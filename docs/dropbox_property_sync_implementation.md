# Dropbox Property Name Sync - Implementation Documentation

**Date:** October 2, 2025
**Status:** ✅ Complete and Tested
**Entities:** Property (complete), Client, Contact, Deal (in progress)

---

## Overview

Automatically syncs property/client/contact/deal names to their corresponding Dropbox folder names when the name is changed in the CRM. This ensures the Dropbox folder structure stays in sync with your CRM data.

---

## Problem Solved

Previously, when you:
1. Created a property in Salesforce which created a Dropbox folder
2. Changed the property name in the CRM
3. The Dropbox folder kept the old name → **broken link**

Now the Dropbox folder is automatically renamed to match the new property name.

---

## Architecture

### Components

1. **dropboxService.ts** - Extended with folder operations
   - `renameFolder(oldPath, newPath)` - Renames folders in Dropbox
   - `folderExists(path)` - Checks if folder exists
   - `buildFolderPath(name)` - Builds clean folder paths

2. **dropboxPropertySync.ts** - New sync service
   - `syncPropertyName(propertyId, oldName, newName)` - Main sync logic
   - `checkSyncStatus(propertyId, propertyName)` - Checks if names match
   - Handles all error scenarios gracefully

3. **UI Integration** - Two locations
   - PropertyDetailScreen.tsx - Auto-save inline editing
   - PinDetailsSlideout.tsx - Map sidebar Save button

---

## How It Works

### Flow Diagram

```
User changes property name
         ↓
Save to database (always succeeds)
         ↓
Attempt Dropbox sync
         ↓
    ┌─────────┴─────────┐
    ↓                   ↓
  Success            Failure
    ↓                   ↓
Update mapping      Show warning
    ↓                   ↓
Done              Retry button
```

### Detailed Steps

1. **User edits property name** in CRM
2. **System saves to database** (non-blocking, always succeeds)
3. **System checks for Dropbox mapping** in `dropbox_folder_mapping` table
4. **If mapping exists:**
   - Extracts old folder path
   - Builds new folder path (preserving base directory structure)
   - Checks if old folder exists in Dropbox
   - Renames folder using Dropbox API
   - Updates `dropbox_folder_mapping` table with new path
5. **If sync fails:**
   - Shows yellow warning banner below property name field
   - Displays error message
   - Shows "Retry Sync" button

---

## Code Changes

### File: src/services/dropboxService.ts

**Added Methods:**

```typescript
// Rename a folder in Dropbox
async renameFolder(oldPath: string, newPath: string): Promise<DropboxFile>

// Check if folder exists
async folderExists(path: string): Promise<boolean>

// Build clean folder path
buildFolderPath(entityName: string, basePath?: string): string
```

**Key Features:**
- Path validation for security
- Token auto-refresh on expiration
- Detailed error handling

---

### File: src/services/dropboxPropertySync.ts (NEW)

**Service Class:**

```typescript
class DropboxPropertySyncService {
  async syncPropertyName(
    propertyId: string,
    oldName: string,
    newName: string
  ): Promise<{ success: boolean; error?: string }>

  async checkSyncStatus(
    propertyId: string,
    propertyName: string
  ): Promise<{ inSync: boolean; currentFolderName?: string }>
}
```

**Singleton Pattern:**
```typescript
export function getDropboxPropertySyncService(): DropboxPropertySyncService
```

**Key Logic:**
- Preserves base path structure from existing folder mapping
- Cleans property name (removes invalid characters)
- Non-blocking (property save succeeds even if Dropbox fails)
- Detailed console logging for debugging

---

### File: src/components/property/PropertyDetailScreen.tsx

**Added State:**
```typescript
const [dropboxSyncError, setDropboxSyncError] = useState<string | null>(null);
```

**Modified Function:**
```typescript
const handleFieldUpdate = async (field: keyof Property, value: any) => {
  // ... existing save logic ...

  // If property_name changed, sync to Dropbox
  if (field === 'property_name' && oldValue !== value) {
    await syncPropertyNameToDropbox(oldValue, value);
  }
}
```

**New Helper Functions:**
```typescript
const syncPropertyNameToDropbox = async (oldName: string, newName: string) => {
  // Calls dropboxPropertySync service
  // Sets error state if sync fails
}

const handleRetryDropboxSync = async () => {
  // Checks current folder name
  // Retries sync operation
}
```

---

### File: src/components/property/PropertyDetailsSection.tsx

**Added Props:**
```typescript
interface PropertyDetailsSectionProps {
  // ... existing props ...
  dropboxSyncError?: string | null;
  onRetryDropboxSync?: () => void;
}
```

**UI Added:**
```tsx
{dropboxSyncError && (
  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
    <div className="flex items-start gap-2">
      <svg className="w-5 h-5 text-yellow-600">...</svg>
      <div className="flex-1">
        <p className="text-sm text-yellow-800 font-medium">Dropbox Sync Warning</p>
        <p className="text-sm text-yellow-700 mt-1">{dropboxSyncError}</p>
        <button onClick={onRetryDropboxSync}>Retry Sync</button>
      </div>
    </div>
  </div>
)}
```

---

### File: src/components/mapping/slideouts/PinDetailsSlideout.tsx

**Added State:**
```typescript
const [dropboxSyncError, setDropboxSyncError] = useState<string | null>(null);
const [originalPropertyName, setOriginalPropertyName] = useState<string | null>(null);
```

**Modified Function:**
```typescript
const handleSavePropertyChanges = async () => {
  // ... save to database ...

  // If property_name changed, sync to Dropbox
  const nameChanged = originalPropertyName !== localPropertyData.property_name;
  if (nameChanged && originalPropertyName) {
    await syncService.syncPropertyName(id, originalPropertyName, newName);
  }
}
```

**Added Retry Handler:**
```typescript
const handleRetryDropboxSync = async () => {
  // Checks sync status
  // Retries sync with current folder name
}
```

**UI Added:** Same yellow warning banner below Property Name field

---

## Error Handling

### Scenarios Handled

1. **No Dropbox mapping exists**
   - Status: Success (no action needed)
   - No error shown to user

2. **Folder doesn't exist in Dropbox**
   - Status: Failure
   - Error: "Dropbox folder not found. The folder may have been deleted or moved."
   - Shows retry button

3. **Folder name conflict**
   - Status: Failure
   - Error: "A folder with that name already exists in Dropbox."
   - Shows retry button

4. **Network/API error**
   - Status: Failure
   - Error: Specific error message from Dropbox API
   - Shows retry button

5. **Property name unchanged**
   - Status: Success (skipped)
   - No action taken

---

## User Experience

### Property Detail Page

1. User edits property name inline
2. Auto-save triggers immediately
3. Property saved to database
4. Dropbox sync happens in background
5. If error: Yellow warning appears below field
6. User can click "Retry Sync" to try again

### Map Sidebar

1. User opens property in map sidebar
2. User edits property name
3. User clicks "Save" button
4. Property saved to database
5. Dropbox sync happens in background
6. If error: Yellow warning appears below field
7. User can click "Retry Sync" to try again

### Key UX Decisions

- ✅ Non-blocking: Database save always succeeds
- ✅ Clear feedback: Yellow warning (not red error)
- ✅ Recoverable: Retry button available
- ✅ Unobtrusive: Warning only appears if there's an issue
- ✅ Informative: Specific error messages

---

## Testing

### Test Scenarios

1. **Happy Path - Property Detail Page**
   - ✅ Change property name inline
   - ✅ Name saves to database
   - ✅ Dropbox folder renamed
   - ✅ Mapping table updated
   - ✅ No error shown

2. **Happy Path - Map Sidebar**
   - ✅ Change property name in sidebar
   - ✅ Click Save button
   - ✅ Name saves to database
   - ✅ Dropbox folder renamed
   - ✅ Mapping table updated
   - ✅ No error shown

3. **Error Path - No Mapping**
   - Property has no Dropbox folder
   - Name saves to database
   - No error shown (expected behavior)

4. **Error Path - Folder Not Found**
   - Property has mapping but folder deleted
   - Name saves to database
   - Warning appears with retry button
   - User can retry after folder is restored

5. **Edge Cases**
   - Name changed to same name → Skipped
   - Special characters in name → Cleaned automatically
   - Multiple rapid changes → Last change wins

---

## Database Schema

### Table: dropbox_folder_mapping

**Columns Used:**
- `entity_type` - 'property', 'client', 'contact', 'deal'
- `entity_id` - UUID of the entity
- `dropbox_folder_path` - Full path to folder (e.g., `/Salesforce Documents/Property Name`)
- `last_verified_at` - Timestamp of last successful sync

**Query Example:**
```sql
-- Find mapping for a property
SELECT * FROM dropbox_folder_mapping
WHERE entity_type = 'property'
  AND entity_id = 'property-uuid-here';

-- Check all mappings
SELECT entity_type, entity_id, dropbox_folder_path
FROM dropbox_folder_mapping
ORDER BY entity_type, dropbox_folder_path;
```

---

## Environment Variables

Required in `.env`:

```bash
VITE_DROPBOX_ACCESS_TOKEN=your_token_here
VITE_DROPBOX_REFRESH_TOKEN=your_refresh_token_here
VITE_DROPBOX_APP_KEY=your_app_key_here
VITE_DROPBOX_APP_SECRET=your_app_secret_here
```

---

## Console Logging

### Debug Output

When sync runs, you'll see:
```
🔵 syncPropertyName called: { propertyId, oldName, newName }
📂 Fetching Dropbox folder mapping...
✅ Found mapping: { ... }
🔄 Dropbox sync: { oldPath, newPath, propertyId }
✅ Dropbox folder renamed successfully: { from, to }
```

### Error Output

```
❌ Error fetching mapping: { ... }
⚠️  No Dropbox folder mapping found for property: propertyId
⚠️  Dropbox folder does not exist at: /path/to/folder
```

---

## Known Limitations

1. **No batch operations** - Each property is synced individually
2. **No undo** - Folder rename is immediate (no confirmation)
3. **One-way sync** - Only CRM → Dropbox (not Dropbox → CRM)
4. **Manual retry required** - Failed syncs don't auto-retry

---

## Future Enhancements

### Planned
- [ ] Extend to Client entities
- [ ] Extend to Contact entities
- [ ] Extend to Deal entities

### Potential
- [ ] Bi-directional sync (Dropbox → CRM)
- [ ] Batch rename operations
- [ ] Auto-retry on network failures
- [ ] Sync history/audit log
- [ ] Admin panel for manual sync management

---

## Troubleshooting

### Issue: Folder not renamed

**Check:**
1. Browser console for error messages
2. Does property have entry in `dropbox_folder_mapping`?
3. Does folder exist at the old path in Dropbox?
4. Are Dropbox API credentials valid?

**Solution:**
- Check console logs (look for 🔵 emoji logs)
- Verify mapping exists in database
- Use "Retry Sync" button
- Refresh Dropbox access token if needed

### Issue: "Path outside allowed directory" error

**Cause:** Folder path doesn't start with `/Salesforce Documents`

**Solution:**
- Check `dropbox_folder_mapping.dropbox_folder_path` value
- Ensure path starts with allowed base path
- Update mapping if needed

### Issue: Name saved but sync failed

**Cause:** This is expected behavior (non-blocking)

**Solution:**
- Use "Retry Sync" button
- Check error message for specific issue
- Fix underlying issue (folder exists, network, etc.)

---

## Support

For issues or questions:
1. Check browser console logs
2. Review error message in UI
3. Check this documentation
4. Contact development team

---

**Implementation Complete:** October 2, 2025
**Next Steps:** Replicate for Client, Contact, and Deal entities
