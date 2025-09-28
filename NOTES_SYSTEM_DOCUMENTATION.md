# Notes System Documentation

## Overview
The notes system provides rich text note creation, editing, and display capabilities integrated throughout the application. Notes can be associated with clients, deals, contacts, properties, assignments, and site submits.

## Recent Updates (September 2025)

### ✅ **Rich Text Editor Upgrade**
- **Replaced** markdown-based editor with **React-Quill** WYSIWYG editor
- **Salesforce-like interface** with modern toolbar and formatting options
- **Professional styling** with custom CSS matching design system
- **HTML content storage** for rich formatting preservation

### ✅ **Notes Page Enhancements**
- **Added "+ New" button** to main Notes page header
- **Added "Edit Note" functionality** to expanded note view
- **Cleaned up note display** - removed technical fields (Note ID, Salesforce ID, Size, Share Type, Visibility)
- **Streamlined view** showing only Created/Updated dates and Edit button

### ✅ **Content Truncation Fix**
- **Implemented pagination** in fix-all-notes.js script to process ALL 1,310+ records
- **Successfully restored full content** for truncated notes from Salesforce
- **Automated script** fetches complete content via Salesforce VersionData API

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

#### 4. **ClientSidebar.tsx** & Similar Components
- **"+ New" button** for quick note creation
- **Associated notes display** with rich text rendering
- **Context-aware** note creation (auto-associates with current object)

### Data Flow

1. **Creation**: NoteFormModal → Supabase → NotesPage refresh
2. **Editing**: NoteFormModal (with noteId) → Supabase → State update
3. **Display**: RichTextNote component renders HTML or Markdown
4. **Association**: note_object_link table manages relationships

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
- `note.body`: HTML content from React-Quill
- `note.title`: Note title/subject
- `note.content_size`: Character count (text-only)
- `note_object_link.object_type`: Type of associated object
- `note_object_link.object_id`: ID of associated object

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
│   ├── ClientSidebar.tsx        # Sidebar with notes integration
│   └── NoteAssociations.tsx     # Association management
├── pages/
│   └── NotesDebugPage.tsx       # Main notes listing page
└── lib/
    └── supabaseClient.ts        # Database connection

scripts/
├── fix-all-notes.js             # Content restoration script
└── NOTES_TRUNCATION_FIX.md      # Script documentation
```

## Development Guidelines

### Adding Notes to New Components
1. Import `NoteFormModal` and `RichTextNote`
2. Add state for modal open/close
3. Create handlers for note creation/editing
4. Pass appropriate object ID for auto-association

### Styling Notes
- Use `quill-content` class for HTML content display
- Import `QuillEditor.css` for consistent styling
- Follow existing typography patterns

### Database Queries
- Use pagination for large note lists
- Include note_object_link joins for associations
- Order by created_at DESC for chronological display

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

---

*Last updated: September 28, 2025*
*Documentation reflects React-Quill upgrade and Notes page enhancements*