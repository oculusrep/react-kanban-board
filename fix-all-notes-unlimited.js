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

// = PRODUCTION CREDENTIALS - UPDATE BEFORE CUTOVER
const SF_CONFIG = {
  instanceUrl: 'https://YOUR-PRODUCTION-INSTANCE.salesforce.com', // UPDATE
  username: 'YOUR_PRODUCTION_USERNAME',                            // UPDATE
  password: 'YOUR_PRODUCTION_PASSWORD',                            // UPDATE
  securityToken: 'YOUR_PRODUCTION_SECURITY_TOKEN'                 // UPDATE
};

const DB_CONFIG = {
  supabaseUrl: 'https://YOUR-PRODUCTION-PROJECT.supabase.co',     // UPDATE
  supabaseKey: 'YOUR_PRODUCTION_SUPABASE_ANON_KEY'                // UPDATE
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

            console.log(' Salesforce SOAP login successful');
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
    console.log('\n1� Authenticating with Salesforce...');
    const { sessionId, instanceUrl } = await soapLogin();

    // Step 2: Get all notes that need content fix
    console.log('\n2� Loading truncated notes from database...');
    const { data: notes, error: notesError } = await supabase
      .from('note')
      .select('id, title, body, sf_content_document_id')
      .or('body.is.null,body.eq.')
      .or('char_length(body).lte.255');

    if (notesError) {
      throw new Error(`Database error: ${notesError.message}`);
    }

    console.log(`=� Found ${notes.length} notes that may need content updates`);

    if (notes.length === 0) {
      console.log(' No notes need updating. All notes already have full content!');
      return;
    }

    // Step 3: Get ContentVersion data for VersionData paths
    console.log('\n3� Loading ContentVersion data for API paths...');
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

    console.log(`= Created ${Object.keys(contentDocumentToPath).length} ContentDocument � VersionData mappings`);

    // Step 5: Process each note
    console.log('\n4� Processing notes with full content...\n');

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const note of notes) {
      processed++;

      try {
        // Check if note has ContentDocument mapping
        if (!note.sf_content_document_id) {
          console.log(`�  [${processed}/${notes.length}] ${note.title || 'Untitled'} - No ContentDocument ID`);
          skipped++;
          continue;
        }

        const versionDataPath = contentDocumentToPath[note.sf_content_document_id];
        if (!versionDataPath) {
          console.log(`�  [${processed}/${notes.length}] ${note.title || 'Untitled'} - No VersionData path`);
          skipped++;
          continue;
        }

        // Fetch full content from Salesforce
        console.log(`= [${processed}/${notes.length}] Fetching: ${note.title || 'Untitled'}...`);

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

          console.log(` [${processed}/${notes.length}] Updated: ${note.title || 'Untitled'} (${note.body?.length || 0} � ${fullContent.length} chars)`);
          updated++;
        } else {
          console.log(`�  [${processed}/${notes.length}] ${note.title || 'Untitled'} - No improvement needed`);
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
    console.log(` Successfully Updated: ${updated}`);
    console.log(`�  Skipped (no improvement): ${skipped}`);
    console.log(`L Errors: ${errors}`);
    console.log('PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP');

    if (updated > 0) {
      console.log('\n<� SUCCESS! Notes content fix completed.');
      console.log('=� Verify results in UI - notes should now display full content with rich formatting.');
    } else {
      console.log('\n�  No notes were updated. This may indicate:');
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
  console.log('= Production Notes Content Fix Script');
  console.log('�  IMPORTANT: Update SF_CONFIG and DB_CONFIG with production credentials before running!');
  console.log('');

  // Basic credential validation
  if (SF_CONFIG.username.includes('YOUR_PRODUCTION') || DB_CONFIG.supabaseUrl.includes('YOUR-PRODUCTION')) {
    console.error('L CONFIGURATION ERROR: Please update SF_CONFIG and DB_CONFIG with real production credentials');
    console.error('=� Edit this file and replace placeholder values before running');
    process.exit(1);
  }

  processAllNotes();
}

module.exports = { processAllNotes };