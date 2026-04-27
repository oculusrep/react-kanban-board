# Feature — Point Shape Support for Custom Map Layers

**Date:** 2026-04-27
**Commits:** [`4cbd219c`](https://github.com/oculusrep/react-kanban-board/commit/4cbd219c), [`50dae4bb`](https://github.com/oculusrep/react-kanban-board/commit/50dae4bb)

## Why

Need to onboard CSV-uploaded "Market Point" datasets that are scoped to a single client (or shared with several) and rendered with a distinct, per-layer icon. The first such dataset is BWW Market Points for client `BWW - Dhwanish + Shamil` (9 SC locations).

Two designs were considered:

1. **Dedicated tables** (`market_point_layer`, `market_point`, `market_point_layer_client`).
2. **Extend the existing custom-layer system** (`map_layer`, `map_layer_shape`, `map_layer_client_share`) to support points alongside polygons.

Picked option 2. The existing system already had layer metadata, per-shape geometry/style, client sharing with reference/copy semantics, RLS for portal users, and realtime subscriptions. Extending it gives the same machinery to every future CSV-imported point layer (competitor stores, distribution centers, etc.) without parallel infrastructure or new RLS work.

## Schema changes

[`supabase/migrations/20260427_point_layer_support.sql`](../supabase/migrations/20260427_point_layer_support.sql)

```sql
-- 1. Allow 'point' as a shape_type
ALTER TABLE map_layer_shape
  DROP CONSTRAINT IF EXISTS map_layer_shape_shape_type_check;
ALTER TABLE map_layer_shape
  ADD CONSTRAINT map_layer_shape_shape_type_check
    CHECK (shape_type IN ('polygon','circle','polyline','rectangle','point'));

-- 2. Per-shape attributes (CSV columns, etc.)
ALTER TABLE map_layer_shape ADD COLUMN IF NOT EXISTS attributes JSONB;
CREATE INDEX IF NOT EXISTS idx_map_layer_shape_attributes_gin
  ON map_layer_shape USING GIN (attributes);

-- 3. Per-layer icon config (drives rendering of point markers)
ALTER TABLE map_layer ADD COLUMN IF NOT EXISTS icon_config JSONB;
```

### `map_layer.icon_config` shape

Used only by point layers; ignored for polygon shapes.

```jsonc
{
  "shape": "circle",            // 'circle' | 'square' | 'diamond'
  "fill": "#FACC15",            // outer hex
  "stroke": "#1F2937",          // outer hex
  "iconColor": "#000000",       // inner icon hex
  "icon": "bullseye",           // 'bullseye' | 'storefront' | 'pin' | 'flag' | 'dot'
  "size": 28,                   // px
  "labelField": "market_point_number",  // attributes key shown on hover
  "labelOnHover": true
}
```

### `map_layer_shape.attributes` shape

Free-form JSONB. For point layers from CSV uploads, holds the source row's columns. Different layers can use different keys with no schema change.

```jsonc
{
  "market_point_number": "197194",
  "address": "7491 Augusta Road",
  "city": "Piedmont",
  "state": "SC",
  "zip": "29673"
}
```

### Geometry for `shape_type = 'point'`

```jsonc
{ "type": "point", "coordinates": [lat, lng] }
```

## Code changes

### [`src/services/mapLayerService.ts`](../src/services/mapLayerService.ts)

- `MapLayer.icon_config` typed as `PointIconConfig | null`.
- `MapLayerShape.shape_type` widened to include `'point'`; `attributes: Record<string, any> | null` added.
- `GeoJSONGeometry` gained `{ type: 'point'; coordinates: [number, number] }`.
- `createLayer` / `createShape` persist `icon_config` and `attributes` respectively.
- `importGeoJSON` and `importKML` no longer coerce points into 100m circles — they now create true point shapes and (for GeoJSON) carry feature `properties` into `attributes`.
- **New:** `importCSV(layerId, csvText, columnMap)` — parses CSV, creates one point per row, stores all non-lat/lng columns in `attributes`. Module-scoped `parseCSV` handles quoted fields, embedded commas, embedded newlines, and `""` escapes (no external dependency).

### [`src/components/mapping/layers/CustomLayerLayer.tsx`](../src/components/mapping/layers/CustomLayerLayer.tsx)

- `GoogleShape` union now includes `google.maps.Marker`.
- `ShapeRef` carries an optional `cleanup` closure (used for point shapes' hover listeners and InfoWindow).
- Pulls the layer's `icon_config` from `useLayerManager()` so we don't re-fetch the layer.
- New `case 'point'` in `createGoogleShape` builds a Marker with `buildPointIcon(iconConfig)`, adds mouseover/mouseout listeners that open/close a small InfoWindow rendered by `buildPointTooltip`, and registers a click listener if `onClick` is supplied.
- `buildPointTooltip` outputs a single-line HTML string (no leading whitespace — InfoWindow renders it as visible blank) with `Market Point: <value>` on top and a muted `address • city, state • zip` line below.

### [`src/components/mapping/utils/pointLayerIcons.ts`](../src/components/mapping/utils/pointLayerIcons.ts) — new

- `PointIconConfig` type and `DEFAULTS`.
- `buildPointIcon(config) → google.maps.Icon` returns a data-URI SVG.
- Built-in icon set: `bullseye`, `storefront`, `pin`, `flag`, `dot`. Outer shape options: `circle`, `square`, `diamond`.
- Adding a new icon: extend `renderInnerIcon()` and add the name to `POINT_ICON_NAMES` so a future picker UI can list it.

## How to add a new point layer (until the upload UI ships)

For now this is a SQL workflow via the Supabase MCP. Pattern:

```sql
WITH new_layer AS (
  INSERT INTO map_layer (
    name, description, layer_type,
    default_color, default_stroke_color, default_opacity, default_stroke_width,
    icon_config
  ) VALUES (
    '<Layer Name>',
    '<Optional description>',
    'custom',
    '#FACC15', '#1F2937', 0.35, 2,
    '{"shape":"circle","fill":"#FACC15","stroke":"#1F2937",
      "iconColor":"#000000","icon":"bullseye","size":28,
      "labelField":"<attributes_key>","labelOnHover":true}'::jsonb
  ) RETURNING id
),
new_share AS (
  INSERT INTO map_layer_client_share (
    layer_id, client_id, share_type, is_visible_by_default
  )
  SELECT id, '<client_uuid>'::uuid, 'reference', true
  FROM new_layer
  RETURNING layer_id
)
INSERT INTO map_layer_shape (layer_id, shape_type, geometry, attributes, name)
SELECT
  (SELECT layer_id FROM new_share),
  'point',
  jsonb_build_object('type','point','coordinates',jsonb_build_array(lat, lng)),
  jsonb_build_object('<key1>', val1, '<key2>', val2, ...),
  '<optional shape name>'
FROM (VALUES
  (..., lat_value, lng_value),
  ...
) AS rows(...);
```

Sharing the same layer to additional clients later is a single insert into `map_layer_client_share`.

## BWW Market Points seed (2026-04-27)

- Layer id: `083d83bb-6645-4791-89b7-e0fc40650c23`
- Name: `BWW Market Points`
- icon_config: yellow circle, black bullseye, label = `market_point_number`
- Shared to: `BWW - Dhwanish + Shamil` (`ce3a0e65-4145-4ee3-ac4e-0c206b274417`), `share_type='reference'`, default visible
- 9 points across upstate SC (Duncan, Greer, Woodruff, Fountain Inn, Piedmont, Spartanburg, Williamston, Chesnee, Gaffney)

## Drive-by fix in commit `4cbd219c`

[`SiteSubmitSidebar.tsx`](../src/components/shared/SiteSubmitSidebar.tsx) had a duplicate `CLIENT_VISIBLE_STAGES` — imported on line 25, redeclared locally on line 175 with a slightly different value (`'Under Contract/Contingent'` vs the DB-correct `'Under Contract / Contingent'`). The local copy was removed; the import wins. This was blocking Vite's dev server.

### Pre-existing bug noted but not fixed

[`pipelineConfig.ts`](../src/components/client-pipeline/pipelineConfig.ts) lists `'Store Opened'`, but the `submit_stage` table has `'Store Open'` (no trailing 'd'). Portal client filtering currently misses any site submits in the Store Open stage. Worth a follow-up fix.

## Deferred

- **Right-click radius / drive-time rings** on point markers (separate phase).
- **Existing-store pin drops** with custom brand logo (separate concept from Market Points).
- **CSV upload UI** — drag/drop into the map, optionally chat with an agent to map columns and pick an icon. Backend (`mapLayerService.importCSV`) is ready; frontend is not.
- **Admin UI to assign existing layers to additional clients.** Today this is a single SQL insert into `map_layer_client_share`.
- **`Store Opened` → `Store Open` fix** in `pipelineConfig.ts`.
