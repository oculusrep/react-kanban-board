#!/usr/bin/env node

/**
 * Salesforce Notes Content Fetcher
 *
 * This script fetches full note content from Salesforce REST API using VersionData paths
 * that were synced via Airbyte. The VersionData field contains API endpoint paths that
 * need to be called to get the actual base64-encoded content.
 */

const fs = require('fs');
const https = require('https');

// Configuration - UPDATE THESE VALUES
const SALESFORCE_CONFIG = {
  instanceUrl: process.env.SF_INSTANCE_URL || 'https://your-instance.salesforce.com',
  accessToken: process.env.SF_ACCESS_TOKEN || 'your_access_token_here',
  // Alternative: Use username/password/security_token OAuth flow
  clientId: process.env.SF_CLIENT_ID,
  clientSecret: process.env.SF_CLIENT_SECRET,
  username: process.env.SF_USERNAME,
  password: process.env.SF_PASSWORD,
  securityToken: process.env.SF_SECURITY_TOKEN
};

/**
 * Get OAuth access token using username/password flow
 */
async function getAccessToken() {
  if (SALESFORCE_CONFIG.accessToken && SALESFORCE_CONFIG.accessToken !== 'your_access_token_here') {
    return SALESFORCE_CONFIG.accessToken;
  }

  const authUrl = `${SALESFORCE_CONFIG.instanceUrl}/services/oauth2/token`;
  const authData = new URLSearchParams({
    grant_type: 'password',
    client_id: SALESFORCE_CONFIG.clientId,
    client_secret: SALESFORCE_CONFIG.clientSecret,
    username: SALESFORCE_CONFIG.username,
    password: SALESFORCE_CONFIG.password + SALESFORCE_CONFIG.securityToken
  });

  return new Promise((resolve, reject) => {
    const postData = authData.toString();
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(authUrl, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            resolve(response.access_token);
          } else {
            reject(new Error(`OAuth failed: ${data}`));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Fetch content from a Salesforce VersionData API path
 */
async function fetchVersionData(versionDataPath, accessToken) {
  const fullUrl = `${SALESFORCE_CONFIG.instanceUrl}${versionDataPath}`;

  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    };

    https.get(fullUrl, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            // The response should be base64-encoded content
            const decodedContent = Buffer.from(data, 'base64').toString('utf8');
            resolve(decodedContent);
          } catch (err) {
            // If not base64, return raw data
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
 * Sample VersionData paths for testing
 * Replace these with actual paths from your database
 */
const SAMPLE_VERSION_PATHS = [
  '/services/data/v62.0/sobjects/ContentVersion/068460000007bU4AAI/VersionData',
  // Add more paths from your database query
];

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🔐 Authenticating with Salesforce...');
    const accessToken = await getAccessToken();
    console.log('✅ Authentication successful');

    console.log('📄 Fetching note content...');

    for (const path of SAMPLE_VERSION_PATHS) {
      try {
        console.log(`📥 Fetching: ${path}`);
        const content = await fetchVersionData(path, accessToken);

        console.log('📝 Content preview:');
        console.log(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
        console.log(`📊 Full length: ${content.length} characters`);
        console.log('---');

        // TODO: Update database with full content
        // await updateNoteInDatabase(versionId, content);

      } catch (err) {
        console.error(`❌ Failed to fetch ${path}:`, err.message);
      }
    }

  } catch (err) {
    console.error('❌ Script failed:', err.message);

    if (err.message.includes('OAuth failed')) {
      console.log('\n💡 Authentication help:');
      console.log('1. Set environment variables:');
      console.log('   export SF_INSTANCE_URL="https://your-instance.salesforce.com"');
      console.log('   export SF_ACCESS_TOKEN="your_token"');
      console.log('   OR');
      console.log('   export SF_CLIENT_ID="your_connected_app_id"');
      console.log('   export SF_CLIENT_SECRET="your_connected_app_secret"');
      console.log('   export SF_USERNAME="your_username"');
      console.log('   export SF_PASSWORD="your_password"');
      console.log('   export SF_SECURITY_TOKEN="your_security_token"');
    }
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { fetchVersionData, getAccessToken };