const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function runMigration() {
  try {
    console.log('Reading migration file...');
    const migrationSQL = fs.readFileSync(
      './supabase/migrations/20251023_fix_agci_and_splits_proportional_override.sql',
      'utf8'
    );

    console.log('Running migration...');
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (error) {
      console.error('Migration failed:', error);

      // Try splitting the migration into individual statements
      console.log('\nTrying to execute statements individually...');
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i] + ';';
        if (stmt.includes('CREATE') || stmt.includes('DROP') || stmt.includes('COMMENT')) {
          console.log(`\nExecuting statement ${i + 1}/${statements.length}...`);
          console.log(stmt.substring(0, 100) + '...');

          const { error: stmtError } = await supabase.rpc('exec_sql', { sql: stmt });
          if (stmtError) {
            console.error(`Error in statement ${i + 1}:`, stmtError);
          } else {
            console.log('✓ Success');
          }
        }
      }
    } else {
      console.log('Migration completed successfully!');
      console.log('Data:', data);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

runMigration();
