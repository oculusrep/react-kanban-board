import 'dotenv/config';
import { Dropbox } from 'dropbox';
import { createClient } from '@supabase/supabase-js';

// Configuration
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
const BASE_PATH = '/Salesforce Documents';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key for admin operations
);

const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN });

// Salesforce ID prefix to entity type mapping
const SF_PREFIX_MAP = {
  '001': 'client',         // Salesforce Account
  '006': 'deal',           // Salesforce Opportunity
  'a00': 'property',       // Custom Salesforce Property object
  '003': 'contact',        // Salesforce Contact
  '00Q': 'contact',        // Salesforce Lead (migrated to contact table)
  'a1y': 'property_unit',  // Custom Salesforce Property Unit object
  // 'a1n': 'restaurant_trend',  // Restaurant Trends - table doesn't exist yet
};

/**
 * Get entity type from Salesforce ID prefix
 */
function getEntityTypeFromSfId(sfId) {
  const prefix = sfId.substring(0, 3);
  return SF_PREFIX_MAP[prefix] || null;
}

/**
 * Recursively scan Dropbox for all .sfdb files
 */
async function findAllSfdbFiles(path) {
  const sfdbFiles = [];

  console.log(`📁 Scanning path: ${path}`);

  try {
    // Initial folder listing (recursive scan)
    const response = await dbx.filesListFolder({
      path: path,
      recursive: true,        // Scan all subfolders
      include_deleted: false  // Don't include deleted files
    });

    // Filter for .sfdb files only
    const files = response.result.entries.filter(
      entry => entry['.tag'] === 'file' && entry.name.endsWith('.sfdb')
    );

    sfdbFiles.push(...files);
    console.log(`   Found ${files.length} .sfdb files in initial batch`);

    // Handle pagination (Dropbox returns max 2000 items per request)
    let hasMore = response.result.has_more;
    let cursor = response.result.cursor;

    while (hasMore) {
      console.log(`   Fetching more files...`);

      const continueResponse = await dbx.filesListFolderContinue({ cursor });

      const moreFiles = continueResponse.result.entries.filter(
        entry => entry['.tag'] === 'file' && entry.name.endsWith('.sfdb')
      );

      sfdbFiles.push(...moreFiles);
      console.log(`   Found ${moreFiles.length} more .sfdb files`);

      hasMore = continueResponse.result.has_more;
      cursor = continueResponse.result.cursor;
    }

    return sfdbFiles;

  } catch (error) {
    console.error('❌ Error scanning Dropbox:', error.error || error.message);
    throw error;
  }
}

/**
 * Main migration function
 */
async function migrateDropboxMappings() {
  // Print header
  console.log('\n' + '='.repeat(60));
  console.log('   DROPBOX FOLDER MAPPING MIGRATION');
  console.log('='.repeat(60) + '\n');
  console.log(`📍 Base Path: ${BASE_PATH}`);
  console.log(`🔗 Supabase URL: ${process.env.SUPABASE_URL}\n`);

  // Step 1: Scan Dropbox for .sfdb files
  console.log('🔍 Step 1: Scanning Dropbox for .sfdb files...\n');

  const sfdbFiles = await findAllSfdbFiles(BASE_PATH);

  console.log(`\n✅ Total .sfdb files found: ${sfdbFiles.length}\n`);

  // Exit early if no files found
  if (sfdbFiles.length === 0) {
    console.log('⚠️  No .sfdb files found. Check your BASE_PATH or Dropbox structure.\n');
    return;
  }

  // Step 2: Process each .sfdb file
  console.log('🔍 Step 2: Processing mappings...\n');

  // Initialize counters
  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;
  let unknownPrefixCount = 0;

  // Track stats by entity type
  const stats = {
    client: 0,
    property: 0,
    deal: 0,
    contact: 0,
    property_unit: 0
  };

  // Track records not found (for reporting)
  const notFoundRecords = [];

  // Loop through each .sfdb file
  for (let i = 0; i < sfdbFiles.length; i++) {
    const file = sfdbFiles[i];

    try {
      // Extract Salesforce ID from filename (remove .sfdb extension and leading dot)
      const sfId = file.name.replace('.sfdb', '').replace(/^\./, '');

      // Determine entity type from SF ID prefix
      const entityType = getEntityTypeFromSfId(sfId);

      // Skip if unknown prefix
      if (!entityType) {
        console.warn(`   ⚠️  Unknown SF ID prefix for: ${sfId}`);
        unknownPrefixCount++;
        continue;
      }

      // Get folder path (remove filename from full path)
      const folderPath = file.path_display.replace(`/${file.name}`, '');

      // Look up entity in Supabase by sf_id
      const { data: entity, error } = await supabase
        .from(entityType)
        .select('id')
        .eq('sf_id', sfId)
        .single();

      // Record not found in database
      if (error || !entity) {
        notFoundRecords.push(`${sfId} (${entityType})`);
        notFoundCount++;
        continue;
      }

      // UPSERT mapping to database
      const { error: upsertError } = await supabase
        .from('dropbox_folder_mapping')
        .upsert({
          entity_type: entityType,
          entity_id: entity.id,
          sf_id: sfId,
          dropbox_folder_path: folderPath,
          sfdb_file_found: true,
          last_verified_at: new Date().toISOString()
        }, {
          onConflict: 'entity_type,entity_id'
        });

      // Handle upsert errors
      if (upsertError) {
        console.error(`   ❌ Error upserting mapping for ${sfId}:`, upsertError.message);
        errorCount++;
      } else {
        // Success! Increment counters
        successCount++;
        stats[entityType]++;

        // Show progress every 50 records
        if (successCount % 50 === 0) {
          const percent = Math.round((successCount / sfdbFiles.length) * 100);
          console.log(`   📊 Progress: ${successCount}/${sfdbFiles.length} mapped (${percent}%)`);
        }
      }

    } catch (err) {
      console.error(`   ❌ Error processing file ${file.name}:`, err.message);
      errorCount++;
    }
  }

  // Display final results
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Migration Complete!\n');
  console.log('📊 Results Summary:');
  console.log('='.repeat(60));
  console.log(`✅ Successfully mapped:       ${successCount}`);
  console.log(`   - Clients:                 ${stats.client}`);
  console.log(`   - Properties:              ${stats.property}`);
  console.log(`   - Deals:                   ${stats.deal}`);
  console.log(`⚠️  Not found in database:    ${notFoundCount}`);
  console.log(`⚠️  Unknown ID prefixes:      ${unknownPrefixCount}`);
  console.log(`❌ Errors:                    ${errorCount}`);
  console.log('='.repeat(60));

  // Optionally list records not found (if reasonable number)
  if (notFoundRecords.length > 0 && notFoundRecords.length <= 20) {
    console.log('\n⚠️  Records not found in database:');
    notFoundRecords.forEach(record => console.log(`   - ${record}`));
  } else if (notFoundRecords.length > 20) {
    console.log(`\n⚠️  ${notFoundRecords.length} records not found (showing first 20):`);
    notFoundRecords.slice(0, 20).forEach(record => console.log(`   - ${record}`));
  }

  console.log('');
}

// Run migration with proper error handling
migrateDropboxMappings()
  .then(() => {
    console.log('✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
