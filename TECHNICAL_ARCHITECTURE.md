# Technical Architecture Documentation

## System Overview
React-based Kanban board application with integrated CRM functionality, mapping system, and comprehensive notes management. Built with TypeScript, React, Tailwind CSS, and Supabase backend.

## Core Technologies

### Frontend Stack
- **React 18** with TypeScript for type safety
- **Tailwind CSS** for styling and responsive design
- **React Router** for client-side navigation
- **Vite** for build tooling and development server

### Backend & Data
- **Supabase** for database, authentication, and real-time features
- **PostgreSQL** database with typed schema generation
- **Airbyte** for Salesforce data synchronization

### Rich Text & UI Libraries
- **React-Quill** for modern WYSIWYG note editing
- **React-Markdown** for legacy content rendering
- **Custom CSS** for Salesforce-like styling

## Application Architecture

### Page-Level Components
```
src/pages/
├── ClientDetailsPage.tsx         # Individual client management
├── NotesDebugPage.tsx            # Main notes interface (/notes-debug)
├── MappingPageNew.tsx            # Geographic mapping system
├── SiteSubmitDetailsPage.tsx     # Site submission workflow
└── [Entity]DetailsPage.tsx      # Other entity detail views
```

### Feature Components
```
src/components/
├── notes/
│   ├── NoteFormModal.tsx         # Rich text note creation/editing
│   ├── RichTextNote.tsx          # Content display component
│   ├── NoteAssociations.tsx      # Entity relationship management
│   └── QuillEditor.css           # Custom editor styling
├── sidebars/
│   ├── ClientSidebar.tsx         # Client-specific sidebar
│   ├── PropertySidebar.tsx       # Property-specific sidebar
│   └── [Entity]Sidebar.tsx      # Other entity sidebars
├── navigation/
│   ├── Navbar.tsx                # Main navigation
│   ├── MasterSearchBox.tsx       # Global search functionality
│   └── DedicatedSearchModal.tsx  # Advanced search interface
└── mapping/
    ├── MapComponent.tsx          # Geographic visualization
    └── LayerControls.tsx         # Map layer management
```

### Data Layer
```
src/lib/
├── supabaseClient.ts             # Database connection
└── types/
    ├── database-schema.ts        # Generated TypeScript types
    └── [entity].types.ts         # Custom type definitions
```

## Database Schema

### Core Entities
- **client**: Customer/client management
- **deal**: Sales pipeline management
- **contact**: Individual contact records
- **property**: Real estate property data
- **assignment**: Task/assignment tracking
- **site_submit**: Site submission workflow

### Notes System
- **note**: Rich text notes with HTML content
- **note_object_link**: Many-to-many relationships between notes and entities
- **salesforce_ContentVersion**: Source data sync from Salesforce

### Key Relationships
```sql
note ←→ note_object_link ←→ [client|deal|contact|property|assignment|site_submit]
```

## Notes System Architecture

### Content Flow
1. **User Input**: React-Quill WYSIWYG editor
2. **Storage**: HTML content in `note.body` field
3. **Display**: RichTextNote component with dual rendering
4. **Associations**: Automatic linking via note_object_link table

### Rich Text Pipeline
```
User Input → React-Quill → HTML → Database → RichTextNote → Rendered Display
                                     ↓
                           Legacy Markdown ← React-Markdown ← Conversion
```

### Content Migration
```
Salesforce ContentNote → Airbyte Sync → Database → fix-all-notes.js → Full Content
```

## Search & Navigation

### Global Search
- **MasterSearchBox**: Unified search across all entities
- **DedicatedSearchModal**: Advanced search with entity-specific filters
- **Field-specific queries**: Support for `field:value` syntax

### Navigation Patterns
- **Entity-centric**: Drill down from lists to detail views
- **Context-aware**: Sidebars adapt to current entity
- **Cross-referencing**: Easy navigation between related entities

## State Management

### Component-Level State
- **React hooks** (useState, useEffect) for local state
- **Custom hooks** for reusable logic (useRecentlyViewed)
- **Context providers** for authentication and global state

### Data Fetching
- **Supabase client** for real-time database operations
- **Optimistic updates** for improved user experience
- **Error boundaries** for graceful error handling

## Integration Points

### Salesforce Synchronization
- **Airbyte connectors** for automated data sync
- **Custom scripts** for content restoration (fix-all-notes.js)
- **Real-time updates** via Supabase triggers

### Google Maps Integration
- **Maps JavaScript API** for geographic visualization
- **Geocoding API** for address conversion
- **Custom map controls** and layer management

### Authentication Flow
- **Supabase Auth** for user management
- **Protected routes** with authentication guards
- **Role-based access** control (future enhancement)

## Performance Considerations

### Bundle Optimization
- **Code splitting** for large components (React-Quill)
- **Lazy loading** for non-critical features
- **Tree shaking** for unused dependencies

### Database Performance
- **Pagination** for large datasets (25 items per page)
- **Indexed queries** on frequently searched fields
- **Batch operations** for bulk data processing

### Caching Strategy
- **Browser caching** for static assets
- **Component memoization** for expensive renders
- **API response caching** for repeated queries

## Development Workflow

### Build & Deployment
```bash
npm run dev         # Development server (Vite)
npm run build       # Production build
npm run preview     # Preview production build
npm run schema      # Generate database types
```

### Code Quality
- **TypeScript** for compile-time type checking
- **ESLint** for code quality (when configured)
- **Prettier** for consistent formatting (when configured)

### Testing Strategy
- **Manual testing** during development
- **Build verification** before deployment
- **User acceptance testing** for feature validation

## Security Considerations

### Data Protection
- **Environment variables** for sensitive configuration
- **Supabase RLS** (Row Level Security) for data isolation
- **Input sanitization** for user-generated content

### API Security
- **JWT tokens** for authenticated requests
- **Rate limiting** on external API calls
- **HTTPS enforcement** for all connections

## Monitoring & Debugging

### Development Tools
- **React DevTools** for component debugging
- **Supabase Dashboard** for database monitoring
- **Browser DevTools** for performance analysis

### Error Handling
- **Try-catch blocks** for async operations
- **User-friendly error messages** in UI
- **Console logging** for debugging information

## Future Architecture Considerations

### Scalability
- **Microservices** architecture for complex features
- **CDN integration** for asset delivery
- **Database sharding** for large datasets

### Technology Upgrades
- **React 19** migration planning
- **Next.js** consideration for SSR benefits
- **Alternative state management** (Redux, Zustand) evaluation

### Feature Extensions
- **Real-time collaboration** with WebSockets
- **Offline capabilities** with service workers
- **Mobile app** development strategy

---

*Architecture documented as of: September 28, 2025*
*Review and update quarterly or after major changes*