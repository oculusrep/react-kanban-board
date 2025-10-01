# Dropbox Folder Mapping Migration Script - Detailed Instructions

## Overview

This migration script scans your entire Dropbox "Salesforce Documents" folder structure, finds all `.sfdb` marker files, extracts Salesforce IDs, and creates mappings in your Supabase database to link Dropbox folders with your CRM records.

## Context

**What are .sfdb files?**
- Marker files created by "Dropbox for Salesforce" plugin
- Named with Salesforce record IDs (e.g., `001R000001234567.sfdb`)
- Located in each record's Dropbox folder
- Link Salesforce records to their file storage

**Expected Scale:**
- ~3000 properties
- ~670 deals  
- ~532 clients
- **Total: ~4200 folders to scan**

**Salesforce ID Prefixes:**
- `001` = Account → maps to `client` table
- `006` = Opportunity → maps to `deal` table
- `a00` = Custom Property → maps to `property` table

---

## File to Create

**File:** `scripts/migrateDropboxMappings.js`

**Location:** Create in your project's `scripts/` directory

---

## Script Requirements

### Imports and Configuration

```javascript
// Import required modules
import 'dotenv/config';
import { Dropbox } from 'dropbox';
import { createClient } from '@supabase/supabase-js';

// Configuration constants
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
const BASE_PATH = '/Oculus Dropbox/Mike Minihan/Salesforce Documents';

// Initialize Supabase client with service key (admin access)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Initialize Dropbox client
const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN });

// Salesforce ID prefix to entity type mapping
const SF_PREFIX_MAP = {
  '001': 'client',      // Salesforce Account
  '006': 'deal',        // Salesforce Opportunity
  'a00': 'property',    // Custom Salesforce Property object
};
```

---

## Main Migration Function

### Function: `migrateDropboxMappings()`

This is the main orchestrator function. It should:

#### 1. Print Welcome Banner

```javascript
console.log('\n' + '='.repeat(60));
console.log('   DROPBOX FOLDER MAPPING MIGRATION');
console.log('='.repeat(60) + '\n');
console.log(`📍 Base Path: ${BASE_PATH}`);
console.log(`🔗 Supabase URL: ${process.env.SUPABASE_URL}\n`);
```

#### 2. Scan Dropbox for .sfdb Files

```javascript
console.log('🔍 Step 1: Scanning Dropbox for .sfdb files...\n');

const sfdbFiles = await findAllSfdbFiles(BASE_PATH);

console.log(`\n✅ Total .sfdb files found: ${sfdbFiles.length}\n`);

// Exit early if no files found
if (sfdbFiles.length === 0) {
  console.log('⚠️ No .sfdb files found. Check your BASE_PATH or Dropbox structure.');
  return;
}
```

#### 3. Process Each .sfdb File

```javascript
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
  deal: 0
};

// Track records not found (for reporting)
const notFoundRecords = [];

// Loop through each .sfdb file
for (let i = 0; i < sfdbFiles.length; i++) {
  const file = sfdbFiles[i];
  
  try {
    // Extract Salesforce ID from filename
    const sfId = file.name.replace('.sfdb', '');
    
    // Determine entity type from SF ID prefix
    const entityType = getEntityTypeFromSfId(sfId);
    
    // Skip if unknown prefix
    if (!entityType) {
      console.warn(`   ⚠️ Unknown SF ID prefix for: ${sfId}`);
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
```

#### 4. Display Final Results

```javascript
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
  console.log('\n⚠️ Records not found in database:');
  notFoundRecords.forEach(record => console.log(`   - ${record}`));
} else if (notFoundRecords.length > 20) {
  console.log(`\n⚠️ ${notFoundRecords.length} records not found (showing first 20):`);
  notFoundRecords.slice(0, 20).forEach(record => console.log(`   - ${record}`));
}

console.log('');
```

---

## Helper Function: `findAllSfdbFiles()`

This function recursively scans Dropbox for all `.sfdb` marker files.

### Function: `findAllSfdbFiles(path)`

**Parameters:** 
- `path` (string): Dropbox folder path to scan

**Returns:** 
- Array of file objects with `.sfdb` extension

**Implementation:**

```javascript
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
```

**Key Points:**
- Uses `recursive: true` to scan entire folder tree
- Filters only files ending with `.sfdb`
- Handles pagination for large folder structures (>2000 files)
- Shows progress during scan

---

## Helper Function: `getEntityTypeFromSfId()`

Maps Salesforce ID prefixes to entity types.

### Function: `getEntityTypeFromSfId(sfId)`

**Parameters:**
- `sfId` (string): Salesforce record ID (e.g., "001R000001234567")

**Returns:**
- Entity type string ('client', 'property', 'deal') or `null` if unknown

**Implementation:**

```javascript
function getEntityTypeFromSfId(sfId) {
  // Extract first 3 characters (Salesforce ID prefix)
  const prefix = sfId.substring(0, 3);
  
  // Look up in mapping
  return SF_PREFIX_MAP[prefix] || null;
}
```

**Examples:**
- `getEntityTypeFromSfId('001R000001234567')` → `'client'`
- `getEntityTypeFromSfId('006R000009876543')` → `'deal'`
- `getEntityTypeFromSfId('a00R000005555555')` → `'property'`
- `getEntityTypeFromSfId('999XXXXXXXXXXXX')` → `null`

---

## Script Entry Point

Wrap the main function with error handling:

```javascript
// Run migration with proper error handling
console.log('\n' + '='.repeat(60));
console.log('   DROPBOX FOLDER MAPPING MIGRATION');
console.log('='.repeat(60));

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
```

---

## Complete Script Structure

```
scripts/migrateDropboxMappings.js
│
├── Imports & Configuration
│   ├── Load environment variables
│   ├── Initialize Dropbox client
│   ├── Initialize Supabase client
│   └── Define SF_PREFIX_MAP
│
├── Helper Functions
│   ├── findAllSfdbFiles(path)
│   │   ├── Scan Dropbox recursively
│   │   ├── Filter .sfdb files
│   │   ├── Handle pagination
│   │   └── Return file array
│   │
│   └── getEntityTypeFromSfId(sfId)
│       ├── Extract prefix
│       └── Map to entity type
│
├── Main Migration Function
│   ├── migrateDropboxMappings()
│   │   ├── Print welcome banner
│   │   ├── Scan for .sfdb files
│   │   ├── Process each file
│   │   │   ├── Extract SF ID
│   │   │   ├── Determine entity type
│   │   │   ├── Look up in database
│   │   │   ├── UPSERT mapping
│   │   │   └── Track statistics
│   │   └── Display results
│
└── Entry Point
    ├── Run migration
    ├── Handle success
    └── Handle errors
```

---

## Expected Output

When you run `npm run migrate:dropbox`, you should see:

```
============================================================
   DROPBOX FOLDER MAPPING MIGRATION
============================================================

📍 Base Path: /Oculus Dropbox/Mike Minihan/Salesforce Documents
🔗 Supabase URL: https://your-project.supabase.co

🔍 Step 1: Scanning Dropbox for .sfdb files...

📁 Scanning path: /Oculus Dropbox/Mike Minihan/Salesforce Documents
   Found 2000 .sfdb files in initial batch
   Fetching more files...
   Found 2000 more .sfdb files
   Fetching more files...
   Found 202 more .sfdb files

✅ Total .sfdb files found: 4202

🔍 Step 2: Processing mappings...

   📊 Progress: 50/4202 mapped (1%)
   📊 Progress: 100/4202 mapped (2%)
   📊 Progress: 150/4202 mapped (4%)
   ...
   📊 Progress: 4150/4202 mapped (99%)
   📊 Progress: 4200/4202 mapped (100%)

============================================================
🎉 Migration Complete!

📊 Results Summary:
============================================================
✅ Successfully mapped:       4195
   - Clients:                 532
   - Properties:              2998
   - Deals:                   665
⚠️  Not found in database:    5
⚠️  Unknown ID prefixes:      2
❌ Errors:                    0
============================================================

⚠️ Records not found in database:
   - 001R000001111111 (client)
   - 006R000002222222 (deal)
   - a00R000003333333 (property)
   - 001R000004444444 (client)
   - 006R000005555555 (deal)

✅ Script completed successfully
```

---

## Database Operations

### What Gets Stored

For each successful mapping, the script creates a record in `dropbox_folder_mapping`:

```sql
INSERT INTO dropbox_folder_mapping (
  entity_type,
  entity_id,
  sf_id,
  dropbox_folder_path,
  sfdb_file_found,
  last_verified_at
) VALUES (
  'client',                                           -- Entity type
  '550e8400-e29b-41d4-a716-446655440000',            -- UUID from your database
  '001R000001234567',                                 -- Salesforce ID
  '/Oculus Dropbox/.../Accounts/Acme Corp',          -- Full Dropbox path
  true,                                               -- .sfdb file was found
  '2025-09-30T15:30:00Z'                             -- Timestamp
)
ON CONFLICT (entity_type, entity_id) DO UPDATE SET
  dropbox_folder_path = EXCLUDED.dropbox_folder_path,
  last_verified_at = EXCLUDED.last_verified_at;
```

### UPSERT Pattern

The script uses `UPSERT` (insert or update) with conflict resolution:

```javascript
.upsert({
  entity_type: entityType,
  entity_id: entity.id,
  sf_id: sfId,
  dropbox_folder_path: folderPath,
  sfdb_file_found: true,
  last_verified_at: new Date().toISOString()
}, {
  onConflict: 'entity_type,entity_id'  // Update if this combination exists
});
```

**Benefits:**
- ✅ Safe to run multiple times
- ✅ Won't create duplicates
- ✅ Updates paths if they changed
- ✅ Updates verification timestamp

---

## Performance Characteristics

### Speed
- **Initial scan:** 30-60 seconds (depends on folder count)
- **Processing:** 2-5 minutes for ~4200 records
- **Database operations:** ~5-10 operations per second
- **Total time:** 3-6 minutes end-to-end

### Memory
- **Peak usage:** ~50-100 MB
- **File list in memory:** ~4200 objects
- **No streaming needed:** Entire list fits in memory

### API Calls
- **Dropbox API:** 3-5 requests (handles pagination)
- **Supabase API:** ~8400 requests (2 per record: lookup + upsert)

---

## Error Handling

### Common Errors and Solutions

#### 1. Authentication Error
```
❌ Error scanning Dropbox: invalid_access_token
```

**Solution:**
```bash
npm run dropbox:refresh
# Copy new token to .env
# Re-run migration
```

#### 2. Path Not Found
```
❌ Error scanning Dropbox: path/not_found
```

**Solution:**
- Check BASE_PATH in script
- Verify path exists in Dropbox
- Check for typos in folder names

#### 3. Rate Limit
```
❌ Error: too_many_requests
```

**Solution:**
- Wait 1 minute
- Re-run script (will pick up where it left off with UPSERT)

#### 4. Network Error
```
❌ Error: ECONNRESET
```

**Solution:**
- Check internet connection
- Re-run script (safe to re-run)

---

## Verification

After migration completes, verify results:

### 1. Check Database

```sql
-- Count total mappings
SELECT COUNT(*) FROM dropbox_folder_mapping;
-- Should be ~4200

-- Count by entity type
SELECT entity_type, COUNT(*) 
FROM dropbox_folder_mapping 
GROUP BY entity_type;
-- Should show: client: 532, property: 2998, deal: 665

-- Sample some records
SELECT * FROM dropbox_folder_mapping LIMIT 10;
```

### 2. Verify Specific Record

```sql
-- Look up a specific client by SF ID
SELECT 
  dfm.*,
  c.client_name
FROM dropbox_folder_mapping dfm
JOIN client c ON c.id = dfm.entity_id
WHERE dfm.sf_id = '001R000001234567';
```

### 3. Check for Orphans

```sql
-- Find mappings with no corresponding entity (shouldn't happen)
SELECT * FROM dropbox_folder_mapping dfm
LEFT JOIN client c ON c.id = dfm.entity_id AND dfm.entity_type = 'client'
LEFT JOIN property p ON p.id = dfm.entity_id AND dfm.entity_type = 'property'
LEFT JOIN deal d ON d.id = dfm.entity_id AND dfm.entity_type = 'deal'
WHERE c.id IS NULL AND p.id IS NULL AND d.id IS NULL;
-- Should return 0 rows
```

---

## Troubleshooting

### "Not found in database" Records

**What it means:**
- .sfdb file exists in Dropbox
- But no record with that `sf_id` in your database

**Possible reasons:**
1. Record was deleted in Salesforce but files remain
2. Record hasn't been migrated from Salesforce yet
3. Record belongs to a different object type not yet supported

**Action:**
- This is normal
- Review the list in migration output
- Decide if you need to migrate those records

### "Unknown ID prefix" Records

**What it means:**
- .sfdb file has a Salesforce ID with unknown prefix
- Not in SF_PREFIX_MAP (001, 006, a00)

**Possible reasons:**
1. Contact records (prefix 003) - not yet supported
2. Other custom objects
3. Legacy or deleted object types

**Action:**
- Review which prefixes appear
- Add to SF_PREFIX_MAP if needed:

```javascript
const SF_PREFIX_MAP = {
  '001': 'client',
  '006': 'deal',
  'a00': 'property',
  '003': 'contact',    // Add if needed
  'a01': 'unit',       // Add if needed
};
```

### Slow Performance

**If migration is taking >10 minutes:**

1. Check internet connection
2. Check Supabase region (latency)
3. Consider batching (process in chunks)

**Optimization option:**

```javascript
// Process in batches of 100
const batchSize = 100;
for (let i = 0; i < sfdbFiles.length; i += batchSize) {
  const batch = sfdbFiles.slice(i, i + batchSize);
  await Promise.all(batch.map(processSingleFile));
}
```

---

## Re-running the Migration

The script is **safe to run multiple times** because:

1. Uses UPSERT pattern (no duplicates)
2. Updates existing records with new timestamps
3. Won't fail if records already exist

**When to re-run:**
- After migrating more Salesforce records
- If paths change in Dropbox
- To update verification timestamps
- To fix errors from previous run

---

## Next Steps

After successful migration:

1. ✅ Verify database has ~4200 records
2. ✅ Spot-check some mappings in Supabase
3. ✅ Build React sidebar component to display files
4. ✅ Test file upload/download functionality
5. ✅ Add to your regular maintenance procedures

---

## Maintenance

### Monthly
- Re-run migration to catch new records
- Verify all mappings are current

### When Salesforce Shuts Down (2 months)
- Run final migration
- Consider archiving .sfdb files
- Document final state for future reference

---

## Summary

This migration script:
- ✅ Scans entire Dropbox folder structure
- ✅ Finds all .sfdb marker files (~4200 expected)
- ✅ Extracts Salesforce IDs from filenames
- ✅ Maps to entity types (client, property, deal)
- ✅ Looks up records in Supabase
- ✅ Creates mappings in dropbox_folder_mapping table
- ✅ Shows detailed progress and statistics
- ✅ Safe to run multiple times (UPSERT pattern)
- ✅ Completes in 3-6 minutes

**Result:** Database table linking every CRM record to its Dropbox folder for seamless file access in your new system.