# Property Unit File Management - Feature Test Suite

**Feature**: Dropbox file management for individual property units
**Commit**: 19ddc8e
**Date**: 2025-10-30

## Overview

Property units now support file management through Dropbox integration. Each property unit can have its own dedicated folder for storing unit-specific files like LODs (Letters of Determination), As-Built drawings, floor plans, and lease documents.

## Feature Scope

- Each property unit gets a dedicated Dropbox folder
- Folder path structure: `/Properties/[Property Name]/Units/[Unit Name]/`
- Files are managed inline within the expanded property unit card
- Supports upload, download, delete, and share link generation
- Auto-creates Dropbox folders on first file upload

---

## Test Cases

### TC-PUF-001: Access Property Unit Files Section

**Prerequisites**:
- Access to a property with at least one property unit
- Property page loaded successfully

**Steps**:
1. Navigate to any property page (e.g., `/property/{propertyId}`)
2. Scroll to the "Property Units" section
3. Click the chevron icon to expand a property unit card
4. Scroll down within the expanded unit details

**Expected Result**:
- Unit expands showing all fields (Name, SF, Rent, NNN, etc.)
- "Unit Features" section with checkboxes is visible
- **Files** section appears below Unit Features
- Files section shows either:
  - File upload interface (if no folder exists yet)
  - List of existing files (if folder exists)

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-002: Upload First File to Property Unit (Auto-Create Folder)

**Prerequisites**:
- Property unit with no existing Dropbox folder
- Test file ready (e.g., sample LOD.pdf)

**Steps**:
1. Expand a property unit that has never had files uploaded
2. Locate the Files section
3. Note the message: "No Dropbox folder linked to this record"
4. Click "Upload Files" or drag a file into the upload area
5. Select a test file (e.g., `LOD-Suite-101.pdf`)
6. Wait for upload to complete

**Expected Result**:
- Upload progress indicator appears
- Dropbox folder is auto-created with path: `/Properties/[Property Name]/Units/[Unit Name]/`
- Success message appears: "Created Dropbox folder: [Unit Name]"
- File appears in the file list
- File shows correct name, size, and modified date
- Database record created in `dropbox_mapping` table with `entity_type='property_unit'`

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-003: Upload Multiple Files to Property Unit

**Prerequisites**:
- Property unit with existing Dropbox folder
- Multiple test files ready (e.g., LOD.pdf, As-Built.dwg, FloorPlan.pdf)

**Steps**:
1. Expand a property unit with an existing file folder
2. Click "Upload Files"
3. Select multiple files at once (Ctrl/Cmd+Click)
4. Or drag multiple files into the upload area
5. Wait for all uploads to complete

**Expected Result**:
- All files upload successfully
- Progress indicator shows for each file
- All files appear in the file list
- Files are sorted by name or date
- No duplicate file entries
- File count updates correctly

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-004: View and Download Property Unit Files

**Prerequisites**:
- Property unit with at least 2-3 uploaded files

**Steps**:
1. Expand the property unit
2. Locate the Files section
3. Review the file list
4. Click on a file name to download/view it

**Expected Result**:
- All uploaded files are visible in the list
- Each file shows:
  - File name
  - File size (formatted, e.g., "2.4 MB")
  - Last modified date/time
  - File type icon (PDF, image, etc.)
- Clicking a file opens it in a new tab or downloads it
- Dropbox shared link is generated correctly

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-005: Delete File from Property Unit

**Prerequisites**:
- Property unit with at least one uploaded file

**Steps**:
1. Expand the property unit
2. Find a file in the Files section
3. Hover over the file to reveal action buttons
4. Click the delete/trash icon
5. Confirm deletion in the confirmation dialog

**Expected Result**:
- Delete confirmation prompt appears
- After confirmation:
  - File is removed from the list immediately
  - File is deleted from Dropbox
  - File count decrements
  - If last file, folder remains (or shows empty state)
- No errors in browser console

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-006: Create Subfolder in Property Unit Files

**Prerequisites**:
- Property unit with existing Dropbox folder

**Steps**:
1. Expand the property unit
2. Locate the Files section
3. Click "Create Folder" button (if available)
4. Enter folder name (e.g., "As-Builts")
5. Confirm folder creation

**Expected Result**:
- New folder appears in the file list
- Folder icon is distinct from file icons
- Folder can be clicked to navigate into it
- Can upload files into the subfolder
- Breadcrumb navigation works to go back to root

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-007: Get Shared Link for Property Unit File

**Prerequisites**:
- Property unit with at least one uploaded file

**Steps**:
1. Expand the property unit
2. Find a file in the Files section
3. Hover over the file
4. Click the "Share" or "Get Link" icon
5. Wait for link generation

**Expected Result**:
- Shared link is generated successfully
- Link is copied to clipboard automatically (or copy button appears)
- Success message: "Link copied to clipboard"
- Link can be pasted and opened in a browser
- Link opens the file directly in Dropbox web viewer
- File is accessible without login (public link)

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-008: Files Section for Multiple Property Units

**Prerequisites**:
- Property with 3+ property units

**Steps**:
1. Navigate to a property with multiple units
2. Expand first property unit
3. Upload a file to the first unit (e.g., "LOD-Suite-A.pdf")
4. Collapse first unit and expand second unit
5. Upload a different file to the second unit (e.g., "LOD-Suite-B.pdf")
6. Expand third unit and verify it has no files

**Expected Result**:
- Each unit has its own independent Files section
- Files uploaded to Unit A only appear in Unit A
- Files uploaded to Unit B only appear in Unit B
- Unit C shows empty state (no folder linked)
- No file cross-contamination between units
- Each unit gets its own Dropbox folder path:
  - Unit A: `/Properties/[Property]/Units/Suite A/`
  - Unit B: `/Properties/[Property]/Units/Suite B/`
  - Unit C: No folder yet

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-009: Files Persist After Unit Expansion/Collapse

**Prerequisites**:
- Property unit with uploaded files

**Steps**:
1. Expand a property unit with existing files
2. Verify files are visible
3. Collapse the property unit
4. Expand the same property unit again
5. Check the Files section

**Expected Result**:
- Files are still present after re-expansion
- File list matches previous state
- No duplicate files appear
- File count is accurate
- No unnecessary API calls (files cached appropriately)

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-010: File Upload with Special Characters in Unit Name

**Prerequisites**:
- Property unit with special characters in name (e.g., "Suite #101-A", "Unit 5 (End Cap)")

**Steps**:
1. Navigate to a property
2. Create or find a unit with special characters in the name
3. Expand the unit
4. Upload a test file to the Files section

**Expected Result**:
- Dropbox folder is created successfully
- Special characters are sanitized/escaped properly in folder path
- No errors during folder creation
- File uploads successfully
- Folder path is readable and valid in Dropbox
- No broken characters or encoding issues

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-011: Error Handling - No Dropbox Token

**Prerequisites**:
- Dropbox access token not configured (removed from .env)

**Steps**:
1. Remove or comment out `VITE_DROPBOX_ACCESS_TOKEN` in .env
2. Restart the application
3. Navigate to a property unit
4. Expand a unit and check the Files section

**Expected Result**:
- Graceful error message appears
- Message states: "Dropbox access token is required. Please set VITE_DROPBOX_ACCESS_TOKEN in your .env file."
- No broken UI elements
- No console errors that crash the app
- Rest of the unit editing functionality still works

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-012: Error Handling - Dropbox Folder Deleted Externally

**Prerequisites**:
- Property unit with existing Dropbox folder and files
- Access to Dropbox web interface

**Steps**:
1. Upload files to a property unit
2. Note the Dropbox folder path
3. Go to Dropbox web interface and manually delete the unit's folder
4. Return to OVIS and refresh the property page
5. Expand the property unit

**Expected Result**:
- Error message appears: "Dropbox folder was deleted. Upload a file to recreate it."
- File list shows empty
- Upload functionality still works
- Uploading a new file recreates the folder
- New folder has the same path as before
- Database mapping is updated with new verification timestamp

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-013: Performance - Large File Upload

**Prerequisites**:
- Large test file ready (50+ MB, e.g., large CAD drawing or high-res rendering)

**Steps**:
1. Expand a property unit
2. Upload a large file (50-100 MB)
3. Monitor upload progress
4. Wait for completion

**Expected Result**:
- Upload progress indicator shows percentage
- Upload doesn't freeze the UI
- User can navigate away and upload continues (or clear messaging if not)
- Upload completes successfully
- File appears in the list with correct size
- No timeout errors
- Browser console shows no memory warnings

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-014: Database Integration Check

**Prerequisites**:
- Database access
- Property unit with uploaded files

**Steps**:
1. Upload files to a property unit
2. Query the `dropbox_mapping` table:
   ```sql
   SELECT * FROM dropbox_mapping
   WHERE entity_type = 'property_unit'
   AND entity_id = '[unit_id]';
   ```
3. Verify the record exists

**Expected Result**:
- Record exists in `dropbox_mapping` table
- Fields are correctly populated:
  - `entity_type` = 'property_unit'
  - `entity_id` = the property unit's UUID
  - `dropbox_folder_path` = correct path format
  - `last_verified_at` = recent timestamp
  - `sf_id` = placeholder format: `AUTO-[first 13 chars of entity_id]`
- Record is unique (no duplicates)

**Status**: [ ] Pass / [ ] Fail

---

### TC-PUF-015: Integration with Property Unit CRUD Operations

**Prerequisites**:
- Property unit with uploaded files

**Steps**:
1. Upload files to a property unit
2. Edit the property unit name
3. Save the changes
4. Verify files are still accessible
5. (Optional) Delete the property unit
6. Check if Dropbox folder handling is appropriate

**Expected Result**:
- Renaming unit doesn't break file access
- Files remain in the original folder path (or folder is renamed if logic supports it)
- Files section still works after unit rename
- If unit is deleted:
  - Files remain in Dropbox (no auto-deletion)
  - Or clear warning is shown about file handling
  - Database mapping remains or is soft-deleted appropriately

**Status**: [ ] Pass / [ ] Fail

---

## Folder Structure Verification

### Expected Dropbox Folder Hierarchy:

```
/Properties/
  └─ [Property Name]/
      ├─ [Property-level files]
      └─ Units/
          ├─ [Unit 1 Name]/
          │   ├─ LOD.pdf
          │   ├─ As-Built.dwg
          │   └─ FloorPlan.pdf
          ├─ [Unit 2 Name]/
          │   ├─ LOD.pdf
          │   └─ Lease.pdf
          └─ [Unit 3 Name]/
              └─ [Unit 3 files]
```

**Verification Steps**:
1. Go to Dropbox web interface
2. Navigate to `/Properties/` folder
3. Find the property being tested
4. Verify `Units/` subfolder exists
5. Check each unit has its own subfolder
6. Confirm files are in correct unit folders

**Expected Result**: Folder structure matches the hierarchy above

**Status**: [ ] Pass / [ ] Fail

---

## Browser Console Check

**Steps**:
1. Open browser developer tools (F12)
2. Navigate to Console tab
3. Perform all test cases above
4. Monitor for errors, warnings, or unusual logs

**Expected Result**:
- No JavaScript errors during normal operation
- No 406 errors from Dropbox API
- No CORS errors
- Debug logs (if present) are informative and not excessive
- No memory leaks or performance warnings

**Status**: [ ] Pass / [ ] Fail

---

## Related Features to Test

### Property-Level Files (Regression Test)
- **Test**: Upload files to the property (not unit) Files section
- **Expected**: Property-level files don't interfere with unit-level files
- **Status**: [ ] Pass / [ ] Fail

### Site Submit Files (if applicable)
- **Test**: If site submits reference property units, verify file access
- **Expected**: Can view unit files from site submit context
- **Status**: [ ] Pass / [ ] Fail

---

## Notes

- Property unit file management is designed for unit-specific documents
- Common file types: LODs, As-Builts, floor plans, lease documents, unit photos
- Each unit is independent - files don't share between units
- Files are stored in Dropbox and linked via the `dropbox_mapping` table
- First upload to a unit auto-creates the Dropbox folder
- Folder paths use the property name and unit name for organization

## Related Files

- `/Users/mike/Documents/GitHub/react-kanban-board/src/hooks/useDropboxFiles.ts` (Extended to support property_unit)
- `/Users/mike/Documents/GitHub/react-kanban-board/src/components/property/PropertyUnitsSection.tsx` (UI integration)
- `/Users/mike/Documents/GitHub/react-kanban-board/src/components/sidebar/FileManagerModule.tsx` (File management component)

## Database Schema

**Table**: `dropbox_mapping`
- `entity_type`: 'property_unit'
- `entity_id`: Property unit UUID
- `dropbox_folder_path`: Full Dropbox folder path
- `sf_id`: Placeholder (AUTO-[13 chars])
- `last_verified_at`: Last verification timestamp

**Table**: `property_unit`
- `id`: UUID (used as entity_id in dropbox_mapping)
- `property_unit_name`: Used to create folder path
- `property_id`: Parent property FK
