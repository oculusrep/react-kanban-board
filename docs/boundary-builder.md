# Boundary Builder Feature Documentation

## Overview

The Boundary Builder allows brokers to create custom territory layers by searching for and assembling administrative boundaries (counties) from the US Census TIGER/Line API. Boundaries can be saved as individual shapes (collections) or merged into a single unified polygon.

**Availability**: OVIS Map (`/mapping`) and Broker Portal View only (not visible to clients)

---

## Architecture

### Data Flow

```
User Search/Browse
       ↓
BoundarySearchBox / StateBrowsePanel
       ↓
boundaryService.ts (Census TIGER API)
       ↓
BoundaryBuilderPanel (collection state)
       ↓
Save as Collection OR Merge & Save
       ↓
mapLayerService.ts (Supabase)
       ↓
CustomLayerLayer.tsx (renders on map)
```

### Key Files

| File | Purpose |
|------|---------|
| `src/services/boundaryService.ts` | Census API integration, geometry conversion, merge logic |
| `src/services/mapLayerService.ts` | Layer/shape CRUD, merge/simplify operations |
| `src/components/mapping/BoundaryBuilderPanel.tsx` | Main UI panel for building territories |
| `src/components/mapping/BoundarySearchBox.tsx` | Type-ahead search component |
| `src/components/mapping/ShapeEditorPanel.tsx` | Edit shape properties (color, stroke, opacity) |
| `src/pages/MappingPageNew.tsx` | OVIS map integration |
| `src/pages/portal/PortalMapPage.tsx` | Portal map integration |

---

## US Census TIGER/Line API

### Endpoints

**Base URL**: `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb`

| Boundary Type | Endpoint |
|---------------|----------|
| Counties | `/State_County/MapServer/1/query` |
| ZIP Codes (Phase 2) | `/ZCTA5/MapServer/0/query` |

### Query Parameters

```typescript
// Search counties by name
?where=UPPER(NAME) LIKE '%FULTON%'
&outFields=GEOID,NAME,STATE
&returnGeometry=false
&f=json

// Get county geometry by GEOID
?where=GEOID='13121'
&outFields=*
&returnGeometry=true
&outSR=4326
&f=geojson
```

### Rate Limiting

- No API key required
- 100ms delay between requests (built into service)
- Results cached in memory to minimize API calls

### Coordinate System

Census API returns coordinates as `[longitude, latitude]` (GeoJSON standard).
Our map layer system uses `[latitude, longitude]` format.

The `convertToMapLayerGeometry()` method handles this conversion:

```typescript
// Census: [lng, lat] → App: [lat, lng]
convertToMapLayerGeometry(censusGeometry) {
  return coordinates.map(ring =>
    ring.map(([lng, lat]) => [lat, lng])
  );
}
```

---

## Boundary Service API

### Types

```typescript
type BoundaryType = 'county' | 'city' | 'zip' | 'msa';

interface BoundarySearchResult {
  type: BoundaryType;
  geoid: string;        // Census GEOID (e.g., "13121" for Fulton County, GA)
  name: string;         // Raw name from Census
  state: string;        // State abbreviation (e.g., "GA")
  stateFips: string;    // State FIPS code (e.g., "13")
  displayName: string;  // Formatted name (e.g., "Fulton County, GA")
}

interface FetchedBoundary extends BoundarySearchResult {
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][];
  };
}
```

### Methods

#### `searchCounties(query: string, stateFips?: string)`

Search counties by name with optional state filter.

```typescript
const results = await boundaryService.searchCounties('Fulton', '13');
// Returns: [{ geoid: '13121', name: 'Fulton County', state: 'GA', ... }]
```

#### `getCountiesForState(stateFips: string)`

Get all counties for a state (for browse mode).

```typescript
const counties = await boundaryService.getCountiesForState('13'); // Georgia
// Returns all 159 Georgia counties
```

#### `fetchCountyGeometry(geoid: string)`

Fetch full geometry for a county.

```typescript
const boundary = await boundaryService.fetchCountyGeometry('13121');
// Returns: { ...searchResult, geometry: { type: 'Polygon', coordinates: [...] } }
```

#### `mergePolygons(boundaries: FetchedBoundary[])`

Merge multiple boundaries into a single polygon using Turf.js union.

```typescript
const merged = boundaryService.mergePolygons(boundaries);
// Returns: [[[lat, lng], [lat, lng], ...]] (app coordinate format)
```

**Important**: Uses Turf.js v7+ API which requires `FeatureCollection`:

```typescript
const featureCollection = {
  type: 'FeatureCollection',
  features: features,
};
const merged = union(featureCollection);
```

---

## Map Layer Service Extensions

### `mergeLayerShapes(layerId: string, mergedName: string)`

Merges all shapes in a layer into a single polygon with auto-simplification.

```typescript
await mapLayerService.mergeLayerShapes(layerId, 'Metro Atlanta');
```

**Process**:
1. Fetch all shapes for the layer
2. Convert to Turf.js features
3. Union using FeatureCollection API
4. Simplify using Douglas-Peucker (tolerance: 0.0005)
5. Delete original shapes
6. Create single merged shape

### `simplifyShape(shapeId: string, tolerance?: number)`

Simplify a single shape to reduce vertex count.

```typescript
await mapLayerService.simplifyShape(shapeId, 0.0005);
```

**Default tolerance**: 0.0005 degrees (~50m at equator)

**Results**: Typical county merge reduces from 15,000+ points to ~250 points (98% reduction)

### `getShape(shapeId: string)`

Fetch a single shape by ID.

```typescript
const shape = await mapLayerService.getShape(shapeId);
```

---

## UI Components

### BoundaryBuilderPanel

Main panel for building territories.

**Props**:
```typescript
interface BoundaryBuilderPanelProps {
  isOpen: boolean;
  onClose: () => void;
  map: google.maps.Map | null;
  onSaveCollection: (boundaries: FetchedBoundary[], layerName: string) => Promise<void>;
  onSaveMerged: (boundaries: FetchedBoundary[], layerName: string) => Promise<void>;
}
```

**State**:
- `collection`: Array of `FetchedBoundary` objects
- `previewPolygons`: Google Maps polygons for visual preview
- `browseState` / `browseBoundaryType`: Browse mode filters

**Features**:
- Search box for finding counties by name
- Browse by state dropdown
- Collection list with remove buttons
- Preview rendering with dashed stroke
- Save as Collection or Merge & Save options

### BoundarySearchBox

Type-ahead search component.

**Props**:
```typescript
interface BoundarySearchBoxProps {
  onSelect: (boundary: BoundarySearchResult) => void;
  disabled?: boolean;
  placeholder?: string;
  stateFips?: string;  // Optional state filter
  existingBoundaryIds?: Set<string>;  // Show "Added" for duplicates
}
```

**Behavior**:
- 300ms debounce on search input
- Keyboard navigation (arrows, enter, escape)
- Shows loading spinner during search
- Displays "Added" badge for boundaries already in collection

### ShapeEditorPanel

Edit shape properties after saving.

**Features**:
- Fill color picker
- Stroke color picker
- Opacity slider (0-100%)
- Stroke width slider (1-10px)
- "Make Default" checkbox (applies to layer)
- Delete shape button

**Scrolling fix**: Uses flex layout with `overflow-y-auto` to prevent button cutoff:

```tsx
<div className="flex flex-col max-h-[calc(100vh-9rem)]">
  <div className="flex-shrink-0">Header</div>
  <div className="overflow-y-auto flex-1">Form fields</div>
  <div className="flex-shrink-0">Buttons</div>
</div>
```

---

## Integration Points

### OVIS Map (MappingPageNew.tsx)

```tsx
// State
const [showBoundaryBuilder, setShowBoundaryBuilder] = useState(false);

// Entry point in LayerPanel
<button onClick={() => setShowBoundaryBuilder(true)}>
  Build Territory from Boundaries
</button>

// Panel
<BoundaryBuilderPanel
  isOpen={showBoundaryBuilder}
  onClose={() => setShowBoundaryBuilder(false)}
  map={mapInstance}
  onSaveCollection={handleSaveBoundaryCollection}
  onSaveMerged={handleSaveBoundaryMerged}
/>

// Merge button in custom layers dropdown
<button onClick={() => handleMergeLayerShapes(layer.id, layer.name)}>
  Merge Shapes
</button>
```

### Portal Map (PortalMapPage.tsx)

Same integration pattern, but only visible when `showBrokerFeatures` is true:

```tsx
const showBrokerFeatures = isInternalUser && viewMode === 'broker';

{showBrokerFeatures && (
  <BoundaryBuilderPanel ... />
)}
```

---

## Known Issues & Solutions

### 1. Duplicate "County" in Names

**Problem**: Census API returns "Fulton County" and code appended "County" again.

**Solution**: Check if name already contains "county" before appending:

```typescript
const displayName = rawName.toLowerCase().includes('county')
  ? `${rawName}, ${stateAbbr}`
  : `${rawName} County, ${stateAbbr}`;
```

### 2. Turf.js v7+ Union API Change

**Problem**: `union(polygon1, polygon2)` throws "Must have at least 2 geometries".

**Solution**: Turf v7+ requires FeatureCollection:

```typescript
const featureCollection = {
  type: 'FeatureCollection' as const,
  features: features,
};
const merged = union(featureCollection);
```

### 3. UI Not Refreshing After Merge

**Problem**: Interior lines still visible after merge operation.

**Solution**: Add delay for DB propagation + refresh trigger:

```typescript
await mapLayerService.mergeLayerShapes(layerId, layerName);
await new Promise(resolve => setTimeout(resolve, 500));
await refreshCustomLayers();
setCustomLayerRefreshTrigger(prev => prev + 1);
```

### 4. Shape Editor Buttons Cut Off

**Problem**: Long forms push buttons below viewport.

**Solution**: Flex layout with constrained height and scrollable content area.

---

## Phase 2 Roadmap

### Cities (OSM Nominatim)

```typescript
const url = `https://nominatim.openstreetmap.org/search?` +
  `city=${cityName}&state=${state}&country=USA&format=json&polygon_geojson=1`;
```

**Note**: Nominatim has usage policy - needs User-Agent header and rate limiting.

### ZIP Codes (Census ZCTA)

```typescript
const ZIP_ENDPOINT = `${CENSUS_BASE}/ZCTA5/MapServer/0/query`;
// Query: where=ZCTA5CE20='30033'
```

### MSAs (Metropolitan Statistical Areas)

Census CBSA endpoint for metro area boundaries.

### UI Updates Needed

1. Type selector in StateBrowsePanel: Counties | Cities | Zips | MSAs
2. Update BoundarySearchBox to search across types
3. Support mixed-type collections
4. Add icons for each boundary type

### Advanced Editing

1. **Add Region**: Union with hand-drawn polygon
2. **Remove Region**: Difference with hand-drawn polygon
3. **Snap to Boundary**: Snap vertices to nearby boundary lines

---

## Testing Checklist

- [ ] Search "Fulton" → see "Fulton County, GA" (not "Fulton County County")
- [ ] Select Georgia → see all 159 counties listed
- [ ] Add county → see dashed preview on map
- [ ] Save Collection → layer with individual shapes
- [ ] Save Merged → layer with single unified polygon
- [ ] Merge existing collection → shapes combine, point count reduced
- [ ] Simplify individual shape → vertex count reduced
- [ ] Edit shape formatting → colors/opacity apply
- [ ] "Make Default" checkbox → layer defaults updated
- [ ] Share layer → client sees in portal (but not builder tools)
- [ ] Broker portal view → all tools available
- [ ] Client portal view → only sees shared layers, no editing

---

## Database Schema Reference

### map_layer

```sql
id              uuid PRIMARY KEY
name            text NOT NULL
description     text
layer_type      text DEFAULT 'custom'
default_color   text DEFAULT '#3b82f6'
default_stroke_color text DEFAULT '#1e40af'
default_opacity numeric DEFAULT 0.3
default_stroke_width integer DEFAULT 2
created_at      timestamptz
updated_at      timestamptz
```

### map_layer_shape

```sql
id          uuid PRIMARY KEY
layer_id    uuid REFERENCES map_layer(id)
name        text
description text
shape_type  text NOT NULL  -- 'polygon', 'circle', 'polyline', 'rectangle'
geometry    jsonb NOT NULL -- [[lat, lng], [lat, lng], ...]
color       text
stroke_color text
opacity     numeric
stroke_width integer
created_at  timestamptz
updated_at  timestamptz
```

### map_layer_client (for sharing)

```sql
layer_id    uuid REFERENCES map_layer(id)
client_id   uuid REFERENCES client(id)
created_at  timestamptz
PRIMARY KEY (layer_id, client_id)
```
