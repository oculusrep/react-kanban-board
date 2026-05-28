# Municipal Project Importer — Spec

**Status:** Draft, awaiting Mike's review before Phase 1 build.
**Created:** 2026-05-21
**Source CSV used for design:** `data/incoming muni uploads/Winder GA - PROJECT TRACKING  - April 2026.csv`

## Goal

Let the team ingest municipal-development tracking spreadsheets (one per city, varying column shapes) into OVIS so projects can be browsed on the existing map alongside properties, filtered by status, and updated on re-import without dupes.

## Scope by phase

| Phase | Ships | Status |
|-------|-------|--------|
| **1** | Schema + CSV importer (upload → column map → stage map → per-row diff preview → geocode to point → insert/upsert). Admin-only page at `/admin/municipal-import`. | **Next up** |
| **2** | Municipal Projects layer on existing `MappingPage` — per-municipality toggle, per-status filter, click-pin → slideout with all project fields + manual status override. | Later |
| **3** | "Draw Polygon" button on the slideout that activates terra-draw on the underlying map; save polygon to `municipal_project.geometry`; pin replaced by polygon's centroid label. | Later |

Each phase is independently useful and ships as its own PR.

---

## Data model

### New tables

```sql
-- Canonical taxonomy shared across all municipalities.
-- Grows over time (users can create new stages during the stage-mapping step).
project_stage
  id              uuid PK
  name            text NOT NULL UNIQUE   -- 'Planning', 'Approved', 'Under Construction', 'Built Out', ...
  sort_order      int  NOT NULL          -- for display ordering in filters
  color           text                   -- hex, optional; defaults assigned client-side
  created_at      timestamptz default now()

-- One row per city we track.
municipality
  id                       uuid PK
  name                     text NOT NULL          -- 'Winder'
  state                    text NOT NULL          -- 'GA'
  display_color            text                   -- map-pin color; default brand palette
  default_visible          bool default true      -- layer toggle default state
  created_at               timestamptz default now()
  UNIQUE (name, state)

-- Per-municipality column→canonical-stage mapping. Saved on first import; reused on later imports from same muni.
-- A municipality typically has several stage columns; one row per source column.
municipality_stage_mapping
  id                  uuid PK
  municipality_id     uuid NOT NULL REFERENCES municipality(id) ON DELETE CASCADE
  source_column_name  text NOT NULL                            -- 'RECORDED'
  project_stage_id    uuid NOT NULL REFERENCES project_stage(id)
  completion_values   text[] NOT NULL DEFAULT '{}'             -- ['Yes'] — treat any of these as "stage complete". Empty array = "any non-blank/non-No/non-N/A counts as complete".
  date_column         bool NOT NULL DEFAULT false              -- true = treat any parseable date as completion
  priority            int NOT NULL DEFAULT 0                   -- higher priority wins when computing latest completed stage
  UNIQUE (municipality_id, source_column_name)

-- The project rows themselves.
municipal_project
  id                       uuid PK
  municipality_id          uuid NOT NULL REFERENCES municipality(id) ON DELETE CASCADE
  address                  text NOT NULL
  project_name             text NOT NULL                       -- '' allowed but rare; see dedup notes
  phase_label              text NOT NULL DEFAULT ''            -- 'Phase I' / 'Phase II' / '' — extracted from NOTES on import
  parcel_numbers           text[] NOT NULL DEFAULT '{}'

  -- unit counts (nullable; CSV often has blanks)
  single_family_lots       int
  townhouse_units          int
  duplex_units             int
  apt_units                int
  cottage_units            int
  total_housing_units      int                                 -- imported as-is; computed fallback = SUM(units)

  -- zoning
  zoning                   text
  zoning_approval_date     date
  notes                    text

  -- raw workflow stages from the source CSV — stored as jsonb so we can keep all per-muni columns
  -- without changing schema per municipality. Shape: { "PRELIMINARY PLAT": "Yes", "RECORDED": "2/19/2024", ... }
  raw_stages               jsonb NOT NULL DEFAULT '{}'

  -- computed status (re-derived on insert/update via trigger or app code)
  status_stage_id          uuid REFERENCES project_stage(id)
  -- manual override; if NOT NULL, wins over computed
  status_override_id       uuid REFERENCES project_stage(id)

  -- geocode + polygon
  geocoded_address         text                                -- the formatted_address Google returned
  centroid                 geometry(Point, 4326)               -- geocoded point until polygon is drawn; then derived from polygon
  geometry                 geometry(Polygon, 4326)             -- drawn in Phase 3

  -- linkage + provenance
  property_id              uuid REFERENCES property(id)        -- nullable; manual link via future detail UI
  source_import_id         uuid REFERENCES municipal_import(id)
  source_row_number        int                                 -- row in the originating CSV (1-indexed, header = row 1)

  created_at               timestamptz NOT NULL DEFAULT now()
  updated_at               timestamptz NOT NULL DEFAULT now()

  UNIQUE (municipality_id, address, project_name, phase_label)

-- Audit log per upload.
municipal_import
  id                  uuid PK
  municipality_id     uuid NOT NULL REFERENCES municipality(id)
  file_name           text NOT NULL
  file_sha256         text                                     -- detect exact-duplicate uploads
  uploaded_by         uuid REFERENCES "user"(id)
  uploaded_at         timestamptz NOT NULL DEFAULT now()
  row_count           int NOT NULL DEFAULT 0                   -- data rows (excl. header, excl. skipped footers)
  inserted_count      int NOT NULL DEFAULT 0
  updated_count       int NOT NULL DEFAULT 0
  skipped_count       int NOT NULL DEFAULT 0
  column_mapping      jsonb NOT NULL DEFAULT '{}'              -- { source_col: target_field } used for this import
  status              text NOT NULL DEFAULT 'pending'          -- pending | success | partial | failed
  error_log           jsonb NOT NULL DEFAULT '[]'              -- [{ row_number, error }, ...]
```

### Indexes

```sql
CREATE INDEX municipal_project_municipality_idx       ON municipal_project (municipality_id);
CREATE INDEX municipal_project_status_idx             ON municipal_project (status_stage_id);
CREATE INDEX municipal_project_centroid_gix           ON municipal_project USING GIST (centroid);
CREATE INDEX municipal_project_geometry_gix           ON municipal_project USING GIST (geometry);
CREATE INDEX municipality_stage_mapping_muni_idx      ON municipality_stage_mapping (municipality_id);
```

### Extension

`postgis` already present in this project (other tables use `geometry`). Migration will verify with `CREATE EXTENSION IF NOT EXISTS postgis`.

### RLS

All five new tables get RLS enabled with policies matching the existing admin-tool pattern (read = authenticated, write = admin role). Final policies to match what `app_settings` / `agent_rules` use today.

---

## Status computation

**Effective status** = `COALESCE(status_override_id, status_stage_id)`.

**Auto-computed `status_stage_id`** is derived at insert/update time:
1. For each row in `municipality_stage_mapping` for this project's municipality, check the corresponding key in `raw_stages`.
2. A stage counts as "complete" when:
   - `date_column=true` and the raw value parses as a date, OR
   - `completion_values` is non-empty and the raw value is in the array, OR
   - `completion_values` is empty and the raw value is non-blank and not in `{"No", "N/A", "Not Applicable", "In Progress", ""}`.
3. Among completed stages, pick the one with the highest `priority`. That stage's `project_stage_id` becomes `status_stage_id`.
4. If no stage is complete, leave `status_stage_id` NULL (UI shows "Planning" as a fallback label).

Computation lives in the importer (app code) on insert and on `update`. No DB trigger — explicit code is easier to debug.

---

## Importer UI flow (Phase 1)

Route: `/admin/municipal-import` (wrapped in `AdminRoute`). Single-page, stepper-style component.

### Step 1 — Upload + municipality

- Dropzone (uses already-installed `react-dropzone`). Accept `.csv` only.
- Pick municipality (combobox of existing `municipality` rows + "Create new…" inline form for name/state).
- Parse CSV client-side with **papaparse** (needs install: `papaparse` + `@types/papaparse`).
- Compute `file_sha256` client-side; warn if a `municipal_import` row with the same hash already exists for this muni.

### Step 2 — Column mapping

Two-column UI: left = CSV header names, right = target field dropdown (or "Ignore"). Target field options:
- `address`, `parcel_numbers`, `project_name`, `single_family_lots`, `townhouse_units`, `duplex_units`, `apt_units`, `cottage_units`, `total_housing_units`, `zoning`, `zoning_approval_date`, `notes`
- `raw_stage_column` (multi-select effectively — any column not mapped above is treated as a raw stage)
- `ignore`

**Defaults**: if this municipality has a previous `municipal_import`, prefill mapping from the most recent one. Otherwise fuzzy-match column header → target field by name (e.g., "ADDRESS" → `address`, "SINGLE FAMILY LOTS APPROVED" → `single_family_lots`).

### Step 3 — Stage mapping

For each column mapped as `raw_stage_column`, show a row with:
- Source column name (read-only)
- Canonical stage dropdown (populated from `project_stage`; "+ Create new stage…" at the bottom)
- Completion mode radio: "Date column" / "Value match" / "Any non-blank"
- If "Value match": tag-input for `completion_values` (default: `["Yes"]`)
- Priority number (default: order shown, higher = later in workflow)

Saved as `municipality_stage_mapping` rows on submit. Prefilled if mapping already exists for this muni.

### Step 4 — Preview

Tabular preview with:
- **Auto-skip rows** where `project_name` AND `address` are both blank (footer totals). Show count: `"3 rows skipped (no project name or address — likely totals)"`.
- Per-row badge: `NEW` (no existing match), `UPDATE` (match exists, fields differ — pre-checked), `UNCHANGED` (match exists, all fields equal — defaults to skip), `ERROR` (geocoding failed, malformed date, etc.).
- For `UPDATE` rows: expandable diff showing field-by-field old → new with per-field checkboxes.
- Bulk controls: "Select all NEW", "Select all UPDATE", "Skip all UNCHANGED".
- Geocoding status column: shows the formatted address Google returned, or "Failed" with retry button.

### Step 5 — Submit

- Calls geocoding for any rows missing `centroid` (Google Geocoding API, throttled to 10/sec).
- Computes `status_stage_id` for each row per the rules above.
- Upserts via `supabase-js` (no edge function — matches existing patterns in this codebase).
- Writes one `municipal_import` row with counts and any errors.
- Redirects to a success view: "Imported N projects (X new, Y updated, Z skipped). View import log."

---

## Dedup logic

**Match key:** `(municipality_id, lower(trim(address)), lower(trim(project_name)), lower(trim(phase_label)))`.

**Phase extraction:** before matching, parse `phase_label` from the `notes` column:
- regex `/\bPhase\s+([IVX]+|\d+)\b/i` → `"Phase " + match[1]` (normalize "Phase 1" → "Phase I" if you prefer Roman; I'll default to keeping source format).
- If no match → `phase_label = ''`.

**Re-import behavior:** per-row diff preview, user picks per row (default: pre-check `UPDATE` when any field changed). Already locked in.

---

## Geocoding

- Use Google Geocoding API via the existing `@googlemaps/js-api-loader`.
- Throttle to 10 requests/sec to stay well under quota.
- On failure, mark row as `ERROR` in preview with a "Retry" button and a manual lat/lng input.
- Cache geocoding results within the import session — if two rows share the same address, geocode once.
- Re-imports skip geocoding for rows where `centroid` is already populated (don't burn API calls on existing data).

---

## What I'm defaulting (will not ask, will flag in PR)

- **CSV parser:** `papaparse` + `@types/papaparse` (install as deps).
- **Footer/total rows:** auto-skipped when both `project_name` and `address` are blank; count shown in preview.
- **Phase label format:** preserve source casing ("Phase I" stays "Phase I", "Phase 1" stays "Phase 1") rather than normalizing — avoids surprising the user with a transformation they didn't ask for.
- **Computed status when nothing is complete:** `status_stage_id = NULL`, UI label "Planning" (fallback only, not a real `project_stage` row).
- **Manual property link:** out of scope for Phase 1 — `property_id` exists as a column but no UI for setting it; revisit in Phase 2 or 3.

---

## Open items I'd still like to confirm before coding

None blocking — happy to start Phase 1 on this spec. Flagging two minor things I'd ask in passing:
1. Should I seed `project_stage` with the obvious 4 (Planning / Approved / Under Construction / Built Out) so the first import isn't starting from zero?
2. The `app_settings`-style RLS pattern is "read=auth, write=admin". Confirm that's what you want for these five tables before I lock it in the migration.
