# Property Dashboard Architecture

## Overview

The property dashboard system provides a comprehensive interface for managing property-related information with efficient access to multiple related entities (Deals, Contacts, Units, Site Submits) through both desktop and mobile optimized layouts.

## Architecture Components

### 1. ResponsivePropertyDashboard.tsx
**Main entry point** that automatically switches between desktop and mobile interfaces based on screen size.

- **Breakpoint**: 1024px (lg breakpoint)
- **Desktop**: Uses tabbed interface with static sidebar
- **Mobile**: Uses card-based navigation with full-screen sections

### 2. PropertyDashboard.tsx (Desktop)
**Desktop-optimized interface** featuring:

#### Layout Structure
- **Header**: Full-width property header with key property info
- **Tabs**: Horizontal tab navigation for different sections
- **Main Content**: Scrollable content area with max-width container
- **Static Sidebar**: Collapsible contacts sidebar (80px collapsed, 320px expanded)

#### Tab Sections
1. **Details Tab**: Complete property information
   - Property Details Section
   - Location Section
   - Financial Section
   - Market Analysis Section
   - Links Section
   - Notes Section

2. **Deals Tab**: Property-related deals management
   - Deal listing with key metrics
   - New deal creation
   - Deal stage and value display

3. **Units Tab**: Property units management (placeholder)
   - Future implementation for unit management
   - New unit creation interface

4. **Site Submits Tab**: Submission tracking (placeholder)
   - Future implementation for site submission tracking
   - New submit creation interface

#### Features
- **Live Deal Count**: Tab badges show current deal count
- **Auto-save**: Inline editing with immediate persistence
- **Validation**: Real-time form validation with warnings/errors
- **Responsive Sidebar**: Collapsible contacts with mini-avatars

### 3. PropertyDashboardMobile.tsx (Mobile)
**Mobile-optimized interface** featuring:

#### Layout Structure
- **Header**: Mobile-optimized property header
- **Navigation**: Grid-based section selection
- **Full-Screen Sections**: Each area opens in full screen

#### Section Navigation
1. **Overview**: Property details in compact format
2. **Deals**: Full-screen deal management
3. **Contacts**: Full-screen contact management
4. **Units**: Placeholder with "coming soon"
5. **Site Submits**: Placeholder with "coming soon"

#### Features
- **Card-Based Navigation**: 2x2 grid for section access
- **Section Counts**: Display counts on navigation cards
- **Back Navigation**: Consistent back button behavior
- **Touch Optimized**: Larger touch targets and spacing

## Database Integration

### Current Tables
- **property**: Main property information
- **property_contact**: Many-to-many property-contact relationships
- **deal**: Property-related deals
- **contact**: Contact information

### Future Tables
- **units**: Property unit information
- **site_submits**: Site submission tracking

## Implementation Benefits

### Desktop Advantages
- **Efficient Navigation**: Tab-based interface reduces clicks
- **Multi-tasking**: Sidebar allows contact access while viewing other sections
- **Information Density**: More information visible simultaneously
- **Professional Interface**: Salesforce-like experience

### Mobile Advantages
- **Touch Optimized**: Large touch targets and gestures
- **Focus**: One section at a time reduces cognitive load
- **Progressive Disclosure**: Information revealed as needed
- **Native Feel**: Card-based navigation feels app-like

## Usage Examples

### Basic Implementation
```tsx
import ResponsivePropertyDashboard from './components/property/ResponsivePropertyDashboard';

// Automatically responsive
<ResponsivePropertyDashboard 
  propertyId="property-123"
  mode="view"
  onBack={() => navigate('/properties')}
/>
```

### Force Desktop Layout
```tsx
import PropertyDashboard from './components/property/PropertyDashboard';

<PropertyDashboard 
  propertyId="property-123"
  mode="view"
  onBack={() => navigate('/properties')}
/>
```

### Force Mobile Layout
```tsx
import PropertyDashboardMobile from './components/property/PropertyDashboardMobile';

<PropertyDashboardMobile 
  propertyId="property-123" 
  mode="view"
  onBack={() => navigate('/properties')}
/>
```

## Key Design Decisions

### Desktop: Tabbed Interface
- **Rationale**: Minimizes clicks for frequently accessed sections
- **Trade-off**: Slightly more complex navigation structure
- **Benefit**: Professional, familiar interface pattern

### Mobile: Card Navigation
- **Rationale**: Touch-friendly, discoverable navigation
- **Trade-off**: Requires more taps to access information
- **Benefit**: Native app-like experience

### Static Sidebar (Desktop Only)
- **Rationale**: Contacts are frequently accessed across all sections
- **Implementation**: Collapsible to save space when not needed
- **Benefit**: Always available without losing context

### Responsive Breakpoint: 1024px
- **Rationale**: Provides adequate space for desktop layout on tablets in landscape
- **Consideration**: Tablets in portrait use mobile layout for better usability

## Future Enhancements

### Planned Features
1. **Units Management**: Complete unit tracking and management
2. **Site Submits**: Submission workflow and tracking
3. **Deal Detail Views**: Expanded deal management interface
4. **Contact Management**: Inline contact editing and creation
5. **Bulk Operations**: Multi-select and bulk actions
6. **Search & Filtering**: Quick search across all sections
7. **Dashboard Widgets**: Summary cards and key metrics
8. **Export Capabilities**: PDF/Excel export for sections

### Performance Optimizations
- **Lazy Loading**: Load tab content on demand
- **Virtualization**: Virtual scrolling for large lists
- **Caching**: Smart caching of frequently accessed data
- **Prefetching**: Preload likely-to-be-accessed data

## File Structure

```
src/components/property/
├── ResponsivePropertyDashboard.tsx    # Main responsive wrapper
├── PropertyDashboard.tsx              # Desktop interface
├── PropertyDashboardMobile.tsx        # Mobile interface  
├── PropertyHeader.tsx                 # Shared header component
├── StaticContactsSidebar.tsx          # Desktop sidebar
├── ContactsSidebar.tsx                # Mobile contacts
└── sections/                          # Shared section components
    ├── PropertyDetailsSection.tsx
    ├── LocationSection.tsx
    ├── FinancialSection.tsx
    ├── MarketAnalysisSection.tsx
    ├── LinksSection.tsx
    └── NotesSection.tsx
```

This architecture provides a scalable foundation for comprehensive property management while maintaining excellent user experience across all device types.