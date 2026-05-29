# Starbucks Site Analysis

A tool for evaluating a **proposed Starbucks site** by comparing it to the most
demographically **analogous existing stores** of the same type, plus the competitive
density (nearby Starbucks) around it.

Reached at **`/site-analysis`** (Reports page → ☕ Starbucks Site Analysis).

---

## What it does

Given a subject location (an existing `site_submit`, or a typed address) and a store
type (DT / Cafe / DTO), it:

1. **Enriches** the subject with ESRI demographics for four trade areas — **1mi ring,
   3mi ring, 5min drive, 10min drive** — for 5 metrics: population, median age, median
   HH income, "some college or higher" % (of pop age 25+), and daytime-worker employees.
2. **Finds the top 3 analogous stores** of the same type (and, by default, same state)
   ranked by demographic similarity.
3. **Counts nearby Starbucks by type** (DT/Cafe/DTO) within each of the four areas, for
   the subject and for each analog (so saturation is comparable side by side).
4. Shows each location's dominant **ESRI Tapestry segment** (with an optional
   "same segment only" filter).

Output is a comparison table: subject in column 1, the 3 analogs beside it, every data
point as a row grouped by trade area, plus a "Nearby Starbucks (count by type)" table.

---

## How the match score is calculated

The score (0–100) comes from `find_analogous_stores`:

- Compares **20 data points** = 5 metrics × 4 trade areas between the subject and each
  candidate store.
- Each gap is **standardized**: `(store value − subject value) ÷ stddev of that metric
  across the candidate pool`. Standardizing puts every metric on equal footing (so
  population in the tens of thousands doesn't dominate median age) and weights all 20
  equally.
- The standardized gaps are combined into a single **Euclidean distance** (in
  standard-deviation units): `distance = sqrt(Σ (standardized gap)²)`.
- Mapped to a score: `score = 100 / (1 + distance/√20)`. So **100 = identical profile**,
  ~50 ≈ one standard deviation off per metric on average, ~33 ≈ two.
- Candidates are ranked by smallest distance; top N (default 3) returned.

---

## Architecture

### Data
- **`starbucks_store_demographics`** (1:1 with `starbucks_store`, keyed by `store_number`):
  the 20 metrics + Tapestry (`tapestry_code/name/lifemode`) + provenance (`enriched_at`,
  `esri_raw`). RLS-gated by `user_has_starbucks_access()`.
- **`starbucks_store.state`**: backfilled from the `market` label (e.g. "…, GA" → GA).
  Used for the same-state filter. ~94% GA, plus FL (Tallahassee).

### Functions (Postgres RPCs, all `SECURITY INVOKER`)
- **`find_analogous_stores(p_subject jsonb, p_store_type, p_state, p_limit, p_tapestry_code)`**
  — the matcher (see scoring above). Returns store identity, lat/lng, Tapestry,
  match_score, and demographics. Optional same-state and same-Tapestry filters.
- **`count_nearby_stores_by_type(p_lat, p_lng, p_iso_5min, p_iso_10min, p_exclude_store)`**
  — DT/Cafe/DTO counts within the rings (PostGIS `ST_DWithin`) and within the drive-time
  isochrones (`ST_Intersects` on the GeoJSON polygon). Used for the **subject** (live
  isochrones from the enrichment call).
- **`count_nearby_for_store(p_store_number)`** — same counts for an existing store, using
  its **stored** isochrones from `esri_raw` (so analogs cost no extra ESRI calls).

### Edge function
- **`esri-geoenrich`** (shared with property enrichment): `include_education` flag adds
  the education variables; the drive-time call now also returns `isochrones` (GeoJSON
  polygons) derived from the NetworkServiceArea geometry it already fetched. Backward
  compatible — the property flow is unaffected when the flag/keys aren't requested.

### Frontend
- **`src/pages/SiteAnalysisPage.tsx`** — the whole tool. Route in `App.tsx`, Reports-grid
  card in `ReportsPage.tsx`.

### ETL
- **`scripts/enrichStarbucksDemographics.ts`** — batch-enriches all stores
  (`bun scripts/enrichStarbucksDemographics.ts`). Re-run after a new ESRI data vintage or
  when stores are added. Note: a server-side script invoking the `verify_jwt` edge
  function must use the **legacy anon JWT** for the function call and the `sb_secret_`
  service key for DB writes (the new secret key is not a JWT).

---

## Permissions

- Gated by **`can_view_site_analysis`** (UI: Reports card + page). Registered in
  `src/types/permissions.ts` (category "Starbucks Layer"), so it appears in the User
  Management role/user editors.
- **Coupling:** the underlying store/demographic *data* is still RLS-protected by
  `can_view_starbucks_layer`. Anyone granted `can_view_site_analysis` today also has
  `can_view_starbucks_layer`, so it works. If `can_view_site_analysis` is ever granted to
  a user **without** the layer permission, the report loads but returns **empty** (DB
  blocks the data). To decouple, extend `user_has_starbucks_access()` to also accept
  `can_view_site_analysis`.

---

## Data-source caveat (ESRI vs Sites USA)

Numbers come from ESRI's **"Esri Updated Demographics"** collection — a different dataset
from **Sites USA** (also sold via ESRI's platform). They will not match a Sites USA
report. Known differences observed:
- **Income:** ESRI *median* runs ~⅓ below the Sites USA figure; the gap is a real
  cross-vendor difference (it does not fully reconcile by switching ESRI median↔average).
- **Population:** matches closely where geometry is identical (3mi ring), diverges on the
  1mi ring (apportionment) and most on drive-times (different routing engines).
- **Employees:** ESRI is *daytime working population*; Sites USA "Total Employees" is an
  establishment count — different definitions.

What matters for this tool: it uses the **same ESRI source for the subject and all 234
stores**, so comparisons are internally apples-to-apples even if absolute numbers differ
from a Sites USA package.

---

## Future refinements

- **Add traffic (next iteration).** Incorporate road traffic — StreetLight **AADT** on the
  frontage road(s) — as an analog dimension, and surface it in the comparison. StreetLight
  is already integrated in OVIS; AADT likely requires per-site API calls (quota/cost), so
  scope the credit usage. Traffic is especially load-bearing for **DT** site selection and
  is the most-requested next signal.
- **MCP tool wrapper** — expose `find_analogous_stores` (+ the count RPCs) as an OVIS MCP
  tool so an agent can answer "top 3 analogous stores to this address."
- **Decouple the permission** from `can_view_starbucks_layer` at the data layer (see
  Permissions) if the report should be grantable independently.
- **Optional display tweaks** to align with Sites USA packages (show average income,
  establishment employees) — cross-vendor numbers still won't match exactly.
