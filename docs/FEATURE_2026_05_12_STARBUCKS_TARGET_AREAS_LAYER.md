# Feature — Starbucks GA Target Areas Map Layer

**Date:** 2026-05-12

## Why

Starbucks sends OVIS a KML of their Georgia real-estate target areas — ~319 polygons with site-selection metadata (priority, market, SDM, RE availability, model sales, etc.). Brokers/VAs/admins need to see these on the map; the Starbucks portal user also needs read access to their own data.

Treated this as a sibling to the existing Starbucks Stores layer (point data on `starbucks_store`). Same client, same confidentiality posture, so it reuses the same RLS gating. The broader "client-shared map layer" rebuild is being spec'd separately ([CLIENT_MAP_LAYERS_PLAN.md](../CLIENT_MAP_LAYERS_PLAN.md)); this work intentionally slots into the *current* layer system without inventing new abstractions, so it's an easy lift-and-shift when the rebuild lands.

Full intake spec: see attached `STARBUCKS_LAYER_SPEC.md` (delivered with the KML drop).

## What was built

### Database — two migrations

[`supabase/migrations/20260512000001_starbucks_target_area_layer.sql`](../supabase/migrations/20260512000001_starbucks_target_area_layer.sql)
- `public.starbucks_target_area` — 46 columns, `geom GEOMETRY(Polygon, 4326)`, GiST index on `geom`, btree indexes on `priority` / `store_type` / `market_name` / `sdm_mdm`
- Natural key: `target_area_id` (UUID GUID from KML) — drives upsert semantics on re-import
- Dedicated `update_starbucks_target_area_updated_at()` trigger function
- `ENABLE ROW LEVEL SECURITY` + one SELECT policy calling **the existing `user_has_starbucks_access()` helper** (defined in [`20260505000001_starbucks_layer.sql`](../supabase/migrations/20260505000001_starbucks_layer.sql))

[`supabase/migrations/20260512000002_starbucks_target_area_in_bbox_rpc.sql`](../supabase/migrations/20260512000002_starbucks_target_area_in_bbox_rpc.sql)
- `get_starbucks_target_areas_in_bbox(p_south, p_west, p_north, p_east)` returns rows with `geom_geojson jsonb`
- Mirrors the existing [`get_streetlight_segments_in_bbox`](../supabase/migrations/20260505000000_streetlight_segments_in_bbox_rpc.sql) pattern: `SECURITY INVOKER` so the underlying-table RLS applies, `LIMIT 5000`, GiST-backed `&&` + `ST_Intersects`
- `GRANT EXECUTE … TO authenticated` (no anon)

### Access model — reuses existing Starbucks gates

No new permission, no new client flag. The new table is gated by the **same** `user_has_starbucks_access()` function as `starbucks_store` / `starbucks_snapshot`:

- **Internal** users with `can_view_starbucks_layer` in `user.permissions` or `role.permissions` (user override wins) → SELECT
- **Portal** users whose linked `client.starbucks_layer_enabled = TRUE` (the Starbucks client) → SELECT
- **Writes** (insert/update/delete) go through the service role (psql / Supabase service key) and bypass RLS, matching the seed/re-import workflow

### Frontend

| File | Role |
|---|---|
| [`src/hooks/useStarbucksTargetAreaStyles.ts`](../src/hooks/useStarbucksTargetAreaStyles.ts) | localStorage-backed per-priority style state (color, opacity, visibility). Defaults: green / yellow / purple. |
| [`src/components/mapping/layers/StarbucksTargetAreaLayer.tsx`](../src/components/mapping/layers/StarbucksTargetAreaLayer.tsx) | Bounds-aware fetch via RPC, renders `google.maps.Polygon` per row, click→InfoWindow, hover bump, live-preview re-styling without polygon rebuild. |
| [`src/components/mapping/layers/StarbucksTargetAreaToggle.tsx`](../src/components/mapping/layers/StarbucksTargetAreaToggle.tsx) | Compact toggle row + collapsible style editor with per-priority checkbox + line/fill color pickers + opacity slider + Reset link. Designed to fit the 384-px Layers menu. |
| [`src/components/mapping/layers/LayerManager.tsx`](../src/components/mapping/layers/LayerManager.tsx) | Layer registered as `id: 'starbucks_target_areas'`, `requiresPermission: 'can_view_starbucks_layer'`. |
| [`src/pages/MappingPageNew.tsx`](../src/pages/MappingPageNew.tsx) | Imports the hook + components; renders the toggle in the Layers menu and the layer alongside `StarbucksLayer`. Master toggle off→on resets all bucket checkboxes to visible. |

### Styling behaviour

Per-priority styling, persisted in `localStorage` (key `starbucks_target_area_styles_v1`). Each of the 3 priority buckets exposes:

- **Show / hide checkbox** — detaches polygons from the map, leaving the other priorities untouched
- **Line color** — native `<input type="color">`
- **Fill color** — native `<input type="color">`
- **Opacity slider** — 0.00–1.00, step 0.05, with live numeric readout

Live preview: changes apply to existing polygons via `setOptions` — no refetch, no rebuild, smooth slider drag. Hover handlers read styles through a ref so they always pick up the user's latest values mid-drag.

Master layer toggle off→on **resets all three bucket checkboxes to visible** (the user's intuition: turning the layer back on should show everything). Color/opacity customizations are preserved.

## Re-importing a new KML

[`scripts/import_starbucks_kml.py`](../scripts/import_starbucks_kml.py) parses the KML and emits an idempotent SQL seed (one `BEGIN/COMMIT`, 319 `INSERT … ON CONFLICT DO UPDATE` statements). Table name (`public.starbucks_target_area`, singular) is baked into the script — no manual rewrite step.

```bash
python3 scripts/import_starbucks_kml.py path/to/GA_Target_Areas.kml > /tmp/seed.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/seed.sql
```

Rows removed from a newer KML stay in the DB on purpose — preserves any OVIS-side annotations we attach to a `target_area_id` later. Delete manually if needed.

## What's intentionally NOT here

Per spec, scope-tight v1:

- No file-manager UI for layer management (covered by [CLIENT_MAP_LAYERS_PLAN.md](../CLIENT_MAP_LAYERS_PLAN.md))
- No aerial-markup tool
- No generic KML importer — script is Starbucks-specific
- No slideout integration on polygon click — just an `InfoWindow`
- No priority / store-type / SDM filters in the editor — only style controls
- No DB-backed per-user style preferences — localStorage is per-browser
