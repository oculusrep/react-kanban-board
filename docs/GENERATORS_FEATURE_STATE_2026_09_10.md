# Generators feature — current state (read-only audit, 2026-09-10)

**Headline: there is no generators feature in OVIS.** No table, column, type, component,
service, edge function, or migration named `generator` / `school` / `employer` exists on
`main`, on `feature/starbucks-loi-tool`, or on `feat/legal-orchestration-v1`. There is also
no "IV therapy" Places layer anywhere in the repo.

This document records what *does* exist in the adjacent space, so a generators build can
reuse it rather than reinvent it.

## Verification performed

```sql
-- no tables
select table_name from information_schema.tables
 where table_schema='public'
   and (table_name ilike '%generator%' or table_name ilike '%school%'
        or table_name ilike '%employer%');
-- → 0 rows

-- no columns
select table_name, column_name from information_schema.columns
 where table_schema='public'
   and (column_name ilike '%generator%' or column_name ilike '%school%'
        or column_name ilike '%employer%');
-- → 0 rows
```

```
git grep -lI -i generator <all branches> -- '*.sql'
→ only supabase/migrations/20260509114321_task_system_v2_block_schema_phase2.sql
  (comment about the task daily-instance generator — unrelated)
```

`grep -rli "iv.therapy\|iv_therapy"` over the whole repo → 0 files.

---

## 1. SCHEMA — nearest existing analogues

### `municipal_project` — the residential-pipeline analogue (closest match)

39 columns, live definition:

| # | column | type | null | default |
|---|--------|------|------|---------|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | municipality_id | uuid | NO | |
| 3 | address | text | NO | |
| 4 | project_name | text | NO | `''::text` |
| 5 | phase_label | text | NO | `''::text` |
| 6 | parcel_numbers | text[] | NO | `'{}'::text[]` |
| 7 | single_family_lots | integer | YES | |
| 8 | townhouse_units | integer | YES | |
| 9 | duplex_units | integer | YES | |
| 10 | apt_units | integer | YES | |
| 11 | cottage_units | integer | YES | |
| 12 | total_housing_units | integer | YES | |
| 13 | zoning | text | YES | |
| 14 | zoning_approval_date | date | YES | |
| 15 | notes | text | YES | |
| 16 | raw_stages | jsonb | NO | `'{}'::jsonb` |
| 17 | status_stage_id | uuid | YES | |
| 18 | status_override_id | uuid | YES | |
| 19 | geocoded_address | text | YES | |
| 20 | centroid | geometry(Point,4326) | YES | |
| 21 | geometry | geometry (polygon) | YES | |
| 22 | property_id | uuid | YES | |
| 23 | source_import_id | uuid | YES | |
| 24 | source_row_number | integer | YES | |
| 25 | created_at | timestamptz | NO | now() |
| 26 | updated_at | timestamptz | NO | now() |
| 27 | source | text | YES | |
| 28 | builder_developer | text | YES | |
| 29 | permit_url | text | YES | |
| 30 | permit_application_date | date | YES | |
| 31 | source_research_run_id | uuid | YES | |
| 32 | location_description | text | YES | |
| 33 | parcel_boundary_notes | text | YES | |
| 34 | created_by_id | uuid | YES | |
| 35 | updated_by_id | uuid | YES | |
| 36 | label_offset_x_px | integer | YES | |
| 37 | label_offset_y_px | integer | YES | |
| 38 | discovery_source | text | YES | |
| 39 | discovery_source_raw | text | YES | |

Indexes:

```
municipal_project_pkey                                   UNIQUE btree (id)
municipal_project_municipality_id_address_project_name_phas_key
                                                         UNIQUE btree (municipality_id, address, project_name, phase_label)
municipal_project_centroid_gix                           gist (centroid)
municipal_project_geometry_gix                           gist (geometry)
municipal_project_municipality_idx                       btree (municipality_id)
municipal_project_status_idx                             btree (status_stage_id)
municipal_project_source_run_idx                         btree (source_research_run_id) WHERE source_research_run_id IS NOT NULL
```

Note: **no `site_submit_id` FK.** Municipal projects are anchored to a municipality, not to
a site. The link to a site is indirect, via `source_research_run_id → research_run.site_submit_id`.

### `municipal_project_staging` — the agent write target

From `supabase/migrations/20260606130000_create_research_run_staging.sql`:

```sql
CREATE TABLE public.municipal_project_staging (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id                 uuid NOT NULL REFERENCES public.research_run(id) ON DELETE CASCADE,
  boundary_municipality_id        uuid REFERENCES public.boundary_municipality(id),
  municipality_id                 uuid REFERENCES public.municipality(id),
  project_name                    text,
  address                         text,
  phase_label                     text NOT NULL DEFAULT '',
  parcel_numbers                  text[] NOT NULL DEFAULT '{}',
  single_family_lots              int,
  townhouse_units                 int,
  duplex_units                    int,
  apt_units                       int,
  cottage_units                   int,
  total_housing_units             int,
  zoning                          text,
  zoning_approval_date            date,
  notes                           text,
  raw_stages                      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_stage_id                 uuid REFERENCES public.project_stage(id),
  builder_developer               text,
  permit_url                      text,
  permit_application_date         date,
  source                          text NOT NULL,
  matched_existing_id             uuid REFERENCES public.municipal_project(id),
  approval_state                  text NOT NULL DEFAULT 'pending'
                                    CHECK (approval_state IN ('pending','approved','rejected')),
  approved_at                     timestamptz,
  approved_municipal_project_id   uuid REFERENCES public.municipal_project(id),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);
```

(Later migrations add `location_description`, `parcel_boundary_notes`, `discovery_source`,
`discovery_source_raw`.)

**Note: no lat/lng columns on staging.** Coordinates are computed in the browser at approval
time and passed to the approve RPC.

### `research_run` — the per-site anchor

```sql
CREATE TABLE public.research_run (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_submit_id  uuid NOT NULL REFERENCES public.site_submit(id) ON DELETE CASCADE,
  triggered_by    uuid REFERENCES public."user"(id),
  triggered_at    timestamptz NOT NULL DEFAULT now(),
  radius_miles    int NOT NULL DEFAULT 10 CHECK (radius_miles BETWEEN 1 AND 50),
  state           text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending','running','awaiting_review','approved','archived','failed')),
  needs_review    text,
  alt_avenues     text,
  openclaw_run_id text,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

Cardinality: `site_submit 1 → N research_run 1 → N municipal_project_staging`.

### `google_places_result` — the retail/POI analogue

| # | column | type | null | default |
|---|--------|------|------|---------|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | place_id | varchar | NO | |
| 3 | query_id | uuid | YES | |
| 4 | layer_id | uuid | YES | |
| 5 | name | varchar | NO | |
| 6 | formatted_address | text | YES | |
| 7 | latitude | numeric | NO | |
| 8 | longitude | numeric | NO | |
| 9 | business_status | varchar | NO | |
| 10 | types | text[] | YES | |
| 11 | rating | numeric | YES | |
| 12 | user_ratings_total | integer | YES | |
| 13 | phone_number | varchar | YES | |
| 14 | website | text | YES | |
| 15 | raw_data | jsonb | YES | |
| 16 | property_id | uuid | YES | |
| 17 | first_seen_at | timestamptz | YES | now() |
| 18 | last_seen_at | timestamptz | YES | now() |
| 19 | created_at | timestamptz | YES | now() |

Indexes include `UNIQUE (place_id, layer_id)` and `btree (latitude, longitude)`.
This is the schema a generators table would most closely resemble (name + address +
lat/lng + types + provenance + dedupe key). It has **no site_submit link** — it is
layer-scoped, not site-scoped.

---

## 2. WHAT POPULATES IT

The Market Research path writes **residential development records only** — no schools,
employers, or retail generators.

Path: `ovis-research-trigger` (start) → external OpenClaw agent → `ovis-research-mcp`
(MCP over HTTP, JSON-RPC 2.0, bearer-token auth, service-role writes).

Four MCP tools, `supabase/functions/ovis-research-mcp/index.ts`:
`get_municipalities_in_radius`, `create_research_checklist`, `update_checklist_status`,
`submit_research_report`.

`submit_research_report` is the single batched end-of-run write. Its per-record schema is
the de-facto column contract; sources are agent-selected and free-text, constrained by
`discovery_source`:

```
enum: ['pz_agenda','news','permit_portal','activity_pdf','builder_site','econ_dev','other', null]
```

Fill rates over all 296 staging rows in production:

| field | filled | of 296 |
|-------|--------|--------|
| project_name / address / total_housing_units | 296 | 100% |
| status_stage_id | 292 | 99% |
| location_description | 264 | 89% |
| builder_developer | 252 | 85% |
| parcel_boundary_notes | 216 | 73% |
| zoning | 200 | 68% |
| single_family_lots | 144 | 49% |
| zoning_approval_date | 96 | 32% |
| permit_url | 76 | 26% |
| apt_units | 73 | 25% |
| townhouse_units | 51 | 17% |
| permit_application_date | 45 | 15% |
| discovery_source | 29 | 10% |
| matched_existing_id | 5 | 2% |

Approval state: 152 approved, 99 rejected, 45 pending.

Trigger: **on demand only** — a "Start Research" click on a Starbucks site submit, plus the
cron-driven Deep-Sweep chunk loop (`ovis-sweep-tick` → `research_sweep` /
`research_sweep_chunk`). Nothing fires on site-submit creation.

---

## 3. GEOCODING

No generator rows exist, so no generator lat/lng. What exists:

- `municipal_project.centroid geometry(Point,4326)` + `geocoded_address text`. Staging has
  neither — coordinates are computed client-side at approval.
- `google_places_result.latitude / .longitude numeric NOT NULL`, straight from the Places
  API response.

### Google Geocoding API callers

`src/services/geocodingService.ts` — Google primary, Nominatim (OSM) fallback:

```ts
class GeocodingService {
  private readonly GOOGLE_GEOCODING_BASE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
  private readonly NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
  private readonly GOOGLE_RATE_LIMIT_MS = 100;  // 10 req/s
  private readonly OSM_RATE_LIMIT_MS = 1100;    // Nominatim policy
```

It returns Google's precision so callers can down-weight coarse hits:

```ts
location_type?: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE';
```

Key: `import.meta.env.VITE_GOOGLE_GEOCODING_API_KEY` — a **browser-exposed Vite var**, separate
from `VITE_GOOGLE_MAPS_API_KEY`. There is **no server-side geocoding key** and no geocoding
edge function. `scripts/backfillMunicipalProjectCentroids.ts` hits the same REST endpoint
from Node.

Callers: `ResearchRunApprovalModal`, `BatchGeocodingPanel`, `BatchReverseGeocodingPanel`,
`InlinePropertyCreationModal`, `NewMunicipalProjectModal`, `AddressSearchBox`,
`SiteAnalysisPage`, `LocationSection`, `NewPropertyPage`, `CompDetailSlideout`, tours.

Where centroids actually come from: `src/components/shared/ResearchRunApprovalModal.tsx`
geocodes each selected row **in the browser, immediately before** calling the approve RPC:

```ts
// Geocode each selected row before submitting so the new municipal_project
// rows land with a centroid + geocoded_address — without those the
// project never renders on the map layer.
const g = await geocodingService.geocodeAddress(finalAddress);
if ('latitude' in g && 'longitude' in g) { lat = g.latitude; lng = g.longitude; }
...
...(lat !== null && lng !== null ? { latitude: lat, longitude: lng } : {}),
...(formatted ? { geocoded_address: formatted } : {}),
```

The RPC side (`supabase/migrations/20260629150000_approve_writes_centroid.sql`) turns those
into `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`. Rows whose geocode fails land with a NULL
centroid and are invisible on the map. Results are **not cached** — the same address
re-geocodes on every approval pass. There is also a low-precision guard: rows that only
geocode to `GEOMETRIC_CENTER`/`APPROXIMATE` are flagged and skipped by the dup-distance check.

### Edge Function caching patterns to copy

There is no IV-therapy Places layer. Two real caching patterns exist:

1. **`supabase/functions/esri-geoenrich/index.ts`** — the better model for a geocode cache.
   Log-table-as-cache: lat/lng rounded to 6 decimals (~11cm) for the cache key, sorted
   arrays so parameter order doesn't split the key, polygon shapes fuzz-matched by
   centroid, TTL window, `cache_hit` boolean on `esri_enrichment_log`, and a graceful
   degrade — if `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are missing it logs a warning
   and runs uncached rather than failing.
2. **`supabase/functions/streetlight/index.ts`** — dedicated cache tables
   (`streetlight_segment`, `streetlight_segment_metrics`) with upserts, a cache-only read
   endpoint, plus quota/usage accounting (`streetlight_quota_config`,
   `streetlight_usage_log`, `streetlight_user_limit`).

The Places side (`src/services/googlePlacesSearchService.ts`) is **client-side**, not an
edge function: it uses the browser Places SDK and only writes results/spend to
`google_places_result` and `google_places_api_log` (`COST_PER_REQUEST_CENTS = 2`,
budget checks via `ApiUsageStats`). Not a cache-before-call pattern.

---

## 4. DOWNSTREAM

No generator readers exist. For municipal projects:

**Map layer** — `src/components/mapping/layers/MunicipalProjectLayer.tsx` reads the
`municipal_project_v` view, filtering out un-geocoded rows:

```ts
const { data, error } = await supabase
  .from('municipal_project_v')
  .select('*')
  .not('centroid_lat', 'is', null)
  .not('centroid_lng', 'is', null);
```

Renders an AdvancedMarker at the centroid plus a polygon from `geometry_geojson` when drawn.
Labels support a persisted per-project pixel offset (`label_offset_x_px` / `_y_px`) so the
label holds a constant on-screen distance across zoom levels. Stage color/abbreviation is
joined client-side from `project_stage`.

**Exports** — `src/services/municipalProjectKmlExport.ts` emits OGC KML 2.2, one Placemark
per project with `<ExtendedData>` SimpleData for every field and a per-stage `<Style>`.
Driven by `MunicipalProjectExportModal`. `src/lib/excelExport.ts` exists but is used by the
deal/assignment report pages, not by projects.

**No pptx/slide generation anywhere in the repo.**

**Other readers** — `MunicipalProjectSlideout`, `MunicipalProjectDrawer`,
`MunicipalProjectInlineFilters`, `MunicipalUnitsScreenshotModal`, `PastResearchRunsPanel`,
`ResearchRunApprovalModal`, `municipalImportService`.

### Ordering / ranking logic that exists

- `research_checklist_item.priority` — int, 1 = municipality closest to the site;
  index `(research_run_id, priority)`. This is the only distance-ordering in the research path.
- `find_analogous_stores` RPC (`SiteAnalysisPage`) ranks by `match_score` with a `distance` field.
- Dedupe proximity math in `ResearchRunApprovalModal`, down-weighted by geocode precision.
- **No pin numbering, no cluster grouping, and no distance-from-site sort on projects themselves.**
  Note for any new layer: `MarkerClusterer.clearMarkers()` leaves glyphs behind — use
  `clusterer.setMap(null)`.

---

## Implications for building generators

A generators feature is a greenfield build. Reusable pieces:

| need | reuse |
|------|-------|
| site-scoped run + staging + approve/reject | `research_run` / `municipal_project_staging` / `approve_research_staging_rows` |
| row shape (name, address, lat/lng, types, provenance, dedupe key) | `google_places_result` |
| geocoding with precision + OSM fallback | `geocodingService` (but it's browser-side and uncached) |
| server-side cached external API | `esri-geoenrich` (rounded-coord cache key, TTL, graceful degrade) |
| spend cap / usage accounting | `google_places_api_log` + `streetlight_usage_log` |
| map rendering + KML export | `MunicipalProjectLayer` + `municipalProjectKmlExport` |

Two gaps worth deciding early:

1. **Where geocoding runs.** Today it's in the browser on an exposed key with no cache. A
   generators build that geocodes dozens of schools/employers per site should move this to
   an edge function with the `esri-geoenrich` cache pattern and a server-side key.
2. **What generators link to.** `municipal_project` deliberately has no `site_submit_id` —
   it hangs off a municipality and reaches the site only through `source_research_run_id`.
   Generators are inherently site-relative (distance to *this* site drives ranking), so they
   likely want a direct `site_submit_id` FK plus a stored distance, which is a different
   shape from the existing precedent.
