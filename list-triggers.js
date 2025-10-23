const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

(async () => {
  try {
    // Query pg_trigger to see what triggers exist
    const { data, error } = await supabase
      .rpc('exec_raw_sql', {
        query: `
          SELECT 
            t.tgname AS trigger_name,
            CASE 
              WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
              ELSE 'AFTER'
            END AS timing,
            CASE 
              WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
              WHEN t.tgtype & 4 = 4 THEN 'INSERT'
              WHEN t.tgtype & 8 = 8 THEN 'DELETE'
            END AS event,
            p.proname AS function_name
          FROM pg_trigger t
          JOIN pg_proc p ON t.tgfoid = p.oid
          JOIN pg_class c ON t.tgrelid = c.oid
          WHERE c.relname = 'payment'
            AND NOT t.tgisinternal
          ORDER BY timing, event;
        `
      });

    if (error) {
      console.error('RPC Error:', error.message);
      
      // Try alternative method - direct query
      console.log('\nTrying alternative query method...');
      // Just try to get function source that might be interfering
      const { data: funcs } = await supabase
        .rpc('exec_raw_sql', {
          query: `SELECT proname FROM pg_proc WHERE proname LIKE '%payment%' AND proname LIKE '%update%' OR proname LIKE '%override%';`
        });
      
      console.log('Payment-related functions:', funcs);
      return;
    }

    console.log('Triggers on payment table:');
    console.log(data);
    
  } catch (error) {
    console.error('Error:', error);
  }
})();
