#!/usr/bin/env node

/**
 * Update Notes with Full Content from Salesforce API
 *
 * This script:
 * 1. Queries database for notes with VersionData paths
 * 2. Fetches full content from Salesforce REST API
 * 3. Updates the notes table with complete content
 */

const { createClient } = require('@supabase/supabase-js');
const { fetchVersionData, getAccessToken } = require('./fetch-salesforce-notes');

// Supabase configuration - UPDATE THESE
const SUPABASE_CONFIG = {
  url: process.env.SUPABASE_URL || 'your_supabase_url',
  key: process.env.SUPABASE_ANON_KEY || 'your_supabase_key'
};

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

/**
 * Get notes that need full content (currently truncated at 255 chars)
 */
async function getTruncatedNotes() {
  console.log('🔍 Finding notes with VersionData paths...');

  const { data, error } = await supabase
    .from('salesforce_ContentVersion')
    .select(`
      Id,
      ContentDocumentId,
      VersionData,
      ContentSize,
      Title
    `)
    .not('VersionData', 'is', null)
    .gt('ContentSize', 255)
    .limit(50); // Start with first 50

  if (error) {
    throw new Error(`Database query failed: ${error.message}`);
  }

  console.log(`📊 Found ${data.length} notes with VersionData paths`);
  return data;
}

/**
 * Get corresponding note records that need updating
 */
async function getNotesToUpdate(contentVersions) {
  const contentDocumentIds = contentVersions.map(cv => cv.ContentDocumentId);

  const { data, error } = await supabase
    .from('note')
    .select('id, salesforce_content_note_id, body')
    .in('salesforce_content_document_id', contentDocumentIds);

  if (error) {
    throw new Error(`Note query failed: ${error.message}`);
  }

  console.log(`📝 Found ${data.length} note records to update`);
  return data;
}

/**
 * Update a note with full content
 */
async function updateNoteContent(noteId, fullContent) {
  const { error } = await supabase
    .from('note')
    .update({
      body: fullContent,
      updated_at: new Date().toISOString()
    })
    .eq('id', noteId);

  if (error) {
    throw new Error(`Failed to update note ${noteId}: ${error.message}`);
  }

  return true;
}

/**
 * Main processing function
 */
async function processNotes() {
  try {
    // Get authentication token
    console.log('🔐 Getting Salesforce access token...');
    const accessToken = await getAccessToken();

    // Get content versions with paths
    const contentVersions = await getTruncatedNotes();
    if (contentVersions.length === 0) {
      console.log('ℹ️  No truncated notes found');
      return;
    }

    // Get corresponding note records
    const notes = await getNotesToUpdate(contentVersions);

    let successCount = 0;
    let errorCount = 0;

    for (const cv of contentVersions) {
      try {
        console.log(`\n📥 Processing: ${cv.Title || cv.Id}`);
        console.log(`📍 Path: ${cv.VersionData}`);

        // Fetch full content from Salesforce
        const fullContent = await fetchVersionData(cv.VersionData, accessToken);

        // Find corresponding note record
        const noteRecord = notes.find(n => n.salesforce_content_document_id === cv.ContentDocumentId);

        if (!noteRecord) {
          console.log(`⚠️  No note record found for ContentDocument ${cv.ContentDocumentId}`);
          continue;
        }

        // Update database with full content
        await updateNoteContent(noteRecord.id, fullContent);

        console.log(`✅ Updated note ${noteRecord.id}`);
        console.log(`📊 Content: ${noteRecord.body.substring(0, 100)}... → ${fullContent.substring(0, 100)}...`);
        console.log(`📏 Length: ${noteRecord.body.length} → ${fullContent.length} characters`);

        successCount++;

        // Rate limiting - don't overwhelm Salesforce API
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err) {
        console.error(`❌ Failed to process ${cv.Id}:`, err.message);
        errorCount++;
      }
    }

    console.log(`\n🎉 Processing complete!`);
    console.log(`✅ Success: ${successCount} notes updated`);
    console.log(`❌ Errors: ${errorCount} failed`);

  } catch (err) {
    console.error('💥 Script failed:', err.message);
    process.exit(1);
  }
}

/**
 * Dry run mode - just shows what would be processed
 */
async function dryRun() {
  try {
    console.log('🔍 DRY RUN - No changes will be made\n');

    const contentVersions = await getTruncatedNotes();
    const notes = await getNotesToUpdate(contentVersions);

    console.log(`📊 Summary:`);
    console.log(`- ContentVersions with paths: ${contentVersions.length}`);
    console.log(`- Notes to update: ${notes.length}`);

    console.log(`\n📋 Sample VersionData paths:`);
    contentVersions.slice(0, 5).forEach(cv => {
      console.log(`- ${cv.VersionData} (Size: ${cv.ContentSize} chars)`);
    });

  } catch (err) {
    console.error('💥 Dry run failed:', err.message);
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--dry-run')) {
    dryRun();
  } else if (args.includes('--help')) {
    console.log(`
Salesforce Notes Content Fetcher

Usage:
  node update-notes-with-full-content.js [options]

Options:
  --dry-run    Show what would be processed without making changes
  --help       Show this help message

Environment Variables:
  SF_INSTANCE_URL    Salesforce instance URL (e.g., https://your-org.salesforce.com)
  SF_ACCESS_TOKEN    Direct access token (if available)

  OR for OAuth flow:
  SF_CLIENT_ID       Connected App Client ID
  SF_CLIENT_SECRET   Connected App Client Secret
  SF_USERNAME        Salesforce username
  SF_PASSWORD        Salesforce password
  SF_SECURITY_TOKEN  Salesforce security token

  SUPABASE_URL       Your Supabase project URL
  SUPABASE_ANON_KEY  Your Supabase anon key
`);
  } else {
    processNotes();
  }
}

module.exports = { processNotes, dryRun };