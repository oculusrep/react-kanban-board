import 'dotenv/config';
import { Dropbox } from 'dropbox';

const BASE_PATH = '/Salesforce Documents';

async function testDropboxConnection() {
  console.log('\n' + '='.repeat(60));
  console.log('   DROPBOX CONNECTION TEST');
  console.log('='.repeat(60) + '\n');

  // Check if access token exists
  const accessToken = process.env.DROPBOX_ACCESS_TOKEN;

  if (!accessToken) {
    console.error('❌ DROPBOX_ACCESS_TOKEN not found in .env file\n');
    console.error('Run: npm run dropbox:auth to get your token\n');
    process.exit(1);
  }

  // Initialize Dropbox client
  const dbx = new Dropbox({ accessToken });

  try {
    // Test 1: Get current account
    console.log('🔍 Test 1: Checking account connection...\n');

    const accountResponse = await dbx.usersGetCurrentAccount();
    const account = accountResponse.result;

    console.log('✅ Connected as:', account.name.display_name);
    console.log('   Email:', account.email);
    console.log('   Account ID:', account.account_id);
    console.log('');

    // Test 2: List folder contents
    console.log('🔍 Test 2: Testing folder access...\n');
    console.log(`   Path: ${BASE_PATH}\n`);

    const folderResponse = await dbx.filesListFolder({
      path: BASE_PATH,
      limit: 5
    });

    const entries = folderResponse.result.entries;

    console.log(`✅ Found ${folderResponse.result.entries.length} items (showing first 5):\n`);

    entries.forEach((entry, index) => {
      const type = entry['.tag'] === 'folder' ? '📁' : '📄';
      console.log(`   ${index + 1}. ${type} ${entry.name}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Dropbox connection successful!');
    console.log('='.repeat(60) + '\n');
    console.log('✅ All tests passed!');
    console.log('✅ You can now run: npm run migrate:dropbox\n');

  } catch (error) {
    console.error('❌ Connection test failed!\n');

    if (error.error) {
      console.error('Error:', error.error.error_summary || error.error);
    } else {
      console.error('Error:', error.message);
    }

    console.error('\nTroubleshooting:');
    console.error('1. Check your DROPBOX_ACCESS_TOKEN in .env');
    console.error('2. Make sure the path exists in your Dropbox:');
    console.error(`   ${BASE_PATH}`);
    console.error('3. Verify permissions are enabled in Dropbox App Console:');
    console.error('   - files.metadata.read');
    console.error('   - files.content.read');
    console.error('   - files.content.write');
    console.error('4. If token expired (4 hours), run: npm run dropbox:refresh\n');

    process.exit(1);
  }
}

// Run the test
testDropboxConnection();
