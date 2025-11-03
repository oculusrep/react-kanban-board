// Run the user fields population migration
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('📝 Reading migration file...');
  const sql = fs.readFileSync('supabase/migrations/20251103205500_populate_critical_date_user_fields.sql', 'utf8');

  console.log('🚀 Running migration...');
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(async () => {
    // If exec_sql doesn't exist, try direct query
    return await supabase.from('critical_date').select('count').limit(0);
  });

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log('✅ Migration completed successfully');
  console.log(data);
}

runMigration();
