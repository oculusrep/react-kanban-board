const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🔄 Running property CASCADE DELETE migration...');

  const migrationPath = path.join(__dirname, 'supabase/migrations/20251103220000_add_property_cascade_deletes.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Split into individual ALTER statements
  const alterStatements = [
    // 1a. Property Contact
    `ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS property_contact_property_id_fkey, ADD CONSTRAINT property_contact_property_id_fkey FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE`,

    // 1b. Property Unit
    `ALTER TABLE property_unit DROP CONSTRAINT IF EXISTS property_unit_property_id_fkey, ADD CONSTRAINT property_unit_property_id_fkey FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE`,

    // 1c. Activity
    `ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_property_id, ADD CONSTRAINT fk_activity_property_id FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE`,

    // 1d. Note Object Link
    `ALTER TABLE note_object_link DROP CONSTRAINT IF EXISTS fk_note_object_link_property_id, ADD CONSTRAINT fk_note_object_link_property_id FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE`,

    // 2a. Site Submit
    `ALTER TABLE site_submit DROP CONSTRAINT IF EXISTS site_submit_property_id_fkey, ADD CONSTRAINT site_submit_property_id_fkey FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE SET NULL`
  ];

  const supabaseUrl = 'https://rqbvcvwbziilnycqtmnc.supabase.co';
  const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxYnZjdndiemlpbG55Y3F0bW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNjE2MzI2NCwiZXhwIjoyMDQxNzM5MjY0fQ.WKuhf_yQiA1lMDJR9_JWdSsxpZnX6y9fNMLkMDWCPqA';

  for (let i = 0; i < alterStatements.length; i++) {
    const statement = alterStatements[i];
    console.log(`\n[${i + 1}/${alterStatements.length}] ${statement.substring(0, 60)}...`);

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ query: statement })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`❌ Failed: ${error}`);
      } else {
        console.log('✅ Success');
      }
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
    }
  }

  console.log('\n✅ Migration complete! You can now delete properties.');
  console.log('\nℹ️ If the above method didn\'t work, please run this SQL manually in the Supabase SQL Editor:');
  console.log('\n' + sql);
}

runMigration();
