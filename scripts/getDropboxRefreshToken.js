import 'dotenv/config';
import http from 'http';
import { parse } from 'url';

// Configuration - Replace these with your actual values from Dropbox Console
const APP_KEY = process.env.DROPBOX_APP_KEY || 'paste_your_app_key_here';
const APP_SECRET = process.env.DROPBOX_APP_SECRET || 'paste_your_app_secret_here';
const REDIRECT_URI = 'http://localhost:3000';

async function getDropboxTokens() {
  // Generate authorization URL
  const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${APP_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&token_access_type=offline`;

  console.log('\n' + '='.repeat(70));
  console.log('   DROPBOX OAUTH TOKEN GENERATION');
  console.log('='.repeat(70) + '\n');
  console.log('📋 Instructions:\n');
  console.log('1. Open the following URL in your browser:\n');
  console.log(`   ${authUrl}\n`);
  console.log('2. Click "Allow" to authorize the app');
  console.log('3. You will be redirected to localhost (page may not load - that\'s OK!)');
  console.log('4. Wait for this script to capture the authorization code...\n');
  console.log('='.repeat(70) + '\n');
  console.log('⏳ Waiting for authorization...\n');

  // Create HTTP server to catch OAuth callback
  const server = http.createServer(async (req, res) => {
    const url = parse(req.url, true);

    // Check if this is the OAuth callback
    if (url.pathname === '/' && url.query.code) {
      const authCode = url.query.code;

      console.log('✅ Authorization code received!');
      console.log('🔄 Exchanging code for tokens...\n');

      try {
        // Exchange authorization code for tokens
        const params = new URLSearchParams({
          code: authCode,
          grant_type: 'authorization_code',
          client_id: APP_KEY,
          client_secret: APP_SECRET,
          redirect_uri: REDIRECT_URI
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
          throw new Error(`Token exchange failed: ${error}`);
        }

        const tokens = await response.json();

        // Display tokens
        console.log('='.repeat(70));
        console.log('🎉 SUCCESS! Your Dropbox tokens:');
        console.log('='.repeat(70) + '\n');
        console.log('Add these to your .env file:\n');
        console.log(`DROPBOX_APP_KEY=${APP_KEY}`);
        console.log(`DROPBOX_APP_SECRET=${APP_SECRET}`);
        console.log(`DROPBOX_ACCESS_TOKEN=${tokens.access_token}`);
        console.log(`DROPBOX_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log('\n' + '='.repeat(70));
        console.log('⚠️  IMPORTANT NOTES:');
        console.log('='.repeat(70));
        console.log('- Access token expires in 4 hours');
        console.log('- Use: npm run dropbox:refresh to get a new access token');
        console.log('- Refresh token is long-lived (does not expire)');
        console.log('- NEVER commit these tokens to git');
        console.log('='.repeat(70) + '\n');

        // Send success page to browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Dropbox Auth Success</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .container {
                  background: white;
                  padding: 40px;
                  border-radius: 10px;
                  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                  text-align: center;
                }
                h1 { color: #0061ff; margin-top: 0; }
                p { color: #666; font-size: 18px; }
                .icon { font-size: 64px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="icon">✅</div>
                <h1>Dropbox Authorization Successful!</h1>
                <p>Check your terminal for your access tokens.</p>
                <p>You can close this window now.</p>
              </div>
            </body>
          </html>
        `);

        // Close server
        server.close();

      } catch (error) {
        console.error('\n❌ Error exchanging code for tokens:');
        console.error(error.message);
        console.error('\nTroubleshooting:');
        console.error('1. Check that APP_KEY and APP_SECRET are correct');
        console.error('2. Verify redirect URI is set to http://localhost:3000 in Dropbox Console');
        console.error('3. Make sure you authorized the correct app\n');

        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error: Check your terminal for details');

        server.close();
        process.exit(1);
      }
    }
  });

  // Start server on port 3000
  server.listen(3000, () => {
    console.log('🌐 Server listening on http://localhost:3000\n');
  });
}

// Run the function
getDropboxTokens().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
