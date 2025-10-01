# Dropbox Integration Setup - Claude Code Instructions

## Project Context

We are building a Dropbox file integration for a commercial real estate CRM that is migrating away from Salesforce. The system currently uses "Dropbox for Salesforce" which stores files in Dropbox folders linked to Salesforce records via `.sfdb` marker files.

### Current Situation:
- Salesforce will be shut down in 2 months
- Files are stored in: `/Oculus Dropbox/Mike Minihan/Salesforce Documents/`
- Each record's folder contains a `.sfdb` file named with the Salesforce ID (e.g., `001R000001234567.sfdb`)
- We need to map these Dropbox folders to our new Supabase database records
- Database has `client`, `property`, and `deal` tables with `sf_id` fields

### Salesforce ID Prefixes:
- `001` = Account → maps to `client` table
- `006` = Opportunity → maps to `deal` table  
- `a00` = Custom Property object → maps to `property` table

### Architecture:
1. **One-time migration script** to scan Dropbox and build mappings
2. **Database table** to store folder path mappings
3. **React components** to display files in sidebar on Client/Property/Deal pages
4. **Full read/write access** - users can view, upload, create folders, delete files

### Security:
- Using Full Dropbox access (can't move files without breaking Salesforce)
- Code-level path restriction to Salesforce Documents folder only
- Token stored in environment variables
- Temporary solution (2 months until Salesforce shutdown)

### Expected Scale:
- ~3000 properties
- ~670 deals
- ~532 clients
- Total: ~4200 folders to scan

---

## Task 1: Create OAuth Token Generation Script

**Purpose:** Generate long-lived Dropbox access and refresh tokens using OAuth 2.0 flow.

**File:** `scripts/getDropboxRefreshToken.js`

**Requirements:**
```javascript
// Import required modules
import http from 'http';
import { parse } from 'url';

// Configuration
const APP_KEY = 'paste_your_app_key_here'; // User will replace this
const APP_SECRET = 'paste_your_app_secret_here'; // User will replace this
const REDIRECT_URI = 'http://localhost:3000';

// Main functionality needed:
// 1. Generate Dropbox OAuth authorization URL with these parameters:
//    - client_id: APP_KEY
//    - redirect_uri: REDIRECT_URI
//    - response_type: code
//    - token_access_type: offline (CRITICAL - ensures refresh token)

// 2. Display clear instructions to user:
//    - Print the authorization URL
//    - Tell them to open it in browser
//    - Tell them to click "Allow"
//    - Tell them they'll be redirected to localhost

// 3. Start HTTP server on port 3000 to catch OAuth callback

// 4. When callback received with 'code' parameter:
//    - Exchange code for tokens via POST to https://api.dropboxapi.com/oauth2/token
//    - Body parameters: code, grant_type=authorization_code, client_id, client_secret, redirect_uri
//    - Content-Type: application/x-www-form-urlencoded

// 5. Display tokens in formatted output:
//    DROPBOX_APP_KEY=...
//    DROPBOX_APP_SECRET=...
//    DROPBOX_ACCESS_TOKEN=...
//    DROPBOX_REFRESH_TOKEN=...
//    
//    Include note that access token expires in 4 hours

// 6. Show success HTML page in browser:
//    - Title: "Dropbox Auth Success"
//    - Message: "Check your terminal for tokens"
//    - Style: centered, readable

// 7. Close server after successful exchange

// Error handling:
// - Catch and display errors clearly
// - Show helpful troubleshooting if token exchange fails
```

**User actions after file is created:**
1. Replace `paste_your_app_key_here` with actual App key from Dropbox Console
2. Replace `paste_your_app_secret_here` with actual App secret from Dropbox Console
3. Save file
4. Run: `npm run dropbox:auth`

---

## Task 2: Create Token Refresh Script

**Purpose:** Refresh expired access token using refresh token (access tokens expire every 4 hours).

**File:** `scripts/refreshDropboxToken.js`

**Requirements:**
```javascript
// Import dotenv to load environment variables
import 'dotenv/config';

// Main functionality needed:
// 1. Read from process.env:
//    - DROPBOX_REFRESH_TOKEN
//    - DROPBOX_APP_KEY
//    - DROPBOX_APP_SECRET

// 2. Make POST request to https://api.dropboxapi.com/oauth2/token
//    - Body parameters:
//      - grant_type: refresh_token
//      - refresh_token: from env
//      - client_id: from env (APP_KEY)
//      - client_secret: from env (APP_SECRET)
//    - Content-Type: application/x-www-form-urlencoded

// 3. Parse response and extract new access_token

// 4. Display new token clearly:
//    ✅ New Access Token Generated:
//    
//    [token value]
//    
//    📝 Update your .env file:
//    DROPBOX_ACCESS_TOKEN=[token value]

// Error handling:
// - If refresh fails, show error message
// - Display what's wrong (missing env vars, invalid refresh token, etc.)
```

**User will run:** `npm run dropbox:refresh` when access token expires

---

## Task 3: Create Connection Test Script

**Purpose:** Verify Dropbox API connection, permissions, and folder access.

**File:** `scripts/testDropbox.js`

**Requirements:**
```javascript
// Import required modules
import 'dotenv/config';
import { Dropbox } from 'dropbox';

// Initialize Dropbox client
const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });

// Test function should:
// 1. Test connection by calling usersGetCurrentAccount()
//    - Display: ✅ Connected as: [name]
//    - Display: Email: [email]

// 2. Test folder access by listing:
//    Path: '/Oculus Dropbox/Mike Minihan/Salesforce Documents'
//    - Use filesListFolder with limit: 5
//    - Display: ✅ Found X items (showing first 5):
//    - List each item: name and type (file/folder)

// 3. Success message: 🎉 Dropbox connection successful!

// Error handling with specific troubleshooting:
// - Catch errors and display friendly message
// - Show troubleshooting steps:
//   1. Check your DROPBOX_ACCESS_TOKEN in .env
//   2. Make sure the path exists in your Dropbox
//   3. Verify permissions are enabled in Dropbox App Console
```

**User will run:** `npm run dropbox:test` to verify setup

---

## Task 4: Update package.json Scripts

**Purpose:** Add convenient npm scripts for Dropbox utilities.

**File:** `package.json`

**Instructions:**
Add these scripts to the existing "scripts" section (don't remove existing scripts):

```json
"dropbox:auth": "node scripts/getDropboxRefreshToken.js",
"dropbox:refresh": "node scripts/refreshDropboxToken.js",
"dropbox:test": "node scripts/testDropbox.js",
"migrate:dropbox": "node scripts/migrateDropboxMappings.js"
```

**Result:** Users can run:
- `npm run dropbox:auth` - Get initial tokens
- `npm run dropbox:refresh` - Refresh expired token
- `npm run dropbox:test` - Verify connection
- `npm run migrate:dropbox` - Build folder mappings

---

## Task 5: Update .env.example

**Purpose:** Document required Dropbox environment variables for other developers.

**File:** `.env.example`

**Instructions:**
Add this section to .env.example (keep existing variables):

```env
# =============================================================================
# Dropbox API Configuration
# =============================================================================
# Get these from: https://www.dropbox.com/developers/apps
# 1. Create app with "Full Dropbox" access
# 2. Enable file and sharing permissions
# 3. Run: npm run dropbox:auth to get tokens
# 
# IMPORTANT:
# - Access token expires every 4 hours
# - Use: npm run dropbox:refresh to get new access token
# - Refresh token is long-lived (doesn't expire)
# - NEVER commit these tokens to git
# =============================================================================

DROPBOX_APP_KEY=your_app_key_from_dropbox_console
DROPBOX_APP_SECRET=your_app_secret_from_dropbox_console
DROPBOX_ACCESS_TOKEN=your_access_token_here
DROPBOX_REFRESH_TOKEN=your_refresh_token_here
```

---

## Task 6: Verify .gitignore

**Purpose:** Ensure environment files are never committed to version control.

**File:** `.gitignore`

**Instructions:**
Check if these entries exist in .gitignore. If not, add them:

```
# Environment variables
.env
.env.local
.env.production
.env.*.local
.env.development.local
.env.test.local
.env.production.local
```

---

## Task 7: Create Dropbox Service Class

**Purpose:** Encapsulate all Dropbox API operations with security validation.

**File:** `src/services/dropboxService.ts`

**Requirements:**
```typescript
// This service provides secure access to Dropbox API operations
// CRITICAL: All path operations must validate against ALLOWED_BASE_PATH

import { Dropbox } from 'dropbox';

// TypeScript interfaces
interface DropboxFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number | null;
  modified: string | null;
  shared_link: string | null;
}

class DropboxService {
  private dbx: Dropbox;
  private readonly ALLOWED_BASE_PATH = '/Oculus Dropbox/Mike Minihan/Salesforce Documents';
  
  constructor(accessToken: string) {
    this.dbx = new Dropbox({ accessToken });
  }
  
  // CRITICAL: Validate all paths before operations
  private validatePath(path: string): void {
    if (!path.startsWith(this.ALLOWED_BASE_PATH)) {
      throw new Error('Security violation: Path outside allowed directory');
    }
  }
  
  // Method: listFolderContents(folderPath: string): Promise<DropboxFile[]>
  // - Validate path first
  // - Call filesListFolder with path, recursive=false, include_deleted=false
  // - Filter out .sfdb files (don't show to users)
  // - Map entries to DropboxFile interface
  // - Return array of DropboxFile objects
  
  // Method: getSharedLink(path: string): Promise<string>
  // - Validate path first
  // - Try to create shared link with sharingCreateSharedLinkWithSettings
  // - Settings: requested_visibility='public', audience='public', access='viewer'
  // - If error 409 (already exists), fetch existing with sharingListSharedLinks
  // - Return URL string
  
  // Method: uploadFile(file: File, folderPath: string, fileName?: string): Promise<DropboxFile>
  // - Validate path first
  // - Construct upload path: folderPath + filename
  // - Use filesUpload with: path, contents=file, mode='add', autorename=true
  // - autorename=true adds (1), (2) if file exists
  // - Return uploaded file as DropboxFile object
  
  // Method: createFolder(folderPath: string): Promise<DropboxFile>
  // - Validate path first
  // - Use filesCreateFolderV2 with path, autorename=false
  // - Return created folder as DropboxFile object
  
  // Method: deleteFileOrFolder(path: string): Promise<void>
  // - Validate path first
  // - Use filesDeleteV2 with path
  // - Return void (no response needed)
  
  // All methods should have try/catch with meaningful error messages
}

export default DropboxService;
```

**Key security feature:** `validatePath()` prevents access to files outside Salesforce Documents folder

---

## Task 8: Create React Hook for Dropbox Files

**Purpose:** React hook to manage Dropbox files for a specific entity (client/property/deal).

**File:** `src/hooks/useDropboxFiles.ts`

**Requirements:**
```typescript
// Hook to fetch and manage Dropbox files for an entity
// Handles: loading state, file list, uploads, folder creation

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import DropboxService from '../services/dropboxService';

// Return type
interface UseDropboxFilesReturn {
  files: DropboxFile[];
  folderPath: string | null;
  loading: boolean;
  uploading: boolean;
  error: string | null;
  refreshFiles: () => Promise<void>;
  uploadFiles: (fileList: FileList) => Promise<void>;
  createFolder: (folderName: string) => Promise<void>;
  deleteItem: (path: string) => Promise<void>;
  getSharedLink: (path: string) => Promise<string>;
}

// Hook signature: useDropboxFiles(entityType, entityId)
// entityType: 'client' | 'property' | 'deal'
// entityId: string | null

// Functionality needed:
// 1. State management:
//    - files: DropboxFile[]
//    - folderPath: string | null
//    - loading, uploading, error states

// 2. Initialize DropboxService with token from env

// 3. fetchFiles function:
//    - Query dropbox_folder_mapping table
//    - Filter by entity_type and entity_id
//    - Get single result
//    - If no mapping found, set error: "No Dropbox folder linked to this record"
//    - If mapping found, get dropbox_folder_path
//    - Call dropboxService.listFolderContents(path)
//    - Update files state

// 4. uploadFiles function:
//    - Accept FileList from input or drag-drop
//    - Set uploading=true
//    - Loop through files and call dropboxService.uploadFile()
//    - After all uploads complete, call refreshFiles()
//    - Set uploading=false

// 5. createFolder function:
//    - Accept folder name string
//    - Construct full path: folderPath + '/' + folderName
//    - Call dropboxService.createFolder()
//    - Call refreshFiles()

// 6. deleteItem function:
//    - Accept path string
//    - Call dropboxService.deleteFileOrFolder()
//    - Call refreshFiles()

// 7. getSharedLink function:
//    - Accept path string
//    - Call dropboxService.getSharedLink()
//    - Return URL string

// 8. useEffect to call fetchFiles when entityId changes

// Return all functions and state
```

---

## Task 9: Create TypeScript Types

**Purpose:** Define TypeScript interfaces for Dropbox integration.

**File:** `src/types.ts` (add to existing file)

**Instructions:**
Add these interfaces to the existing types.ts file:

```typescript
// Dropbox folder mapping (database table)
export interface DropboxFolderMapping {
  id: string;
  entity_type: 'client' | 'property' | 'deal';
  entity_id: string;
  sf_id: string;
  dropbox_folder_path: string;
  sfdb_file_found: boolean;
  last_verified_at: string;
  created_at: string;
  updated_at: string;
}

// Dropbox file/folder representation
export interface DropboxFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number | null;
  modified: string | null;
  shared_link: string | null;
  icon?: string; // Optional: for file type icons
}
```

---

## Task 10: Create Database Migration

**Purpose:** Add dropbox_folder_mapping table to store Dropbox folder paths.

**File:** `_master_migration_script.sql` (add to existing file)

**Instructions:**
Add this section to the existing migration script:

```sql
-- =============================================================================
-- DROPBOX FOLDER MAPPING TABLE
-- =============================================================================
-- Maps Salesforce records to their Dropbox folders
-- Used to connect client/property/deal records to Dropbox file storage

CREATE TABLE IF NOT EXISTS dropbox_folder_mapping (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Entity identification
  entity_type VARCHAR(50) NOT NULL, -- 'client', 'property', 'deal'
  entity_id UUID NOT NULL,
  
  -- Salesforce reference for verification
  sf_id VARCHAR(18) NOT NULL,
  
  -- Dropbox folder path
  dropbox_folder_path TEXT NOT NULL,
  
  -- Metadata
  sfdb_file_found BOOLEAN DEFAULT true,
  last_verified_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure one mapping per entity
  CONSTRAINT unique_entity_mapping UNIQUE(entity_type, entity_id),
  CONSTRAINT unique_sf_id UNIQUE(sf_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dropbox_entity_type ON dropbox_folder_mapping(entity_type);
CREATE INDEX IF NOT EXISTS idx_dropbox_entity_id ON dropbox_folder_mapping(entity_id);
CREATE INDEX IF NOT EXISTS idx_dropbox_sf_id ON dropbox_folder_mapping(sf_id);
CREATE INDEX IF NOT EXISTS idx_dropbox_folder_path ON dropbox_folder_mapping(dropbox_folder_path);

-- Update trigger
CREATE OR REPLACE FUNCTION update_dropbox_folder_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trigger_update_dropbox_folder_mapping_updated_at
  BEFORE UPDATE ON dropbox_folder_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_dropbox_folder_mapping_updated_at();

-- Add comment
COMMENT ON TABLE dropbox_folder_mapping IS 'Maps CRM records to Dropbox folders via Salesforce ID and .sfdb marker files';
```

---

## Task 11: Create Dropbox Folder Mapping Migration Script

**Purpose:** One-time script to scan all Dropbox folders, find .sfdb marker files, and build mappings table.

**File:** `scripts/migrateDropboxMappings.js`

**Requirements:**
```javascript
// This migration script scans Dropbox for .sfdb files and creates mappings
// Expected to process ~4200 records (3000 properties, 670 deals, 532 clients)

import 'dotenv/config';
import { Dropbox } from 'dropbox';
import { createClient } from '@supabase/supabase-js';

// Configuration
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
const BASE_PATH = '/Oculus Dropbox/Mike Minihan/Salesforce Documents';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key for admin operations
);

const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN });

// Salesforce ID prefix to entity type mapping
const SF_PREFIX_MAP = {
  '001': 'client',      // Account
  '006': 'deal',        // Opportunity
  'a00': 'property',    // Custom Property object
};

// Main migration function structure:
async function migrateDropboxMappings() {
  // 1. Print header with banner
  //    - Title: "DROPBOX FOLDER MAPPING MIGRATION"
  //    - Show BASE_PATH
  //    - Show Supabase URL
  
  // 2. Step 1: Scan Dropbox for .sfdb files
  //    - Call findAllSfdbFiles(BASE_PATH)
  //    - Show progress while scanning
  //    - Display total count found
  
  // 3. Step 2: Process each .sfdb file
  //    - Initialize counters: successCount, notFoundCount, errorCount, unknownPrefixCount
  //    - Initialize stats object: { client: 0, property: 0, deal: 0 }
  //    - Loop through each .sfdb file:
  //      a. Extract Salesforce ID from filename (remove .sfdb extension)
  //      b. Get entity type from SF ID prefix using SF_PREFIX_MAP
  //      c. If unknown prefix, increment unknownPrefixCount and continue
  //      d. Get folder path (remove filename from full path)
  //      e. Look up entity in Supabase by sf_id
  //      f. If not found, increment notFoundCount and continue
  //      g. If found, UPSERT to dropbox_folder_mapping table with:
  //         - entity_type
  //         - entity_id
  //         - sf_id
  //         - dropbox_folder_path
  //         - sfdb_file_found: true
  //         - last_verified_at: current timestamp
  //      h. Use onConflict: 'entity_type,entity_id' for UPSERT
  //      i. Increment appropriate counters
  //      j. Show progress every 50 records
  
  // 4. Display final results:
  //    - Banner separator line
  //    - Success message
  //    - Total successfully mapped
  //    - Breakdown by entity type (clients, properties, deals)
  //    - Not found in database count
  //    - Unknown ID prefixes count
  //    - Errors count
  //    - Banner separator line
  
  // 5. If notFoundCount > 0 and <= 20, list the missing records
  //    - Show first 20 records that weren't found
  
  // Error handling:
  // - Wrap entire migration in try/catch
  // - Display errors clearly with stack trace
  // - Exit with code 0 on success, 1 on failure
}

// Helper function: findAllSfdbFiles(path)
async function findAllSfdbFiles(path) {
  // 1. Initialize empty array for .sfdb files
  // 2. Call dbx.filesListFolder with:
  //    - path: provided path
  //    - recursive: true (scan all subfolders)
  //    - include_deleted: false
  // 3. Filter results for files ending with .sfdb
  // 4. Handle pagination (Dropbox returns max 2000 at a time):
  //    - Check has_more flag
  //    - If true, call filesListFolderContinue with cursor
  //    - Keep fetching until has_more is false
  // 5. Show progress: "Found X .sfdb files" after each batch
  // 6. Return array of all .sfdb files found
  
  // Error handling:
  // - Catch and display Dropbox API errors
  // - Show specific error message (permissions, path not found, etc.)
}

// Helper function: getEntityTypeFromSfId(sfId)
function getEntityTypeFromSfId(sfId) {
  // Extract first 3 characters (prefix)
  // Look up in SF_PREFIX_MAP
  // Return entity type or null if not found
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
```

**Key features:**
- Progress indicators every 50 records (for ~4200 records this will show 84 updates)
- UPSERT pattern to handle re-running the script
- Detailed statistics broken down by entity type
- Clear error reporting with troubleshooting info
- Handles Dropbox pagination (important for large folder structures)

**User will run once:** `npm run migrate:dropbox`

**Expected output:**
```
==============================================================
   DROPBOX FOLDER MAPPING MIGRATION
==============================================================

📍 Base Path: /Oculus Dropbox/Mike Minihan/Salesforce Documents
🔗 Supabase URL: https://xxx.supabase.co

🔍 Step 1: Scanning Dropbox for .sfdb files...

📁 Scanning path: /Oculus Dropbox/Mike Minihan/Salesforce Documents
   Found 128 .sfdb files in initial batch
   Fetching more files...
   Found 256 more .sfdb files
   ...
   
✅ Total .sfdb files found: 4202

🔍 Step 2: Processing mappings...

   📊 Progress: 50/4202 mapped (1%)
   📊 Progress: 100/4202 mapped (2%)
   ...
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

✅ Script completed successfully
```

---

## Success Criteria

After completing all tasks, verify:

1. ✅ Four scripts exist in `scripts/` folder:
   - getDropboxRefreshToken.js
   - refreshDropboxToken.js
   - testDropbox.js
   - migrateDropboxMappings.js

2. ✅ package.json has four new scripts:
   - dropbox:auth
   - dropbox:refresh
   - dropbox:test
   - migrate:dropbox

3. ✅ .env.example documents Dropbox variables

4. ✅ .gitignore protects environment files

5. ✅ DropboxService class exists with path validation

6. ✅ useDropboxFiles hook exists

7. ✅ TypeScript types added to types.ts

8. ✅ Database migration added to _master_migration_script.sql

9. ✅ User can run `npm run dropbox:auth` to get tokens

10. ✅ User can run `npm run dropbox:test` to verify connection

11. ✅ User can run `npm run migrate:dropbox` to build mappings

12. ✅ After migration runs, dropbox_folder_mapping table contains ~4200 records

---

## User Steps After Claude Code Completes

### Phase 1: Setup Authentication

1. **Get Dropbox App credentials:**
   - Go to Dropbox App Console → Settings tab
   - Copy App key and App secret

2. **Update getDropboxRefreshToken.js:**
   - Replace placeholder App key
   - Replace placeholder App secret
   - Save file

3. **Run OAuth flow:**
   ```bash
   npm run dropbox:auth
   ```
   - Follow terminal instructions
   - Copy tokens to .env

4. **Test connection:**
   ```bash
   npm run dropbox:test
   ```
   - Should show your account name
   - Should list files from Salesforce Documents folder

### Phase 2: Run Migration

5. **Run database migration first:**
   - Execute the SQL from _master_migration_script.sql in Supabase
   - This creates the dropbox_folder_mapping table

6. **Run Dropbox folder mapping migration:**
   ```bash
   npm run migrate:dropbox
   ```
   - Will take 2-5 minutes to scan ~4200 folders
   - Watch progress indicators
   - Review final statistics

7. **Verify results in Supabase:**
   - Open Supabase dashboard
   - Check dropbox_folder_mapping table
   - Should have ~4200 records (532 clients + 2998 properties + 665 deals)

### Phase 3: Maintenance

8. **When token expires (every 4 hours):**
   ```bash
   npm run dropbox:refresh
   ```
   - Update DROPBOX_ACCESS_TOKEN in .env

9. **If you need to re-run migration:**
   - Safe to run multiple times
   - Uses UPSERT pattern (won't create duplicates)
   - Will update last_verified_at timestamp

---

## Troubleshooting

**If migration shows "Not found in database":**
- These are .sfdb files for records not yet migrated from Salesforce
- Or records that were deleted in Salesforce
- This is normal - not all Dropbox folders may have corresponding database records

**If migration is slow:**
- Expected for 4200+ folders
- Dropbox API has rate limits
- Allow 2-5 minutes for full scan

**If you get authentication errors:**
- Token may have expired (4 hours)
- Run `npm run dropbox:refresh`
- Update .env with new token
- Re-run migration

**If path validation errors occur:**
- Check BASE_PATH matches your actual Dropbox structure
- Ensure path starts with `/Oculus Dropbox/Mike Minihan/Salesforce Documents`

---

## Next Phase (Not Part of This Task)

After these tasks are complete and migration is successful, the next phase will be:
- Sidebar component to display Dropbox files on Client/Property/Deal pages
- Upload functionality with drag-and-drop
- Folder creation UI
- File deletion with confirmation
- Open files in Dropbox web interface

But those are separate tasks for later.