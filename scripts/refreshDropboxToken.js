import 'dotenv/config';

async function refreshDropboxToken() {
  console.log('\n' + '='.repeat(60));
  console.log('   DROPBOX TOKEN REFRESH');
  console.log('='.repeat(60) + '\n');

  // Validate environment variables
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;

  if (!refreshToken || !appKey || !appSecret) {
    console.error('❌ Missing required environment variables!\n');
    console.error('Please ensure your .env file contains:');
    console.error('  - DROPBOX_REFRESH_TOKEN');
    console.error('  - DROPBOX_APP_KEY');
    console.error('  - DROPBOX_APP_SECRET\n');
    process.exit(1);
  }

  console.log('🔄 Refreshing access token...\n');

  try {
    // Request new access token using refresh token
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret
    });

    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const data = await response.json();

    // Display new token
    console.log('='.repeat(60));
    console.log('✅ New Access Token Generated:');
    console.log('='.repeat(60) + '\n');
    console.log(data.access_token);
    console.log('\n' + '='.repeat(60));
    console.log('📝 Update your .env file:');
    console.log('='.repeat(60) + '\n');
    console.log(`DROPBOX_ACCESS_TOKEN=${data.access_token}`);
    console.log('\n' + '='.repeat(60));
    console.log('⏰ This token will expire in 4 hours');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error refreshing token:\n');
    console.error(error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify DROPBOX_REFRESH_TOKEN is correct in .env');
    console.error('2. Check DROPBOX_APP_KEY and DROPBOX_APP_SECRET');
    console.error('3. If refresh token is invalid, run: npm run dropbox:auth\n');
    process.exit(1);
  }
}

// Run the refresh
refreshDropboxToken();
