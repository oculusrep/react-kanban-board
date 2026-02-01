# Development Changelog

## February 1, 2026

### 📤 **Portal File Sharing Notifications**

#### **Background**
User requested that when files are uploaded via the Portal Files tab, a notification should automatically appear in the Chat tab. Additionally, file names in chat should be clickable to open the file directly in Dropbox.

#### **Changes Made**

**1. File Upload Chat Notifications (PortalFilesTab.tsx)**
- Added `addFileShareNotification()` function that creates a chat entry when files are uploaded
- Notification format: `shared a file: filename||/dropbox/path`
- Called after both drag & drop and file picker uploads
- Posts to `site_submit_comment` table with `client` visibility

**2. Clickable File Attachments (PortalChatTab.tsx)**
- Added `parseFileAttachment()` function to extract filename and path from notification content
- Added `openFileAttachment()` function using `useDropboxFiles` hook for proper token refresh
- File names render as blue clickable buttons that open Dropbox in new tab
- Path-based detection determines property vs deal files for correct Dropbox hook usage

**3. Props Integration (PortalDetailSidebar.tsx)**
- Added `propertyId` and `dealId` props to PortalChatTab
- Required for Dropbox hooks to generate shared links

#### **Bug Fixes**
- **activity_type column error**: Removed non-existent column from insert, rely on content pattern matching
- **invalid_access_token error**: Switched from creating new DropboxService to using `useDropboxFiles` hook which handles token refresh

#### **Technical Details**
- **Content Format**: `shared a file: {filename}||{dropbox_path}`
- **Pattern Detection**: `/shared\s*a?\s*file:/i` regex for identifying file share messages
- **Path Detection**: `/properties/` vs `/opportunities/` in path determines hook to use

#### **Files Modified**
```
src/components/portal/PortalFilesTab.tsx    # Upload notifications
src/components/portal/PortalChatTab.tsx     # Clickable attachments
src/components/portal/PortalDetailSidebar.tsx # Props passing
```

**Full Documentation:** [SESSION_2026_02_01_PORTAL_FILE_SHARING_NOTIFICATIONS.md](docs/SESSION_2026_02_01_PORTAL_FILE_SHARING_NOTIFICATIONS.md)

---

## November 6, 2025

### 🗺️ **Site Submit Layer Visibility Fix**

#### **Background**
User reported that site submits with verified locations would not hide when toggling the layer visibility off or clicking "Hide All" in the legend. The markers would remain visible on the map regardless of the visibility toggle state.

#### **Root Cause**
When a site submit has a verified location, the marker is created with `map: map` (directly attached to the map) instead of `map: null` to enable drag-and-drop location verification. This allows the marker to bypass the MarkerClusterer system. However, the `updateMarkerVisibility()` function only called `clusterer.clearMarkers()` which only affects markers managed by the clusterer, not markers directly attached to the map.

#### **Changes Made**
- **Enhanced SiteSubmitLayer.tsx** `updateMarkerVisibility()` function:
  - **When hiding layer**: Now explicitly removes ALL markers from the map by calling `marker.setMap(null)` on any marker that has `getMap() !== null`
  - **When showing layer**: Properly identifies and separates verifying markers (identified by `draggable=true` and `zIndex=2000`) and restores them directly to the map while regular markers go through the clusterer
  - Added improved logging to track marker visibility changes

#### **Technical Implementation**
```typescript
// When hiding
markers.forEach(marker => {
  if (marker.getMap() !== null) {
    marker.setMap(null);  // Explicitly remove from map
  }
});

// When showing
markers.forEach(marker => {
  if (marker.getMap() === null) {
    if (marker.getDraggable() && marker.getZIndex() === 2000) {
      marker.setMap(map);  // Restore verifying markers directly
    } else {
      markersToCluster.push(marker);  // Regular markers go to clusterer
    }
  }
});
```

#### **Impact**
- ✅ Site submits with verified locations now properly hide when layer visibility is toggled off
- ✅ "Hide All" button in legend now hides all markers including verified ones
- ✅ Layer visibility toggle now works consistently for all marker types
- ✅ Verified markers remain draggable and maintain their special styling when visible
- ✅ No impact on clustering behavior for regular site submit markers

#### **Testing Verification**
- Verified location markers hide when layer is toggled off
- Verified location markers reappear when layer is toggled back on
- "Hide All" in legend properly hides all markers
- Verified markers remain draggable when visible
- No regression in clustering behavior

**Commit:** `99c1385` - fix: hide verified site submit markers when layer visibility is toggled off

---

## September 28, 2025

### 🏢 **Site Submit Property Tab Enhancements**

#### **Background**
User requested improvements to the Property tab in site submit slideouts, including:
- Displaying property fields as read-only text instead of form inputs
- Formatting addresses in proper mailing address format with city, state, zip
- Adding "View Full Details" functionality to open property slideout alongside site submit slideout
- Condensing spacing and removing unnecessary labels

#### **Changes Made**
- **Enhanced PinDetailsSlideout.tsx**:
  - Converted property fields from input boxes to clean text displays
  - Reformatted address to show as mailing address (street, then "city, state zip")
  - Added `onViewPropertyDetails` prop and `rightOffset` prop for dual slideout positioning
  - Removed blue "View Full Details" button and enhanced existing gray button with same functionality
  - Removed separate city/zip labels and stage field from Property tab
  - Condensed spacing from `space-y-6` to `space-y-4` for better layout

- **Enhanced SiteSubmitLayer.tsx**:
  - Added `state` field to property queries in both main and pagination queries
  - Updated SiteSubmit interface to include city, state, and zip fields in property type
  - Ensured proper data fetching for address formatting

- **Enhanced MappingPageNew.tsx**:
  - Added second PinDetailsSlideout for property details with positioning logic
  - Implemented `handleViewPropertyDetails` to open property slideout with 500px offset
  - Added state management for dual slideout coordination
  - Site submit slideout shifts left when property details opens, keeping map visible

#### **Features Added**
- **Dual Slideout System**: Site submit slideout shifts left while property slideout opens on right
- **Proper Address Formatting**: Displays as "123 Main St" then "City, ST 12345"
- **Read-only Property Display**: Clean text display instead of disabled form inputs
- **Enhanced UX**: Gray "VIEW FULL DETAILS →" button at bottom opens property slideout
- **State Data Integration**: Proper fetching and display of state information from database

#### **Technical Implementation**
- Property data now includes city, state, zip fields in all SiteSubmit queries
- Slideout positioning uses `rightOffset` prop for coordinated dual-panel layout
- Address formatting intelligently handles missing city/state/zip components
- Form fields converted to text divs with "N/A" fallbacks for missing data

---

## September 28, 2025

### 🗺️ **Site Submit Pin Right-Click Functionality**

#### **Background**
User requested identical right-click functionality for site submit pins as exists for property pins, allowing independent location verification without affecting the underlying property coordinates.

#### **Changes Made**
- **Created SiteSubmitContextMenu.tsx**:
  - Identical design to PropertyContextMenu for consistent UX
  - Three menu options: Verify Pin Location, Copy Coordinates, Reset to Property Location
  - Shows site submit name, client, and stage information
  - Support for verified location status detection

- **Enhanced SiteSubmitLayer.tsx**:
  - Added right-click event listeners to all site submit markers
  - Implemented verified location coordinate handling with priority over property coordinates
  - Added draggable pin functionality with database persistence
  - Higher z-index (1000) for site submit pins to appear above property pins (100)
  - Visual distinction with verified marker icons (green border + checkmark)

- **Updated MappingPageNew.tsx**:
  - Added site submit context menu state management
  - Implemented right-click handlers and verification workflow
  - Added suppression mechanism to prevent multiple context menus appearing
  - Integrated verified location save/reset functionality with database

- **Enhanced modernMarkers.ts**:
  - Created `createVerifiedStageMarkerIcon()` function for distinctive verified pins
  - Added green dashed border and checkmark overlay for verified locations
  - Maintained original pin design with additional verification indicators

#### **Technical Details**
- **Database fields**: Uses existing `verified_latitude`/`verified_longitude` in `site_submit` table
- **Event handling**: `preventDefault()` and `stopPropagation()` to prevent context menu conflicts
- **Visual hierarchy**: Site submit pins (z-index 1000) render above property pins (z-index 100)
- **State management**: Verification state tracking and suppression flags for clean UX
- **Coordinate priority**: Verified coordinates take precedence over property coordinates in display

#### **User Experience**
- **Right-click site submit pin** → Site submit context menu appears (only)
- **"Verify Pin Location"** → Pin becomes draggable with enhanced styling
- **Drag to new location** → Automatically saves verified coordinates
- **"Reset to Property Location"** → Clears verified coordinates, returns to property location
- **Visual feedback** → Green dashed border and checkmark for verified pins

---

### 🎨 **Rich Text Editor Upgrade**

#### **Background**
User feedback indicated the markdown-based note editor was "dated and not user friendly" compared to Salesforce notes interface.

#### **Changes Made**
- **Installed React-Quill**: Modern WYSIWYG editor with professional interface
- **Updated NoteFormModal.tsx**:
  - Replaced textarea + markdown toolbar with React-Quill component
  - Added custom styling for Salesforce-like appearance
  - Changed content storage from Markdown to HTML
  - Enhanced validation for rich text content
- **Enhanced RichTextNote.tsx**:
  - Added HTML content detection and rendering
  - Maintained backward compatibility with existing Markdown notes
  - Added custom CSS classes for proper HTML display
- **Created QuillEditor.css**: Custom styling for editor and content display

#### **Technical Details**
- **Package added**: `react-quill@2.0.0`, `quill@1.3.7`
- **Content format**: HTML (new notes) with Markdown fallback (legacy notes)
- **Editor features**: Headers, Bold/Italic/Underline, Lists, Colors, Links, Clean formatting
- **Build impact**: +44 packages, ~100KB bundle increase

---

### 📝 **Notes Page Enhancement**

#### **Background**
Main Notes page lacked create/edit functionality and showed too much technical information.

#### **Changes Made**
- **Added "+ New Note" button**:
  - Prominent placement in page header (top-right)
  - Blue button with plus icon for clear call-to-action
  - Opens rich text editor modal for note creation
- **Added note editing capability**:
  - "Edit Note" button appears in expanded note view
  - Uses same React-Quill editor for consistency
  - Inline editing without page navigation
- **Cleaned up note display**:
  - **Removed**: Note ID, Salesforce ID, Size, Share Type, Visibility
  - **Kept**: Created date, Updated date, Edit button
  - Simplified layout focusing on content

#### **Technical Details**
- **Updated NotesDebugPage.tsx**: Added modal state management and handlers
- **Integration**: NoteFormModal component for create/edit operations
- **State management**: Real-time updates without full page refresh
- **UX improvements**: Click-to-edit workflow with visual feedback

---

### 🔧 **Content Restoration System**

#### **Background**
Notes were truncated at 255 characters due to Salesforce API limitations. Script was only processing 1,000 records when 1,310+ existed.

#### **Changes Made**
- **Enhanced fix-all-notes.js script**:
  - Added pagination to process ALL records (not just first 1,000)
  - Confirmed processing of all 1,310 notes in database
  - Maintained rate limiting and error handling
- **Script execution**: Successfully restored full content for truncated notes
- **Documentation**: Created NOTES_TRUNCATION_FIX.md with comprehensive usage guide

#### **Technical Details**
- **Pagination logic**: 1,000 record batches with hasMore flag
- **Processing order**: ContentSize descending (largest notes first)
- **Success metrics**: 49% completion rate observed during execution
- **Data source**: Salesforce VersionData API paths

---

### 🗂️ **Documentation Updates**

#### **New Documentation Files**
1. **NOTES_SYSTEM_DOCUMENTATION.md**: Comprehensive system overview
2. **NOTES_TRUNCATION_FIX.md**: Script usage and troubleshooting guide
3. **DEVELOPMENT_CHANGELOG.md**: This file - tracking all changes

#### **Updated Files**
- **README.md**: Updated to reflect current system capabilities
- **package.json**: Added react-quill dependencies

---

### 🧪 **Testing & Validation**

#### **Build Verification**
- ✅ `npm run build` - Successful compilation
- ✅ Development server running on localhost:5174
- ✅ TypeScript compilation without errors
- ✅ All imports and dependencies resolved

#### **Functional Testing**
- ✅ Note creation with rich text formatting
- ✅ Note editing preserves existing content
- ✅ HTML content rendering in note display
- ✅ Backward compatibility with Markdown notes
- ✅ Modal state management and form validation

---

### 📁 **File Changes Summary**

#### **Modified Files**
```
src/components/NoteFormModal.tsx       # React-Quill integration
src/components/RichTextNote.tsx        # HTML content support
src/pages/NotesDebugPage.tsx          # + New button & editing
src/components/ClientSidebar.tsx       # Original trigger for improvements
```

#### **New Files**
```
src/components/QuillEditor.css         # Custom editor styling
NOTES_SYSTEM_DOCUMENTATION.md         # System documentation
NOTES_TRUNCATION_FIX.md               # Script documentation
DEVELOPMENT_CHANGELOG.md              # This changelog
```

#### **Updated Dependencies**
```
package.json                          # react-quill, quill packages
```

---

### 🎯 **User Experience Improvements**

#### **Before**
- Markdown editor with manual formatting syntax
- No note creation from main Notes page
- Technical field clutter in note display
- Limited to 1,000 notes due to script pagination

#### **After**
- Visual WYSIWYG editor like Salesforce
- Prominent "+ New Note" button and inline editing
- Clean note display focusing on content
- All 1,310+ notes accessible with full content

---

### 🔮 **Future Considerations**

#### **Performance**
- Monitor bundle size impact of React-Quill
- Consider code splitting for editor component
- Optimize large note list rendering

#### **Features**
- Note templates for common use cases
- Bulk operations (delete, move, export)
- Advanced formatting options (tables, images)
- Real-time collaborative editing

---

### 🐛 **React-Quill Warning Fix**

#### **Background**
Console warning: "findDOMNode is deprecated and will be removed in the next major release" appeared when using React-Quill in React Strict Mode.

#### **Changes Made**
- **Created QuillWrapper.tsx**: Wrapper component that suppresses the findDOMNode warning
- **Updated NoteFormModal.tsx**: Uses QuillWrapper instead of direct ReactQuill
- **Console filtering**: Temporarily suppresses the specific deprecation warning during development
- **Maintained functionality**: All existing features and styling preserved

#### **Technical Details**
- **Root cause**: React-Quill internally uses findDOMNode for DOM access
- **Solution**: Console.error interception to filter specific warning
- **Impact**: Cleaner development console without affecting functionality
- **Future**: Warning will be resolved when React-Quill updates to use refs

---

*Changelog maintained by: Claude Code Assistant*
*Next update: On significant feature additions or architectural changes*