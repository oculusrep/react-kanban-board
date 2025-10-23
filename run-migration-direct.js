const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    db: { schema: 'public' },
    auth: { persistSession: false }
  }
);

async function runMigration() {
  try {
    console.log('Reading migration file...');
    const migrationSQL = fs.readFileSync(
      './supabase/migrations/20251023_fix_agci_and_splits_proportional_override.sql',
      'utf8'
    );

    // Execute the entire migration as one block
    console.log('\nExecuting migration...\n');

    // Remove comments and split by statement boundaries more carefully
    const cleanSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--') || line.includes('--'))
      .join('\n');

    // Try to execute as a single block first
    console.log('Attempting to execute migration as single block...');
    const { data, error } = await supabase.rpc('exec_sql', { sql: cleanSQL });

    if (error) {
      console.error('Error executing migration:', error);
      console.log('\nPlease copy the SQL below and run it in Supabase SQL Editor:');
      console.log('https://supabase.com/dashboard/project/rqbvcvwbziilnycqtmnc/sql/new');
      console.log('\n' + '='.repeat(80));
      console.log(migrationSQL);
      console.log('='.repeat(80));
    } else {
      console.log('✅ Migration executed successfully!');
      console.log('Data:', data);
    }

  } catch (err) {
    console.error('Unexpected error:', err.message);
  }
}

runMigration();
