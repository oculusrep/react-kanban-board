#!/usr/bin/env node

/**
 * PRODUCTION CUTOVER SCRIPT - Fix All Notes Unlimited
 *
 * Critical script for production deployment to resolve 255-character truncation issue.
 * Processes ALL notes without record limits.
 *
 * BEFORE RUNNING:
 * 1. Update SF_CONFIG and DB_CONFIG with production credentials
 * 2. Run: npm install @supabase/supabase-js
 * 3. Execute: node fix-all-notes-unlimited.js
 *
 * Expected results: ~1500+ notes updated with full content
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
require('dotenv').config();

// Load credentials from environment variables
const SF_CONFIG = {
  instanceUrl: process.env.SALESFORCE_INSTANCE_URL || 'https://YOUR-PRODUCTION-INSTANCE.salesforce.com',
  username: process.env.SALESFORCE_USERNAME || 'YOUR_PRODUCTION_USERNAME',
  password: process.env.SALESFORCE_PASSWORD || 'YOUR_PRODUCTION_PASSWORD',
  securityToken: process.env.SALESFORCE_SECURITY_TOKEN || 'YOUR_PRODUCTION_SECURITY_TOKEN'
};

const DB_CONFIG = {
  supabaseUrl: process.env.VITE_SUPABASE_URL || 'https://YOUR-PRODUCTION-PROJECT.supabase.co',
  supabaseKey: process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_PRODUCTION_SUPABASE_ANON_KEY'
};

// Initialize Supabase client
const supabase = createClient(DB_CONFIG.supabaseUrl, DB_CONFIG.supabaseKey);

/**
 * SOAP Login to Salesforce to get session ID
 */
function soapLogin() {
  return new Promise((resolve, reject) => {
    const loginSoapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:enterprise.soap.sforce.com">
   <soapenv:Header/>
   <soapenv:Body>
      <urn:login>
         <urn:username>${SF_CONFIG.username}</urn:username>
         <urn:password>${SF_CONFIG.password}${SF_CONFIG.securityToken}</urn:password>
      </urn:login>
   </soapenv:Body>
</soapenv:Envelope>`;

    const postData = loginSoapBody;
    const options = {
      hostname: SF_CONFIG.instanceUrl.replace('https://', ''),
      port: 443,
      path: '/services/Soap/c/61.0',
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'SOAPAction': 'login',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const sessionIdMatch = data.match(/<sessionId>([^<]+)<\/sessionId>/);
          const serverUrlMatch = data.match(/<serverUrl>([^<]+)<\/serverUrl>/);

          if (sessionIdMatch && serverUrlMatch) {
            const sessionId = sessionIdMatch[1];
            const serverUrl = serverUrlMatch[1];
            const instanceUrl = serverUrl.substring(0, serverUrl.indexOf('/services'));

            console.log('? Salesforce SOAP login successful');
            resolve({ sessionId, instanceUrl });
          } else {
            console.error('L Login failed:', data);
            reject(new Error('SOAP login failed'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Fetch content from Salesforce ContentVersion VersionData
 */
function fetchSalesforceContent(versionDataPath, sessionId, instanceUrl) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: instanceUrl.replace('https://', ''),
      port: 443,
      path: versionDataPath,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionId}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Main processing function
 */
async function processAllNotes() {
  console.log('=� Starting PRODUCTION Notes Content Fix (UNLIMITED)');
  console.log('=� This script processes ALL notes without limits');

  try {
    // Step 1: Authenticate with Salesforce
    console.log('\n1?� Authenticating with Salesforce...');
    const { sessionId, instanceUrl } = await soapLogin();

    // Step 2: Get all notes that may need content fix
    console.log('\n2?� Loading notes from database...');

    // Get all notes and filter for ones that need fixing
    const { data: allNotes, error: notesError } = await supabase
      .from('note')
      .select('id, title, body, sf_content_document_id');

    if (notesError) {
      throw new Error(`Database error: ${notesError.message}`);
    }

    // Filter for notes that need fixing (empty, null, or short body)
    const notes = allNotes.filter(note => {
      if (!note.body || note.body.trim() === '') return true; // Empty or null
      if (note.body.length <= 255) return true; // Likely truncated
      return false;
    });

    console.log(`=� Found ${notes.length} notes that may need content updates`);

    if (notes.length === 0) {
      console.log('? No notes need updating. All notes already have full content!');
      return;
    }

    // Step 3: Get ContentVersion data for VersionData paths
    console.log('\n3?� Loading ContentVersion data for API paths...');
    const { data: contentVersions, error: cvError } = await supabase
      .from('content_version')
      .select('id, content_document_id, version_data, text_preview')
      .not('version_data', 'is', null)
      .like('version_data', '/services/data/%');

    if (cvError) {
      throw new Error(`ContentVersion error: ${cvError.message}`);
    }

    console.log(`=� Found ${contentVersions.length} ContentVersions with API paths`);

    // Step 4: Create mapping from ContentDocument to VersionData path
    const contentDocumentToPath = {};
    contentVersions.forEach(cv => {
      if (cv.content_document_id && cv.version_data) {
        contentDocumentToPath[cv.content_document_id] = cv.version_data;
      }
    });

    console.log(`=? Created ${Object.keys(contentDocumentToPath).length} ContentDocument � VersionData mappings`);

    // Step 5: Process each note
    console.log('\n4?� Processing notes with full content...\n');

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const note of notes) {
      processed++;

      try {
        // Check if note has ContentDocument mapping
        if (!note.sf_content_document_id) {
          console.log(`�?  [${processed}/${notes.length}] ${note.title || 'Untitled'} - No ContentDocument ID`);
          skipped++;
          continue;
        }

        const versionDataPath = contentDocumentToPath[note.sf_content_document_id];
        if (!versionDataPath) {
          console.log(`�?  [${processed}/${notes.length}] ${note.title || 'Untitled'} - No VersionData path`);
          skipped++;
          continue;
        }

        // Fetch full content from Salesforce
        console.log(`=? [${processed}/${notes.length}] Fetching: ${note.title || 'Untitled'}...`);

        const fullContent = await fetchSalesforceContent(versionDataPath, sessionId, instanceUrl);

        if (fullContent && fullContent.length > (note.body?.length || 0)) {
          // Update note with full content
          const { error: updateError } = await supabase
            .from('note')
            .update({ body: fullContent })
            .eq('id', note.id);

          if (updateError) {
            throw new Error(`Update failed: ${updateError.message}`);
          }

          console.log(`? [${processed}/${notes.length}] Updated: ${note.title || 'Untitled'} (${note.body?.length || 0} � ${fullContent.length} chars)`);
          updated++;
        } else {
          console.log(`�?  [${processed}/${notes.length}] ${note.title || 'Untitled'} - No improvement needed`);
          skipped++;
        }

        // Rate limiting - 150ms delay between API calls
        await new Promise(resolve => setTimeout(resolve, 150));

      } catch (error) {
        console.error(`L [${processed}/${notes.length}] Error processing ${note.title || 'Untitled'}: ${error.message}`);
        errors++;
        continue;
      }
    }

    // Step 6: Final results
    console.log('\n=� FINAL RESULTS:');
    console.log('PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP');
    console.log(`=� Total Notes Processed: ${processed}`);
    console.log(`? Successfully Updated: ${updated}`);
    console.log(`�?  Skipped (no improvement): ${skipped}`);
    console.log(`L Errors: ${errors}`);
    console.log('PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP');

    if (updated > 0) {
      console.log('\n<� SUCCESS! Notes content fix completed.');
      console.log('=� Verify results in UI - notes should now display full content with rich formatting.');
    } else {
      console.log('\n�?  No notes were updated. This may indicate:');
      console.log('   - All notes already have full content');
      console.log('   - ContentDocument mappings are missing');
      console.log('   - VersionData paths are invalid');
    }

  } catch (error) {
    console.error('\n=� CRITICAL ERROR:', error.message);
    console.error('=⚠️ Check your credentials and network connection');
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  console.log('=== Production Notes Content Fix Script ===');
  console.log('⚠️  IMPORTANT: Update SF_CONFIG and DB_CONFIG with production credentials before running!');
  console.log('');

  // Basic credential validation
  console.log('🔍 Checking credentials...');
  console.log(`📊 Supabase URL: ${DB_CONFIG.supabaseUrl.substring(0, 30)}...`);
  console.log(`🔑 Supabase Key: ${DB_CONFIG.supabaseKey.substring(0, 20)}...`);

  const missingSalesforce = SF_CONFIG.username.includes('YOUR_PRODUCTION') ||
                           SF_CONFIG.instanceUrl.includes('YOUR-PRODUCTION') ||
                           SF_CONFIG.password.includes('YOUR_PRODUCTION') ||
                           SF_CONFIG.securityToken.includes('YOUR_PRODUCTION');

  const missingSupabase = DB_CONFIG.supabaseUrl.includes('YOUR-PRODUCTION');

  if (missingSalesforce) {
    console.error('❌ SALESFORCE CREDENTIALS MISSING:');
    console.error('   Add these to your .env file:');
    console.error('   SALESFORCE_INSTANCE_URL=https://your-instance.salesforce.com');
    console.error('   SALESFORCE_USERNAME=your-username');
    console.error('   SALESFORCE_PASSWORD=your-password');
    console.error('   SALESFORCE_SECURITY_TOKEN=your-security-token');
    process.exit(1);
  }

  if (missingSupabase) {
    console.error('❌ SUPABASE CREDENTIALS MISSING: Update VITE_SUPABASE_URL in .env');
    process.exit(1);
  }

  console.log('✅ Credentials loaded successfully!');

  processAllNotes();
}

module.exports = { processAllNotes };