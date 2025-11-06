const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  'https://rqbvcvwbziilnycqtmnc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxYnZjdndiemppbG55Y3F0bW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNTczNjIzNCwiZXhwIjoyMDQxMzEyMjM0fQ.d8yK7VZEk4A37aDvNNYj_3f3gDdwJD0eVqk3mXq8yY0'  // Service role key
);

async function runMigration() {
  console.log('Starting timeline sync migration...\n');

  try {
    // Step 1: Add columns to critical_date table
    console.log('Step 1: Adding columns...');
    const {error: step1Error } = await supabase.rpc('exec', {
      query: `
        ALTER TABLE critical_date
        ADD COLUMN IF NOT EXISTS is_timeline_linked BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS deal_field_name TEXT;

        CREATE INDEX IF NOT EXISTS idx_critical_date_timeline_linked
        ON critical_date(deal_id, is_timeline_linked, deal_field_name)
        WHERE is_timeline_linked = TRUE;
      `
    });

    if (step1Error && !step1Error.message.includes('already exists')) {
      throw step1Error;
    }
    console.log('✓ Columns and index created\n');

    // Step 2: Get all deals
    console.log('Step 2: Fetching deals...');
    const { data: deals, error: dealsError } = await supabase
      .from('deal')
      .select('id, target_close_date, loi_signed_date, contract_signed_date, booked_date, closed_date');

    if (dealsError) throw dealsError;
    console.log(`✓ Found ${deals.length} deals\n`);

    // Step 3: Create timeline critical dates
    console.log('Step 3: Creating timeline critical dates...');
    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < deals.length; i++) {
      const deal = deals[i];

      // Check if timeline dates already exist
      const { data: existing } = await supabase
        .from('critical_date')
        .select('id')
        .eq('deal_id', deal.id)
        .eq('is_timeline_linked', true)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Create timeline dates
      const timelineDates = [
        { subject: 'Target Close Date', field_name: 'target_close_date', date: deal.target_close_date },
        { subject: 'LOI X Date', field_name: 'loi_signed_date', date: deal.loi_signed_date },
        { subject: 'Effective Date (Contract X)', field_name: 'contract_signed_date', date: deal.contract_signed_date },
        { subject: 'Booked Date', field_name: 'booked_date', date: deal.booked_date },
        { subject: 'Closed Date', field_name: 'closed_date', date: deal.closed_date }
      ];

      const records = timelineDates.map(td => ({
        deal_id: deal.id,
        subject: td.subject,
        critical_date: td.date,
        description: null,
        send_email: false,
        send_email_days_prior: null,
        is_default: true,
        is_timeline_linked: true,
        deal_field_name: td.field_name
      }));

      const { error: insertError } = await supabase
        .from('critical_date')
        .insert(records);

      if (insertError) {
        errors++;
        console.error(`Error for deal ${deal.id}:`, insertError.message);
      } else {
        created++;
      }

      // Progress update every 25 deals
      if ((i + 1) % 25 === 0) {
        console.log(`  Progress: ${i + 1}/${deals.length} deals (${created} created, ${skipped} skipped, ${errors} errors)`);
      }
    }

    console.log(`\n✅ Migration completed!`);
    console.log(`  • Created timeline dates for ${created} deals`);
    console.log(`  • Skipped ${skipped} deals (already had timeline dates)`);
    if (errors > 0) {
      console.log(`  • ${errors} deals had errors`);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
