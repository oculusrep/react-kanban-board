# Property Unit File Management

**Feature**: Dropbox file management for individual property units
**Implementation Date**: 2025-10-30
**Commits**: 19ddc8e, 8200dfc, e6f9ba3

---

## Overview

Property units now support dedicated file management through Dropbox integration. Each property unit can have its own folder for storing unit-specific files like LODs (Letters of Determination), As-Built drawings, floor plans, and lease documents.

This feature allows users to organize files at the unit level without requiring a dedicated property unit page, keeping all files related to a property (including its units) in one organized hierarchy.

---

## Folder Structure

### Hierarchy

```
/Salesforce Documents/
  └─ Properties/
      └─ [Property Name]/
          ├─ [Property-level files]
          └─ Units/
              ├─ [Unit 1 Name]/
              │   ├─ LOD.pdf
              │   ├─ As-Built.dwg
              │   └─ FloorPlan.pdf
              ├─ [Unit 2 Name]/
              │   ├─ Lease.pdf
              │   └─ Photos/
              └─ [Unit 3 Name]/
                  └─ [Unit 3 files]
```

### Path Format

- **Property-level files**: `/Salesforce Documents/Properties/[Property Name]/`
- **Property unit files**: `/Salesforce Documents/Properties/[Property Name]/Units/[Unit Name]/`

### Example

For a property "Main Street Shopping Center" with unit "Suite 101":
```
/Salesforce Documents/Properties/Main Street Shopping Center/Units/Suite 101/
```

---

## User Interface

### Accessing Property Unit Files

1. Navigate to a property page
2. Scroll to the "Property Units" section
3. Click the chevron to expand a property unit card
4. Scroll down within the expanded unit to the "Files" section

### Features Available

- **Upload Files**: Drag & drop or click to select files
- **View Files**: See all uploaded files with name, size, and date
- **Download Files**: Click file name to download/view
- **Delete Files**: Remove files via trash icon
- **Create Folders**: Organize files within the unit folder (if supported)
- **Share Links**: Generate Dropbox shared links for files

### Auto-Creation

When uploading the first file to a property unit:
- Dropbox folder is automatically created
- Path follows the nested structure: `Properties/[Property]/Units/[Unit]/`
- Database mapping is saved in `dropbox_mapping` table
- Success message shows: "Created Dropbox folder: [Unit Name]"

---

## Technical Implementation

### Database Schema

**Table**: `dropbox_mapping`
- **entity_type**: `'property_unit'`
- **entity_id**: Property unit UUID (FK to `property_unit.id`)
- **dropbox_folder_path**: Full Dropbox folder path (nested under property)
- **sf_id**: Placeholder value (format: `AUTO-[first 13 chars of entity_id]`)
- **last_verified_at**: Timestamp of last verification

**Table**: `property_unit`
- **id**: UUID (used as entity_id in dropbox_mapping)
- **property_unit_name**: Used to construct the folder path
- **property_id**: Foreign key to parent property (used to build nested path)

### Code Components

#### 1. Hook: `useDropboxFiles.ts`

Extended to support `'property_unit'` as an entity type.

**Key Changes**:
- Added `'property_unit'` to entity type union
- Extended `getEntityName()` to fetch `property_unit_name`
- Special handling in `createFolderAndMapping()` to:
  - Fetch parent property via `property_id` FK
  - Build nested path under parent property
  - Create folder with proper hierarchy

**Nested Path Logic**:
```typescript
// Fetch parent property
const { data: unitData } = await supabase
  .from('property_unit')
  .select('property_id, property:property_id(property_name)')
  .eq('id', entityId)
  .single();

const propertyName = unitData.property?.property_name;

// Build nested path
const path = `/Salesforce Documents/Properties/${propertyName}/Units/${unitName}/`;
```

#### 2. Component: `PropertyUnitsSection.tsx`

Added `FileManagerModule` to the expanded property unit view.

**Integration**:
- Located below "Unit Features" section
- Always expanded when unit card is expanded
- Passes `entityType="property_unit"` and `entityId={unit.id}`

**Code Addition**:
```tsx
{/* Unit Files */}
<div className="pt-2 border-t border-gray-100">
  <FileManagerModule
    entityType="property_unit"
    entityId={unit.id}
    isExpanded={true}
    onToggle={() => {}}
  />
</div>
```

#### 3. Service: `dropboxService.ts`

No changes required. The `createFolder()` method is called directly for property units since they need custom path logic.

---

## Common Use Cases

### 1. Storing Unit-Specific Documents

**Scenario**: Property manager needs to store LOD and As-Built for each unit.

**Workflow**:
1. Expand the property unit
2. Upload `LOD-Suite-101.pdf` and `As-Built-Suite-101.dwg`
3. Files are stored in: `/Properties/[Property]/Units/Suite 101/`
4. Each unit maintains separate files

### 2. Organizing by Document Type

**Scenario**: Manager wants subfolders for different document types.

**Workflow**:
1. Create subfolders: `LODs`, `As-Builts`, `Photos`, `Leases`
2. Upload files to respective subfolders
3. Structure becomes:
   ```
   /Properties/[Property]/Units/Suite 101/
     ├─ LODs/
     ├─ As-Builts/
     ├─ Photos/
     └─ Leases/
   ```

### 3. Sharing Files with External Parties

**Scenario**: Need to share As-Built with contractor.

**Workflow**:
1. Open the property unit
2. Find the As-Built file
3. Click "Share" icon to generate link
4. Copy and send the Dropbox link to contractor
5. Contractor can view without login

---

## Migration Notes

### Handling Old Mappings

If property unit folders were created before commit 8200dfc (nested structure fix), they may have incorrect paths like:
- `/Salesforce Documents/Properties/undefined/[Unit Name]/`
- `/Salesforce Documents/[Unit Name]/` (root level)

**Cleanup SQL**:
```sql
-- Remove old incorrect mappings
DELETE FROM dropbox_mapping
WHERE entity_type = 'property_unit'
AND dropbox_folder_path LIKE '%/undefined/%';

-- Or remove all property_unit mappings to start fresh
DELETE FROM dropbox_mapping
WHERE entity_type = 'property_unit';
```

After cleanup:
- Existing files in old folders remain in Dropbox (not auto-deleted)
- Re-upload files to create correct nested structure
- Manually move files in Dropbox if needed

### Verifying Correct Structure

**Check Database**:
```sql
SELECT
  entity_type,
  entity_id,
  dropbox_folder_path,
  created_at
FROM dropbox_mapping
WHERE entity_type = 'property_unit'
ORDER BY created_at DESC;
```

Expected path format:
```
/Salesforce Documents/Properties/[Property Name]/Units/[Unit Name]/
```

**Check Dropbox**:
1. Navigate to `/Salesforce Documents/Properties/`
2. Open any property folder
3. Look for `Units` subfolder
4. Verify unit folders are inside

---

## Troubleshooting

### Issue: No Files Section Visible

**Symptoms**:
- Property unit expands but Files section is missing

**Solution**:
- Hard refresh browser (Cmd+Shift+R or Ctrl+Shift+R)
- Verify build is `index-62ede80a.js` or later in console
- Check if `FileManagerModule` is imported in `PropertyUnitsSection.tsx`

### Issue: Folder Created at Root Level

**Symptoms**:
- Files uploaded but folder appears at `/Salesforce Documents/[Unit Name]/`
- No `Units` subfolder under property

**Solution**:
- Check database mapping path
- Delete incorrect mapping (see Migration Notes above)
- Hard refresh browser to get latest code
- Re-upload file to trigger correct folder creation

### Issue: Property Name Shows as "undefined"

**Symptoms**:
- Console shows: `🔍 Fetching files from path: /Salesforce Documents/undefined/[Unit Name]`
- Folder path has "undefined" in it

**Cause**:
- Old code before Supabase query fix (commit e6f9ba3)
- Bad database mapping from earlier upload

**Solution**:
1. Delete bad mapping:
   ```sql
   DELETE FROM dropbox_mapping
   WHERE dropbox_folder_path LIKE '%/undefined/%';
   ```
2. Hard refresh browser
3. Re-upload file

### Issue: Error Fetching Parent Property

**Symptoms**:
- Console shows: `❌ Error fetching property unit parent`
- Upload fails

**Debugging**:
- Check console for `📊 Unit data result` log
- Verify property_unit has valid `property_id`
- Run query manually:
  ```sql
  SELECT id, property_unit_name, property_id
  FROM property_unit
  WHERE id = '[unit-id]';
  ```
- Ensure parent property exists in `property` table

---

## Testing

See detailed test suite: `/test-scripts/features/property-unit-files.md`

**Quick Smoke Test**:
1. Navigate to property with units
2. Expand first unit
3. Upload test file
4. Verify file appears in list
5. Check Dropbox for: `/Properties/[Property]/Units/[Unit]/`
6. Download file to verify accessibility
7. Test with second unit to verify isolation

---

## Related Documentation

- [File Management Module](/docs/file-management.md) (general file management)
- [Property Units](/docs/property-units.md) (property unit features)
- [Test Scripts](/test-scripts/features/property-unit-files.md) (test cases)

---

## Changelog

### 2025-10-30 - Initial Implementation
- **Commit 19ddc8e**: Added basic property unit file management
  - Extended `useDropboxFiles` hook for property_unit
  - Integrated `FileManagerModule` into `PropertyUnitsSection`
  - Files initially created at root level

### 2025-10-30 - Fixed Folder Structure
- **Commit 8200dfc**: Nested property unit folders under parent property
  - Added parent property lookup in `createFolderAndMapping`
  - Changed path from `/Properties/[Unit]/` to `/Properties/[Property]/Units/[Unit]/`
  - Improved logical organization

### 2025-10-30 - Enhanced Debugging
- **Commit e6f9ba3**: Added detailed console logging
  - Fixed Supabase query syntax for property lookup
  - Added debug logs for troubleshooting
  - Improved error messages

---

## Future Enhancements

### Potential Improvements

1. **Bulk Operations**
   - Upload files to multiple units at once
   - Apply same file to all units in a property

2. **File Templates**
   - Template files that auto-populate for new units
   - Standard folder structure per unit type

3. **Version Control**
   - Track file version history
   - Rollback to previous versions

4. **File Sharing**
   - Share entire unit folder with external party
   - Time-limited access links

5. **Integration**
   - Link files to site submits or deals associated with unit
   - Cross-reference files across related entities

---

## Support

For issues or questions:
- Check [Troubleshooting](#troubleshooting) section above
- Review browser console for debug logs (🔍, 📁, 📊 messages)
- Verify database mappings with provided SQL queries
- Consult test scripts for expected behavior
