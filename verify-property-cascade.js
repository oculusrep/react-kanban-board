const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rqbvcvwbziilnycqtmnc.supabase.co';

// No fallback. This previously defaulted to a service_role JWT hardcoded in the
// file — a live-looking credential committed to the repo. Those legacy JWTs were
// disabled on 2025-10-23 and authenticate nothing, so the fallback only served to
// mislead: the script appeared to run without a key and then failed obscurely.
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseKey) {
  console.error(
    'SUPABASE_SECRET_KEY is not set.\n\n' +
    'This script needs the secret key to read schema metadata. Run it as:\n' +
    '  set -a && . ./.env && set +a && node verify-property-cascade.js\n'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyConstraints() {
  console.log('🔍 Checking property foreign key constraints...\n');

  const query = `
    SELECT
        tc.table_name,
        kcu.column_name,
        rc.delete_rule,
        CASE
            WHEN rc.delete_rule = 'CASCADE' THEN '✅ Auto-deletes'
            WHEN rc.delete_rule = 'SET NULL' THEN '⚠️ Sets to NULL'
            WHEN rc.delete_rule = 'NO ACTION' THEN '❌ Still orphans'
            ELSE '❓ ' || rc.delete_rule
        END as what_happens
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'property'
    ORDER BY
        CASE rc.delete_rule
            WHEN 'CASCADE' THEN 1
            WHEN 'SET NULL' THEN 2
            WHEN 'NO ACTION' THEN 3
        END,
        tc.table_name;
  `;

  try {
    const { data, error } = await supabase.rpc('exec_sql', { query });

    if (error) {
      // Try direct query
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/query_constraints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      console.log('⚠️ Unable to query via RPC. Please run this query manually in Supabase SQL Editor:\n');
      console.log(query);
      console.log('\n📝 Expected Results:');
      console.log('┌─────────────────────┬──────────────┬─────────────┬──────────────────┐');
      console.log('│ table_name          │ column_name  │ delete_rule │ what_happens     │');
      console.log('├─────────────────────┼──────────────┼─────────────┼──────────────────┤');
      console.log('│ property_contact    │ property_id  │ CASCADE     │ ✅ Auto-deletes  │');
      console.log('│ property_unit       │ property_id  │ CASCADE     │ ✅ Auto-deletes  │');
      console.log('│ activity            │ property_id  │ CASCADE     │ ✅ Auto-deletes  │');
      console.log('│ note_object_link    │ property_id  │ CASCADE     │ ✅ Auto-deletes  │');
      console.log('│ site_submit         │ property_id  │ SET NULL    │ ⚠️ Sets to NULL  │');
      console.log('└─────────────────────┴──────────────┴─────────────┴──────────────────┘');
      return;
    }

    if (data && data.length > 0) {
      console.log('✅ Property Foreign Key Constraints:\n');
      console.table(data);

      // Check if migration has been applied
      const hasAllCascades = data.some(row =>
        row.table_name === 'property_contact' && row.delete_rule === 'CASCADE'
      ) && data.some(row =>
        row.table_name === 'property_unit' && row.delete_rule === 'CASCADE'
      ) && data.some(row =>
        row.table_name === 'activity' && row.delete_rule === 'CASCADE'
      ) && data.some(row =>
        row.table_name === 'note_object_link' && row.delete_rule === 'CASCADE'
      ) && data.some(row =>
        row.table_name === 'site_submit' && row.delete_rule === 'SET NULL'
      );

      if (hasAllCascades) {
        console.log('\n✅ Migration has been applied correctly!');
        console.log('You can now delete properties without 409 errors.');
      } else {
        console.log('\n❌ Migration NOT yet applied.');
        console.log('Please run the migration SQL in Supabase SQL Editor.');
        console.log('See: APPLY_PROPERTY_CASCADE_DELETES.md');
      }
    } else {
      console.log('⚠️ No results returned. Please check manually.');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\n⚠️ Unable to verify automatically.');
    console.log('Please run the verification query manually in Supabase SQL Editor.');
    console.log('See: APPLY_PROPERTY_CASCADE_DELETES.md for the query.');
  }
}

verifyConstraints();
