#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://rqbvcvwbziilnycqtmnc.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxYnZjdndiemlpbG55Y3F0bW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyMzk5ODIsImV4cCI6MjA2NTgxNTk4Mn0.819LDXCnlu2dgCPw91oMbZIojeFom-UxqJn2hA5yjBM');

async function analyzeAirbyteSync() {
  try {
    console.log('🔍 CHECKING AIRBYTE SYNC RESULTS\n');

    // Check ContentNote table for historical data
    const { data: contentNotes, error: contentError } = await supabase
      .from('salesforce_ContentNote')
      .select('Id, Title, CreatedDate, LastModifiedDate')
      .order('CreatedDate', { ascending: true })
      .limit(10);

    if (contentError) {
      console.log('❌ Error accessing ContentNote table:', contentError.message);
    } else {
      console.log(`📝 ContentNote records: ${contentNotes.length}`);
      console.log('\n📅 Sample ContentNote dates:');
      contentNotes.forEach((note, i) => {
        const created = new Date(note.CreatedDate);
        console.log(`   ${i+1}. ${note.Title || 'Untitled'} - ${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`);
      });
    }

    // Check ContentNote date range
    const { data: allContentNotes, error: allContentError } = await supabase
      .from('salesforce_ContentNote')
      .select('CreatedDate')
      .not('CreatedDate', 'is', null)
      .order('CreatedDate', { ascending: true });

    if (!allContentError && allContentNotes.length > 0) {
      const oldest = new Date(allContentNotes[0].CreatedDate);
      const newest = new Date(allContentNotes[allContentNotes.length - 1].CreatedDate);

      console.log(`\n📊 ContentNote Date Range:`);
      console.log(`   Total ContentNotes: ${allContentNotes.length}`);
      console.log(`   Oldest: ${oldest.getFullYear()}-${String(oldest.getMonth() + 1).padStart(2, '0')}-${String(oldest.getDate()).padStart(2, '0')}`);
      console.log(`   Newest: ${newest.getFullYear()}-${String(newest.getMonth() + 1).padStart(2, '0')}-${String(newest.getDate()).padStart(2, '0')}`);

      // Count by year
      const yearCounts = {};
      allContentNotes.forEach(record => {
        const year = new Date(record.CreatedDate).getFullYear();
        yearCounts[year] = (yearCounts[year] || 0) + 1;
      });

      console.log(`\n📈 ContentNotes by Year:`);
      Object.entries(yearCounts)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .forEach(([year, count]) => {
          console.log(`   ${year}: ${count} notes`);
        });
    }

    // Check ContentVersion for comparison
    const { data: contentVersions, error: versionError } = await supabase
      .from('salesforce_ContentVersion')
      .select('CreatedDate')
      .not('CreatedDate', 'is', null)
      .order('CreatedDate', { ascending: true });

    if (!versionError && contentVersions.length > 0) {
      const oldestVersion = new Date(contentVersions[0].CreatedDate);
      const newestVersion = new Date(contentVersions[contentVersions.length - 1].CreatedDate);

      console.log(`\n📄 ContentVersion Date Range:`);
      console.log(`   Total ContentVersions: ${contentVersions.length}`);
      console.log(`   Oldest: ${oldestVersion.getFullYear()}-${String(oldestVersion.getMonth() + 1).padStart(2, '0')}-${String(oldestVersion.getDate()).padStart(2, '0')}`);
      console.log(`   Newest: ${newestVersion.getFullYear()}-${String(newestVersion.getMonth() + 1).padStart(2, '0')}-${String(newestVersion.getDate()).padStart(2, '0')}`);
    }

    console.log(`\n✅ AIRBYTE SYNC ANALYSIS COMPLETE`);

  } catch (err) {
    console.error('💥 Analysis failed:', err.message);
  }
}

if (require.main === module) {
  analyzeAirbyteSync().then(() => process.exit(0)).catch(console.error);
}