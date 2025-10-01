import 'dotenv/config';
import { Dropbox } from 'dropbox';
import fs from 'fs';

const BASE_PATH = '/Salesforce Documents';
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

async function analyzeMissingRecords() {
  const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN });

  console.log('🔍 Analyzing missing Dropbox records...\n');

  const missingRecords = [];
  let cursor = null;

  // Scan all .sfdb files
  const response = await dbx.filesListFolder({
    path: BASE_PATH,
    recursive: true
  });

  let allFiles = response.result.entries.filter(f => f.name.endsWith('.sfdb'));
  cursor = response.result.cursor;

  while (response.result.has_more) {
    const moreResponse = await dbx.filesListFolderContinue({ cursor });
    const moreFiles = moreResponse.result.entries.filter(f => f.name.endsWith('.sfdb'));
    allFiles = allFiles.concat(moreFiles);
    cursor = moreResponse.result.cursor;
  }

  console.log(`Found ${allFiles.length} total .sfdb files\n`);

  // Known missing IDs from migration output
  const missingIds = [
    'a004o000006cCPWAA2', 'a004o00000ATTW5AAP', 'a004o00000ATULHAA5', 'a004o00000ATULMAA5',
    'a004o00000ATVRXAA5', 'a004o00000ATVRwAAP', 'a004o00000ATYb2AAH', 'a00Kh00000ATo3jIAD',
    'a00Kh00000ATo48IAD', 'a00Kh00000ATo88IAD', 'a00Kh00000ATw1vIAD', 'a00Kh00000AU2NzIAL',
    'a00Kh00000AU9lDIAT', 'a00Vn000002AgOFIA0', 'a00Vn000002rOeBIAU', 'a00Vn000002rJUwIAM',
    'a00Vn000002z2LXIAY', 'a00Vn0000035UrpIAE', 'a00Vn0000035fqRIAQ', 'a00Vn0000044gEWIAY'
  ];

  // Find folders for each missing ID
  for (const sfId of missingIds) {
    const file = allFiles.find(f => {
      const extractedId = f.name.replace('.sfdb', '').replace(/^\./, '');
      return extractedId === sfId;
    });

    if (file) {
      // Get folder path (remove filename)
      const folderPath = file.path_display.substring(0, file.path_display.lastIndexOf('/'));

      // List files in this folder
      try {
        const folderContents = await dbx.filesListFolder({ path: folderPath });
        const fileCount = folderContents.result.entries.filter(e => e['.tag'] === 'file' && !e.name.endsWith('.sfdb')).length;

        missingRecords.push({
          sf_id: sfId,
          folder_path: folderPath,
          folder_name: folderPath.split('/').pop(),
          file_count: fileCount,
          has_files: fileCount > 0
        });
      } catch (err) {
        console.error(`Error listing folder for ${sfId}:`, err.message);
      }
    }
  }

  // Generate report
  console.log('📋 Missing Records Report (first 20):');
  console.log('='.repeat(100));
  console.log('SF ID                | Folder Name                          | Files | Folder Path');
  console.log('-'.repeat(100));

  missingRecords.slice(0, 20).forEach(r => {
    console.log(
      `${r.sf_id.padEnd(20)} | ${r.folder_name.substring(0, 36).padEnd(36)} | ${String(r.file_count).padStart(5)} | ${r.folder_path}`
    );
  });

  console.log('\n📊 Summary:');
  console.log(`Total missing records analyzed: ${missingRecords.length}`);
  console.log(`Records with files: ${missingRecords.filter(r => r.has_files).length}`);
  console.log(`Records with no files: ${missingRecords.filter(r => !r.has_files).length}`);

  // Save full report to file
  const report = {
    generated_at: new Date().toISOString(),
    total_missing: missingRecords.length,
    records: missingRecords
  };

  fs.writeFileSync(
    '/workspaces/react-kanban-board/missing_dropbox_records.json',
    JSON.stringify(report, null, 2)
  );

  console.log('\n✅ Full report saved to: missing_dropbox_records.json');
  console.log('\n💡 These records likely represent:');
  console.log('   • Deleted/archived Salesforce records not migrated to new system');
  console.log('   • Test records from old Salesforce instance');
  console.log('   • Records that failed to migrate during Salesforce → Supabase migration');
  console.log('\n💡 Options:');
  console.log('   1. Leave as-is (74 folders will exist in Dropbox but not accessible via app)');
  console.log('   2. Manually review and delete empty folders from Dropbox');
  console.log('   3. Create placeholder records in database if folders contain important files');
}

analyzeMissingRecords().catch(console.error);
