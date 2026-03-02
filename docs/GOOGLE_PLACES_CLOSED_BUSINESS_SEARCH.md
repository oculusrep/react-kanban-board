# Google Places Closed Business Search

Feature to search for closed businesses using Google Places API, display them on the map, save results as shareable layers, and add them to the properties table.

**Implemented:** February 2026

---

## Overview

Search for permanently or temporarily closed businesses (e.g., "all closed Del Taco locations in Georgia"), display results on the map with custom markers, save as shareable layers, and bulk add to properties table.

---

## Database Schema

### Migration: `supabase/migrations/20260226_google_places_search.sql`

**Tables created:**

1. **google_places_saved_query** - Stores reusable search configurations
   - `id`, `name`, `query_type` (text/nearby)
   - `search_term`, `status_filter` (permanently_closed/temporarily_closed/both)
   - `geography_type` (state/county/city/zip/radius/polygon)
   - `geography_data` (JSONB)
   - `last_run_at`, `result_count`, `created_at`, `created_by_id`

2. **google_places_result** - Stores fetched place data
   - `id`, `place_id`, `query_id`, `layer_id`
   - `name`, `formatted_address`, `latitude`, `longitude`
   - `business_status`, `types[]`, `rating`, `phone_number`, `website`
   - `raw_data` (JSONB), `property_id` (if added to properties)

3. **google_places_api_log** - Tracks API usage for budget monitoring
   - `id`, `request_type`, `query_id`, `api_endpoint`
   - `request_count`, `estimated_cost_cents`, `response_status`

4. **app_settings entry:**
   - Key: `google_places_api_budget`
   - Value: `{"monthly_budget_cents": 20000, "warn_at_percent": 80}`

5. **property table addition:**
   - `google_place_id` (VARCHAR) - for duplicate detection

---

## Services

### `src/services/googlePlacesSearchService.ts`

Core API interaction:
- `textSearch(query, statusFilter)` - Text-based search
- `nearbySearchWithGrid(keyword, bounds, gridSize, statusFilter)` - Grid-based nearby search
- `searchClosedInState(searchTerm, stateAbbr, statusFilter)` - State-wide search
- `getApiUsageStats()` - Budget tracking
- `calculateDistanceKm()` - Haversine distance calculation

### `src/services/closedPlacesLayerService.ts`

Layer management:
- `createSavedQuery(config)` - Save search configuration
- `getSavedQueries()` - List saved queries
- `saveResultsToLayer(results, layerName)` - Create layer from results

### `src/services/duplicateDetectionService.ts`

Three-tier duplicate detection:
1. `findByPlaceId(placeId)` - Exact match on google_place_id
2. `findByProximity(lat, lng, 50)` - Within 50 meters
3. `findByFuzzyAddress(address)` - Normalized address comparison

---

## Components

### Search Panel
- **`ClosedBusinessSearchPanel.tsx`** - Main slide-out search panel

### Map Layers
- **`ClosedPlacesLayer.tsx`** - Renders result markers with clustering
- **`ClosedPlacePopup.tsx`** - Info popup on marker click

### Property Integration
- **`AddClosedPlacePropertyModal.tsx`** - Single place → property
- **`BulkAddPropertiesModal.tsx`** - Multiple places → properties

---

## Geography Options

Four search area types available:

| Type | Description |
|------|-------------|
| **State** | Select from dropdown, optional grid search |
| **City** | City name + state, uses text search |
| **Radius** | Click map to set center, slider for radius (5-100km) |
| **Area** | Select existing layer polygon OR draw custom area |

### Search Logic by Geography

| Type | Search Method | Filtering |
|------|---------------|-----------|
| State | `searchClosedInState()` | STATE_BOUNDS lookup |
| City | `textSearch(query + " in City, ST")` | Google geocodes internally |
| Radius | `nearbySearchWithGrid()` | Distance filter from center |
| Polygon | `nearbySearchWithGrid()` | `booleanPointInPolygon()` via Turf.js |

---

## Marker Styles

Added to `src/components/mapping/utils/modernMarkers.ts`:

- **Permanently closed:** Red pin with X icon
- **Temporarily closed:** Yellow/amber pin with pause icon
- **Selected state:** Larger size, darker stroke

---

## Budget Controls

- Monthly budget configurable in `app_settings` table
- Estimated API cost shown before search (~$0.02 per call)
- Search blocked when over budget
- Usage stats displayed in search panel

---

## Files Reference

```
src/services/googlePlacesSearchService.ts     # Core API service
src/services/closedPlacesLayerService.ts      # Layer management
src/services/duplicateDetectionService.ts     # Duplicate detection
src/components/mapping/ClosedBusinessSearchPanel.tsx  # Search UI
src/components/mapping/layers/ClosedPlacesLayer.tsx   # Map layer
src/components/mapping/popups/ClosedPlacePopup.tsx    # Marker popup
src/components/modals/AddClosedPlacePropertyModal.tsx # Single add
src/components/modals/BulkAddPropertiesModal.tsx      # Bulk add
supabase/migrations/20260226_google_places_search.sql # Database schema
```

---

## Integration Points

- **MappingPageNew.tsx** - "Search Closed Businesses" button in toolbar
- **LayerPanel.tsx** - "Bulk Add to Properties" button for closed business layers
- **Layer Management page** - Closed business layers appear with sharing support
