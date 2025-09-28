#!/usr/bin/env node

/**
 * Production Notes Fix - Updates all truncated notes with full content
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const SF_CONFIG = {
  instanceUrl: 'https://d46000000rbetea2.my.salesforce.com',
  username: 'mike@oculusrep.com',
  password: 'VM54Toph',
  securityToken: 'UrQTwut4iy0sFBiwsYeae8YGr'
};

const DB_CONFIG = {
  supabaseUrl: 'https://rqbvcvwbziilnycqtmnc.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxYnZjdndiemlpbG55Y3F0bW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyMzk5ODIsImV4cCI6MjA2NTgxNTk4Mn0.819LDXCnlu2dgCPw91oMbZIojeFom-UxqJn2hA5yjBM'
};

/**
 * SOAP login to get session ID
 */
async function soapLogin() {
  return new Promise((resolve, reject) => {
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:enterprise.soap.sforce.com">
    <soapenv:Header/>
    <soapenv:Body>
        <urn:login>
            <urn:username>${SF_CONFIG.username}</urn:username>
            <urn:password>${SF_CONFIG.password}${SF_CONFIG.securityToken}</urn:password>
        </urn:login>
    </soapenv:Body>
</soapenv:Envelope>`;

    const options = {
      hostname: 'login.salesforce.com',
      path: '/services/Soap/c/62.0',
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'SOAPAction': 'login',
        'Content-Length': Buffer.byteLength(soapBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const sessionMatch = data.match(/<sessionId>([^<]+)<\/sessionId>/);
          const serverUrlMatch = data.match(/<serverUrl>([^<]+)<\/serverUrl>/);

          if (sessionMatch && serverUrlMatch) {
            resolve({ sessionId: sessionMatch[1], serverUrl: serverUrlMatch[1] });
          } else {
            reject(new Error('Failed to extract session from SOAP response'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(soapBody);
    req.end();
  });
}

/**
 * Fetch content from VersionData path
 */
async function fetchContent(versionDataPath, sessionId, serverUrl) {
  return new Promise((resolve, reject) => {
    const baseUrl = new URL(serverUrl).origin;
    const fullUrl = `${baseUrl}${versionDataPath}`;

    const options = {
      headers: {
        'Authorization': `Bearer ${sessionId}`,
        'Accept': '*/*'
      }
    };

    https.get(fullUrl, options, (res) => {
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          const buffer = Buffer.concat(chunks);
          const content = buffer.toString('utf8');
          resolve(content);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString()}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Main production run
 */
async function fixAllNotes() {
  try {
    console.log('🚀 Starting production notes fix...\n');

    const supabase = createClient(DB_CONFIG.supabaseUrl, DB_CONFIG.supabaseKey);

    // Get SOAP session
    console.log('🔐 Authenticating with Salesforce...');
    const { sessionId, serverUrl } = await soapLogin();

    // Get all text-based ContentVersions that need fixing using pagination
    console.log('📋 Getting all text notes that need fixing...');

    let allVersions = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      console.log(`📄 Loading page ${page + 1}...`);

      const { data: versions, error } = await supabase
        .from('salesforce_ContentVersion')
        .select('Id, VersionData, ContentSize, Title, FileType, ContentDocumentId')
        .not('VersionData', 'is', null)
        .gt('ContentSize', 255)
        .in('FileType', ['SNOTE', 'TEXT', 'HTML', 'text/plain', 'text/html'])
        .order('ContentSize', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;

      if (versions && versions.length > 0) {
        allVersions = allVersions.concat(versions);
        console.log(`📄 Page ${page + 1}: Found ${versions.length} notes (Total so far: ${allVersions.length})`);

        // Check if we got a full page (meaning there might be more)
        hasMore = versions.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }

    console.log(`📊 Found ${allVersions.length} total text notes to fix\n`);

    if (allVersions.length === 0) {
      console.log('ℹ️  No text notes found that need fixing');
      return;
    }

    const versions = allVersions;

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < versions.length; i++) {
      const cv = versions[i];

      try {
        console.log(`\n📥 [${i+1}/${versions.length}] Processing: ${cv.Title || cv.Id}`);
        console.log(`📏 Size: ${cv.ContentSize} chars, Type: ${cv.FileType}`);

        // Fetch full content
        const fullContent = await fetchContent(cv.VersionData, sessionId, serverUrl);

        // Find the corresponding note in your notes table
        const { data: noteRecords, error: noteError } = await supabase
          .from('note')
          .select('id, body')
          .eq('sf_content_document_id', cv.ContentDocumentId);

        if (noteError) {
          console.error(`❌ Database query failed: ${noteError.message}`);
          errorCount++;
          continue;
        }

        if (!noteRecords || noteRecords.length === 0) {
          console.log(`⚠️  No note record found for ContentDocument ${cv.ContentDocumentId}`);
          continue;
        }

        const noteRecord = noteRecords[0];

        // Update the note with full content
        const { error: updateError } = await supabase
          .from('note')
          .update({
            body: fullContent,
            updated_at: new Date().toISOString()
          })
          .eq('id', noteRecord.id);

        if (updateError) {
          console.error(`❌ Update failed: ${updateError.message}`);
          errorCount++;
          continue;
        }

        console.log(`✅ Updated note ${noteRecord.id}`);
        console.log(`📊 Length: ${noteRecord.body.length} → ${fullContent.length} characters`);
        successCount++;

        // Rate limiting - be nice to Salesforce API
        if (i < versions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }

      } catch (err) {
        console.error(`❌ Failed to process ${cv.Id}: ${err.message}`);
        errorCount++;
      }
    }

    console.log(`\n🎉 Processing complete!`);
    console.log(`✅ Successfully updated: ${successCount} notes`);
    console.log(`❌ Failed: ${errorCount} notes`);
    console.log(`📊 Total processed: ${successCount + errorCount}/${versions.length}`);

  } catch (err) {
    console.error('💥 Script failed:', err.message);
  }
}

// Command line options
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Production Notes Fix

Usage:
  node fix-all-notes.js           # Fix all truncated notes
  node fix-all-notes.js --help    # Show this help

This script will:
1. Login to Salesforce via SOAP
2. Fetch full content for all text notes > 255 characters
3. Update your notes table with complete content
`);
  } else {
    fixAllNotes();
  }
}