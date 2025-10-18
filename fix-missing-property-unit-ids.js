#!/usr/bin/env node

/**
 * Fix Missing Property Unit IDs Script
 *
 * This script finds site submits that have sf_property_unit (Salesforce ID) populated
 * but are missing the property_unit_id foreign key. It then looks up the correct
 * property_unit_id by finding other site submits with the same sf_property_unit
 * that DO have the property_unit_id set, and applies the fix.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fixMissingPropertyUnitIds() {
  console.log('🔍 Finding site submits with missing property_unit_id...\n');

  // Step 1: Find all site submits with sf_property_unit but no property_unit_id
  const { data: brokenSubmits, error: findError } = await supabase
    .from('site_submit')
    .select('id, site_submit_name, sf_property_unit, property_id, property!site_submit_property_id_fkey(property_name)')
    .not('sf_property_unit', 'is', null)
    .is('property_unit_id', null);

  if (findError) {
    console.error('❌ Error finding broken site submits:', findError);
    return;
  }

  if (!brokenSubmits || brokenSubmits.length === 0) {
    console.log('✅ No site submits found with missing property_unit_id. All good!');
    return;
  }

  console.log(`Found ${brokenSubmits.length} site submit(s) with missing property_unit_id:\n`);
  brokenSubmits.forEach((s, i) => {
    console.log(`${i + 1}. ${s.site_submit_name}`);
    console.log(`   Property: ${s.property?.property_name || 'N/A'}`);
    console.log(`   sf_property_unit: ${s.sf_property_unit}`);
    console.log(`   property_unit_id: NULL ❌\n`);
  });

  // Step 2: For each broken submit, find the correct property_unit_id
  const fixes = [];

  for (const broken of brokenSubmits) {
    console.log(`🔎 Looking up property_unit_id for sf_property_unit: ${broken.sf_property_unit}`);

    // Find other site submits with the same sf_property_unit that have property_unit_id set
    const { data: reference, error: refError } = await supabase
      .from('site_submit')
      .select('property_unit_id, property_unit!site_submit_property_unit_id_fkey(property_unit_name)')
      .eq('sf_property_unit', broken.sf_property_unit)
      .not('property_unit_id', 'is', null)
      .limit(1)
      .single();

    if (refError || !reference) {
      console.log(`   ⚠️  Could not find reference with property_unit_id for this sf_property_unit\n`);
      continue;
    }

    console.log(`   ✅ Found reference: property_unit_id = ${reference.property_unit_id}`);
    console.log(`   Unit name: ${reference.property_unit?.property_unit_name}\n`);

    fixes.push({
      id: broken.id,
      name: broken.site_submit_name,
      property_unit_id: reference.property_unit_id,
      unit_name: reference.property_unit?.property_unit_name
    });
  }

  if (fixes.length === 0) {
    console.log('❌ No fixes could be determined. Manual intervention may be required.');
    return;
  }

  // Step 3: Show the proposed fixes
  console.log('\n📋 Proposed fixes:\n');
  fixes.forEach((fix, i) => {
    console.log(`${i + 1}. "${fix.name}"`);
    console.log(`   Will set property_unit_id to: ${fix.property_unit_id}`);
    console.log(`   Unit name: ${fix.unit_name}\n`);
  });

  // Step 4: Apply the fixes
  console.log('🔧 Applying fixes...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const fix of fixes) {
    const { error: updateError } = await supabase
      .from('site_submit')
      .update({ property_unit_id: fix.property_unit_id })
      .eq('id', fix.id);

    if (updateError) {
      console.log(`   ❌ Failed to update "${fix.name}":`, updateError.message);
      errorCount++;
    } else {
      console.log(`   ✅ Updated "${fix.name}"`);
      successCount++;
    }
  }

  // Step 5: Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Total site submits processed: ${brokenSubmits.length}`);
  console.log(`   Successfully fixed: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log('='.repeat(60));

  if (successCount > 0) {
    console.log('\n✅ Fix completed! Site submits now have proper property_unit_id values.');
  }
}

// Run the script
fixMissingPropertyUnitIds()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
