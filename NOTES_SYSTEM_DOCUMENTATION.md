# Notes System Documentation

## Overview
The notes system provides rich text note creation, editing, and display capabilities integrated throughout the application. Notes can be associated with clients, deals, contacts, properties, assignments, and site submits.

## Recent Updates (October 2025)

### ✅ **Deal Sidebar Note Management** (October 2, 2025)
- **Database schema fix**: Made `sf_content_note_id` and `sf_content_document_link_id` nullable to support local note creation
- **Auto-open in edit mode**: New notes automatically open in edit mode for immediate input
- **Object tagging/linking**: Notes can now be associated with multiple objects (deals, contacts, properties, clients)
  - Interactive search interface with dropdown type selector
  - Real-time search across object types
  - Visual display of linked objects with remove capability
  - Proper foreign key storage in `note_object_link` table
- **Improved vertical spacing**: Expanded sidebar height (`max-h-96`) and scrollable note editor (`max-h-[500px]`) for better visibility
- **Auto-association**: Notes created from deal sidebar automatically link to current deal with proper `deal_id` foreign key
- **Title and body updates**: Both title and body fields properly save and display

### ✅ **Rich Text Editor Upgrade** (September 2025)
- **Replaced** markdown-based editor with **React-Quill** WYSIWYG editor
- **Salesforce-like interface** with modern toolbar and formatting options
- **Professional styling** with custom CSS matching design system
- **HTML content storage** for rich formatting preservation

### ✅ **Notes Page Enhancements** (September 2025)
- **Added "+ New" button** to main Notes page header
- **Added "Edit Note" functionality** to expanded note view
- **Cleaned up note display** - removed technical fields (Note ID, Salesforce ID, Size, Share Type, Visibility)
- **Streamlined view** showing only Created/Updated dates and Edit button

### ✅ **Content Truncation Fix** (September 2025)
- **Implemented pagination** in fix-all-notes.js script to process ALL 1,310+ records
- **Successfully restored full content** for truncated notes from Salesforce
- **Automated script** fetches complete content via Salesforce VersionData API

### ✅ **Site Submit Pin Right-Click Functionality** (September 2025)
- **Desktop right-click context menu** for site submit pins (identical to property pins)
- **Verify Pin Location** - enables dragging to set verified coordinates independently of property location
- **Copy Coordinates** - copies current pin coordinates to clipboard
- **Reset to Property Location** - clears verified coordinates and returns pin to property location
- **Visual distinction** - verified pins show green dashed border with checkmark overlay
- **Database integration** - saves to `verified_latitude`/`verified_longitude` fields in `site_submit` table
- **Event handling** - prevents property/map context menus from interfering with site submit menus

## Architecture

### Core Components

#### 1. **NoteFormModal.tsx**
- **Modern React-Quill editor** with rich text formatting
- **Configurable toolbar**: Headers, Bold/Italic/Underline, Lists, Colors, Links
- **HTML content storage** instead of markdown
- **Auto-association** with parent objects (client, deal, contact, etc.)
- **Form validation** and error handling

#### 2. **RichTextNote.tsx**
- **Hybrid content renderer** - supports both HTML (new) and Markdown (legacy)
- **Automatic content detection** based on markup
- **Custom styling** for both rendering modes
- **Clean display** with proper typography

#### 3. **NotesDebugPage.tsx** (Main Notes Page)
- **Comprehensive note listing** with advanced search
- **Pagination** for large datasets (25 notes per page)
- **Filtering** by association type (client, deal, contact, etc.)
- **Expandable note content** with inline editing
- **Real-time search** with field-specific filters

#### 4. **DealSidebar.tsx** (and similar sidebar components)
- **Inline note editing** with title and body fields
- **Multi-object tagging** - link notes to deals, contacts, properties, clients
- **Search interface** for finding and linking objects
- **Auto-association** - notes created from sidebar automatically link to parent entity
- **Visual tag display** - linked objects shown as removable tags
- **Proper foreign keys** - stores both `object_id` and specific `[type]_id` for joins

### Data Flow

1. **Creation (Sidebar)**: DealSidebar → Insert note → Insert note_object_link with proper foreign keys → Fetch and display
2. **Creation (Main Page)**: NoteFormModal → Supabase → NotesPage refresh
3. **Editing**: Inline edit in sidebar or NoteFormModal → Update note table → State update
4. **Display**: RichTextNote (rich text) or plain text display in sidebar
5. **Association**: note_object_link table with both `object_id` and `[type]_id` for proper joins
6. **Multi-linking**: Search interface → Insert additional note_object_link records → Refresh display

## Rich Text Features

### Available Formatting
- **Headers** (H1, H2, H3)
- **Text styling**: Bold, Italic, Underline
- **Lists**: Bullet points and numbered lists
- **Colors**: Text and background colors
- **Links**: Clickable web links
- **Clean formatting**: Remove unwanted formatting

### Editor Configuration
```javascript
const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'color': [] }, { 'background': [] }],
    ['link'],
    ['clean']
  ],
};
```

## Database Schema

### Tables
- **note**: Main notes table with HTML content
- **note_object_link**: Association table linking notes to objects
- **salesforce_ContentVersion**: Source data from Salesforce

### Key Fields
- `note.body`: HTML content from React-Quill (or plain text for sidebar notes)
- `note.title`: Note title/subject
- `note.content_size`: Character count (text-only)
- `note.sf_content_note_id`: Salesforce ContentNote ID (nullable for local notes)
- `note_object_link.object_type`: Type of associated object (deal, contact, property, client, etc.)
- `note_object_link.object_id`: Generic UUID of associated object
- `note_object_link.[type]_id`: Specific foreign key (e.g., `deal_id`, `contact_id`) for proper joins
- `note_object_link.sf_content_document_link_id`: Salesforce link ID (nullable for local notes)

## Content Migration & Restoration

### fix-all-notes.js Script
- **Purpose**: Restore full content for truncated notes
- **Process**: SOAP login → Fetch from VersionData → Update database
- **Pagination**: Handles all 1,310+ records in batches
- **Rate limiting**: 150ms between API calls
- **Ordering**: Processes largest notes first (ContentSize DESC)

### Usage
```bash
# Ensure credentials in .env
node fix-all-notes.js
```

## User Interface

### Main Notes Page (/notes-debug)
- **Header**: Title, stats, and prominent "+ New Note" button
- **Filters**: By type, advanced search with field-specific queries
- **Note cards**: Expandable with title, associations, dates
- **Pagination**: 25 notes per page with navigation

### Note Creation/Editing
- **Modal interface** with React-Quill editor
- **Title and content fields** with validation
- **Rich formatting toolbar** with intuitive controls
- **Auto-save on submission** with proper error handling

### Note Display
- **Context-aware rendering** (HTML vs Markdown)
- **Clean typography** with consistent styling
- **Expandable content** for long notes
- **Association tags** showing relationships

## File Structure

```
src/
├── components/
│   ├── NoteFormModal.tsx        # Rich text editor modal
│   ├── RichTextNote.tsx         # Content display component
│   ├── QuillEditor.css          # Custom styling for editor
│   ├── DealSidebar.tsx          # Deal sidebar with inline note editing & tagging
│   ├── ClientSidebar.tsx        # Client sidebar with notes integration
│   ├── NoteAssociations.tsx     # Association management
│   └── sidebar/
│       └── SidebarModule.tsx    # Reusable sidebar module with expandable sections
├── pages/
│   └── NotesDebugPage.tsx       # Main notes listing page
└── lib/
    └── supabaseClient.ts        # Database connection

scripts/
├── fix-all-notes.js             # Content restoration script
└── NOTES_TRUNCATION_FIX.md      # Script documentation

docs/
└── NOTES_SYSTEM_DOCUMENTATION.md  # This file
```

## Development Guidelines

### Adding Notes to New Components
1. Import `NoteFormModal` and `RichTextNote` for rich text, or use inline editing like `DealSidebar.tsx`
2. Add state for modal open/close or inline edit mode
3. Create handlers for note creation/editing
4. **Important**: When creating note_object_link records, set BOTH:
   - `object_id`: Generic UUID field
   - `[type]_id`: Specific foreign key (e.g., `deal_id`, `contact_id`)
5. Pass appropriate object ID for auto-association

### Styling Notes
- Use `quill-content` class for HTML content display
- Import `QuillEditor.css` for consistent styling
- Follow existing typography patterns
- For inline editing, use `max-h-96` on containers and `max-h-[500px]` with overflow-y-auto on edit forms

### Database Queries
- Use pagination for large note lists
- Include note_object_link joins for associations with explicit foreign key names:
  ```typescript
  client:client!note_object_link_client_id_fkey(id, client_name)
  ```
- Order by created_at DESC for chronological display
- Always specify the exact foreign key relationship to avoid ambiguity errors

### Multi-Object Linking
- Store both `object_type` (string) and specific foreign key in note_object_link
- Example insert for linking to a contact:
  ```typescript
  {
    note_id: noteId,
    object_type: 'contact',
    object_id: contactId,
    contact_id: contactId  // Required for joins to work
  }
  ```

## Integration Points

### Sidebar Components
- All entity sidebars include notes section
- "+ New" button for quick note creation
- Auto-association with parent entity

### Search System
- Notes searchable through main search
- Field-specific search (title:, body:, client:, etc.)
- Fuzzy matching for flexible queries

### Navigation
- Main "Notes" link in navbar → /notes-debug
- Breadcrumb navigation from entity pages
- Direct links to associated objects

## Future Enhancements

### Planned Features
- Note templates for common use cases
- Bulk operations (delete, associate, export)
- Note sharing and permissions
- Attachment support
- Advanced filtering and sorting

### Technical Improvements
- Code splitting for React-Quill bundle size
- Offline editing capabilities
- Real-time collaboration
- Version history tracking

## Known Issues & Solutions

### Database Schema
- **Issue**: `sf_content_note_id` was NOT NULL, preventing local note creation
- **Solution**: Made nullable via SQL migration:
  ```sql
  ALTER TABLE note ALTER COLUMN sf_content_note_id DROP NOT NULL;
  ALTER TABLE note_object_link ALTER COLUMN sf_content_document_link_id DROP NOT NULL;
  ```

### Foreign Key Ambiguity
- **Issue**: Supabase joins failed with "more than one relationship" error
- **Solution**: Use explicit foreign key names in select queries:
  ```typescript
  deal:deal!note_object_link_deal_id_fkey(id, deal_name)
  ```

### Vertical Space in Sidebar
- **Issue**: Note editor too cramped in sidebar, couldn't see all fields
- **Solution**: Increased SidebarModule max-height to `max-h-96` (384px) and added `max-h-[500px] overflow-y-auto` to edit form

---

*Last updated: October 2, 2025*
*Documentation reflects Deal Sidebar note management with multi-object tagging*