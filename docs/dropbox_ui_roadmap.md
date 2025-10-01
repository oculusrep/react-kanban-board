# Dropbox UI Implementation Roadmap

**Current Status:** Backend complete, ready for UI integration
**Goal:** View existing Salesforce documents + drag-and-drop new files for ongoing CRM use

---

## Phase 1: Core File Viewer Component (Session 1)

### 1.1 Create Base FileManager Component
**Location:** `src/components/FileManager/FileManager.tsx`

**Features:**
- Display list of files and folders
- File type icons (PDF, Word, Excel, Images, etc.)
- Folder/file metadata (size, modified date)
- Loading states
- Empty state ("No files yet")
- Error handling display

**Design Considerations:**
- Responsive layout (works on mobile/tablet/desktop)
- Accessibility (keyboard navigation, screen readers)
- Choose UI style: List view vs Grid view vs Both

---

### 1.2 Add File Actions
**Features to implement:**
- **View/Download:** Click file → opens shared link in new tab
- **Delete:** Trash icon with confirmation modal
- **Folder Navigation:** Click folder → navigate into it, show breadcrumbs
- **Back Navigation:** Breadcrumb trail to navigate up

**User Experience:**
- Confirmation dialogs for destructive actions
- Success/error toast notifications
- Disabled states during operations

---

### 1.3 Integrate into Detail Pages
**Target pages:**
- Property detail page
- Client detail page
- Deal detail page

**Implementation:**
- Add "Files" tab or section to existing detail views
- Import `useDropboxFiles` hook
- Pass entity type and entity ID
- Show file count badge on tab

**Conditional Rendering:**
- Show "No Dropbox folder linked" for records without mappings
- Show empty state with upload prompt for empty folders
- Show file list for folders with content

---

## Phase 2: File Upload (Session 2)

### 2.1 Single File Upload Button
**Features:**
- "Upload File" button opens file picker
- Show upload progress indicator
- Display success/error messages
- Auto-refresh file list after upload

**Technical:**
- Use native `<input type="file" />` with styled button
- Handle file validation (size limits, if needed)
- Use `uploadFiles()` from hook

---

### 2.2 Drag-and-Drop Upload Zone
**Features:**
- Dropzone component that overlays file list
- Visual feedback on drag over (border highlight, overlay)
- "Drag files here or click to upload" messaging
- Support multiple files at once
- Upload progress for each file (or batch progress)

**Technical:**
- HTML5 drag-and-drop API
- File validation before upload
- Batch upload handling
- Consider using library like `react-dropzone` for better UX

---

### 2.3 Folder Creation
**Features:**
- "New Folder" button
- Modal/inline input for folder name
- Validation (no special chars, not empty)
- Auto-refresh after creation

**Use Cases:**
- Organize documents by category (Contracts, Photos, Reports, etc.)
- Create subfolders for deals or phases

---

## Phase 3: Enhanced Features (Session 3)

### 3.1 File Preview
**Features:**
- Preview modal for common file types
- Images: Show inline preview
- PDFs: Embed PDF viewer or use iframe
- Office docs: Show preview via Dropbox or "Download to view"
- Videos: Inline video player

**Technical:**
- Modal component with file type detection
- Use Dropbox preview API if available
- Fallback to shared link download

---

### 3.2 Bulk Actions
**Features:**
- Select multiple files (checkboxes)
- Bulk delete
- Bulk download (zip via Dropbox API)
- "Select all" option

**UI:**
- Checkbox column in list view
- Action bar appears when items selected
- Clear selection button

---

### 3.3 Search and Filtering
**Features:**
- Search box filters by filename
- Filter by file type (Documents, Images, Folders, etc.)
- Sort options (name, date, size)

**Technical:**
- Client-side filtering (fast for reasonable file counts)
- Consider server-side if folders have hundreds of files

---

## Phase 4: New Record Workflow (Session 4)

### 4.1 Auto-Create Dropbox Folders for New Records
**Problem:** New properties/clients/deals created after Salesforce migration won't have Dropbox folders

**Solution Options:**

#### Option A: Create on First Upload (Lazy Creation)
- User creates new property in CRM
- User clicks "Files" tab → sees "No Dropbox folder yet"
- User uploads first file → system auto-creates folder
- Folder naming convention: `{entity_type}_{entity_id}` or `{property_name}_{date}`

**Pros:** Only creates folders when actually needed
**Cons:** Requires handling "no folder" state in UI

#### Option B: Create on Record Creation (Eager Creation)
- When user creates property/client/deal, automatically create Dropbox folder
- Background job or API hook creates folder
- Insert mapping into `dropbox_folder_mapping` table
- Folder immediately available in "Files" tab

**Pros:** Consistent experience, folder always exists
**Cons:** Creates potentially unused folders

---

### 4.2 Folder Naming Strategy
**For Salesforce-migrated records:**
- Keep existing folder structure (already in `/Salesforce Documents/...`)

**For new records:**
- Option 1: Flat structure - `/New CRM Files/{entity_type}_{id}`
- Option 2: Organized structure - `/New CRM Files/Properties/{property_name}_{id}`
- Option 3: Mixed - Keep using `/Salesforce Documents` with new naming convention

**Recommendation:** Create `/New CRM Files/` folder with organized structure:
```
/New CRM Files/
  /Properties/
    /123 Main St_uuid/
  /Clients/
    /Acme Corp_uuid/
  /Deals/
    /Deal 2024-001_uuid/
```

---

### 4.3 Update Backend Services
**Required changes:**

1. **Update DropboxService**
   - Add `createEntityFolder(entityType, entityId, entityName)` method
   - Creates folder with naming convention
   - Returns folder path

2. **Update useDropboxFiles Hook**
   - Check if mapping exists
   - If not, show "Create folder" option
   - On create, call service + insert mapping

3. **Optional: Server-side Hook**
   - Add Supabase trigger/function on property/client/deal insert
   - Automatically creates folder and mapping
   - Requires backend API endpoint

---

## Phase 5: Polish & Production Readiness (Session 5)

### 5.1 Error Handling & Edge Cases
- Handle Dropbox API rate limits
- Handle token expiration (auto-refresh)
- Handle network failures (retry logic)
- Handle concurrent operations (optimistic updates)
- Handle deleted Dropbox folders
- Handle orphaned mappings (folder deleted but mapping remains)

---

### 5.2 Performance Optimization
- Lazy load file lists (only fetch when tab opened)
- Cache file lists (invalidate on mutation)
- Virtualize long file lists (if 100+ files)
- Optimize image thumbnails

---

### 5.3 User Permissions
**Current state:** All users can access all files (via Dropbox token)

**Future consideration:**
- Role-based access (admins vs users)
- Entity-level permissions (only see files for properties you own)
- Action restrictions (view-only vs edit)

**Implementation:**
- Check user permissions before rendering actions
- Backend validation of operations
- Consider row-level security in Supabase

---

### 5.4 Activity Logging
- Log file uploads (who, when, what)
- Log deletions (audit trail)
- Show "Last modified by" on files
- Activity feed per entity

---

## Technical Architecture Summary

### Current Design (Works for Both Use Cases)

```
┌─────────────────────────────────────────────────┐
│  React Component (Property Detail Page)        │
│  ├─ useDropboxFiles('property', propertyId)    │
│  └─ <FileManager /> component                   │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  useDropboxFiles Hook                           │
│  ├─ Queries: dropbox_folder_mapping table       │
│  ├─ Gets: folderPath for entity                 │
│  └─ Calls: DropboxService methods               │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  DropboxService                                 │
│  ├─ listFolderContents(folderPath)             │
│  ├─ uploadFile(folderPath, file)               │
│  ├─ createFolder(folderPath, name)             │
│  ├─ deleteFileOrFolder(path)                    │
│  └─ getSharedLink(filePath)                     │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Dropbox API                                    │
│  - /Salesforce Documents/ (existing folders)    │
│  - /New CRM Files/ (new folders)                │
└─────────────────────────────────────────────────┘
```

### How It Works for Both Scenarios

#### Scenario 1: Viewing Salesforce Documents (Current)
1. User opens property detail page
2. Hook queries `dropbox_folder_mapping` → finds existing path
3. Service lists files from `/Salesforce Documents/{folder}`
4. User sees files, can view/download

#### Scenario 2: Uploading New Files (Future)
**For existing Salesforce-migrated records:**
1. User opens property detail page
2. Hook finds existing folder path
3. User drags file onto dropzone
4. Service uploads to existing folder path
5. File appears in Dropbox alongside Salesforce docs

**For new records created in CRM:**
1. User creates new property (no Dropbox folder yet)
2. User opens Files tab → "No folder yet"
3. User clicks "Create folder" or uploads first file
4. Service creates `/New CRM Files/Properties/{name}_{id}/`
5. Hook inserts mapping into database
6. Future uploads go to this folder

---

## Key Design Decisions

### 1. Single Dropbox Integration (Not Multiple)
**Decision:** Use one Dropbox account/token for all users

**Pros:**
- Simpler setup (no per-user OAuth)
- Centralized document storage
- Easy backup and management
- Team can access all documents

**Cons:**
- All users share same permissions
- Need to implement app-level access control

---

### 2. Folder Organization Strategy
**Decision:** Two root folders
- `/Salesforce Documents/` - Existing migrated folders (read/write)
- `/New CRM Files/` - New folders for new records (write primarily)

**Alternative:** Could merge into single structure, but keeping separate helps distinguish legacy vs new

---

### 3. Mapping Table as Source of Truth
**Decision:** Always query `dropbox_folder_mapping` table, not Dropbox API

**Pros:**
- Fast lookups (database vs API call)
- Consistent entity → folder relationship
- Can add metadata (created_by, last_verified, etc.)

**Cons:**
- Must keep table in sync if folders renamed/moved in Dropbox

---

### 4. File Operations in Real-Time (Not Queued)
**Decision:** Upload/delete immediately, show progress

**Alternative:** Could queue operations for background processing

**Why chosen:** Better UX for small files, acceptable latency

---

## Dependencies and Libraries

### Already Installed
- `dropbox` - SDK for API calls
- `@supabase/supabase-js` - Database client

### Recommended for UI
- `react-dropzone` - Drag-and-drop file uploads (~10kb)
- `react-icons` - File type icons (or `lucide-react`)
- `framer-motion` - Smooth animations (optional)

### Optional Enhancements
- `react-pdf` - PDF preview in modal
- `react-image-lightbox` - Image preview gallery
- `file-saver` - Client-side file downloads

---

## Session-by-Session Checklist

### Next Session (Session 1): Core Viewer
- [ ] Create FileManager component structure
- [ ] Implement file list display with icons
- [ ] Add folder navigation with breadcrumbs
- [ ] Add view/download functionality (shared links)
- [ ] Add delete with confirmation
- [ ] Integrate into one detail page (e.g., Property)
- [ ] Test with existing Salesforce folders

**Deliverable:** Can view and navigate Salesforce documents in UI

---

### Session 2: Upload
- [ ] Add single file upload button
- [ ] Add drag-and-drop zone
- [ ] Implement upload progress indicator
- [ ] Add folder creation modal
- [ ] Test uploading to existing folders
- [ ] Add success/error notifications

**Deliverable:** Can upload files to existing folders

---

### Session 3: Polish & Features
- [ ] Add file preview modal (images, PDFs)
- [ ] Add bulk selection and actions
- [ ] Add search/filter
- [ ] Add loading skeletons
- [ ] Integrate into remaining detail pages (Client, Deal)

**Deliverable:** Full-featured file manager

---

### Session 4: New Records Support
- [ ] Design folder naming convention
- [ ] Update DropboxService with createEntityFolder()
- [ ] Update hook to handle missing mappings
- [ ] Add "Create folder" UI for new records
- [ ] Test creating new property + uploading files
- [ ] Consider auto-folder-creation on record insert

**Deliverable:** New CRM records can have Dropbox folders

---

### Session 5: Production Ready
- [ ] Add comprehensive error handling
- [ ] Add token refresh logic in UI
- [ ] Add activity logging
- [ ] Performance testing with large file counts
- [ ] User permissions (if needed)
- [ ] Documentation for users

**Deliverable:** Production-ready file management system

---

## Questions to Answer Before Next Session

1. **UI Placement:** Where should files appear?
   - [ ] As a tab in detail pages?
   - [ ] As a sidebar panel?
   - [ ] As a modal?

2. **Design Style:**
   - [ ] List view (table-like)?
   - [ ] Grid view (tile-based)?
   - [ ] Both with toggle?

3. **Priority Features:**
   - [ ] Session 1 must-haves?
   - [ ] Can preview/search wait until Session 3?

4. **New Folder Strategy:**
   - [ ] Create on first upload (lazy)?
   - [ ] Create on record creation (eager)?
   - [ ] Manual "Create folder" button?

5. **Folder Naming:**
   - [ ] Use property name in folder name?
   - [ ] Use entity ID only?
   - [ ] Custom format?

---

## Notes

- Backend is 100% ready for both existing and new files
- `useDropboxFiles` hook already supports all CRUD operations
- Main work is UI/UX implementation
- Design can accommodate both Salesforce legacy docs and new ongoing uploads
- No backend changes needed until Session 4 (new record folder creation)

---

## Success Criteria

### Minimum Viable Product (End of Session 2)
- ✅ View list of files from existing Salesforce folders
- ✅ Click to open/download files
- ✅ Drag-and-drop upload new files
- ✅ Delete files with confirmation
- ✅ Create subfolders

### Full Feature Set (End of Session 5)
- ✅ All MVP features
- ✅ File preview for common types
- ✅ Search and filter
- ✅ Works for new records (post-Salesforce)
- ✅ Bulk operations
- ✅ Activity logging
- ✅ Production-ready error handling
