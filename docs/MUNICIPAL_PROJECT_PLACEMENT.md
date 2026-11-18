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

## Coweta County adapter (2026-11-13)

- **Parser:** migration `20261113062803_parcel_id_coweta_format` (built from the live definition,
  including Henry and Hall). Coweta `ParcelNumber` was profiled over all 66,099 rows. 66% are
  3-part, district / map / parcel, padded with a double space: `162  1259 001`, `N12A 1234 001A`.
  The parser reads that form with any run of spaces or dashes between the parts (`162-1259-001`,
  `163 1261 002`) and stores it single-spaced. The 2-part form (`075A      012`, 34% of parcels) is
  **not** read. It's the same shape Dublin, Elbert County and Grovetown records use, and reading it
  would fill `parcel_numbers` outside Coweta. No Coweta record cites a 2-part id today.
  Regression over every staged and committed row: only the 3 Coweta rows changed, and no row lost an id.
- **Double spaces:** they never reach the query. `likeFromRuns` splits on any separator run
  (`ParcelNumber LIKE '162%1259%001'`), and the result is checked with the normalized compare.
  Stripping non-alphanumerics is lossless on Coweta: 65,417 distinct ids → 65,417 normalized, zero
  collisions.
- **Adapter:** `services1.arcgis.com/AaPyNbrJpNGryRqh/.../WeeklyUpdate_WinGapParcels/FeatureServer/0`,
  `ParcelNumber`, refreshed weekly. It matches Coweta County, Newnan, Senoia, Haralson, Grantville,
  Moreland, Turin and Sharpsburg. Haralson straddles Meriwether, so a parcel on that side comes back
  "missing". Palmetto and Chattahoochee Hills aren't matched (mostly Fulton).
- **Records (Coweta County 7, Senoia 5 committed; 38 staged incl. 1 Haralson):** only **2** cite
  parcel ids, both Senoia:
  - *Templar Development Subdivision* (committed): 3 ids, backfilled. **3/3 resolve.** RPC dry run
    (rolled back): 25.97 ac vs 29.58 stated, −12.2%, flagged. The note says "plus two existing
    city-limit parcels" that it doesn't name, which accounts for the gap. It already has a
    hand-drawn boundary (25.42 ac), so the fetch button doesn't appear (fetch once).
  - *141 South*: the ids live only on merged staging row `4fda4623` (backfilled). The committed
    record `d4549c22` has none. **4/4 resolve.** Dry run: 87.87 ac vs 82.10 stated, +7.0%, flagged.
    Already hand-drawn (128.68 ac, drawn to the ~152 ac DRI footprint).
  - Net: **0 records gain a polygon from this.** The other 48 Coweta/Senoia/Haralson records state
    acreage, a land lot ("Land Lot 135 of the 1st District") or nothing. The fetch only helps once
    research starts capturing Coweta parcel ids.

### 141 South boundary replaced (2026-11-13)

`d4549c22`: the hand-drawn boundary (128.68 ac, drawn to the ~152 ac DRI footprint) was replaced by
the union of its 4 parcels from merged staging row `4fda4623`: 87.87 ac vs 82.10 stated, +7.0%.
`parcel_numbers` was set first. It is `parcel_fetch`, `geometry_needs_review = true` (dashed), and the
pin is inside the shape. The old shape wasn't snapshotted and `municipal_project` keeps no geometry
history, so a database backup is the only way back to it. Templar was left hand-drawn.
Grants: migration `20261113152028` revoked PUBLIC + anon EXECUTE on `extract_parcel_numbers` and
`extract_stated_acres`. Verified with an anonymous RPC call (42501), and by impersonating
authenticated and service_role (both still parse).

### Coweta/Senoia source audit (2026-11-13), report only

Corrects the count above: there are 62 rows, not 50 (12 on the map, 50 staged). **58 have no parcel
ids** (10 on the map, 48 staged). By a keyword match on `source` (minutes, agenda, BOC, staff
report, plat, Accela, CivicClerk, DRI, annexation report, REZ/LDP numbers), **7 of the 10 on the map
and 22 of the 48 staged cite a government document.** The rest cite builder sites, MLS, blogs and
news.

Five cited documents were opened (CivicClerk API: `cowetacoga.api.civicclerk.com/v1/Events/{id}`,
files via `Meetings/GetMeetingFileStream(fileId=…)`):

| Record | Document | States parcel ids? | Resolve on Coweta layer |
|---|---|---|---|
| Freedom Land REZ 25-05 (`f19f177a`) | BOC 2025-08-19 packet, staff memo | **Yes, 29** (`111-6001-082` … `-032`), 101.36 ac | 29/29 |
| Benister REZ 24-003 (`75755c3e`) | BOC 2025-09-16 packet, staff memo | **Yes, 4** (`154-1220-001 {Partial}`, `155-1217-014`, `155-1224-002`, `155-1224-009`), 1,543.23 ac | 4/4 (tax-roll 1,558.73 ac) |
| Pollard / Silver Springs (`87f6cc3d`) | BOC 2025-04-15 packet item 11 (the cited AN 004-25 link, senoia.com/media/14631, is 404) | **Yes, 3** (`157 1213 001`, `157 1213 009`, `157 1212 005`), 108.14 ac | 3/3 (tax-roll 108.17 ac) |
| Fox Hall Phase 5 (`49463114`) | BOC 2024-09-17 packet, deed + plat + PT-61s (scanned) | Only `1401135022` on the PT-61 conveying roads/open space to the county: a 0 ac parcel, not the phase. The deed describes "Land Lot 135, 1st District, Lots 31–48, 93–103, 131–134" | not a project boundary |
| Monarch at the Creek (`b96280c3`) | Accela LDP-26-006 | Couldn't open. The deep link returns Accela's error page, even with a session cookie | — |

**Verdict: the agent is missing ids that government sources state.** 3 of the 4 documents that
opened list parcel ids in the staff memo header ("Tax Parcel(s): …" / "Tax ID #: …"), all 3-part
dashed or spaced, and every one resolves. That's a research-prompt fix (Market Research), not a
coverage ceiling.

Side notes for the parser: Coweta packets also write `075A-042` (the 2-part form this parser
deliberately doesn't read) and run ids across line breaks (`111-6001-` / `078`). The fabric also
carries `SubdivisionName` / `SubdivisionPhase` (e.g. "Fox Hall 6": 32 parcels), which could place
platted subdivisions with no id at all. Not built.

## Parcel-adapter check on research runs (2026-11-14)

The run and sweep approval view now shows one line for each county with no
parcel adapter:

> Newton County — no parcel adapter (5 records with parcel IDs)

Each line has a **Copy cc prompt** button.

- `get_research_parcel_counties(run_ids)` (migration 20261114072811) maps the
  run's checklist municipalities to counties. A city maps to the county that
  contains its centroid. It counts the non-rejected staged records with
  parcel IDs per county and returns up to 3 sample IDs.
- The view compares each county with `COUNTY_ADAPTERS` and
  `COUNTIES_WITHOUT_PARCEL_SERVICE` (`src/services/parcelFabric.ts`). It shows
  a line only for counties that have neither and have at least one record
  with parcel IDs. It's read-only and never blocks a run.
- The check runs when the view opens, not once at run start. A county stops
  being flagged as soon as its adapter, or its "none" entry, ships.
- The prompt text is in [PARCEL_ADAPTER_CC_PROMPT.md](PARCEL_ADAPTER_CC_PROMPT.md),
  between the PROMPT START and PROMPT END markers. It's bundled with Vite
  `?raw`, so editing it needs a deploy but no code change.

## Server-side parcel fetch as a post-run step (2026-11-14)

The post-run pipeline is now dedupe → Gemini → dedupe → **parcel fetch** →
"Sweep ready".

- **Shared code.** The adapters and the fetch moved to
  `supabase/functions/_shared/parcel-adapters.ts`. `src/services/parcelFabric.ts`
  re-exports them, so the browser button and the server step use the same
  code, including Henry's 75 s timeout and retry. **New adapters go in the
  shared file.**
- **Staging boundaries.** `municipal_project_staging` now has `geometry` and
  the `geometry_*` columns, plus `parcel_fetch_status` / `_note` / `_at`
  (migration 20261114081656).
- **The rules** live in `set_staging_polygon_from_parcels`, a staging twin of
  the button's RPCs:
  - union of multi-parcel records
  - valid MultiPolygon only
  - acreage validation, flagged when outside tolerance
  - partial-parcel flag
  - never replace an existing boundary
- **Fetch status** is one of `resolved`, `partial` (some IDs missing),
  `none_resolved`, `no_adapter` or `error`. Records matched to a committed
  record are skipped, because approve never carries geometry on that path.
- **On approve** the boundary carries over and the pin is placed inside it
  (`ST_PointOnSurface`, `centroid_source = 'polygon'`, ahead of any geocode).
  It stays dashed until reviewed. On a fold-in, an existing project only takes
  the boundary if it has none.
- **The summary** adds "🗺 N of M ready records have boundaries" to the header
  and the Telegram message.
- **First run, 2026-11-14:**
  - Alcovy: 5 records with parcel IDs, all in Newton County, which has no
    adapter.
  - Senoia: 1 record. Georgian Pines' `172 1340 001` isn't in the current
    Coweta fabric, where map 172-1340 starts at 003, so it was likely
    re-platted.

## Newton County: no public parcel service (2026-11-14)

The task was to add an adapter for Newton County (Covington, Oxford and the
unincorporated county) for sweep 607d4cc7, which staged 5 records with parcel
IDs. **Not built:** Newton County publishes no anonymous parcel service.

**What was checked:**

- **County-run ArcGIS Server, `gis.ncboc.com`.** The parcel layer is
  `/arcgis/rest/services/Public/Newton_Parcels/FeatureServer/0`, registered on
  ArcGIS Online by GDITAdmin as "Parcels - GA - Newton County". It answers
  **499 Token Required**.
  - So does the whole `Public` folder, along with Zoning, FLUM, Overlays,
    Hosted, Utilities and most others.
  - Only `County/City_Limits`, `County/Newton_County_Boundary`,
    `County_Public_Works/*`, `County_Stormwater` and `FEMA/FEMA_Flood` are
    anonymous.
- **ArcGIS Online.** There's no county-published parcel layer. The
  "Newton County GIS" results belong to Newton County, **Texas** (DETCOG), and
  `aroGeoAdmin/Newton_Parcels` is Newton County, **Missouri** (−94°, 36.7°).
- **The county website and the permit portal** (`newtondevelopment.ncboc.com`).
  Neither page or its scripts reference a parcel map service. qPublic is a
  property viewer, not a service you can query.
- **The only public Newton County, GA layer is a third-party snapshot:**
  `services1.arcgis.com/qTQ6qYkHpxlu0G82/arcgis/rest/services/Newton_Parcels/FeatureServer/0`.
  - Owner `mhackman_UofMD`, last edited **2022-02-26**, 45,755 parcels,
    State Plane GA West (2240).
  - `PARCEL_NO` is like `00270-00000-127-000`, and `DXF_TEXT` holds the short
    form our records use, like `27-127`.
  - Our 3 test IDs against it: `27-127` was found (36.08 ac, Covington),
    `27-136` was found (1 ac, Covington), and `005-002` was **missing**. That
    one has no map digits, so it is probably a Covington city-format ID, not
    a county one.
  - It's not built because it's 4+ years stale: a new subdivision's re-plat
    would come back "missing" or show the pre-plat tract.

**Recorded:** Newton County is in `COUNTIES_WITHOUT_PARCEL_SERVICE`
(`supabase/functions/_shared/parcel-adapters.ts`), so the research run and
sweep views stop flagging it. If the county ever publishes the layer
anonymously, or grants OVIS a token, the adapter is a few lines: field
`DXF_TEXT` (or `PARCEL_NO`), via `likeFromRuns`.

## Newton County: the 2022 snapshot as a fallback adapter (2026-11-14, supersedes the "none" above)

Mike chose to use the third-party snapshot rather than record "none". Newton
County is out of `COUNTIES_WITHOUT_PARCEL_SERVICE`, and its adapter in
`supabase/functions/_shared/parcel-adapters.ts` is set up as follows.

**Adapter:**

| Setting | Value |
|---|---|
| Layer | `services1.arcgis.com/qTQ6qYkHpxlu0G82/.../Newton_Parcels/FeatureServer/0` |
| ID field | `DXF_TEXT`, via `likeFromRuns` + normalized compare. Values look like `27-127`; Covington city parcels look like `CO1-1-1`. |
| Matches | Newton County, Covington, Oxford, Porterdale, Mansfield, Newborn. Social Circle straddles Walton County and isn't matched. |
| Low-trust settings | `sourceVintage: '2022 third-party snapshot'`, `maxAcreageVariancePct: 15`, `requireStatedAcres: true`, 1 retry |

**New adapter flags** (migration 20261114092015):

- `sourceVintage`, `maxAcreageVariancePct` and `requireStatedAcres` are passed
  to both RPCs: the browser button's `set_municipal_project_polygon_from_parcels`
  and the post-run `set_staging_polygon_from_parcels`.
- **Acreage validation is mandatory.** With no stated acres, nothing is saved
  (`no_stated_acres`). If the fetched acreage is more than 15% off, nothing is
  saved either and the record is marked `snapshot_mismatch`.
- A saved boundary gets `geometry_source_vintage`, plus a dated line in the
  record's notes. Approve carries it over, and `municipal_project_v` exposes
  it.
- It shows as a tag on the approval card ("🗺 BOUNDARY · 2022 THIRD-PARTY
  SNAPSHOT") and in the map slideout next to "Boundary from the county parcel
  map". A mismatch shows a "SNAPSHOT MISMATCH" badge.

**Alcovy sweep, 5 records with parcel IDs:**

| Record | IDs | Stated | Fetched | Result |
|---|---|---|---|---|
| Arbor (fka Crescent Place) | 27-127, 27-135, 27-136 | 38.08 ac | 37.85 ac (−0.6%) | **Drawn** (vintage-tagged, dashed until reviewed) |
| Dobbs Landing | 25-174 | 213.86 ac | 14.74 ac | **Snapshot mismatch**: one parcel of a multi-parcel tract |
| Towns at Yellow River | 25-104 | 28.16 ac | 18.11 ac | **Snapshot mismatch** (35.7%) |
| Tomlo Farms Subdivision (2 staged copies) | 005-002 | 118.20 ac | — | **Missing** |

**Covington city-format IDs.** Only one Newton project uses a non-county
format: Tomlo Farms, `005-002`, staged twice. That's 1 project, 2 records, out
of 5 records with parcel IDs.
- It isn't in the snapshot under any form tried: `5-2`, the padded
  `00050-00000-002`, or the city `CO…` form.
- Its fetch note says "likely re-platted", the generic wording for a missing
  ID. The real cause is the format.
- No converter has been built.

## Houston County adapter (2026-11-17)

Prompted by sweep `0b19edc4`, which staged 9 records with parcel IDs in Centerville, Houston County
and Warner Robins.

**Where the layer is.** Houston County doesn't publish a queryable parcel layer itself:
- The county site's tax assessor page links only qPublic (Schneider), a viewer you can't query.
- The county's AGOL org, `hcga.maps.arcgis.com` (`5Q1LCD0VQuwWFHKM`), has one public service, a
  water service-line inventory.
- No county-run ArcGIS Server answers (`gis.` / `maps.` on houstoncountyga.gov and .org).

The public parcel fabric is the **City of Warner Robins Planning & Engineering** layer:

| | |
|---|---|
| Layer | `services6.arcgis.com/wtKwyZlCD3bY8Zh4/arcgis/rest/services/Base_Map_Polygon/FeatureServer/0` (AGOL item `b31b9574…`, org "City of Warner Robins Planning & Engineering") |
| Coverage | **All of Houston** (71,012 parcels) **and Peach** (14,608), with a `County` field |
| Last edited | 2026-11-02 |
| ID field | `Parcel_No`, stored single-spaced, 6 + 6: `0W1330 039000`, `00122A 105000`, `0W77C0 617000`, `0W1630 80A000`, `000340 001CEL` |
| Map prefix | `0W` Warner Robins, `0P` Perry, `0C` Centerville, `00` unincorporated |
| Access | Anonymous, no token; `Access-Control-Allow-Origin: *` |
| Speed | 43 pages of 2,000 rows at a 0.39 s median, 1.6 s worst; single-record queries 15–420 ms |

qPublic pads the same IDs (`0W1330    039000`). `likeFromRuns` splits on any separator run, so the
padding never matters. Normalizing is lossless within Houston: 70,773 distinct IDs, 70,773
normalized.

Two other layers were not used:
- **MGRC `Parcels_LitterSurvey`** (`services1.arcgis.com/Ug5xGQbHsD8zuZzM`) is a 2025-05-19 assessor
  snapshot, 69,861 parcels. It was used only to trace the missing IDs below.
- **`houston_gis/HoustonParcels`** is Houston County, **Minnesota**.

**The three test IDs:**

| ID | Result |
|---|---|
| `0W1330 039000` | Found. Polygon, 57.34 ac (record states 56.3) |
| `0W67A0 027000` | Found. Polygon, 18.3 ac (one of a 24.22 ac pair) |
| `001040 129000` | **Missing.** It's in neither the current layer nor the May 2025 snapshot. The 309.4 ac Moody / Woodard / Bob White Rd tract is now `0W1330 089000` (309.6 ac, Alexis Investments). That's a **renumber on annexation into Warner Robins**, not a re-plat. |

**Parser.** Migration `20261117194114_parcel_id_houston_format` was built from the live
definition, which includes Forsyth, Macon-Bibb, 5+6, Henry, Hall and Coweta.
- 6+6 alphanumerics is too generic to read everywhere, so the Houston pattern is **scoped by a
  county argument**:
  - `extract_parcel_numbers(text, county)` is the full parser. It reads
    `0[0-9WPC][0-9A-Z]{4}[ -]+[0-9]{2}[0-9A-Z]([0-9]{3}|CEL)` only when the county is
    `'Houston County'`. That pattern matches 70,855 of the layer's 71,012 Houston rows. The rest are
    `…PU` and `…L01` rows and non-parcels such as `DRAINAGE`.
  - `extract_parcel_numbers(text)` passes NULL, so its output is unchanged by construction.
  - `parcel_id_county(municipality name)` maps the adapter's own list to `'Houston County'`.
  - `municipal_project_sync_parcel_numbers()` looks up the row's municipality (boundary
    municipality first, then `municipality`) and passes the county.
- **Grants:** none to PUBLIC or anon; authenticated and service_role only. An anonymous RPC call to
  all three gets 42501.
- **Regression check** (rolled back, 764 staged + 500 committed rows):
  - The 1-argument output changed on 0 rows.
  - The county-aware parse differs on 44 rows, all Houston, with no ID lost.
  - The backfill changed 17 staged rows (+28 IDs) and 12 committed rows (+16 IDs), all Houston,
    with no ID lost.
- **Applied** with psql `--single-transaction` and recorded in `schema_migrations`. The backfill
  rules match Hall and Coweta: superset-only, skip `parcel_fetch` boundaries, skip in-flight runs.

**Adapter** (`supabase/functions/_shared/parcel-adapters.ts`):
- `Parcel_No` via `likeFromRuns` plus the normalized compare.
- `idPattern` is the same shape as the parser.
- Default 30 s timeout and 1 retry. It's Esri-hosted and fast, unlike Henry.
- It matches Houston County, Warner Robins, Perry and Centerville.
- **Warner Robins (7.8% in Peach) and Perry (6.5% in Peach) straddle Peach County.** They're
  matched anyway, as Haralson is for Coweta, because nearly all of each is in Houston. A Peach-side
  parcel uses Peach's format (`052B 071`), which the parser doesn't read, though it is in this same
  layer.
- Byron and Fort Valley are Peach: not matched.
- Union, acreage validation, partial flag, pin-in-shape, dashed until reviewed and never replace:
  unchanged, all in the RPCs.

**Resolution (all Houston records with IDs, after the backfill):**

| | Records | IDs | Resolve | Missing | All resolve | Some | None |
|---|---|---|---|---|---|---|---|
| Committed | 19 | 26 | 16 | 10 | 10 | 1 | 8 |
| Staged (non-rejected) | 22 | 32 | 21 | 11 | 12 | 1 | 9 |

The same **10 distinct IDs** are missing in both tables. All but one are on annexation records, and
**6 trace to a renumber on annexation.** Each was found in the May 2025 snapshot, with the same
acreage on the same ground under a new city number:

| Cited (county) | Snapshot ac | Now |
|---|---|---|
| `000720 001000` | 124.68 | `0C0120 033000` (124.7 ac, Centerville) |
| `000730 032000` | 23.08 | `0W069A 063000` (23.1) |
| `000770 101000` | 31.11 | `0W1000 248000` (31.1) |
| `000770 102000` | 14.43 | `0W1000 249000` (14.4) |
| `000780 227000` | 13.79 | `0W1000 250000` (13.8) |
| `000770 013000` | 4.01 | `0W0750 102000` (4.0) |

The other four:
- `001040 129000`: renumbered by acreage and roads to `0W1330 089000`, but not in the snapshot.
- `000510 36B000`: 7.66 ac in May 2025, gone now, with no single same-size successor. It was
  probably re-platted.
- `001030 015000`: in neither fabric. Not traced.
- `0W1200 134000`: in neither fabric, and `0W1200 134`–`135` are a gap in the current sequence. A
  re-plat before 2025.

So in Houston, **"missing" usually means annexed, not re-platted**: research cites the
pre-annexation county number from the annexation packet. Nothing remaps them. The fetch note's
"likely re-platted" wording is wrong for these.

**Acreage dry run** (rolled back) on the 10 committed records whose IDs all resolve and that have no
boundary. All produce a MultiPolygon, the pin is inside, and every one is dashed (`parcel_fetch`,
unreviewed):

| Record | Fetched | Stated | Var. | Flag |
|---|---|---|---|---|
| Robins Royal Hospitality | 5.53 | 5.529 | 0.0% | — |
| Alexis Investments / Woodlands | 309.64 | 309.4 | 0.1% | — |
| Caleb Properties (Corder Rd) | 24.16 | 24.22 | 0.2% | — |
| Castaway Self Storage | 7.40 | 7.44 | 0.5% | — |
| Project Dev. & Mgmt / McCrory | 57.34 | 56.3 | 1.8% | — |
| Irma Mondragon | 5.83 | 5.8 | 0.5% | flagged: partial parcel ("portion of property") |
| 3V Investment / Elberta Rd | 3.31 | 3.6 | 8.1% | flagged |
| CCCCT / West Wrasling Way | 8.33 | 9.11 | 8.6% | flagged |
| Grimes/Kushinka (Peacock) | 5.79 | 6.34 | 8.7% | flagged ("including ROW") |
| Orchard Investment PDR | 61.96 | 55.74 | 11.2% | flagged |

That's 5 within tolerance and 5 flagged. Several of the flagged records state acreage "including
right-of-ways", which a parcel union doesn't contain. Nothing was drawn: the fetch runs once, on
request (the slideout button). Charles Randle / Lake Joy Rd already has a hand-drawn boundary and
resolves 1 of 2 IDs. It was not touched.

Data-quality flags, not fixed:
- Two pairs of committed records look like duplicates:
  - Alexis / Woodlands: `04a8b742` cites the old county ID, `023dd3f1` the new one.
  - Patriot Development / William Drive: `c8bc36d6` and `5b1c13a9`.
- Staged `c8e425e0` cites "Tax parcel 061006, lots 42 and 63", which isn't a parcel ID.
