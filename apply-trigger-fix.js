const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function applyTriggerFix() {
  console.log('🔧 Applying payment trigger restoration...\n');

  // Read the SQL file
  const sqlPath = path.join(__dirname, 'supabase', 'RESTORE_ALL_PAYMENT_TRIGGERS.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('📄 SQL file loaded:', sqlPath);
  console.log('📏 SQL length:', sql.length, 'characters\n');

  // Split SQL into individual statements (simple split on semicolons)
  // Note: This is a simple approach and might not work for complex SQL
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log('📊 Found', statements.length, 'SQL statements to execute\n');

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];

    // Skip comment-only statements
    if (statement.startsWith('--') || statement.startsWith('/*')) {
      continue;
    }

    // Get a preview of the statement (first 100 chars)
    const preview = statement.substring(0, 100).replace(/\s+/g, ' ');
    console.log(`\n[${i + 1}/${statements.length}] Executing: ${preview}...`);

    try {
      // Execute the statement
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      });

      if (error) {
        console.error('❌ Error:', error.message);
        errorCount++;
      } else {
        console.log('✅ Success');
        if (data) {
          console.log('   Result:', data);
        }
        successCount++;
      }
    } catch (err) {
      console.error('❌ Exception:', err.message);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log('   ✅ Successful:', successCount);
  console.log('   ❌ Errors:', errorCount);
  console.log('='.repeat(60));

  if (errorCount === 0) {
    console.log('\n🎉 All triggers restored successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Create a new deal');
    console.log('   2. Add brokers to the commission tab');
    console.log('   3. Check the Payment tab - broker splits should appear automatically');
  } else {
    console.log('\n⚠️  Some statements failed. Review the errors above.');
  }
}

applyTriggerFix()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
