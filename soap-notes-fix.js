#!/usr/bin/env node

/**
 * SOAP-based Notes Fix - Uses SOAP login instead of OAuth
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

// Credentials
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
          // Extract session ID from SOAP response
          const sessionMatch = data.match(/<sessionId>([^<]+)<\/sessionId>/);
          const serverUrlMatch = data.match(/<serverUrl>([^<]+)<\/serverUrl>/);

          if (sessionMatch && serverUrlMatch) {
            const sessionId = sessionMatch[1];
            const serverUrl = serverUrlMatch[1];
            console.log('✅ SOAP login successful');
            resolve({ sessionId, serverUrl });
          } else {
            console.error('SOAP response:', data);
            reject(new Error('Failed to extract session ID from SOAP response'));
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
 * Fetch VersionData content using session ID
 */
async function fetchContent(versionDataPath, sessionId, serverUrl) {
  return new Promise((resolve, reject) => {
    // Use the server URL from login response
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
 * Main test
 */
async function runTest() {
  try {
    console.log('🚀 Testing SOAP-based Salesforce notes fetch...\n');

    const supabase = createClient(DB_CONFIG.supabaseUrl, DB_CONFIG.supabaseKey);

    // Get SOAP session
    console.log('🔐 Logging in via SOAP...');
    const { sessionId, serverUrl } = await soapLogin();

    // Get test data - FILTER FOR TEXT NOTES ONLY
    console.log('📋 Getting VersionData paths for TEXT notes...');
    const { data: versions, error } = await supabase
      .from('salesforce_ContentVersion')
      .select('Id, VersionData, ContentSize, Title, FileType, FileExtension')
      .not('VersionData', 'is', null)
      .gt('ContentSize', 255)
      .in('FileType', ['SNOTE', 'TEXT', 'HTML']) // Filter for note/text types only
      .limit(3);

    if (error) throw error;

    console.log(`📊 Testing ${versions.length} VersionData paths\n`);

    for (const cv of versions) {
      try {
        console.log(`📥 Fetching: ${cv.Title || cv.Id}`);
        console.log(`📍 Path: ${cv.VersionData}`);

        const content = await fetchContent(cv.VersionData, sessionId, serverUrl);

        console.log(`✅ Success! Got ${content.length} characters`);
        console.log(`📄 Content preview:`);
        console.log(content.substring(0, 300) + '...\n');

      } catch (err) {
        console.error(`❌ Failed: ${err.message}\n`);
      }
    }

  } catch (err) {
    console.error('💥 Test failed:', err.message);
  }
}

if (require.main === module) {
  runTest();
}