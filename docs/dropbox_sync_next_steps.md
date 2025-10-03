# Dropbox Sync - Next Steps for Client, Contact, and Deal

**Current Status:** Property sync is complete and tested ✅
**Next:** Extend to Client, Contact, and Deal entities

---

## Service Layer - COMPLETE ✅

The sync service already supports all entity types:

**File:** `src/services/dropboxPropertySync.ts`

**Generic Method:**
```typescript
async syncEntityName(
  entityId: string,
  entityType: 'property' | 'client' | 'contact' | 'deal',
  oldName: string,
  newName: string
): Promise<{ success: boolean; error?: string }>
```

**Convenience Methods (ready to use):**
```typescript
async syncPropertyName(propertyId, oldName, newName) // ✅ In use
async syncClientName(clientId, oldName, newName)     // Ready
async syncContactName(contactId, oldName, newName)   // Ready
async syncDealName(dealId, oldName, newName)         // Ready
```

---

## Implementation Pattern

For each entity, follow the same pattern used for Property:

### 1. Identify the Name Field

- **Client:** `client_name`
- **Contact:** Need to check - might be `contact_name` or `first_name`/`last_name` combination
- **Deal:** `deal_name`

### 2. Find the Edit Locations

For each entity, find where the name can be edited:
- Detail page (inline editing or form)
- Sidebar/slideout panels
- Any other edit forms

###3. Add State Variables

```typescript
const [dropboxSyncError, setDropboxSyncError] = useState<string | null>(null);
const [originalEntityName, setOriginalEntityName] = useState<string | null>(null);
```

### 4. Track Original Name

```typescript
useEffect(() => {
  if (entity) {
    setOriginalEntityName(entity.entity_name || null);
  }
}, [entity]);
```

### 5. Add Sync Logic to Save Handler

```typescript
// After saving to database
if (field === 'entity_name' && oldValue !== value) {
  const syncService = getDropboxPropertySyncService();
  const result = await syncService.syncClientName( // or syncContactName, syncDealName
    entityId,
    oldValue,
    value
  );

  if (!result.success) {
    setDropboxSyncError(result.error || 'Failed to sync folder name');
  } else {
    setOriginalEntityName(value);
    setDropboxSyncError(null);
  }
}
```

### 6. Add Retry Handler

```typescript
const handleRetryDropboxSync = async () => {
  if (!entity || !entityId) return;

  const syncService = getDropboxPropertySyncService();
  const { currentFolderName } = await syncService.checkSyncStatus(
    entityId,
    'client', // or 'contact', 'deal'
    entity.entity_name || ''
  );

  if (currentFolderName) {
    const result = await syncService.syncClientName( // or syncContactName, syncDealName
      entityId,
      currentFolderName,
      entity.entity_name || ''
    );

    if (!result.success) {
      setDropboxSyncError(result.error || 'Failed to sync');
    } else {
      setOriginalEntityName(entity.entity_name);
      setDropboxSyncError(null);
    }
  }
};
```

### 7. Add UI Error Display

```tsx
{dropboxSyncError && (
  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
    <div className="flex items-start gap-2">
      <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div className="flex-1">
        <p className="text-sm text-yellow-800 font-medium">Dropbox Sync Warning</p>
        <p className="text-sm text-yellow-700 mt-1">{dropboxSyncError}</p>
        <button
          onClick={handleRetryDropboxSync}
          className="mt-2 text-sm font-medium text-yellow-800 hover:text-yellow-900 underline"
        >
          Retry Sync
        </button>
      </div>
    </div>
  </div>
)}
```

---

## Specific Implementation Steps

### CLIENT SYNC

**Files to Modify:**

1. **src/pages/ClientDetailsPage.tsx**
   - Add state variables
   - Find where `client_name` is saved
   - Add sync logic after save
   - Add retry handler
   - Pass error/retry to form component

2. **src/components/ClientForm.tsx** (if exists)
   - Add error display below client_name field
   - Show retry button

**Test:**
- Edit client name in client detail page
- Verify Dropbox folder renames
- Test retry button if sync fails

---

### CONTACT SYNC

**Files to Modify:**

1. **src/pages/ContactDetailsPage.tsx**
   - First, determine the name field (check database schema)
   - If using `first_name` + `last_name`, combine them for folder name
   - Add state variables
   - Find where name is saved
   - Add sync logic after save
   - Add retry handler

2. **Contact form component** (wherever name fields are edited)
   - Add error display
   - Show retry button

**Special Considerations:**
- If contacts use `first_name` + `last_name`, concatenate for folder name
- Example: `John Doe` would be the folder name

**Test:**
- Edit contact name
- Verify Dropbox folder renames
- Test retry button

---

### DEAL SYNC

**Files to Modify:**

1. **src/pages/DealDetailsPage.tsx**
   - Add state variables
   - Find where `deal_name` is saved
   - Add sync logic after save
   - Add retry handler
   - Pass error/retry to form component

2. **Deal form component** (wherever deal_name is edited)
   - Add error display below deal_name field
   - Show retry button

**Test:**
- Edit deal name
- Verify Dropbox folder renames
- Test retry button

---

## Database Requirements

Ensure `dropbox_folder_mapping` table has entries for:
- `entity_type = 'client'`
- `entity_type = 'contact'`
- `entity_type = 'deal'`

**Check existing mappings:**
```sql
SELECT entity_type, COUNT(*) as count
FROM dropbox_folder_mapping
GROUP BY entity_type;
```

---

## Testing Checklist

For each entity type:

- [ ] **Happy Path**
  - [ ] Change entity name
  - [ ] Verify name saves to database
  - [ ] Verify Dropbox folder renamed
  - [ ] Verify mapping table updated
  - [ ] No error shown

- [ ] **Error Path - No Mapping**
  - [ ] Entity has no Dropbox folder
  - [ ] Name saves to database
  - [ ] No error shown (expected)

- [ ] **Error Path - Folder Not Found**
  - [ ] Entity has mapping but folder deleted
  - [ ] Name saves to database
  - [ ] Warning appears with retry button
  - [ ] Retry works after folder restored

- [ ] **Error Path - Name Conflict**
  - [ ] Another folder with same name exists
  - [ ] Name saves to database
  - [ ] Warning appears with specific error
  - [ ] Retry fails until conflict resolved

---

## Quick Copy-Paste Templates

### For Detail Pages

```typescript
// Add imports
import { getDropboxPropertySyncService } from '../services/dropboxPropertySync';

// Add state
const [dropboxSyncError, setDropboxSyncError] = useState<string | null>(null);
const [originalEntityName, setOriginalEntityName] = useState<string | null>(null);

// Track original name
useEffect(() => {
  if (entity) {
    setOriginalEntityName(entity.entity_name || null);
  }
}, [entity]);

// Add sync to save handler
if (field === 'entity_name' && oldValue !== value) {
  const syncService = getDropboxPropertySyncService();
  const result = await syncService.syncClientName(entityId, oldValue, value);
  if (!result.success) {
    setDropboxSyncError(result.error || 'Failed to sync folder name');
  } else {
    setOriginalEntityName(value);
    setDropboxSyncError(null);
  }
}

// Add retry handler
const handleRetryDropboxSync = async () => {
  if (!entity || !entityId) return;
  const syncService = getDropboxPropertySyncService();
  const { currentFolderName } = await syncService.checkSyncStatus(entityId, 'client', entity.entity_name || '');
  if (currentFolderName) {
    const result = await syncService.syncClientName(entityId, currentFolderName, entity.entity_name || '');
    if (!result.success) {
      setDropboxSyncError(result.error || 'Failed to sync');
    } else {
      setOriginalEntityName(entity.entity_name);
      setDropboxSyncError(null);
    }
  }
};
```

### For Form Components

```tsx
// Add props
interface FormProps {
  // ... existing props ...
  dropboxSyncError?: string | null;
  onRetryDropboxSync?: () => void;
}

// Add UI below name field
{dropboxSyncError && (
  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
    <div className="flex items-start gap-2">
      <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div className="flex-1">
        <p className="text-sm text-yellow-800 font-medium">Dropbox Sync Warning</p>
        <p className="text-sm text-yellow-700 mt-1">{dropboxSyncError}</p>
        {onRetryDropboxSync && (
          <button
            onClick={onRetryDropboxSync}
            className="mt-2 text-sm font-medium text-yellow-800 hover:text-yellow-900 underline"
          >
            Retry Sync
          </button>
        )}
      </div>
    </div>
  </div>
)}
```

---

## Implementation Order

Recommended order (easiest to hardest):

1. **Client** - Likely simplest, single `client_name` field
2. **Deal** - Similar to client, single `deal_name` field
3. **Contact** - Might be more complex if using first/last name

---

## Notes

- The service layer is already complete and tested
- All the Dropbox API code is working
- Just need to wire up the UI for each entity type
- Copy-paste pattern from Property implementation
- Estimated time: 30-45 minutes per entity

---

## Support

If you encounter issues:
1. Check browser console for error logs (look for 🔵 emoji)
2. Verify entity has entry in `dropbox_folder_mapping` table
3. Check that field name matches (client_name, deal_name, etc.)
4. Reference Property implementation as working example

---

**Created:** October 2, 2025
**Status:** Ready to implement
