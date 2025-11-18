# Property-Level Dropbox File Links in Site Submit Emails

**Date:** November 17, 2025
**Feature Branch:** `feature/property-level-dropbox-file-links`
**Commit:** `6b0f265`
**Status:** ✅ Completed and Merged to Main

## Overview

Extended the site submit email system to automatically include individual Dropbox file links for **property-level** site submits, mirroring the existing functionality that was previously only available for property unit site submits.

### Previous Behavior

**Property Unit Site Submits:**
- ✅ Automatically included individual Dropbox files from the property unit folder
- ✅ Files displayed as separate clickable links in the email
- ✅ Files stored in `/Salesforce Documents/Properties/{Property}/Units/{Unit}/`

**Property-Level Site Submits:**
- ❌ Only showed generic property-level links (Marketing Materials, Site Plan, Demographics)
- ❌ Did NOT automatically include individual files from the property's Dropbox folder
- Files stored in `/Salesforce Documents/Properties/{Property}/`

### New Behavior

**Property-Level Site Submits:**
- ✅ Automatically includes individual Dropbox files from the property folder
- ✅ Files displayed as separate clickable links in the email
- ✅ Also shows generic property-level links (if they exist)
- ✅ Both file sources appear in the "Supporting Files" section

## Implementation Details

### 1. File Fetching Logic

**Location:** [src/hooks/useSiteSubmitEmail.ts](../src/hooks/useSiteSubmitEmail.ts) (lines 166-209)

**Trigger Condition:**
```typescript
if (siteSubmitData.property_id && !siteSubmitData.property_unit_id)
```

**Process Flow:**
1. Query `dropbox_mapping` table with:
   - `entity_type = 'property'`
   - `entity_id = siteSubmitData.property_id`
2. Retrieve `dropbox_folder_path` from mapping
3. Initialize `DropboxService` with API credentials
4. List all contents in the property folder using `listFolderContents()`
5. Filter to only include files (exclude subfolders like "Units/")
6. Generate individual shared links for each file using `getSharedLink()`
7. Build array of `PropertyUnitFile` objects with `name` and `sharedLink`

**Code Snippet:**
```typescript
// Fetch property-level files if property_id exists but property_unit_id does not
let propertyFiles: PropertyUnitFile[] = [];
if (siteSubmitData.property_id && !siteSubmitData.property_unit_id) {
  try {
    const { data: dropboxMapping } = await supabase
      .from('dropbox_mapping')
      .select('dropbox_folder_path')
      .eq('entity_type', 'property')
      .eq('entity_id', siteSubmitData.property_id)
      .single();

    if (dropboxMapping?.dropbox_folder_path) {
      const dropboxService = new DropboxService(
        import.meta.env.VITE_DROPBOX_ACCESS_TOKEN || '',
        import.meta.env.VITE_DROPBOX_REFRESH_TOKEN || '',
        import.meta.env.VITE_DROPBOX_APP_KEY || '',
        import.meta.env.VITE_DROPBOX_APP_SECRET || ''
      );

      const contents = await dropboxService.listFolderContents(
        dropboxMapping.dropbox_folder_path
      );

      // Filter to only include files (not subfolders like "Units/")
      const filePromises = contents
        .filter(item => item.type === 'file')
        .map(async (file) => {
          try {
            const sharedLink = await dropboxService.getSharedLink(file.path);
            return {
              name: file.name,
              sharedLink: sharedLink
            };
          } catch (error) {
            console.error(`Failed to get shared link for ${file.name}:`, error);
            return null;
          }
        });

      const filesWithLinks = await Promise.all(filePromises);
      propertyFiles = filesWithLinks.filter((file): file is PropertyUnitFile => file !== null);
    }
  } catch (error) {
    console.error('Error fetching property files:', error);
  }
}
```

### 2. Email Template Updates

**Location:** [src/utils/siteSubmitEmailTemplate.ts](../src/utils/siteSubmitEmailTemplate.ts)

**Interface Changes (line 20):**
```typescript
export interface SiteSubmitEmailData {
  siteSubmit: any;
  property: any;
  propertyUnit: any;
  contacts: any[];
  userData: any;
  propertyUnitFiles?: PropertyUnitFile[]; // Array of property unit files
  propertyFiles?: PropertyUnitFile[];     // Array of property-level files (NEW)
}
```

**Supporting Files Section (lines 118-151):**
```typescript
// Supporting Files Section
const hasPropertyUnitFiles = propertyUnitFiles && propertyUnitFiles.length > 0;
const hasPropertyFiles = propertyFiles && propertyFiles.length > 0;
const hasFiles = property?.marketing_materials ||
                 property?.site_plan ||
                 property?.demographics ||
                 hasPropertyUnitFiles ||
                 hasPropertyFiles;

if (hasFiles) {
  emailHtml += `<br/>`;
  emailHtml += `<p><strong>Supporting Files:</strong><br/>`;

  // For property-level site submits: show property Dropbox files first
  if (hasPropertyFiles) {
    propertyFiles.forEach(file => {
      emailHtml += `<a href="${file.sharedLink}">${file.name}</a><br/>`;
    });
  }

  // Always show generic property-level links if they exist
  if (property?.marketing_materials) {
    emailHtml += `<a href="${property.marketing_materials}">Marketing Materials</a><br/>`;
  }
  if (property?.site_plan) {
    emailHtml += `<a href="${property.site_plan}">Site Plan</a><br/>`;
  }
  if (property?.demographics) {
    emailHtml += `<a href="${property.demographics}">Demographics</a><br/>`;
  }

  // Add individual property unit files (for property unit site submits)
  if (hasPropertyUnitFiles) {
    propertyUnitFiles.forEach(file => {
      emailHtml += `<a href="${file.sharedLink}">${file.name}</a><br/>`;
    });
  }
  emailHtml += `</p>`;
}
```

### 3. Display Order in Email

The "Supporting Files" section now displays files in this order:

**For Property-Level Site Submits (no unit):**
1. Individual property Dropbox files (e.g., "Aerial.pdf", "Survey.dwg")
2. Generic property links (Marketing Materials, Site Plan, Demographics)

**For Property Unit Site Submits:**
1. Generic property links (Marketing Materials, Site Plan, Demographics)
2. Individual property unit Dropbox files (e.g., "LOD.pdf", "FloorPlan.dwg")

## Error Handling

**Graceful Degradation:**
- All errors are caught and logged to console
- Email continues to send even if Dropbox fetch fails
- Falls back to showing only generic property-level links
- No user-facing errors or interruptions

**Error Scenarios Handled:**
- Dropbox mapping not found in database
- Dropbox folder doesn't exist
- Network/API errors when fetching files
- Individual file shared link generation failures
- Dropbox API authentication issues

## Database Requirements

**Required Table:** `dropbox_mapping`

**Required Columns:**
- `entity_type` (text) - Set to `'property'` for property-level mappings
- `entity_id` (uuid) - Foreign key to `property.id`
- `dropbox_folder_path` (text) - Full path to Dropbox folder

**Example Row:**
```sql
INSERT INTO dropbox_mapping (entity_type, entity_id, dropbox_folder_path)
VALUES (
  'property',
  '123e4567-e89b-12d3-a456-426614174000',
  '/Salesforce Documents/Properties/123 Main St'
);
```

## Dropbox Folder Structure

```
/Salesforce Documents/
  └─ Properties/
      └─ [Property Name]/
          ├─ Aerial.pdf              ← Property-level files (NEW: included in email)
          ├─ Survey.dwg              ← Property-level files (NEW: included in email)
          ├─ SitePlan.pdf            ← Property-level files (NEW: included in email)
          └─ Units/                  ← Subfolder (excluded from property-level emails)
              └─ Suite 100/
                  ├─ LOD.pdf         ← Unit files (only in unit emails)
                  └─ FloorPlan.dwg   ← Unit files (only in unit emails)
```

**Filtering Logic:**
- Property-level emails: Include only files directly in property folder
- Exclude the "Units/" subfolder and its contents
- Exclude any other subfolders

## Files Modified

### 1. `/src/hooks/useSiteSubmitEmail.ts`
**Changes:**
- Added property-level file fetching logic (lines 166-209)
- Added `propertyFiles` parameter to `generateSiteSubmitEmailTemplate()` call (line 220)

**Lines Added:** 46 lines

### 2. `/src/utils/siteSubmitEmailTemplate.ts`
**Changes:**
- Updated `SiteSubmitEmailData` interface to include `propertyFiles` (line 20)
- Updated function signature to destructure `propertyFiles` (line 24)
- Enhanced "Supporting Files" section to display property files (lines 127-131)
- Reorganized file display order with comments (lines 118-151)

**Lines Added:** 16 lines
**Lines Modified:** 4 lines

**Total Changes:** 62 insertions, 4 deletions

## Testing Guide

### Manual Testing Steps

1. **Find or Create Property-Level Site Submit:**
   ```sql
   SELECT id, property_id, property_unit_id
   FROM site_submit
   WHERE property_id IS NOT NULL
     AND property_unit_id IS NULL
   LIMIT 1;
   ```

2. **Verify Dropbox Mapping Exists:**
   ```sql
   SELECT * FROM dropbox_mapping
   WHERE entity_type = 'property'
     AND entity_id = '[your_property_id]';
   ```

3. **Upload Test Files to Property Folder:**
   - Navigate to the property in the UI
   - Upload files directly to the property folder (not a unit)
   - Verify files appear in Dropbox at `/Salesforce Documents/Properties/{Property}/`

4. **Send Site Submit Email:**
   - Open the property-level site submit
   - Click "Send Email" button
   - Review email preview in composer modal

5. **Verify Email Content:**
   - Check "Supporting Files" section includes:
     - Individual property Dropbox files as clickable links
     - Generic property-level links (if populated)
   - Verify file links are clickable and point to correct Dropbox files

### Test Cases

**Test Case 1: Property with Dropbox Files**
- ✅ Property has mapping in `dropbox_mapping` table
- ✅ Property folder contains 3+ files
- ✅ Email shows all individual files as separate links
- ✅ File names are displayed correctly
- ✅ Clicking links opens correct Dropbox files

**Test Case 2: Property with Dropbox Files + Generic Links**
- ✅ Property has Dropbox files
- ✅ Property has `marketing_materials` link populated
- ✅ Email shows both Dropbox files AND generic link
- ✅ Both types of links are functional

**Test Case 3: Property with No Dropbox Mapping**
- ✅ Property exists but no `dropbox_mapping` entry
- ✅ Email still sends successfully
- ✅ Shows only generic property-level links
- ✅ No error message displayed to user

**Test Case 4: Property with Empty Dropbox Folder**
- ✅ Property has mapping but folder is empty
- ✅ Email still sends successfully
- ✅ Shows only generic property-level links
- ✅ No error message displayed to user

**Test Case 5: Dropbox API Error**
- ✅ Simulate Dropbox API failure
- ✅ Error logged to console
- ✅ Email still sends successfully
- ✅ Shows only generic property-level links

**Test Case 6: Property Unit Site Submit (Regression)**
- ✅ Property unit site submit still works as before
- ✅ Shows property unit files
- ✅ Shows generic property-level links
- ✅ Does NOT show property-level Dropbox files

## Related Documentation

- [Site Submit Email System](./SITE_SUBMIT_EMAIL_SYSTEM.md) - Complete email system overview
- [Site Submit Email Notifications](./site-submit-email-notifications.md) - Email sending process
- [Site Submit Email Session (Oct 30)](./SITE_SUBMIT_EMAIL_SESSION_2025_10_30.md) - Property unit file links implementation
- [Property Unit File Management](./property-unit-file-management.md) - File organization structure
- [Site Submit Email Metadata](./site-submit-email-metadata.md) - Email tracking system

## Benefits

1. **Consistency:** Property-level site submits now have the same file linking capability as property unit site submits
2. **Completeness:** Users receive all relevant files in a single email (both Dropbox files and generic links)
3. **User Experience:** Recipients can access all property documents with one click
4. **Flexibility:** System gracefully handles missing mappings, empty folders, and API errors
5. **Maintainability:** Follows same pattern as property unit implementation

## Future Enhancements

Potential improvements for future iterations:

1. **File Categorization:** Group files by type (PDFs, images, CAD files)
2. **File Sorting:** Display files in alphabetical order or by upload date
3. **File Thumbnails:** Add preview images for supported file types
4. **Folder Management UI:** Allow users to manage property-level Dropbox mappings from UI
5. **Batch Link Generation:** Optimize Dropbox API calls for large file sets
6. **File Metadata:** Display file size and upload date in email

## Rollout Notes

**Deployment Steps:**
1. ✅ Merge feature branch to main
2. ✅ Push to remote repository
3. ⚠️ Verify production Dropbox API credentials are configured
4. ⚠️ Test with 1-2 real properties before full rollout
5. ⚠️ Monitor console logs for Dropbox API errors
6. ⚠️ Notify users of new capability

**Environment Variables Required:**
- `VITE_DROPBOX_ACCESS_TOKEN`
- `VITE_DROPBOX_REFRESH_TOKEN`
- `VITE_DROPBOX_APP_KEY`
- `VITE_DROPBOX_APP_SECRET`

**No Database Migration Required** - Uses existing `dropbox_mapping` table structure

## Support Notes

**Common Issues:**

1. **Files not appearing in email:**
   - Verify `dropbox_mapping` entry exists for property
   - Check files are directly in property folder (not in subfolders)
   - Verify Dropbox API credentials are valid

2. **Shared links not working:**
   - Ensure Dropbox folder permissions are correct
   - Verify shared link generation didn't fail (check console logs)
   - Confirm recipient has permission to view shared links

3. **Performance issues:**
   - Large numbers of files may slow email preparation
   - Consider limiting file count or implementing pagination
   - Check Dropbox API rate limits

## Git Information

**Branch:** `feature/property-level-dropbox-file-links`
**Commit Hash:** `6b0f265`
**Merge Date:** November 17, 2025
**Merged to:** `main`

**Commit Message:**
```
feat: add Dropbox file links for property-level site submits

Extended the site submit email system to automatically include individual
Dropbox file links for property-level site submits (not just property units).

Changes:
- Added property-level file fetching in useSiteSubmitEmail hook
- Queries dropbox_mapping table with entity_type='property'
- Filters to only include files (excludes subfolders like "Units/")
- Updates email template to display both property Dropbox files and generic links
- Graceful error handling - logs errors and continues with generic links

For property-level site submits, the email now shows:
1. Individual files from the property's Dropbox folder (if found)
2. Generic property-level links (Marketing Materials, Site Plan, Demographics)

This mirrors the existing behavior for property unit site submits and
provides users with comprehensive file access in site submit emails.
```

---

**Implementation Team:** Claude Code
**Reviewed By:** [To be filled]
**Approved By:** [To be filled]
