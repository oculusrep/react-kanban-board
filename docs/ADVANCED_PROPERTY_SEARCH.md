# Advanced Property Search Feature

## Overview

The Advanced Property Search provides two interfaces for searching property data:

1. **Property Search Bar** - A horizontal filter bar at the top of the mapping page for quick, inline searches
2. **Advanced Search Page** - A dedicated full-page search hub with complex filter groups (AND/OR logic)

Both interfaces support filtering properties by various fields, viewing results in table or map format, and saving searches for reuse.

## Access

### Property Search Bar (Mapping Page)
- **Location**: Mapping page > Click "Search" button in the top action bar
- **Description**: Horizontal filter bar that appears at the top of the map, allowing quick property searches without leaving the map view

### Advanced Search Page
- **Location**: Properties dropdown menu > "Advanced Search"
- **Route**: `/advanced-property-search`
- **Description**: Full-page search interface with complex filter group logic

---

## Property Search Bar (Mapping Page)

The Property Search Bar is a streamlined horizontal filter interface designed for quick property searches directly on the mapping page.

### Features

- **Inline Filtering**: Add filters without leaving the map view
- **Quick Filter Types**:
  - Text fields (contains search)
  - Number range fields (min/max values)
  - Boolean toggles (Yes/No)
  - Select dropdowns (e.g., Property Record Type)
- **Active Filter Pills**: Visual display of applied filters with remove buttons
- **View Mode Toggle**: Switch between Map, Table, or Split view
- **Saved Searches**: Save and load search configurations

### Supported Fields

**Standard Fields:**
- Property Name, Address, City, State, Property Type
- Building Sqft, Available Sqft, Rent PSF, NNN PSF
- End Cap, Drive-Thru, Patio, Inline, 2nd Gen Restaurant

### View Modes

1. **Map View**: Full map with property pins for filtered results
2. **Table View**: Compact results table with pagination
3. **Split View**: Side-by-side table and map

### Technical Implementation

- Uses React Portal (`ReactDOM.createPortal`) for filter dropdowns to escape stacking contexts
- Dropdowns render directly to `document.body` with maximum z-index (2147483647)
- Dynamic width for number-range inputs (20rem) vs standard inputs (16rem)
- Sidebars receive `topOffset` prop to shift down when search bar is visible

### Bidirectional Selection

- Click a table row → Map pin highlights + Property sidebar opens
- Click a map pin → Table row highlights + Property sidebar opens
- Property sidebar appears with z-index 10001 (above search bar at z-index 10000)

---

## Advanced Search Page

The Advanced Search Page provides a full-featured query builder for complex property searches.

### Query Builder

The query builder uses a filter groups pattern:
- **Within a group**: Conditions are AND'd together
- **Between groups**: Groups are OR'd together

This allows for complex queries like: "Find properties where (city = Atlanta AND sqft > 5000) OR (city = Miami AND sqft > 3000)"

### Supported Field Types and Operators

**Text Fields** (property_name, address, city, etc.):
- Contains
- Equals
- Starts with
- Is empty
- Is not empty

**Numeric Fields** (building_sqft, rent_psf, asking_purchase_price, etc.):
- Equals
- Greater than
- Less than
- Between
- Is empty

**Boolean Fields** (patio, inline, end_cap, etc.):
- Is true
- Is false

**Date Fields** (lease_expiration_date):
- Equals
- Before
- After
- Between
- Is empty

### Searchable Fields

**Property Fields:**
- property_name, description, landlord
- address, city, state, zip, country, county
- latitude, longitude, verified_latitude, verified_longitude
- trade_area, parcel_id
- building_sqft, available_sqft, acres
- asking_purchase_price, asking_lease_price
- rent_psf, all_in_rent, nnn_psf
- lease_expiration_date
- costar_link, reonomy_link, map_link, marketing_materials, site_plan, tax_url
- property_notes, layer_notes

**Property Unit Fields:**
- property_unit_name, sqft
- patio, inline, end_cap, end_cap_drive_thru, second_gen_restaurant
- rent, nnn
- lease_expiration_date
- unit_notes

### Results Table

**Default Columns:**
- Property Name
- Address
- City
- State
- Record Type
- Building Sqft
- Available Sqft
- Acres
- Asking Purchase Price
- Rent PSF
- NNN PSF

**Features:**
- Click column headers to sort (ascending/descending toggle)
- Expandable rows to show matching units when unit filters are applied
- Column customization via the "Columns" dropdown
- Pagination at the bottom of the table
- Click any row to open the Property Sidebar with full details

### Unit-to-Property Relationship

When unit filters are applied:
- Results are property-centric (returns properties that have matching units)
- When a single unit matches, its sqft/rent/nnn values flow into the display columns
- When multiple units match, an expand button appears to show all matching units
- Expanded rows show: Unit Name, Sqft, Rent, NNN, Features, Lease Expiration

### View Modes

1. **Table View**: Full-width results table
2. **Split View**: Table on the left, map on the right (synchronized)
3. **Map View**: Full-screen map showing all filtered properties

### Map Integration

- Uses the existing Google Maps component
- Properties plot automatically based on coordinates (verified or unverified)
- Click a pin to highlight the row in the table and open the Property Sidebar
- Click a row in the table to highlight the pin on the map
- Map auto-centers and zooms to fit all results

### Saved Searches

**Save Options:**
- "Save As..." creates a new saved search
- "Save" updates the current saved search (owner only)

**Saved Data:**
- All filter groups and conditions
- Custom column selections
- Sort configuration

**Visibility:**
- Private: Only you can see and use the search
- Public: Everyone can see and use the search, but only you can edit/delete it
- Anyone can copy a public search to create their own private version

**Management:**
- Access saved searches from the dropdown in the header
- Edit name/description/visibility of your searches
- Delete your own searches
- Copy any search (yours or public) to create a new one

## Database Schema

### saved_search Table

```sql
CREATE TABLE saved_search (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by_id UUID REFERENCES "user"(id) NOT NULL,
  is_public BOOLEAN DEFAULT false,
  filter_groups JSONB NOT NULL,
  column_config JSONB,
  sort_config JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Run the migration to create this table:
```
supabase/migrations/20260326_create_saved_search_table.sql
```

## File Structure

```
src/
├── pages/
│   ├── AdvancedPropertySearchPage.tsx    # Standalone advanced search page
│   └── MappingPageNew.tsx                # Main mapping page (integrates PropertySearchBar)
├── components/
│   ├── mapping/
│   │   ├── PropertySearchBar.tsx         # Horizontal search bar for mapping page
│   │   ├── PropertySearchOverlay.tsx     # @deprecated - replaced by PropertySearchBar
│   │   └── slideouts/
│   │       ├── PinDetailsSlideout.tsx    # Property detail sidebar (supports topOffset)
│   │       └── RestaurantSlideout.tsx    # Restaurant detail sidebar (supports topOffset)
│   ├── shared/
│   │   └── SiteSubmitSidebar.tsx         # Site submit sidebar (supports topOffset)
│   └── advanced-search/
│       ├── QueryBuilder.tsx              # Filter groups container
│       ├── FilterGroup.tsx               # Single group (AND conditions)
│       ├── FilterCondition.tsx           # Field + Operator + Value row
│       ├── FieldSelector.tsx             # Field dropdown
│       ├── OperatorSelector.tsx          # Operator dropdown
│       ├── ValueInput.tsx                # Dynamic value input
│       ├── PropertySearchResultsTable.tsx # Results table with expandable units
│       ├── ColumnCustomizer.tsx          # Column selection popover
│       ├── SavedSearchSelector.tsx       # Saved search dropdown
│       ├── SaveSearchModal.tsx           # Save/edit modal
│       └── SearchMapView.tsx             # Map integration wrapper
├── hooks/
│   ├── useAdvancedPropertySearch.ts      # Search execution logic
│   └── useSavedSearches.ts               # Saved search CRUD
└── types/
    └── advanced-search.ts                # TypeScript types & constants
```

## Usage Examples

### Find all properties in Georgia with available sqft over 5000
1. Select field: "State"
2. Select operator: "Equals"
3. Enter value: "GA"
4. Click "Add Condition"
5. Select field: "Available Sqft"
6. Select operator: "Greater than"
7. Enter value: "5000"
8. Click "Search"

### Find properties in Atlanta OR Miami with end cap units
1. Set up Group 1:
   - City = "Atlanta"
2. Click "Add Filter Group (OR)"
3. Set up Group 2:
   - City = "Miami"
4. Add condition to both groups (or create a third group):
   - End Cap = Is true
5. Click "Search"

### Find properties with rent between $20-$30 PSF
1. Select field: "Rent PSF"
2. Select operator: "Between"
3. Enter min: "20"
4. Enter max: "30"
5. Click "Search"

---

## Z-Index and Stacking Context Reference

The Property Search Bar uses specific z-index values to ensure proper layering:

| Element | Z-Index | Notes |
|---------|---------|-------|
| Search Bar | 10000 | Fixed at top of mapping page |
| Filter Dropdowns | 2147483647 | Maximum z-index, rendered via React Portal to document.body |
| Property Sidebars | 10001 | Above search bar to ensure visibility |
| Map Controls | Default | Below search bar dropdowns |

### Sidebar Offset System

When the Property Search Bar is visible, sidebars receive a `topOffset` prop:
- `topOffset={45}` when search bar is visible
- `topOffset={0}` when search bar is hidden

This shifts the sidebar down to prevent overlap with the search bar.

---

## Changelog

### 2026-03-30
- Added horizontal Property Search Bar to mapping page
- Implemented React Portal for filter dropdowns to escape stacking contexts
- Added topOffset prop to PinDetailsSlideout, SiteSubmitSidebar, RestaurantSlideout
- Fixed table row click to open property sidebar with full data
- Fixed number-range input field overflow in filter dropdown
- Marked PropertySearchOverlay.tsx as deprecated (replaced by PropertySearchBar.tsx)
