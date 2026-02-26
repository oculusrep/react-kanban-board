# Google Places Closed Business Search - Implementation Plan

## Overview

Feature to search for closed businesses using Google Places API, display them on the map, save results as shareable layers, and add them to the properties table.

**Test Case:** All Del Taco locations listed as permanently closed in Georgia.

---

## Implementation Status

| Phase | Status | Date Completed |
|-------|--------|----------------|
| Phase 1: Database & Core Services | ✅ Complete | 2026-02-26 |
| Phase 2: Search UI & Map Display | ✅ Complete | 2026-02-26 |
| Phase 3: Layer Persistence | 🔲 Not Started | - |
| Phase 4: Property Integration | 🔲 Not Started | - |
| Phase 5: Admin & Budget Controls | 🔲 Not Started | - |
| Phase 6: Portal Integration | 🔲 Not Started | - |
| Phase 7: Permissions & Layer Visibility | 🔲 Not Started | - |

### Completed Work (Phases 1 & 2)

**Database Migration** (`supabase/migrations/20260226_google_places_search.sql`):
- ✅ `google_places_saved_query` table with RLS policies
- ✅ `google_places_result` table with RLS policies
- ✅ `google_places_api_log` table with RLS policies
- ✅ `google_place_id` column added to property table
- ✅ `google_places_api_budget` added to app_settings

**Services**:
- ✅ `src/services/googlePlacesSearchService.ts` - Places API search, state bounds, rate limiting
- ✅ `src/services/closedPlacesLayerService.ts` - Layer management, saved queries

**Components**:
- ✅ `src/components/mapping/ClosedBusinessSearchPanel.tsx` - Search panel UI
- ✅ `src/components/mapping/layers/ClosedPlacesLayer.tsx` - Map markers with clustering
- ✅ `src/components/mapping/popups/ClosedPlacePopup.tsx` - Place info popup

**Markers** (`src/components/mapping/utils/modernMarkers.ts`):
- ✅ `createClosedBusinessPermanentIcon` - Red pin with X
- ✅ `createClosedBusinessTemporaryIcon` - Yellow pin with pause
- ✅ `createClosedBusinessSelectedIcon` - Larger selected variants

**Integration**:
- ✅ `src/pages/MappingPageNew.tsx` - Panel and layer integrated

### Remaining Work

**Phase 3: Layer Persistence**
- Create `SavedQueriesPanel.tsx` component
- Implement "Update existing or create new" prompt on query re-run
- Update `LayerManagementPage.tsx` to display closed business layers with indicator

**Phase 4: Property Integration**
- Create `duplicateDetectionService.ts` (3-tier: place_id, proximity, fuzzy address)
- Create `AddClosedPlacePropertyModal.tsx` (single place → property)
- Create `BulkAddPropertiesModal.tsx` (batch add with duplicate handling)

**Phase 5: Admin & Budget Controls**
- Create `PlacesApiBudgetPage.tsx` admin page
- Add route `/admin/places-api` to App.tsx
- Implement budget enforcement (block searches when exceeded)

**Phase 6: Portal Integration**
- Verify layer sharing works for closed business layers
- Confirm "Add to Properties" button hidden in portal view
- Test full client portal map display

**Phase 7: Permissions & Layer Visibility**
- Add `can_access_closed_business_search` permission to user permissions matrix
- Add feature toggle per role in User Management page
- Implement layer visibility options:
  - **Private** - Only visible to the user who created it
  - **Company** - Visible to all internal users (admin, broker_full, broker_limited)
  - **Client Portal** - Shareable to specific clients via existing sharing mechanism
- Add `visibility` column to `map_layer` table (`private`, `company`, `portal`)
- Add `owner_id` column to `map_layer` table for private layer ownership
- Update RLS policies on `map_layer` to enforce visibility rules
- Update LayerManagementPage to show visibility badges and allow changing visibility
- Update LayerPanel to filter layers based on user permissions and visibility

---

## Database Schema

### Migration: `supabase/migrations/20260226_google_places_search.sql`

**Tables to create:**

1. **google_places_saved_query** - Stores reusable search configurations
   - `id`, `name`, `query_type` (text/nearby)
   - `search_term`, `status_filter` (permanently_closed/temporarily_closed/both)
   - `geography_type` (state/county/city/zip/radius/polygon)
   - `geography_data` (JSONB - state code, bounds, polygon coords, etc.)
   - `last_run_at`, `result_count`, `created_at`, `created_by_id`

2. **google_places_result** - Stores fetched place data
   - `id`, `place_id` (unique), `query_id`, `layer_id`
   - `name`, `formatted_address`, `latitude`, `longitude`
   - `business_status`, `types[]`, `rating`, `phone_number`, `website`
   - `raw_data` (JSONB), `property_id` (if added to properties)
   - `first_seen_at`, `last_seen_at`

3. **google_places_api_log** - Tracks API usage for budget
   - `id`, `request_type`, `query_id`, `api_endpoint`
   - `request_count`, `estimated_cost_cents`, `response_status`
   - `created_at`, `created_by_id`

4. **Add to app_settings:**
   - Key: `google_places_api_budget`
   - Value: `{"monthly_budget_cents": 20000, "warn_at_percent": 80}`

5. **Add to property table:**
   - `google_place_id` (VARCHAR, nullable) - for duplicate detection

---

## Services

### 1. `src/services/googlePlacesSearchService.ts`

Core API interaction service:

```typescript
// Key methods:
- textSearch(query, bounds) → PlacesSearchResult[]
- nearbySearchWithGrid(keyword, bounds, gridSize) → PlacesSearchResult[]
- filterByStatus(results, filter) → PlacesSearchResult[]
- calculateGridCells(bounds, cellSize) → LatLng[]
- logApiUsage(type, queryId, count) → void
- getRemainingBudget() → { used, limit, remaining }
- checkBudgetAvailable(estimatedCalls) → boolean
```

**Implementation notes:**
- Use `google.maps.places.PlacesService` (already loaded in app)
- Text Search for chain names (1-2 API calls typically)
- Grid-based Nearby Search for categories (covers large areas)
- Rate limit: 100ms between requests (matches boundaryService pattern)
- Deduplicate by `place_id` before returning

### 2. `src/services/closedPlacesLayerService.ts`

Manages saved queries and layer integration:

```typescript
// Key methods:
- createSavedQuery(config) → SavedQuery
- getSavedQueries() → SavedQuery[]
- runSavedQuery(id) → PlacesSearchResult[]
- deleteSavedQuery(id) → void
- saveResultsToLayer(results, layerName, queryId?) → MapLayer
- updateExistingLayer(layerId, results) → MapLayer
- linkResultToProperty(resultId, propertyId) → void
```

### 3. `src/services/duplicateDetectionService.ts`

Three-tier duplicate detection:

```typescript
// Detection order:
1. findByPlaceId(placeId) → exact match on google_place_id
2. findByProximity(lat, lng, 50) → within 50 meters
3. findByFuzzyAddress(address) → normalized address comparison

// Returns:
{ matchType, property, confidence }
```

---

## Components

### Panel & Search UI

| Component | Location | Purpose |
|-----------|----------|---------|
| `ClosedBusinessSearchPanel` | `src/components/mapping/ClosedBusinessSearchPanel.tsx` | Main slide-out search panel |
| `SavedQueriesPanel` | `src/components/mapping/SavedQueriesPanel.tsx` | List/run/delete saved queries |
| `GeographySelector` | `src/components/mapping/GeographySelector.tsx` | Reusable state/county/city/zip/radius/polygon picker |

**ClosedBusinessSearchPanel features:**
- Search type toggle: Chain Name vs Business Category
- Search term input
- Status filter: Permanently Closed / Temporarily Closed / Both
- Geography selector (state dropdown, county picker, radius input, etc.)
- Budget display: "~40 API calls | 8,234 remaining this month"
- Search button with progress indicator
- Results preview with count
- "Save as Layer" button
- "Save Query" button

### Map Layers

| Component | Location | Purpose |
|-----------|----------|---------|
| `ClosedPlacesLayer` | `src/components/mapping/layers/ClosedPlacesLayer.tsx` | Renders result markers with clustering |
| `ClosedPlacePopup` | `src/components/mapping/popups/ClosedPlacePopup.tsx` | Info popup on marker click |

**Marker styles (add to modernMarkers.ts):**
- Permanently closed: Red pin with X icon
- Temporarily closed: Yellow/amber pin with pause icon
- Selected state: Larger size, darker stroke

**Popup content:**
- Business name, address
- Status badge (red/yellow)
- Rating (if available)
- "Add to Properties" button (hidden in portal)
- "View on Google Maps" link

### Property Integration Modals

| Component | Location | Purpose |
|-----------|----------|---------|
| `AddClosedPlacePropertyModal` | `src/components/modals/AddClosedPlacePropertyModal.tsx` | Single place → property |
| `BulkAddPropertiesModal` | `src/components/modals/BulkAddPropertiesModal.tsx` | Multiple places → properties |

**AddClosedPlacePropertyModal:**
- Pre-filled: name, address, city, state, zip, lat/lng
- Required: property_type_id selector
- Duplicate warning with options: Skip / Add Anyway / Merge
- Quick Add button (minimal fields) + Save with Details button

**BulkAddPropertiesModal:**
- List of places with checkboxes
- Duplicate indicator per row (⚠️ icon)
- Single property type selector for all
- Per-item action dropdown for duplicates
- Progress bar during bulk add
- Summary: "Added 12, Skipped 3 duplicates"

### Admin Page

| Component | Location | Purpose |
|-----------|----------|---------|
| `PlacesApiBudgetPage` | `src/pages/admin/PlacesApiBudgetPage.tsx` | Budget settings & usage dashboard |

**Features:**
- Monthly budget input ($)
- Warning threshold (%)
- Current month usage chart
- Request log table (recent API calls)
- Reset usage button (admin only)

---

## Integration Points

### MappingPageNew.tsx modifications:
- Add "Search Closed Businesses" button to toolbar
- Add `ClosedBusinessSearchPanel` with open/close state
- Add `ClosedPlacesLayer` to layer stack
- Wire up `onSaveAsLayer` callback

### LayerPanel.tsx modifications:
- Add closed places layer toggle in custom layers section
- Show special icon for closed business layers

### LayerManagementPage.tsx modifications:
- Display closed business layers with indicator
- Link to source saved query (if applicable)
- Sharing works via existing ShareLayerModal

### App.tsx modifications:
- Add route: `/admin/places-api` → `PlacesApiBudgetPage`

---

## Implementation Order

### Phase 1: Database & Core Services
1. Create migration `20260226_google_places_search.sql`
2. Add `google_place_id` column to property table
3. Implement `googlePlacesSearchService.ts`
4. Implement `closedPlacesLayerService.ts`
5. Add closed business markers to `modernMarkers.ts`

### Phase 2: Search UI & Map Display
1. Create `ClosedBusinessSearchPanel.tsx`
2. Create `GeographySelector.tsx` (reuse BoundaryBuilderPanel patterns)
3. Create `ClosedPlacesLayer.tsx` with clustering
4. Create `ClosedPlacePopup.tsx`
5. Integrate into `MappingPageNew.tsx`

### Phase 3: Layer Persistence
1. Implement save results as layer functionality
2. Create `SavedQueriesPanel.tsx`
3. Add "Update existing or create new" prompt on re-run
4. Update `LayerManagementPage.tsx` for closed business layers

### Phase 4: Property Integration
1. Implement `duplicateDetectionService.ts`
2. Create `AddClosedPlacePropertyModal.tsx`
3. Create `BulkAddPropertiesModal.tsx`
4. Wire up Add to Properties flow

### Phase 5: Admin & Budget Controls
1. Create `PlacesApiBudgetPage.tsx`
2. Add budget checking to search service
3. Display remaining budget in search panel
4. Block searches when budget exceeded

### Phase 6: Portal Integration
1. Verify layer sharing works for closed business layers
2. Hide "Add to Properties" button in portal view
3. Test client portal map display

### Phase 7: Permissions & Layer Visibility
1. **User Permission Control**
   - Add `can_access_closed_business_search` to `user.permissions` JSONB
   - Add to User Management page permissions matrix
   - Default: enabled for `admin` and `broker_full`, disabled for others
   - Hide "Search Closed Businesses" button when user lacks permission

2. **Layer Visibility System**
   - Migration to add `visibility` and `owner_id` columns to `map_layer` table:
     ```sql
     ALTER TABLE map_layer ADD COLUMN visibility VARCHAR(20) DEFAULT 'company'
       CHECK (visibility IN ('private', 'company', 'portal'));
     ALTER TABLE map_layer ADD COLUMN owner_id UUID REFERENCES auth.users(id);
     ```
   - Update RLS policies:
     - `private`: Only `owner_id = auth.uid()` can view
     - `company`: All internal users can view
     - `portal`: Visible to internal users + shared clients

3. **UI Updates**
   - LayerManagementPage: Add visibility dropdown (Private/Company/Portal-Ready)
   - LayerPanel: Filter layers by visibility + user permissions
   - SaveLayerModal: Add visibility selector when saving new layer
   - Show visibility badge on layer cards (🔒 Private, 🏢 Company, 🌐 Portal)

4. **Saved Query Visibility**
   - Add same visibility system to `google_places_saved_query` table
   - Allow users to share saved queries company-wide or keep private

---

## Test Plan: Del Taco Georgia

### Setup
- Search: "Del Taco" (chain name)
- Geography: Georgia (state)
- Status: Both
- Expected: 5-15 closed locations

### Test Cases

1. **Search Execution**
   - [ ] Panel opens from toolbar button
   - [ ] Budget display shows remaining calls
   - [ ] Search runs, progress indicator shows
   - [ ] API calls logged to database
   - [ ] Results appear on map

2. **Map Display**
   - [ ] Red markers for permanently closed
   - [ ] Yellow markers for temporarily closed
   - [ ] Clustering works when zoomed out
   - [ ] Markers expand when zooming in

3. **Popup Interaction**
   - [ ] Click marker opens popup
   - [ ] Shows name, address, status
   - [ ] "Add to Properties" button works
   - [ ] "View on Google Maps" opens new tab

4. **Save as Layer**
   - [ ] "Save as Layer" prompts for name
   - [ ] Layer appears in layer panel
   - [ ] Layer toggles on/off
   - [ ] Layer appears in Layer Management page

5. **Saved Query**
   - [ ] Save query with name
   - [ ] Query appears in Saved Queries panel
   - [ ] Run saved query works
   - [ ] Prompts: Update existing layer or create new

6. **Add to Properties**
   - [ ] Quick Add creates property immediately
   - [ ] Add with Details opens form
   - [ ] Duplicate detection finds existing properties
   - [ ] Merge option updates existing property
   - [ ] google_place_id stored on property

7. **Bulk Add**
   - [ ] Select multiple results
   - [ ] Bulk Add modal shows all with duplicate status
   - [ ] Single property type applies to all
   - [ ] Per-item duplicate handling works
   - [ ] Progress indicator during add
   - [ ] Summary shows results

8. **Budget Controls**
   - [ ] Admin page shows current usage
   - [ ] Budget limit can be configured
   - [ ] Warning shows when approaching limit
   - [ ] Search blocked when over budget

9. **Portal Sharing**
   - [ ] Share layer to client
   - [ ] Client sees layer on portal map
   - [ ] Client sees markers and popups
   - [ ] Client does NOT see "Add to Properties"

10. **Permissions & Visibility**
    - [ ] User without `can_access_closed_business_search` cannot see search button
    - [ ] User with permission can see and use search feature
    - [ ] Private layer only visible to creator
    - [ ] Company layer visible to all internal users
    - [ ] Portal-ready layer can be shared to clients
    - [ ] Visibility can be changed from LayerManagementPage
    - [ ] Saved queries respect visibility settings

---

## Key Files Reference

**Patterns to follow:**
- `src/services/mapLayerService.ts` - Layer CRUD, Supabase patterns
- `src/components/mapping/BoundaryBuilderPanel.tsx` - Panel structure, geography selection
- `src/components/mapping/layers/RestaurantLayer.tsx` - Marker clustering, viewport loading
- `src/components/mapping/utils/modernMarkers.ts` - SVG marker creation
- `src/pages/PortalEmailSettingsPage.tsx` - Admin settings page pattern
- `supabase/migrations/20260201_custom_map_layers.sql` - Migration with RLS

**Files to modify:**
- `src/pages/MappingPageNew.tsx` - Add panel and layer
- `src/components/mapping/LayerPanel.tsx` - Add layer toggle
- `src/pages/LayerManagementPage.tsx` - Show closed business layers
- `src/components/mapping/utils/modernMarkers.ts` - Add marker styles
- `src/App.tsx` - Add admin route
