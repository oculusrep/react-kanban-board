# Demographic Ring / Drive-Time / Custom-Polygon Layers — Implementation Plan

## Goal & UX

Add three on-map demographic workflows so a user can stand anywhere on the map (a property pin, a clicked location, or an arbitrary area) and get ESRI-backed demographics for that area visualized as an overlay:

1. **Mileage rings.** Pick a point → toggle a "Demographics rings" layer → see 1/3/5-mi rings drawn around the point + a stats panel showing population, households, median income, etc. per ring.
2. **Drive-time polygons.** Same flow but with drive-time isochrones (5 / 10 / 15 min) instead of rings.
3. **Custom polygon.** Hit "Draw demographic polygon" in the map toolbar → sketch a polygon → click "Fetch demographics" → polygon stays on the map, stats panel populates.

All three render in a unified **Demographics Slideout** that opens from the map (overlay-first per [OVIS_OVERLAY_UX.md](OVIS_OVERLAY_UX.md)) — same UI, three input modes. Closing the slideout removes the overlay shapes; pinning a shape persists it as a saved map layer.

## Reusing existing infrastructure

This is mostly an integration job. The pieces that already exist:

- **ESRI edge function** — [supabase/functions/esri-geoenrich/index.ts](../supabase/functions/esri-geoenrich/index.ts) already supports configurable `custom_radii` + `custom_drive_times`, and **already returns drive-time isochrone polygons** as GeoJSON in `result.isochrones` ([line ~138-140](../supabase/functions/esri-geoenrich/index.ts#L138)). The drive-time `studyAreas` block at [line ~340](../supabase/functions/esri-geoenrich/index.ts#L340) shows the `NetworkServiceArea` request shape we need.
- **Client hook** — [src/hooks/usePropertyGeoenrichment.ts](../src/hooks/usePropertyGeoenrichment.ts) — `enrichForClient(propertyId, lat, lng, radii, driveTimes)` already wraps the edge function with configurable radii.
- **DrawingManager** — already wired up in [src/components/mapping/DrawingToolbarLegacy.tsx:46](../src/components/mapping/DrawingToolbarLegacy.tsx#L46) with polygon / circle / polyline / rectangle modes. We add a "demographic polygon" mode that pipes the drawn shape into our fetch flow instead of saving as a custom-layer shape.
- **Shape rendering** — [src/components/mapping/layers/CustomLayerLayer.tsx:257-275](../src/components/mapping/layers/CustomLayerLayer.tsx#L257-L275) shows how `google.maps.Polygon` and `google.maps.Circle` are instantiated from stored GeoJSON. Same pattern for our overlay shapes.
- **Demographics display** — [src/components/shared/DemographicsSection.tsx](../src/components/shared/DemographicsSection.tsx) + [DemographicsModal.tsx](../src/components/shared/DemographicsModal.tsx) already render ring-buffer + drive-time stats. We pass them a shape-scoped `DemographicData` object instead of a property record.
- **Map-layer DB schema** — [src/services/mapLayerService.ts:71-77](../src/services/mapLayerService.ts#L71-L77) already has GeoJSON-compatible `polygon` / `circle` shape types. Persisted "saved demographic areas" piggyback on this table, with metadata in `attributes`.

## What needs to be built

### Feature 1: Mileage rings (easiest — ~4-6 hours)

Files to create:
- `src/components/mapping/layers/DemographicRingsOverlay.tsx` — renders 1..N `google.maps.Circle` instances around a lat/lng. Colors follow the OVIS palette (Light Slate Blue stroke #8FA9C8, no fill or 5% Steel Blue fill).
- `src/components/mapping/slideouts/DemographicsAnalysisSlideout.tsx` — slideout shell with three input modes (point, drive-time, polygon) and a results panel. Reuses `DemographicsSection`.

Files to modify:
- `src/components/mapping/MapContextMenu.tsx` — add "Demographics here" action that drops a marker and opens the slideout in "rings" mode.
- `src/pages/MappingPageNew.tsx` — mount the slideout + overlay.

API: Existing `enrichForClient(syntheticPropertyId, lat, lng, [1,3,5], [])` call. The first call writes to `property` table — for ad-hoc points we **must not** require a real property row, so add a parallel `enrichLocation(lat, lng, radii, driveTimes)` to the hook that calls a new edge-function path which skips the property save and returns demographics + isochrones directly. Roughly:

```ts
// new method on usePropertyGeoenrichment
enrichLocation: (lat, lng, radii, driveTimes) => Promise<GeoenrichmentResult>
```

The edge function already does the work — wrap the existing `enrichRingBuffersDemographics()` call in a path that doesn't require `property_id`.

### Feature 2: Drive-time polygons (~6-8 hours)

Files to create:
- `src/components/mapping/layers/DemographicIsochronesOverlay.tsx` — render `result.isochrones["5min_drive"]` etc. as `google.maps.Polygon` instances from the GeoJSON the edge function already returns. Each drive-time gets a different stroke color (Deep Midnight Blue → Steel Blue → Light Slate Blue gradient).

Files to modify:
- `supabase/functions/esri-geoenrich/index.ts` — already returns isochrones; verify `returnGeometry: 'true'` is set for all custom drive-time requests (it is, [line 358](../supabase/functions/esri-geoenrich/index.ts#L358)) and that the GeoJSON survives `enrichLocation` mode (ad-hoc point flow added in Feature 1).
- The slideout from Feature 1 gets a "Drive time" tab with checkboxes for 5/10/15 min.

No new ESRI services needed — `NetworkServiceArea` with `returnGeometry=true` already returns the polygons. Cost note: ~10× the credits of a ring buffer per the ESRI pricing table, so this stays behind a button.

### Feature 3: Custom polygon demographics (~8-12 hours)

Files to create:
- `src/components/mapping/DemographicPolygonDrawingMode.tsx` — a thin wrapper that puts the existing `DrawingManager` into `OverlayType.POLYGON` mode but with our completion handler. On `polygoncomplete`, capture the path, kill the drawing mode, hold the polygon in slideout state (not saved yet).

Files to modify:
- `src/hooks/usePropertyGeoenrichment.ts` — add `enrichPolygon(geometry: GeoJSONPolygon, options) => Promise<GeoenrichmentResult>`.
- `supabase/functions/esri-geoenrich/index.ts` — add a `studyAreas` branch for polygon geometry. ESRI's GeoEnrichment accepts an `esriGeometryPolygon` directly:

```jsonc
{
  "geometry": {
    "rings": [[[lng1,lat1], [lng2,lat2], ..., [lng1,lat1]]],
    "spatialReference": {"wkid": 4326}
  }
}
```

…and `areaType` is omitted (no buffer needed — the polygon IS the study area). New request body field: `custom_polygon: { coordinates: number[][][] }`. Server-side validation: reject polygons larger than ~25 sq mi (ESRI quota guardrail, configurable) and polygons with > 200 vertices.

No DB schema change needed for the live workflow. **If we want "save this analysis area"**, persist via the existing `map_layer_shape` table with `shape_type='polygon'` and `attributes: { kind: 'demographic_analysis', enriched_at, demographics: {...} }`.

### Audit logging (shared across all three features)

ESRI calls cost credits. Add a new lightweight table to track every enrichment call:

```sql
CREATE TABLE esri_enrichment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  called_at timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL,  -- 'rings' | 'drive_time' | 'polygon' | 'property'
  radii numeric[],
  drive_times numeric[],
  polygon_area_sq_mi numeric,
  property_id uuid REFERENCES property(id),  -- nullable for ad-hoc
  cost_estimate_credits numeric,
  success boolean NOT NULL,
  error text
);
```

Edge function writes one row per call regardless of cache hit/miss. Bill-aware dashboard later. Apply via psql + manual `schema_migrations` INSERT per [reference_supabase_migration_workflow](../../.claude/projects/-Users-mike-Documents-GitHub-react-kanban-board/memory/reference_supabase_migration_workflow.md).

> **Update 2026-06-03:** Phases 1–3 shipped. The audit-log / cache / "Cached demographics" map layer follow-on is spec'd separately in [DEMOGRAPHIC_CACHE_AND_LAYER_PLAN.md](DEMOGRAPHIC_CACHE_AND_LAYER_PLAN.md).

## Cost & rate-limiting strategy

- **No auto-fetch.** Slideout opens with controls disabled until user clicks "Fetch demographics". Same for polygon mode — drawing the shape does not call ESRI.
- **Cache by geometry + radii.** Hash `(lat, lng, radii, driveTimes)` (or polygon WKB) → check the audit log for a successful call within the last 30 days → reuse instead of re-fetching. Massive cost-saver for property pins that get repeated demographic looks.
- **Per-user soft cap.** Configurable monthly budget (e.g. 200 polygon-enrichments / user / month) enforced server-side in the edge function. Returns 429 with the cap displayed in the UI; admins can override.
- **Polygon size cap.** Polygons over 25 sq mi rejected with a friendly error ("split into smaller areas — ESRI rejects large enrichment polygons"). ESRI itself caps at ~50 sq mi for some plans.

## Phased delivery

1. **Phase 1 — Rings (the cheap one).** Refactor `enrichForClient` to support ad-hoc locations (no `property_id`), build the slideout shell + rings overlay, wire "Demographics here" context menu. Validates the slideout pattern and unblocks the next two.
2. **Phase 2 — Drive-time polygons.** Add the isochrones overlay; flip on the drive-time tab in the slideout. Almost zero new server code — the edge function already returns the geometry.
3. **Phase 3 — Custom polygon.** Edge function `custom_polygon` path, drawing-mode integration, save-as-layer affordance. Highest credit cost, ships last so we already have audit logging in place.

Total: ~3-4 days of focused work for all three, assuming the existing ESRI pipeline is in good shape (it is).

## Open questions

- **Storage of ad-hoc results.** Do users want to save a "this area on this date" snapshot, or is the ephemeral slideout enough? Recommend ephemeral for v1 + a "Save as map layer" button that uses the existing `map_layer_shape` table.
- **Who gets access?** Polygon enrichments are pricier than property-pin enrichments. Limit to admins / specific roles, or open to all logged-in users behind the monthly cap?
- **Which ring/drive-time defaults?** Currently rings default to 1/3/5 mi; drive-time defaults to 10 min only. For the new UI I'd default rings to 1/3/5 (matches stored property data so caching is trivial) and drive-time to 5/10/15 (more useful for site analysis).
- **Variable set.** The edge function only requests the seven core variables ([line 47-69](../supabase/functions/esri-geoenrich/index.ts#L47)). Should the custom-polygon flow optionally request a larger variable set (consumer spending, retail potential, etc.)? Each extra variable adds credits.
- **Marker source for Phase 1.** Should "Demographics here" open from any pin (property, site submit, raw map click) or only the map context menu? Recommend all three.

## Recent enhancements

### 2026-06-18 — 7-minute drive-time + per-band styling

User-driven tweaks to the Ad-hoc location demographics sidebar ([DemographicsAnalysisSlideout.tsx](../src/components/mapping/slideouts/DemographicsAnalysisSlideout.tsx)):

- **Added 7 min** to the drive-time button row (now 5 / 7 / 10 / 15). The ESRI edge function takes `driveTimes` straight through to `bufferRadii` and returns `7min_drive` keyed isochrones, so no backend or schema change was needed. Defaults stay at 5/10/15 — 7 is opt-in.
- **Per-band drive-time styling.** Each selected drive-time band now exposes three controls in the Layer style panel: fill color (F), line color (L), and a fill-opacity slider. Line color defaults to the band's fill color so single-color edits stay coherent. Line opacity and line weight remain global to the layer.

[DemographicIsochronesOverlay.tsx](../src/components/mapping/layers/DemographicIsochronesOverlay.tsx) now takes `bands: { minutes, fillColor, lineColor, fillOpacity }[]` instead of a single per-band `color` plus a global `fillOpacity`. The cached `*_10min_drive` property columns are not affected — they're a separate downstream concern (property-pin pre-cache), not an ad-hoc-sidebar concern.

Shipped in commit `49a57a18`.
