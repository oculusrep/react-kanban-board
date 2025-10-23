const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

(async () => {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT 
          t.tgname AS trigger_name,
          p.proname AS function_name,
          tgtype & 2 = 2 AS before_trigger,
          tgtype & 4 = 4 AS insert_trigger,
          tgtype & 8 = 8 AS delete_trigger,
          tgtype & 16 = 16 AS update_trigger
        FROM pg_trigger t
        JOIN pg_proc p ON t.tgfoid = p.oid
        JOIN pg_class c ON t.tgrelid = c.oid
        WHERE c.relname = 'payment'
          AND NOT t.tgisinternal
        ORDER BY t.tgname;
      `
    });

    if (error) {
      console.error('Error:', error);
      return;
    }

    console.log('Triggers on payment table:');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
})();
