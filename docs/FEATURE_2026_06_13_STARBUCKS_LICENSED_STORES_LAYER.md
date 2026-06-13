# Feature — Starbucks Licensed Stores ("LS") Map Layer

**Date:** 2026-06-13

## Why

Starbucks's licensed locations (Kroger, Target, Marriott, AAFES, etc.) are tracked outside the corporate-owned "Starbucks Stores" data already in OVIS. The first drop arrived as a CSV (`data/incoming/starbucks/LS Store Query.csv`, 214 rows). Brokers/VAs want to see them on the map alongside the owned-store layer, distinguish the three store types (Cafe / Drive Thru / Kiosk) at a glance, and nudge pins whose CSV geocode is off — the same workflow they already use on `property` / `site_submit` / `restaurant` pins.

Re-import is expected periodically; the importer mirrors the CSV exactly (delete rows that disappear).

## What was built

### Database — one migration

[`supabase/migrations/20260613112803_starbucks_licensed_store_layer.sql`](../supabase/migrations/20260613112803_starbucks_licensed_store_layer.sql)
- `public.starbucks_licensed_store` — 24 columns, PK `store_number TEXT`
- Mirrors every column from the CSV plus `verified_latitude` / `verified_longitude` (OVIS overrides) and `created_at` / `updated_at`
- Indexes on `(latitude, longitude)`, `(verified_latitude, verified_longitude)`, `store_type`, `segment`, `market_name`, `state`
- Dedicated `update_starbucks_licensed_store_updated_at()` trigger
- `ENABLE ROW LEVEL SECURITY` reusing **the existing `user_has_starbucks_access()` helper** (no new permission flag)
- Two policies: `SELECT` (any user with Starbucks access) and `UPDATE` (so the map UI can persist `verified_*` without the service role)

### Access model

No new permission, no new client flag — same gate as `starbucks_store` / `starbucks_snapshot` / `starbucks_target_area`. Anyone with `can_view_starbucks_layer` (or a portal user whose linked client has `starbucks_layer_enabled = TRUE`) gets read access. Authorized users can also write `verified_latitude` / `verified_longitude` via the map.

### Importer

[`scripts/ingestStarbucksLicensed.ts`](../scripts/ingestStarbucksLicensed.ts)
- Parses the CSV via `papaparse` (handles the embedded commas in "Atlanta-Sandy Springs-Roswell, GA" / "Kroger Co., The")
- Upserts each row by `store_number` — does **not** touch `verified_latitude` / `verified_longitude` on existing rows
- Then deletes any DB row whose `store_number` is not in the current CSV (mirrors the CSV exactly per the chosen re-import policy)
- Uses `SUPABASE_SERVICE_ROLE_KEY` → bypasses RLS

```bash
bun scripts/ingestStarbucksLicensed.ts "data/incoming/starbucks/LS Store Query.csv"
```

### Frontend

| File | Role |
|---|---|
| [`src/components/mapping/layers/StarbucksLicensedStoreLayer.tsx`](../src/components/mapping/layers/StarbucksLicensedStoreLayer.tsx) | Bbox-aware fetch via `.or()` (matches rows whose raw **or** verified coords fall in view), per-type icon, draggable-when-verifying, right-click hook. |
| [`src/components/mapping/popups/StarbucksLicensedStorePopup.tsx`](../src/components/mapping/popups/StarbucksLicensedStorePopup.tsx) | InfoWindow showing Store #, Name, Type, Segment, address, city, state, ZIP, lat, lng, sqft. Shows a "✓ Verified location" footer when applicable. |
| [`src/components/mapping/StarbucksLicensedStoreContextMenu.tsx`](../src/components/mapping/StarbucksLicensedStoreContextMenu.tsx) | Right-click menu: Verify Pin Location / Reset to Original Location (if verified) / Copy Coordinates. Mirrors `SiteSubmitContextMenu` / `RestaurantContextMenu`. |
| [`src/components/mapping/layers/LayerManager.tsx`](../src/components/mapping/layers/LayerManager.tsx) | Layer registered as `id: 'starbucks_licensed_stores'`, gated by `requiresPermission: 'can_view_starbucks_layer'`. |
| [`src/pages/MappingPageNew.tsx`](../src/pages/MappingPageNew.tsx) | Imports + mounts the layer (after `StarbucksLayer`, before `StarbucksTargetAreaLayer`), renders the toggle directly beneath "Starbucks Stores" in the Layers menu, and wires verify / reset / context-menu handlers. |

### Pin icons

Three logo PNGs, copied into `public/Images/` so Vite serves them as static assets:

| Store Type | Asset |
|---|---|
| Cafe       | `/Images/LICENSE-CAFE.png` |
| Drive Thru | `/Images/License DT.png` |
| Kiosk      | `/Images/LICENSE-KIOSK.png` |

Icon size scales for selected (34px) / verifying (38px) / normal (24px) states.

### Verify-location workflow

1. Right-click a Licensed Store pin → context menu opens
2. Click **Verify Pin Location** → that pin becomes draggable (same pattern as `PropertyLayer.tsx:582`)
3. Drag and drop → `handleLicensedStoreLocationVerified` writes `verified_latitude` / `verified_longitude` directly via the user's auth (RLS UPDATE policy)
4. Pin re-renders at the new position; "✓ Verified location" appears in the popup; **Reset to Original Location** appears in the context menu

## Coordinate resolution

Pins render at `verified_*` if non-null, otherwise the raw CSV `latitude` / `longitude`. The bbox fetch matches rows whose **either** coordinate pair is in view (a `WHERE (raw IN bbox) OR (verified IN bbox)` `.or()`), so dragging a pin near the edge of view doesn't make it disappear.

## What's intentionally NOT here

- No clustering (214 rows nationwide; clustering adds complexity for no benefit at this scale)
- No slideout / detail page — popup is the only view (matches Restaurant layer, which is also "look but don't drill in")
- No filters (by store_type / segment / state) — visually obvious in v1; add later if needed
- No `starbucks_snapshot`-style time-series — Licensed Stores don't carry sales data
- No GeoJSON / KML alternate format — CSV is the source of truth
