const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Initialize Supabase client with service role key
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://rqbvcvwbziilnycqtmnc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('Starting timeline sync migration...');

  try {
    // Step 1: Add columns if they don't exist
    console.log('\n1. Adding columns is_timeline_linked and deal_field_name...');
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'critical_date' AND column_name = 'is_timeline_linked') THEN
            ALTER TABLE critical_date ADD COLUMN is_timeline_linked BOOLEAN DEFAULT FALSE;
            RAISE NOTICE 'Added is_timeline_linked column';
          ELSE
            RAISE NOTICE 'is_timeline_linked column already exists';
          END IF;

          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'critical_date' AND column_name = 'deal_field_name') THEN
            ALTER TABLE critical_date ADD COLUMN deal_field_name TEXT;
            RAISE NOTICE 'Added deal_field_name column';
          ELSE
            RAISE NOTICE 'deal_field_name column already exists';
          END IF;
        END $$;
      `
    });

    if (alterError) {
      console.log('Note: ALTER TABLE might have already been done:', alterError.message);
    } else {
      console.log('✓ Columns added successfully');
    }

    // Step 2: Create index
    console.log('\n2. Creating index...');
    // Indexes can be created even if they exist (will just skip)

    // Step 3: Create timeline critical dates for all deals
    console.log('\n3. Creating timeline critical dates for all existing deals...');

    // Get all deals
    const { data: deals, error: dealsError } = await supabase
      .from('deal')
      .select('id, target_close_date, loi_signed_date, contract_signed_date, booked_date, closed_date');

    if (dealsError) throw dealsError;

    console.log(`Found ${deals.length} deals`);

    let created = 0;
    let skipped = 0;

    for (const deal of deals) {
      // Check if timeline dates already exist for this deal
      const { data: existing, error: existingError } = await supabase
        .from('critical_date')
        .select('id')
        .eq('deal_id', deal.id)
        .eq('is_timeline_linked', true);

      if (existingError) throw existingError;

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Create 5 timeline critical dates
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
        deal_field_name: td.field_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { error: insertError } = await supabase
        .from('critical_date')
        .insert(records);

      if (insertError) {
        console.error(`Error creating timeline dates for deal ${deal.id}:`, insertError);
      } else {
        created++;
      }

      // Log progress every 50 deals
      if ((created + skipped) % 50 === 0) {
        console.log(`Progress: ${created + skipped}/${deals.length} deals processed`);
      }
    }

    console.log(`\n✓ Timeline critical dates created for ${created} deals`);
    console.log(`✓ Skipped ${skipped} deals (already had timeline dates)`);

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
