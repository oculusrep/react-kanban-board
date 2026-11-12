# Municipal project placement: unplaced state + parcel boundaries

**Built 2026-09-20** on `feature/research-cluster-grouping`. Migrations applied to
the shared production database and recorded. Not merged, not pushed.

Supersedes the "what it would take" sections of
[PARCEL_ID_GEOCODING_FEASIBILITY.md](PARCEL_ID_GEOCODING_FEASIBILITY.md) and
[PARCEL_POLYGON_SCOPE.md](PARCEL_POLYGON_SCOPE.md), which remain the record of why
the design is shaped this way.

---

## The rule

**A coarse geocode is not a location.** A county, city or zip centroid, or a road
segment centre, is not where the project is — writing it as the project's
coordinate puts a pin somewhere it isn't, reads as real, and silently poisons
proximity dedupe. Before this, four projects sat stacked on the Forsyth County
centroid and three on Cumming's.

So: **UNPLACED is a first-class state.** `centroid IS NULL` is the single source
of truth; `unplaced_reason` says why. An unplaced record is a **complete record**
in every other respect — same card, every field — and is placed by drawing a
boundary, fetching the parcel, or dropping a pin.

---

## Schema

`municipal_project`, plus the same `parcel_numbers` work on `_staging`:

| column | meaning |
|---|---|
| `centroid_source` | `address_geocode` \| `polygon` \| `manual_pin`. NULL exactly when unplaced |
| `unplaced_reason` | `admin_area_centroid` \| `road_centroid` \| `geocode_failed` \| `no_address`. NULL exactly when placed |
| `geometry` | widened `POLYGON` → **`MULTIPOLYGON`** |
| `geometry_source` | `hand_drawn` \| `parcel_fetch` \| `parcel_fetch_adjusted` |
| `geometry_source_parcels` | the ids that **actually resolved** — not `parcel_numbers`, which still lists re-platted ones |
| `geometry_fetched_at` | which nightly fabric it came from. Diagnostic only |
| `geometry_stated_acres` / `geometry_computed_acres` | the acreage cross-check inputs |
| `geometry_needs_review` | set when variance exceeds the tolerance |
| `geometry_reviewed_at` | first human look. Drives dashed → solid |

Two CHECK constraints hold the model together, and they are the reason two latent
bugs surfaced immediately rather than in production:

```sql
-- placed (centroid + source, no reason) XOR unplaced (neither, with a reason)
-- and: a shape must say where it came from; provenance never outlives the shape
```

`municipal_project_v` adds `is_unplaced`, `geometry_area_variance_pct` and
`geometry_unreviewed`. It was rebuilt from its **live** `pg_get_viewdef` — it
enumerates columns (expanded from `mp.*` at creation), so new columns are
invisible until it is recreated. Its grants were restored explicitly, since
`DROP VIEW` discards them.

## The write path is in the database

`set_municipal_project_polygon`, `set_municipal_project_pin`,
`clear_municipal_project_polygon`, `mark_municipal_project_geometry_reviewed`,
`set_municipal_project_polygon_from_parcels`. No caller can reintroduce a
fabricated coordinate, because:

- **The pin of a project with a boundary is always `ST_PointOnSurface`** of it —
  guaranteed inside the shape. The vertex average this replaced is not a centroid;
  on a concave or holed parcel it lands outside.
- **A save that drops interior rings is REJECTED.** Parcel `161-001` has two, and
  terra-draw cannot represent them. The editor also refuses to *open* a holed or
  multipart boundary rather than silently discarding what it can't hold. A
  rejected save is recoverable; lost holes are not.
- **Editing a fetched boundary flips it to `parcel_fetch_adjusted`**, permanently.
  It never reverts, because it is no longer what the fabric says.
- **An invalid polygon is rejected, not `ST_MakeValid`'d** — repairing a
  self-intersection silently changes the shape the user drew.
- **Moving the pin by hand is refused while a boundary exists.**

## Acreage validation

Every write with a stated acreage compares `ST_Area` of the boundary against the
figure parsed from `parcel_boundary_notes` (`extract_stated_acres`, which returns
NULL for a *range* — there is no single figure to check). Beyond **5%** the record
is flagged, and the slideout shows the variance either way.

This is the retired-parcel-id detector, and it works. Run live against all seven
unplaced Forsyth records carrying parcel ids:

| project | computed | stated | variance | |
|---|---|---|---|---|
| Grand Communities ZA4198 | 19.44 | 19.469 | −0.1% | ✅ |
| Cameron LR Development | 32.19 | 31.90 | +0.9% | ✅ |
| David Pearson Communities | 146.21 | 147.687 | −1.0% | ✅ (4 parts) |
| Copper Mill at Pilgrim Mill | 58.82 | 60.25 | −2.4% | ✅ |
| EC New Vision Senior Living | 18.18 | 68.012 | **−73.3%** | ⚠ flagged |
| Market Place (Providence) | 64.79 | 93.393 | **−30.6%** | ⚠ flagged |

Five agree within 2.4%; the two that don't are parcels missing from the set.
David Pearson produced a **4-part MultiPolygon** — the old `POLYGON` column could
not have stored it.

## Parcel fetch

`src/services/parcelFabric.ts` is a **per-county registry**, not a general GA
parcel geocoder — there is no statewide layer to build one on. Forsyth is the
first entry. Behind `VITE_PARCEL_FETCH_ENABLED`.

- **`f=geojson`, never `f=json`** — verified the two wind rings oppositely, so the
  Esri format inverts holes.
- **LIKE-from-runs, then verify normalized** — the layer stores `PARCELID`
  space-padded (`"220   017"`) and rejects `REPLACE()` in a `where` clause.
  Normalization is lossless: 105,137 distinct raw ids → 105,137 normalized.
- **Union in PostGIS**, because `ST_Union` dissolves shared boundaries. Convex
  hull is not a fallback: 5,302 acres vs 505 true on a disjoint pair.
- **No refetch, by design.** Fetched once, on request. The fabric refreshes
  nightly and a re-plat would overwrite a correct boundary.
- Stated acreage is parsed in SQL, not mirrored in TypeScript.

## `parcel_numbers`

Populated from `parcel_boundary_notes` prose, and kept in step by a trigger. Two
things a naive regex got wrong, both found on real data first:

1. It matched non-parcels — `Plat Book 222 Pages 233-261`, `Approx 312-318 acres`,
   the address `11-165 Willow Bend Road`. So a match only counts inside a
   `;`-delimited clause that actually says *parcel* or *PIN*.
2. **Id format is per-county, like the endpoints.** Forsyth `080-264` / `C37-002`;
   Macon-Bibb `I008-0229`; Bibb `09105 000001`. One loose pattern matches junk
   instead. An unrecognized format yields nothing rather than a wrong guess.

Backfill: 104 staging rows (195 ids), 46 committed (125 ids). The 16 pre-existing
CSV-imported values (Columbia County's `WN03 001`, ampersands and all) are left
untouched.

## Style

A fetched boundary is **dashed until first review, in the same colour as a
hand-drawn one** — it is if anything *more* trustworthy, so the dashes mean "nobody
has confirmed this yet", not "suspect". Google Maps cannot dash a `Polygon`
outline (`icons` is a `Polyline` property), so the polygon's stroke is hidden and
a dashed polyline is traced over each ring.

## Backfill outcome

Every committed address was **re-geocoded** to drive this, rather than guessing
from coordinates. Of 352:

- **252** precise — untouched
- **76** imprecise but already carrying a hand-drawn polygon → pin **re-derived**
  from the shape. All 76 verified inside their polygon. This is an improvement,
  not a loss
- **24** genuinely unplaced — 9 `admin_area_centroid`, 15 `road_centroid`

**Zero stacked pins remain.** All 24 unplaced records verified complete (name,
units, address, municipality).

## Two bugs caught before anyone hit them

Both were introduced by this work, found by testing the shapes real callers use,
and fixed in their own migrations:

1. `20260920100000` — the `parcel_numbers` trigger assigned `extract_parcel_numbers()`
   unconditionally, and it returns NULL when it finds nothing. The column is
   `NOT NULL DEFAULT '{}'`, so **every insert with no parcel id in its notes
   failed**. `'{}'`, not NULL, is how "none" is spelled.
2. `20260920103000` — `approve_research_staging_rows` supplied `centroid` without
   `centroid_source`, violating the new placement CHECK, so **every research
   commit failed**. Rebuilt from the **live** `pg_get_functiondef`, not the old
   migration file; verified it still carries the keep-both collision guard, the
   discovery-source override semantics and the merge fold-in.

## Not built

- **Refetch.** Deliberate, per the design above.
- **Counties other than Forsyth.** Adding one is an entry in `COUNTY_ADAPTERS`.
  Bibb, Columbia, Gwinnett, DeKalb, Jackson and Decatur have verified endpoints;
  **Hall — the largest research footprint — has none.**
- The staging-side agent contract still doesn't emit `parcel_numbers`; the trigger
  covers it for now.

## Not yet clicked through in a browser

Typechecks clean and `vite build` succeeds. Every database behaviour above was
exercised against production data inside a transaction and rolled back, and the
Forsyth fetch was run end-to-end against the live service. The **UI** — the
unplaced panel, pin-drop mode, the dashed stroke, the acreage banner — has not
been driven by hand. That is the next thing to do.

## Status check (2026-11-12)

- **Forsyth fetch:** service up (105,620 parcels, anonymous query OK). 13 records carry
  `geometry_source = 'parcel_fetch'` (8 fetched 2026-09-21, 5 on 2026-09-28); none since.
  `VITE_PARCEL_FETCH_ENABLED` exists in Vercel for Development, Preview and Production (added ~52
  days before this check); its value is encrypted and was not read.
- **Unmerged related work:** `feature/geocode-proxy` (da5290e7, 2026-10-31) — browser geocoding via
  an authenticated edge function; built, awaiting the four-persona localhost test. No unmerged
  parcel-boundary branches or stashes.
- **Adding the other six "usable" counties (Gwinnett, DeKalb, Bibb, Columbia, Jackson, Decatur):**
  their endpoint URLs were never written down, only the field names — each has to be re-found.
  `fetchParcelPolygons` hardcodes `STATEDAREA` in `outFields` (a Forsyth column), so a shared
  change is needed first. Then per county: CORS from the browser, the stored ID format → a
  `whereFor`, city-name matching, a live test with the acreage check. Estimate ~1–2 h shared +
  ~1–2 h per county ≈ 1–1.5 working days for all six.
- **Payoff today is small:** committed `municipal_project` rows with parcel ids outside
  Forsyth/Cumming — Macon-Bibb/Bibb 14, Columbia 1, Jackson 0; no Gwinnett/DeKalb/Decatur records
  at all. The biggest hand-draw counts (Hall, Winder/Barrow, Hiram, Dallas, Paulding) have no public
  parcel endpoint. Fetch also needs the record to carry parcel ids.

## Henry County adapter (2026-11-12)

- **Parser:** migration `20261112075338_parcel_id_henry_format` adds Henry's shape
  (`[0-9H][0-9]{2}[A-Z]?-?[0-9]{8}`: 128-02065000, H04A01001000, 077A01084000) to
  `extract_parcel_numbers()`, from the live definition. A regression check over every staged and
  committed row showed only additions: the Henry row, plus one Cobb row whose 11-digit PINs now
  match too. That Cobb row wasn't backfilled. Backfill was Henry-only: 1 staging row and 1
  committed row (Davis Lake Road, `128-02065000` and `128-02066000`). The other Henry records cite
  land lots or acreage only, never a parcel id. Henry's layer does carry `LANDLOT_1` /
  `LANDDISTRI`, if land-lot lookup is ever worth building.
- **Adapter:** `arcgis.co.henry.ga.us/server/rest/services/Parcels/MapServer/12`, `PARCEL_NO`.
  It matches Henry County, McDonough, Stockbridge, Hampton and Locust Grove.
- **Slow server:** the WAF-fronted server hangs. Observed 2026-11-12: 0.8 s, 60 s with an HTTP 200
  `{"error":{"code":503,"message":"…Wait timeout…"}}`, a 60 s empty body, then 22 s. Adapters now
  take `timeoutMs` / `retries`; Henry gets 75 s and 1 retry. A timeout, network error, 5xx, or an
  ArcGIS error body with code ≥ 500 or "timeout" is retried. The slideout shows the attempt and
  offers Cancel. Cancel only abandons the county fetch; once polygons are in hand the write
  completes.
- `outFields` no longer hardcodes `STATEDAREA` (Forsyth-only); it's `extraFields` per adapter.
- **Verified:** Davis Lake Road fetched with the adapter's query → 2 polygons. The RPC (rolled
  back) gave 47.01 ac computed vs 47.99 stated (2.0%, not flagged) and a MultiPolygon.
- **Jenkinsburg is in Butts County** (TIGERweb: the city polygon is within Butts and only touches
  Henry along the county line). Butts has no county-published parcel layer. The only public one is a
  third-party AGOL snapshot, `services6.arcgis.com/NJH5XZkcw7MLsnAI/arcgis/rest/services/Parcels_Butts_County_GA/FeatureServer/0`
  (13,065 parcels, `GSI_PIN` like `00010-001-000`, last edited 2024-09-13, owner "VerticalAccuracy"),
  which covers Jenkinsburg. Not built. The parser doesn't know the 5-3-3 shape either.

## Hall County adapter (2026-11-12)

- **Parser:** migration `20261112083634_parcel_id_hall_format` (built from the live definition,
  including Henry). Hall PIN = 5-digit map + (space | sub-map letter) + 6-digit parcel + optional
  1–2 letter suffix. Hall sources state the map once and list the rest bare ("15048 000008, 000007,
  000025C"); a bare parcel now inherits the clause's last map, and ranges of ≤ 25 expand
  ("09108 000107-000109"). "(pt.)" is stripped first. A regression check over every staged and
  committed row: zero changes outside Hall, and no row lost an id.
- **Backfill (superset-only, skips parcel-fetched boundaries and in-flight runs):** 30 staging + 12
  committed rows. Committed Hall: 17 records / 33 ids → 22 records / 59 ids.
- **Resolution:** all 59 committed ids resolve on the Hall layer (22/22 records complete); 19 of those
  records have no polygon yet.
- **RPC dry run (rolled back) on those 19:** 9 within tolerance of the stated acres, 4 flagged
  +5.3% to +8.9% (each over-shoots, typically where a cited parcel is "(pt.)"), and **6 had no stated
  acres parsed**, so they weren't checked. The acreage parser misses "84.25 approx. acres",
  "29.52-acre parcel" and "combined 116.47± acres". One of the 6, 5401 Old Winder Hwy, is a
  "(partial)" parcel whose project is 84.30 ac of a 278 ac tract; the fetch draws the whole
  273.78 ac tract and nothing flags it.
- **Adapter:** `services1.arcgis.com/3t0UAc8xSMWWaD2c/.../parcel_owner_public/FeatureServer/0`, `PIN`.
  It matches Hall County, Gainesville, Flowery Branch, Oakwood, Lula, Clermont and Gillsville
  (not Braselton). Data last edited 2025-07-22.

## Acreage reader + partial-parcel flag (2026-11-12)

Migration `20261112100659_parcel_fetch_acreage_and_partial_flag`, built from the live definitions.

- **`extract_stated_acres`** now reads "84.25 approx. acres", "29.52-acre", "combined 116.47± acres",
  "±", singular "acre" and thousands separators. A figure tied to "combined" beats an earlier
  per-parcel figure. Ranges still return NULL. Regression over committed records: 8 went from NULL
  to a value; one changed (5.303 → 5.529, the "combined" total over the first parcel's acreage).
  It's used only by the fetch RPC.
- **`cites_partial_parcel(text)`** matches "(pt.)", "pt.", "partial", "portion of", and "part of
  [a/the] [tax] parcel". Bare "portion" / "part of" were dropped after they hit "western portion",
  "apartment portion" and "Part of broader PRD". It now matches 11 committed notes, all genuine.
- **`set_municipal_project_polygon_from_parcels`** sets `geometry_needs_review` whenever the notes cite
  a partial parcel, whatever the acreage, and returns `partial_parcel`. The slideout says to trim.
- **Grants:** `set_municipal_project_polygon`, `set_municipal_project_polygon_from_parcels` and
  `cites_partial_parcel` were executable by anon (SECURITY DEFINER writers). They're now
  authenticated + service_role only; an anonymous HTTP call gets 42501 / 401.
- **Hall dry run (19 records, rolled back):** the 6 previously unchecked records all validate.
  Taylor Morrison 1.7% and Revive Land Group 1.7% pass. Caneybrooke +5.8%, Bolding Road +5.5% and
  BCBTR +8.9% flag. 5401 Old Winder Hwy flags at +224.8% (273.78 vs 84.30) AND as a partial parcel.
  Overall: 8 pass, 11 flagged. Of the flagged, 6 cite a partial parcel (Yellow Creek Rd flags on
  that alone at 0.2%) and 5 are acreage-only, at +5.3% to +6.3%.
