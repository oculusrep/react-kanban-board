#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://rqbvcvwbziilnycqtmnc.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxYnZjdndiemlpbG55Y3F0bW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyMzk5ODIsImV4cCI6MjA2NTgxNTk4Mn0.819LDXCnlu2dgCPw91oMbZIojeFom-UxqJn2hA5yjBM');

async function checkContactRecords() {
  try {
    console.log('📞 CHECKING CONTACT RECORDS FROM AIRBYTE\n');

    // Check for Contact table
    const { data: contacts, error: contactError } = await supabase
      .from('salesforce_Contact')
      .select('Id, FirstName, LastName, CreatedDate')
      .order('CreatedDate', { ascending: true })
      .limit(10);

    if (contactError) {
      console.log('❌ Error accessing Contact table:', contactError.message);
      console.log('Table might not exist or might be named differently');
    } else {
      const { data: allContacts, error: countError } = await supabase
        .from('salesforce_Contact')
        .select('Id', { count: 'exact' });

      if (countError) throw countError;

      console.log(`📊 Total Contact records: ${allContacts.length}`);

      if (contacts.length > 0) {
        console.log('\n📅 Sample Contact records:');
        contacts.forEach((contact, i) => {
          const name = `${contact.FirstName || ''} ${contact.LastName || ''}`.trim() || 'Unnamed';
          const created = new Date(contact.CreatedDate);
          console.log(`   ${i+1}. ${name} - ${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`);
        });

        // Get date range
        const { data: dateRange, error: rangeError } = await supabase
          .from('salesforce_Contact')
          .select('CreatedDate')
          .not('CreatedDate', 'is', null)
          .order('CreatedDate', { ascending: true });

        if (!rangeError && dateRange.length > 0) {
          const oldest = new Date(dateRange[0].CreatedDate);
          const newest = new Date(dateRange[dateRange.length - 1].CreatedDate);

          console.log(`\n📊 Contact Date Range:`);
          console.log(`   Oldest: ${oldest.getFullYear()}-${String(oldest.getMonth() + 1).padStart(2, '0')}-${String(oldest.getDate()).padStart(2, '0')}`);
          console.log(`   Newest: ${newest.getFullYear()}-${String(newest.getMonth() + 1).padStart(2, '0')}-${String(newest.getDate()).padStart(2, '0')}`);
        }
      }
    }

    // Also check our local contact table
    const { data: localContacts, error: localError } = await supabase
      .from('contact')
      .select('id', { count: 'exact' });

    if (localError) {
      console.log('\n❌ Error accessing local contact table:', localError.message);
    } else {
      console.log(`\n📋 Local contact table records: ${localContacts.length}`);
    }

    const contactCount = contacts ? allContacts.length : 0;
    console.log(`\n${contactCount === 1000 ? '⚠️' : '✅'} Status: ${contactCount === 1000 ? 'Likely hitting 1000 record limit' : 'Contact count looks normal'}`);

  } catch (err) {
    console.error('💥 Check failed:', err.message);
  }
}

if (require.main === module) {
  checkContactRecords().then(() => process.exit(0)).catch(console.error);
}