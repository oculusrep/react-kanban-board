# Starbucks GA Target Areas — OREP edits & OREP-drawn polygons

**Shipped:** 2026-07-15
**Builds on:** [FEATURE_2026_05_12_STARBUCKS_TARGET_AREAS_LAYER.md](FEATURE_2026_05_12_STARBUCKS_TARGET_AREAS_LAYER.md)

## What this adds

The v1 Starbucks GA Target Areas layer was read-only (click → InfoWindow). This feature makes it
editable for authorized OREP users and lets them add their own target-area polygons:

1. **OREP Notes** — a new editable free-text field, separate from the Starbucks-sourced `notes`.
2. **Model Yr1 Sales (editable)** — via an OREP **override** that survives Starbucks KML re-imports.
   Display everywhere uses `COALESCE(orep_model_yr1_sales, model_yr1_sales)`.
3. **OREP-drawn polygons** — right-click the map → **"+ SBUX Target"** → draw a polygon → name it.
   Stored with `source='orep'` and rendered in a distinct, editable **blue (`#0000FF`)** style bucket.

All editing/drawing is gated by the **`can_edit_starbucks_target_area`** permission, set per user (or
role) in the user permissions matrix under the "Starbucks Layer" category. Because portal users have
no row in the `user` table, editing is internal-only by construction.

## Data model (migration `20260715120000_starbucks_target_area_orep_edits.sql`)

New columns on `starbucks_target_area`:

| Column | Type | Purpose |
|--------|------|---------|
| `orep_notes` | `TEXT` | OREP annotation, distinct from Starbucks `notes` |
| `orep_model_yr1_sales` | `NUMERIC(14,2)` | OREP override for `model_yr1_sales` |
| `source` | `TEXT NOT NULL DEFAULT 'starbucks'` | `'starbucks'` (imported) or `'orep'` (drawn in OVIS) |

- `target_area_id` is now **nullable** (OREP rows have no Starbucks GUID; `UNIQUE` still holds since
  Postgres allows multiple NULLs).
- `user_can_edit_starbucks_target_area()` mirrors `user_has_starbucks_access()` Path 1 (merged
  user/role JSONB permission, user override wins).
- RLS write policies: INSERT (source='orep' only), UPDATE, DELETE (source='orep' only) — all gated on
  the helper. The read policy is unchanged.
- **Column guard trigger** `starbucks_target_area_guard_starbucks_cols()`: on `source='starbucks'`
  rows, an authenticated user may only change the OREP columns — every Starbucks column is pinned to
  its old value. The trigger exempts the service-role ETL (`auth.uid() IS NULL`) so re-import can
  still write Starbucks columns.

## RPCs

- `get_starbucks_target_areas_in_bbox` (migration `...120100`) now also returns `source`,
  `orep_notes`, `orep_model_yr1_sales` (raw `model_yr1_sales` retained so the edit UI can show it as
  the override placeholder). Signature changed → DROP + CREATE.
- `create_orep_target_area(p_name text, p_geojson jsonb)` (migration `...120200`) — SECURITY DEFINER,
  re-checks the edit permission, inserts a `source='orep'` row with geometry built from the GeoJSON
  Polygon. Used by the draw flow (inserting PostGIS geometry via PostgREST directly is awkward).

## Frontend

- `useStarbucksTargetAreaStyles.ts` — added an `'orep'` style bucket (default blue `#0000FF`); storage
  key bumped to `_v2`.
- `StarbucksTargetAreaToggle.tsx` — the style editor now has an **OREP** row alongside P1/P2/P3.
- `StarbucksTargetAreaLayer.tsx` — routes `source='orep'` polygons to the `orep` bucket, renders them
  on top, and lets them **bypass the ops-area filter** (they aren't in the Starbucks ops hierarchy).
  New `onFeatureClick` prop: when provided (editors), a polygon click opens the editable slideout;
  otherwise the read-only InfoWindow is shown (now also displaying OREP Notes + the effective sales).
- `StarbucksTargetAreaSlideout.tsx` (new) — edits OREP Notes + Model Yr1 Sales override (+ name and
  delete for OREP-drawn rows). Saves via `supabase.update`, then `refreshLayer('starbucks_target_areas')`.
- `MappingPageNew.tsx` — permission (`can_edit_starbucks_target_area`) gates the slideout wiring and the
  "+ SBUX Target" context-menu item; the draw handler runs a `DrawingManager` polygon draw and calls
  `create_orep_target_area`.
- `GoogleMapContainer.tsx` — added `'drawing'` to the Maps loader libraries.
- `StarbucksTargetAreasReport.tsx` — Model Yr1 Sales column/total/sort/filter now use the effective
  (override-aware) value; OREP Notes surfaced in the notes column and search.

## ⚠️ Re-import safety (IMPORTANT)

The Starbucks KML re-import upserts on `target_area_id` and runs as the service role (bypasses RLS and
the column guard). It **must**:
- only INSERT/UPDATE `source='starbucks'` rows,
- never write the OREP columns (`orep_notes`, `orep_model_yr1_sales`), and
- never DELETE `source='orep'` rows.

OREP rows have a NULL `target_area_id`, so a `target_area_id`-keyed upsert cannot collide with them —
but any "delete rows not present in the KML" cleanup step must be scoped to `source='starbucks'`.
