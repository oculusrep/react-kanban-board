#!/usr/bin/env node

/**
 * Quick Notes Fix - One-time script to fetch full Salesforce note content
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

// Salesforce credentials
const SF_CONFIG = {
  instanceUrl: 'https://d46000000rbetea2.my.salesforce.com',
  username: 'mike@oculusrep.com',
  password: 'VM54Toph',
  securityToken: 'UrQTwut4iy0sFBiwsYeae8YGr',
  // We need a Connected App - let's try Workbench's client ID
  clientId: '3MVG9CEn_O3jvv0xyYakj5PW_UCpMBQyGd4SJDQOZdkHqnGPCdT8D38TDcRKGd2JhZ8UUE8OEd_PBrQjbA9cO',
  clientSecret: 'generic_workbench_secret'
};

// Database config - YOU NEED TO SET THESE
const DB_CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || 'your_supabase_url_here',
  supabaseKey: process.env.SUPABASE_ANON_KEY || 'your_supabase_key_here'
};

let supabase;

/**
 * Get OAuth token using username/password flow
 */
async function getAccessToken() {
  return new Promise((resolve, reject) => {
    const tokenUrl = `${SF_CONFIG.instanceUrl}/services/oauth2/token`;
    const postData = new URLSearchParams({
      grant_type: 'password',
      client_id: SF_CONFIG.clientId,
      client_secret: SF_CONFIG.clientSecret,
      username: SF_CONFIG.username,
      password: SF_CONFIG.password + SF_CONFIG.securityToken
    }).toString();

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(tokenUrl, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            console.log('✅ OAuth authentication successful');
            resolve(response.access_token);
          } else {
            console.error('OAuth response:', data);
            reject(new Error(`OAuth failed: ${response.error_description || data}`));
          }
        } catch (err) {
          reject(new Error(`OAuth parse error: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`OAuth request failed: ${err.message}`));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Fetch content from VersionData API path
 */
async function fetchVersionDataContent(versionDataPath, accessToken) {
  return new Promise((resolve, reject) => {
    const fullUrl = `${SF_CONFIG.instanceUrl}${versionDataPath}`;
    const options = {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': '*/*'
      }
    };

    https.get(fullUrl, options, (res) => {
      let data = '';
      res.setEncoding('binary'); // Handle binary data properly

      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            // Convert binary to buffer then decode base64
            const buffer = Buffer.from(data, 'binary');
            const base64String = buffer.toString('base64');
            const decodedContent = Buffer.from(base64String, 'base64').toString('utf8');
            resolve(decodedContent);
          } catch (err) {
            // If decode fails, try as direct text
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Main test function
 */
async function quickTest() {
  try {
    console.log('🚀 Starting quick notes fix test...\n');

    // Check database config
    if (DB_CONFIG.supabaseUrl.includes('your_supabase')) {
      console.error('❌ Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables');
      console.log('Example:');
      console.log('export SUPABASE_URL="https://your-project.supabase.co"');
      console.log('export SUPABASE_ANON_KEY="your_anon_key"');
      return;
    }

    supabase = createClient(DB_CONFIG.supabaseUrl, DB_CONFIG.supabaseKey);

    // Test database connection
    console.log('🔍 Testing database connection...');
    const { data: testData, error: testError } = await supabase
      .from('salesforce_ContentVersion')
      .select('Id')
      .limit(1);

    if (testError) {
      console.error('❌ Database connection failed:', testError.message);
      return;
    }

    console.log('✅ Database connection successful');

    // Get OAuth token
    console.log('🔐 Getting Salesforce access token...');
    const accessToken = await getAccessToken();

    // Get a few VersionData paths to test
    console.log('📋 Getting VersionData paths from database...');
    const { data: versionData, error: versionError } = await supabase
      .from('salesforce_ContentVersion')
      .select('Id, VersionData, ContentSize, Title')
      .not('VersionData', 'is', null)
      .gt('ContentSize', 255)
      .limit(3);

    if (versionError) {
      console.error('❌ Failed to get VersionData:', versionError.message);
      return;
    }

    if (!versionData || versionData.length === 0) {
      console.log('⚠️  No VersionData paths found in database');
      return;
    }

    console.log(`📊 Found ${versionData.length} VersionData paths to test\n`);

    // Test fetching content
    for (const cv of versionData) {
      try {
        console.log(`📥 Testing: ${cv.Title || cv.Id}`);
        console.log(`📍 Path: ${cv.VersionData}`);
        console.log(`📏 Expected size: ${cv.ContentSize} characters`);

        const fullContent = await fetchVersionDataContent(cv.VersionData, accessToken);

        console.log(`✅ Success! Retrieved ${fullContent.length} characters`);
        console.log(`📄 Preview: ${fullContent.substring(0, 150)}...`);
        console.log('---\n');

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (err) {
        console.error(`❌ Failed: ${err.message}\n`);
      }
    }

    console.log('🎉 Test complete! If you see full content above, the approach works.');

  } catch (err) {
    console.error('💥 Test failed:', err.message);
  }
}

if (require.main === module) {
  quickTest();
}