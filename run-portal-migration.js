const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function runMigration() {
  try {
    console.log('Reading client portal migration file...');
    const migrationSQL = fs.readFileSync(
      './supabase/migrations/20260130_client_portal_schema.sql',
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

      // Split by semicolons but be careful about function bodies
      const statements = [];
      let currentStatement = '';
      let inFunctionBody = false;

      const lines = migrationSQL.split('\n');
      for (const line of lines) {
        // Skip comment-only lines for splitting purposes
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('--') && !currentStatement.trim()) {
          continue;
        }

        currentStatement += line + '\n';

        // Track if we're inside a function body
        if (trimmedLine.includes('$$ LANGUAGE') || trimmedLine.includes('$$;')) {
          inFunctionBody = false;
        }
        if (trimmedLine.includes('AS $$') || trimmedLine.includes("AS '")) {
          inFunctionBody = true;
        }

        // If we hit a semicolon and we're not in a function body, split
        if (trimmedLine.endsWith(';') && !inFunctionBody) {
          const stmt = currentStatement.trim();
          if (stmt && !stmt.startsWith('--')) {
            statements.push(stmt);
          }
          currentStatement = '';
        }
      }

      // Add any remaining statement
      if (currentStatement.trim()) {
        statements.push(currentStatement.trim());
      }

      console.log(`Found ${statements.length} statements to execute\n`);

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];

        // Show what we're executing
        const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
        console.log(`[${i + 1}/${statements.length}] ${preview}...`);

        const { error: stmtError } = await supabase.rpc('exec_sql', { sql: stmt });
        if (stmtError) {
          console.error(`  ERROR: ${stmtError.message}`);
          errorCount++;
        } else {
          console.log('  OK');
          successCount++;
        }
      }

      console.log(`\nMigration complete: ${successCount} succeeded, ${errorCount} failed`);
    } else {
      console.log('Migration completed successfully!');
      console.log('Data:', data);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

runMigration();
