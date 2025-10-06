# Dropbox Auto-Create Folder Feature

**Date:** January 2025
**Status:** ✅ Complete
**Goal:** Automatically create Dropbox folders when uploading files to entities without existing folders

---

## Summary

When a user drags/drops or uploads files to an entity (Property, Client, Deal, or Contact) that doesn't have a Dropbox folder yet, the system will now:

1. ✅ Automatically create a folder in Dropbox with the entity's name
2. ✅ Create the folder in the proper subfolder structure
3. ✅ Insert a mapping record in the `dropbox_folder_mapping` database table
4. ✅ Show a toast notification confirming the folder was created
5. ✅ Upload the files to the newly created folder

---

## Folder Structure

Folders are created in the following structure:

```
/Salesforce Documents/
  ├── Properties/
  │   └── {property_name}
  ├── Clients/
  │   └── {client_name}
  ├── Opportunities/
  │   └── {deal_name}
  └── Contacts/
      └── {first_name} {last_name}
```

---

## Implementation Details

### 1. Updated `dropboxService.ts`

Added two new methods:

#### `buildEntityFolderPath(entityType, entityName)`
- Builds the proper folder path based on entity type
- Maps entity types to their subfolder names (Properties, Clients, Opportunities, Contacts)
- Cleans entity names to remove invalid characters

#### `createFolderForEntity(entityType, entityName)`
- Checks if folder already exists
- Creates folder if it doesn't exist
- Returns folder information

### 2. Updated `useDropboxFiles.ts` Hook

Added three new functions:

#### `getEntityName()`
- Fetches entity data from database
- Returns formatted name based on entity type:
  - Property: `property_name`
  - Client: `client_name`
  - Deal: `deal_name`
  - Contact: `{first_name} {last_name}`

#### `createFolderAndMapping()`
- Creates Dropbox folder for entity
- Inserts mapping into `dropbox_folder_mapping` table
- Updates component state with new folder path

#### Modified `uploadFiles()`
- Checks if folder exists before uploading
- If no folder exists, automatically creates one
- Sets `folderCreatedMessage` to show toast notification
- Proceeds with file upload

### 3. Updated `FileManagerModule.tsx`

- Added `folderCreatedMessage` state handling
- Added `toastMessage` state for dynamic toast content
- Added useEffect to watch for folder creation messages
- Shows green success toast when folder is created

### 4. Database Integration

When creating a new folder, the system inserts a record into `dropbox_folder_mapping`:

```sql
INSERT INTO dropbox_folder_mapping (
  entity_type,
  entity_id,
  dropbox_folder_path,
  sf_id,
  sfdb_file_found,
  last_verified_at
) VALUES (
  'property',             -- Entity type
  '<entity-uuid>',        -- Entity ID
  '/Salesforce Documents/Properties/My Property',  -- Folder path
  '',                     -- Empty string (no Salesforce ID for new folders)
  false,                  -- No .sfdb file found
  NOW()                   -- Current timestamp
);
```

---

## Testing Instructions

### Test Scenario 1: Property without Dropbox Folder

1. **Navigate** to a property that doesn't have a Dropbox folder yet
2. **Open** the sidebar Files module
3. **Verify** you see "No Dropbox folder linked to this record" error
4. **Drag and drop** a file OR click Upload button
5. **Expected Result:**
   - Folder is created in Dropbox: `/Salesforce Documents/Properties/{property_name}`
   - Green toast notification appears: "Created Dropbox folder: {property_name}"
   - File is uploaded successfully
   - Files module now shows the uploaded file

### Test Scenario 2: Client without Dropbox Folder

1. **Navigate** to a client without a Dropbox folder
2. **Upload** a file via the Files module in the sidebar
3. **Expected Result:**
   - Folder created: `/Salesforce Documents/Clients/{client_name}`
   - Toast notification: "Created Dropbox folder: {client_name}"
   - File uploaded and visible

### Test Scenario 3: Deal without Dropbox Folder

1. **Navigate** to a deal without a Dropbox folder
2. **Click** the Files button (📎) in the floating panel
3. **Upload** a file
4. **Expected Result:**
   - Folder created: `/Salesforce Documents/Opportunities/{deal_name}`
   - Toast notification: "Created Dropbox folder: {deal_name}"
   - File uploaded and visible

### Test Scenario 4: Contact without Dropbox Folder

1. **Navigate** to a contact without a Dropbox folder
2. **Upload** a file via the Files module in the sidebar
3. **Expected Result:**
   - Folder created: `/Salesforce Documents/Contacts/{first_name} {last_name}`
   - Toast notification: "Created Dropbox folder: {first_name} {last_name}"
   - File uploaded and visible

### Test Scenario 5: Existing Folder (Regression Test)

1. **Navigate** to a property that ALREADY has a Dropbox folder
2. **Upload** a file
3. **Expected Result:**
   - NO folder creation (uses existing folder)
   - NO toast notification about folder creation
   - File uploaded successfully to existing folder
   - Files list refreshes to show new file

---

## Verification Checklist

- [ ] **Dropbox Folder Created**
  - Check Dropbox web interface
  - Verify folder exists in correct location
  - Verify folder name matches entity name

- [ ] **Database Record Created**
  - Query `dropbox_folder_mapping` table
  - Verify record exists with correct:
    - `entity_type`
    - `entity_id`
    - `dropbox_folder_path`
    - `sf_id` (should be empty string)

- [ ] **Toast Notification**
  - Appears in bottom-right corner
  - Green background with checkmark
  - Shows entity name in message
  - Disappears after 3 seconds

- [ ] **File Upload Success**
  - File appears in Files module
  - File is visible in Dropbox web interface
  - Subsequent uploads work without re-creating folder

---

## Edge Cases Handled

### 1. **Entity with No Name**
- Falls back to "Unnamed {entity_type}"
- Example: "Unnamed Property", "Unnamed Client"

### 2. **Invalid Characters in Name**
- Automatically strips invalid characters: `< > : " / \ | ? *`
- Normalizes whitespace

### 3. **Contact with Missing First/Last Name**
- Uses what's available
- Falls back to "Unnamed Contact" if both missing

### 4. **Multiple Simultaneous Uploads**
- Only creates folder once
- Subsequent uploads use the same folder

### 5. **Dropbox API Errors**
- Catches and displays error messages
- Doesn't create database mapping if Dropbox creation fails

---

## Files Modified

| File | Changes |
|------|---------|
| [src/services/dropboxService.ts](../src/services/dropboxService.ts) | Added `buildEntityFolderPath()` and `createFolderForEntity()` methods |
| [src/hooks/useDropboxFiles.ts](../src/hooks/useDropboxFiles.ts) | Added auto-creation logic, entity name fetching, and database mapping insertion |
| [src/components/sidebar/FileManagerModule.tsx](../src/components/sidebar/FileManagerModule.tsx) | Added toast notification for folder creation, updated entity type to include 'contact' |

---

## Code Examples

### Creating Folder Programmatically

```typescript
import DropboxService from '../services/dropboxService';

const dropboxService = new DropboxService(accessToken);

// Create folder for a property
const folder = await dropboxService.createFolderForEntity('property', 'My Property');
console.log(folder.path); // '/Salesforce Documents/Properties/My Property'
```

### Using the Hook

```typescript
import { useDropboxFiles } from '../hooks/useDropboxFiles';

function MyComponent({ propertyId }: { propertyId: string }) {
  const { uploadFiles, folderCreatedMessage } = useDropboxFiles('property', propertyId);

  const handleUpload = async (files: FileList) => {
    await uploadFiles(files);
    // If no folder existed, folderCreatedMessage will be set
  };

  // Show notification
  useEffect(() => {
    if (folderCreatedMessage) {
      toast.success(folderCreatedMessage);
    }
  }, [folderCreatedMessage]);
}
```

---

## Future Enhancements

1. **Bulk Folder Creation**
   - Admin tool to create folders for all entities missing them
   - Progress bar showing creation status

2. **Custom Folder Names**
   - Allow users to customize folder name during creation
   - Override default naming convention

3. **Folder Templates**
   - Auto-create subfolders (e.g., "Documents", "Images", "Contracts")
   - Apply based on entity type

4. **Folder Permissions**
   - Set Dropbox sharing permissions on creation
   - Automatically share with team members

---

## Known Limitations

1. **Contact Support Not in All Views**
   - Contact entity type added to hook
   - May need to update Contact sidebar component to use FileManagerModule

2. **Salesforce ID Required in Schema**
   - Database schema requires `sf_id` field
   - Using empty string for new folders (not migrated from Salesforce)
   - Consider making `sf_id` nullable in future migration

3. **No Undo**
   - Once folder is created, it cannot be automatically deleted
   - Manual cleanup required in Dropbox if needed

---

## Success Metrics

✅ **User Experience**
- No more "No Dropbox folder" errors blocking file uploads
- Seamless upload experience regardless of folder existence
- Clear feedback when folders are created

✅ **Data Integrity**
- All folder mappings tracked in database
- Consistent folder structure across all entity types
- No orphaned folders in Dropbox

✅ **Developer Experience**
- Reusable service methods
- Type-safe implementation
- Comprehensive error handling

---

**Feature Complete** ✅

Users can now upload files to any entity, and the system will automatically create the necessary Dropbox folders and database mappings on the fly!
