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

## Douglas County adapter (2026-11-23)

Prompted by sweep `f0345346`, which staged 13 records with parcel IDs in Douglas County and
Douglasville.

**Where the layer is.** Douglas County runs its own ArcGIS Server, `maps.douglascountyga.gov`.
Like Forsyth's, it isn't in the ArcGIS Online index. No Esri-hosted copy was needed.

| | |
|---|---|
| Layer | `maps.douglascountyga.gov/arcgis/rest/services/CountyLayers/Parcels/MapServer/15` ("This layer displays land records for Douglas County Ga", Appraisal Department attributes) |
| Coverage | 55,100 rows, 54,992 distinct `ParcelNo` |
| Last edited | Not published. It's a MapServer with no `editingInfo`, and there's no date field. |
| ID field | `ParcelNo`, stored with no separators. It's land lot (4) + district (2) + section (1) + parcel (4), plus an optional letter: `06461820001` (52,827 rows), `0016015A013` (letter in the parcel, 2,102), `04811820005B` (57) |
| District+section | Always one of `015`, `025`, `035`, `013`, `182` |
| Access | Anonymous, no token. CORS reflects the caller's origin (checked for `https://ovis.oculusrep.com` and `http://localhost:5173`). |
| Speed | 28 pages of 2,000 rows at a 0.42 s median and 0.58 s worst. Single-ID queries take 0.36–0.62 s. |

Sources write the ID dashed, as `0978-182-0001`. `likeFromRuns` plus the normalized compare handle
both forms. Normalizing is lossless: 54,992 distinct IDs, 54,992 normalized. The layer also has
`SUBDIVISION` and `totalacres` fields. The subdivisions pass doesn't use the layer yet.

**The three test IDs.** All three were found, each as a single-ring Polygon.

| ID | Result |
|---|---|
| `06471820001` | Found. 5 ac, 5118 Malone Rd. One of the six Malphrus parcels (21.32 ac union) |
| `00110150222` | Found. 10.21 ac, matching the record's 10.21 |
| `08101820055` | Found. 31.38 ac (DC Kensington LLC) |

**Parser.** Migration `20261123053129_parcel_id_douglas_format` was built from the live definition,
which includes Forsyth, Macon-Bibb, 5+6, Henry, Hall, Coweta and Houston.
- The plain 11-digit form was already read everywhere by the Henry pattern. Cobb's IDs are also 11
  digits, so the new Douglas forms are **scoped by county**, like Houston's.
- `extract_parcel_numbers(text, 'Douglas County')` adds three forms:
  - The dashed form (`0978-182-0001`).
  - The letter forms (`0016015A013`, `04811820005B`).
  - Tails written against the last ID: lists (`0022015C014/C015/C016`, `06461820001/02/03`) and
    numeric ranges of at most 25 (`06461820001-003`, `0318-182-0014 through -0027`).
- The district+section code must be one of the five above. IDs are emitted with no separators, as
  the fabric stores them. The pattern matches 54,986 of the 55,100 rows. The rest are three 12-digit
  oddities and non-parcels such as `15' ALLEY`.
- `parcel_id_county()` maps Douglas County and Douglasville to `'Douglas County'`. The 1-argument
  wrapper and the sync trigger are unchanged.
- **Grants:** authenticated and service_role only. An anonymous call gets 42501, verified by
  impersonation.
- **Regression check** (rolled back, 800 staged + 515 committed rows):
  - The 1-argument output changed on 0 rows.
  - The county-aware parse differs on 6 rows, all Douglas, with no ID lost.
  - The backfill changed 7 staged rows, all Douglas, with no ID lost: 0→3, 0→1, 0→2, 0→15, 1→9 and
    3→6 IDs, plus one row (`eef56548`) whose IDs were only re-sorted.
  - There are **no committed Douglas records**, because `municipality` has no Douglas entry.
- **Applied** and recorded in `schema_migrations`. psql couldn't resolve the pooler host from the
  cloud session, so the file went through the Supabase management API's query endpoint as one
  explicit `BEGIN … COMMIT` with the `schema_migrations` insert inside it. That endpoint doesn't
  stamp its own version, unlike `apply_migration`.

**Adapter:**
- `ParcelNo` via `likeFromRuns` plus the normalized compare, with `totalacres` as an extra field.
- `idPattern` is the same shape as the parser.
- The default 30 s timeout and 1 retry, because the server is fast.
- It matches **Douglas County** and **Douglasville**, which is 100% inside the county.
- Not matched:
  - **Austell** (3% Douglas, mostly Cobb) and **Villa Rica** (32% Douglas, mostly Carroll) straddle
    the county line.
  - `Douglas` in `boundary_municipality` is the Coffee County city.
  - Lithia Springs and Winston are unincorporated and have no row of their own.
- Union, acreage validation, partial flag, pin-in-shape, dashed until reviewed and never replace
  are unchanged, all in the RPCs.

**Resolution** (17 non-rejected staged Douglas records with IDs, after the backfill; none has a
boundary and none is `parcel_fetch`). 14 records resolve fully and 3 partly, with **52 of 56 cited IDs (43 of 47 distinct)
resolving**. The 4 missing:

| ID | Record | Why |
|---|---|---|
| `03181820017`, `03181820022` | Lithia Investments | Gaps inside the cited range "0014 through -0027". The fabric has no 0017 or 0022 in land lot 318 (it skips 0008 and 0013 too). These are retired numbers, probably combined into neighbours. |
| `08101820098` | Kensington Park | Not in the fabric. Land lot 810 runs only to 0072, and it now holds 18 Kensington Park lot parcels. This is probably the Phase 2B parent tract, **re-platted into lots** (plat approved Nov 2023). |
| `09021820083` | Chestnut Grove | Not in the fabric. Land lot 902 runs only to 0030. The record's other ID, `09021820018`, is 13.83 ac, exactly the stated acreage, so 0083 looks like a mis-cited ID. Not traced. |

**Acreage dry run** (rolled back, through `set_staging_polygon_from_parcels`). All 17 produce a
MultiPolygon with `ST_PointOnSurface` inside. Every one is `parcel_fetch` and so dashed until
reviewed.

| Record | Fetched | Stated | Var. | Flag |
|---|---|---|---|---|
| South Burnt Hickory | 18.52 | 18.5 | 0.1% | — |
| Mason Malphrus Townhomes | 21.32 | 21.3 | 0.1% | — |
| Themis / Dorris Rd (`b88ec835`) | 79.34 | 79.4 | 0.1% | — |
| Themis / Doris Rd (`1908f7fd`) | 79.34 | 79.6 | 0.3% | — |
| DRB Group / Rose Ave & Bill Arp | 81.9 | 82.2 | 0.4% | — |
| Malphrus Group / Malone Rd | 21.32 | 21.24 | 0.4% | — |
| Timber Ridge / Prestley Mill | 82.92 | 83.3 | 0.5% | — |
| Chestnut Grove | 13.94 | 13.83 | 0.8% | partial (1 of 2 IDs) |
| Reserve at Douglasville | 11.07 | 10.93 | 1.3% | — |
| Stewart Mill Holdings / Greenbrook | 10.04 | 10.21 | 1.7% | — |
| Brian Howell / Stewart Mill Rd | 10.04 | 10.21 | 1.7% | — |
| Traton / Chapel Hill Crossing | 32.69 | 33.26 | 1.7% | — |
| Kensington Park | 18.2 | 18.67 | 2.5% | partial (1 of 2 IDs) |
| Norhaven / Greystone | 8.21 | 7.39 | 11.1% | **flagged** |
| Lithia Investments townhomes | 17.07 | 13.41 | 27.3% | **flagged**, partial (13 of 15) |
| Richardson Family Trust | 51.04 | 85.8 | 40.5% | **flagged** (3 IDs cited over 5 land lots: the cited parcels don't cover the tract) |
| Douglasville Town Green | 14.05 | — | — | no stated acres read |

So 13 are within the 5% tolerance and 3 are flagged. Nothing was drawn: as with Houston, the fetch
runs once, on request (the slideout button) or on the next post-run pass.

Data-quality flags, not fixed:
- Douglasville Town Green states "combined ~8.9 ac", which `extract_stated_acres` doesn't read. The
  fabric has `0016015A013` at 5.80 ac (Southern Bell), not the 1.50 ac the record says.
- Two pairs of staged records look like duplicates:
  - Themis / Doris-Dorris Rd: `1908f7fd` and `b88ec835`.
  - Stewart Mill Rd: `e471908c` and `1702bb37`.
- The "Reserve at Douglasville" located pin is 2.4 km outside its parcel, and Timber Ridge's is
  256 m outside. On approve the pin is placed inside the shape anyway.
- 8 Douglas County records cite only "Land Lot X, District Y, Section Z, Parcel N". Composing an
  ID from that isn't built: it's ambiguous when several land lots are cited.

## Cobb County adapter (2026-11-26)

Prompted by sweep `4eafa7ca`, which staged 4 records with parcel IDs in Cobb County and Marietta.

**Where the layer is.** Cobb County runs its own ArcGIS Server (ArcGIS 11.5) at
`gis.cobbcounty.gov/gisserver/rest/services`; `gis.cobbcounty.org` serves the same directory. Like
Forsyth's and Douglas's, it isn't in the ArcGIS Online index. An ArcGIS Online search for Cobb
parcels returns only city and third-party layers (Kennesaw zoning, a Jacobs project layer). The
county sells its parcel GIS data as a download, but the server layers are public.

| | |
|---|---|
| Layer | `gis.cobbcounty.gov/gisserver/rest/services/tax/taxassessorsdaily/MapServer/0` (`CobbParcels`) |
| Coverage | 280,023 rows, 268,965 distinct `PIN`. Condo footprints repeat, and the first one wins. |
| Last edited | Not published. It's a MapServer with no `editingInfo`. The service name says it's the assessor's daily layer. |
| ID field | `PIN`, 11 digits with no separators: district (2) + land lot (4) + section (1) + parcel (3) + suffix (1), e.g. `17079300040`. All but two `000` placeholder rows have that shape. Districts are 01, 07 and 15–21. |
| Access | Anonymous, no token. CORS reflects the caller's origin. |
| Speed | 281 pages of 1,000 rows at a 0.40 s median, 0.53 s p95 and 0.84 s worst. Single-ID queries take 0.1–0.3 s. |

Sources also write the PIN dashed, as `17-0434-0-018-0`. `likeFromRuns` plus the normalized compare
handle both forms. Normalizing is lossless: 268,965 distinct, 268,965 normalized.

Two other layers were not used:
- **`cobbpublic/Parcels/MapServer/3`** has more rows (283,363), but its first rows are `PIN = '000'`
  placeholders.
- **`cobbpublic/PropertySearch`** has 277,710 rows of zoning and district attributes.

**The three test IDs.** All three were found, each as a single Polygon.

| ID | Result |
|---|---|
| `17079300040` | Found. 15.55 ac, Eastside Baptist Church, 2450 Lower Roswell Rd |
| `17089400020` | Found. 3.47 ac, matching the record's 3.47 (Branch Atlanta Road Associates) |
| `17079300200` | Found. 0.44 ac, 385 Lucky Ct |

**Parser.** Migration `20261126062723_parcel_id_cobb_format` was built from the live definition,
which includes Forsyth, Macon-Bibb, 5+6, Henry, Hall, Coweta, Houston and Douglas.
- The plain 11-digit form was already read everywhere by the Henry pattern. The Cobb pattern adds
  the **dashed or spaced form** (`17-0434-0-018-0`, `17 0793 0 004 0`), emitted with no separators.
- It's **scoped by county**, because Douglas's IDs are also 11 digits.
- `parcel_id_county()` maps Cobb County, Marietta, Smyrna, Kennesaw, Acworth, Powder Springs and
  Mableton to `'Cobb County'`. Each is 100% inside the county.
- **Grants:** authenticated and service_role only. An anonymous call gets 42501, verified by
  impersonation.
- **Regression check** (rolled back, 836 staged + 553 committed rows):
  - The 1-argument output changed on 0 rows.
  - The county-aware parse differs on 2 rows, both Marietta, with no ID lost.
  - The backfill changed 1 staged row, Davis Circle `f3b5cc9a`, from 0 to 4 IDs. It was empty
    although its committed twin already had the same 4.
  - There were 0 changes outside Cobb and no ID was lost.
  - Hudson Road keeps its stored `17-0434-0-018-0`. The new parse (`17043400180`) isn't a literal
    superset of it, and the fetch resolves the dashed form anyway.
- **Applied** and recorded in `schema_migrations`, the same way as Douglas: one explicit
  `BEGIN … COMMIT` through the management API, because psql can't resolve the pooler host here.

**Adapter:**
- `PIN` via `likeFromRuns` plus the normalized compare, with `ACRES` as an extra field.
- `idPattern` is the same shape as the parser.
- The default 30 s timeout and 1 retry, because the server is fast.
- **Austell (97% Cobb, 3% Douglas) straddles the county line and is not matched.** Neither is
  Atlanta (Fulton/DeKalb).
- Union, acreage validation, partial flag, pin-in-shape, dashed until reviewed and never replace
  are unchanged, all in the RPCs. See the gap below.

**Resolution.** 5 staged + 5 committed records have IDs, and the committed ones are twins of the
staged ones. In each table, 13 IDs are cited and **11 resolve**. 4 records have a usable fetch
(3 full, 1 partial) and 1 resolves nothing. The 2 missing IDs:

| ID | Record | Why |
|---|---|---|
| `1707930080` | The Haven at Eastside | Not a re-plat: it has **10 digits**. `17079300080` (0.45 ac, Eastside Baptist Church, Little Rd) exists, so the source dropped a zero. Not corrected. |
| `222-226` | Crestridge Drive (Z2025-17) | Not a parcel ID. It's the address range "222-226 Herbert Drive", misread by the Forsyth pattern. The record cites land lots only. |

**Acreage dry run** (rolled back, through the two `…_from_parcels` RPCs). Every result is a
MultiPolygon with `ST_PointOnSurface` inside, and every one is `parcel_fetch`, dashed until
reviewed.

| Record | Fetched | Stated | Var. | Flag |
|---|---|---|---|---|
| Branch Properties (Z-21-2026) | 3.34 | 3.47 | 3.7% | — |
| Davis Circle Townhomes | 6.52 | 6.8 | 4.1% | — |
| Hudson Road Student Housing | 8.33 | 9.05 | 8.0% | **flagged** |
| The Haven at Eastside (Z-22-2026) | 22.37 | 8.65 | 158.6% | **flagged**, partial (5 of 6). The cited church tract `17079300040` alone is 15.55 ac; the project is part of it. |

So 2 are within the 5% tolerance and 2 are flagged, the same in both tables. Nothing was drawn.
**Committed** Branch Properties (`28e32547`) and Hudson Road (`1ce2954d`) already have hand-drawn
boundaries, so in practice their fetch is never offered.

**Gap found, not changed.** `set_municipal_project_polygon_from_parcels` has **no never-replace
guard**. In the dry run it overwrote both hand-drawn boundaries, and the rollback undid it. Only the
slideout enforces the rule, by hiding the button when `geometry_geojson` is set. The staging RPC does
refuse (`has_boundary`). The 141 South replacement above used this path on purpose, so adding a
guard needs an explicit replace option.

Data-quality flags, not fixed:
- Two pairs of records are staged/committed twins of each other.
- Several Marietta records cite only "Land Lot X, District Y, Parcel NNNN". Composing an ID is
  deterministic for a single land lot (Hudson Road's matches `17043400180`), but it isn't built.

## Parcel IDs inferred for Douglas and Cobb records with none (2026-11-26), proposed, not drawn

There were 83 Douglas and Cobb records (non-rejected staged and committed) with no parcel IDs and no
boundary. Two methods were tried, and **every candidate was checked against the live county layer**:
does it exist, its acreage, and its distance to the record's pin. This was a one-off read-only pass
plus a rolled-back dry run. **Nothing was written.** No parser change was made: both methods need a
person to judge them, so they don't belong in `extract_parcel_numbers()`.

**A. Composed from land-lot citations.**
- Douglas: `LLLL` + `DD` + `S` + `PPPP`. One source wrote "D2 S18", which only makes a valid
  district+section code (`182`) when swapped.
- Cobb: `DD` + `LLLL` + `0` + parcel as 4 digits. "Land Lot 434, District 17, Parcel 0180" gives
  `17043400180`, which is the ID Hudson Road cites itself. The section digit is `0` on 279,845 of
  280,021 PINs, whatever "2nd Section" says.
- When a citation lists several lots and parcels without pairing them, every lot × parcel
  combination was built. Only the combinations near the pin, at a cited address and matching the
  stated acreage were kept. The rest are real parcels up to 11 km away.
- For Hope Creek, the 6 cited parcel numbers turned out to be exactly the 6 cited addresses, all
  within 250 m and all owned by TPG AG EHC III.

**B. Looked up by address**, using a site-address `LIKE` (`PropertyAddress` / `SITUS_ADDR`) with an
exact house-number match. A hit was proposed only if the parcel is plausibly the **whole project**:
- within acreage tolerance when the record states acres;
- otherwise at least 1 ac, with a plausible density for the stated unit count;
- and near the pin.

Many Douglas records give a single house address inside an already-built subdivision. Those hits
are one 0.1–0.4 ac home lot and were rejected.

**Proposed: 22 projects, 44 rows (24 staged, 20 committed).** Every one unions to a MultiPolygon
with `ST_PointOnSurface` inside, and every one would be `parcel_fetch`, dashed until reviewed. The
dry run went through `set_staging_polygon_from_parcels` and `set_municipal_project_polygon_from_parcels`
and was rolled back.

| County | Project | Method | Parcels | Fetched | Stated | Var. |
|---|---|---|---|---|---|---|
| Cobb | PRE Powder Springs Rd / Hope Settlement | land lot | `19026100020` | 10.41 | 10.9 | 4.5% |
| Cobb | Hope Creek / Traton (Z2025-17) | land lot = addresses | `17064800540` `17064800570` `17064800330` `16128100720` `16128100730` `17057700020` | 19.35 | 19.451 | 0.5% |
| Cobb | 890 Canton Road Senior (3 rows) | land lot = address | `16101600060` | 2.15 | 2.18 | 1.4% |
| Cobb | Horizon Lane / Wilshire Ave (4 rows) | land lot | `16106900190` | 38.65 | 38.64 / 38 | 0.0 / 1.7% |
| Cobb | Piedmont Residential, Bells Ferry Rd | 4 addresses, all in the cited land lots | `16087000230` `16085900150` `16087000020` `16087100320` | 16.19 | — | — |
| Cobb | Shallowford Pointe | address | `16047000040` | 13.00 | 13.89 | **6.4%** |
| Cobb | Evergreen Senior Housing | address | `16121300260` | 2.71 | — | — |
| Cobb | Accent Marietta / Marietta Crossing | address | `16123900270` | 14.65 | 19.25 | **23.9%** (LL1240 part not found) |
| Cobb | High Street / former Mountasia | address | `16064400040` `16064400030` | 6.96 | — | — |
| Cobb | Chapman Drive (Z-24-2025) | 4 addresses from the notes | `16051300040` `16051300030` `16051300070` `16051300010` | 17.24 | 17.6 | 2.0% |
| Cobb | Campus Realty / Chastain Center | 2 addresses | `16043000060` `16043000070` | 6.56 | 6.4 | 2.5% |
| Douglas | Meadow Hill | land lot (paired) | `04551820001` `05541820001` `05471820004` | 45.34 | 50 | **9.3%** |
| Douglas | Shree Development Townhome PRD | land lot (P1 in each of 2 lots) | `09731820001` `09671820001` | 11.68 | 10.8 | **8.1%** |
| Douglas | KMC Homes / St. Andrews Pkwy | land lot | `01210350135` | 16.64 | 16.6 | 0.2% |
| Douglas | Walters Creek at Mt. Vernon Rd | land lot (paired, D/S swapped) | `09811820008` `09791820019` `10061820006` `09781820001` | 86.68 | 85.68 | 1.2% |
| Douglas | David Pearson / Veterans Memorial | land lot (paired) | `03681820001` `…0026` `…0027` `…0028` `…0029` `03171820017` | 48.04 | 53.52 | **10.2%** |
| Douglas | Autry Circle Subdivision | land lot | `07030130001` | 12.92 | 13.12 | 1.5% |
| Douglas | Bright Star Road Senior Housing | land lot | `01310250004` `01310250005` | 46.46 | 44.85 | 3.6% |
| Douglas | DRB Group / Fairburn Road PUD | land lot | `01090150133` `01090150134` | 12.90 | 12.89 | 0.1% |
| Douglas | Reserve at Chapel Hill Phase II | address | `00760150034` | 20.98 | — | — |
| Douglas | 8288 Chicago Avenue Multi-Family | address | `02240250034` | 8.96 | — | — |
| Douglas | Peaks of Douglas | address | `00240150014` | 7.34 | — | — |

By row: 22 are within tolerance, 9 are flagged (`geometry_needs_review`), and 13 have no stated
acreage to check against (address matches only).

**Not proposed (39 rows):**
- **The address is one house lot** in a built subdivision: Tributary Village, Paces Estates,
  Charlton Crossing, Tributary at New Manchester, Ashley Falls, East Cobb Walk Townhomes (0.07 ac)
  and Greenhouse Phase 3A (0.08 ac, 1.5 km from its pin).
- **The address parcel is too small for the stated acres:** GreenHouse by Beazer (14.9 vs 174 ac)
  and Powder Springs Rd SW Single-Family. The latter is 4.44 vs 10.9 ac, and the parcel isn't in the
  cited land lot 1076.
- **Nothing to check against:** Bridlewood Townhomes (6.78 ac, no units or acres).
- **The address isn't in the layer:** East Cobb Walk Senior Apartments, Chestnut Grove Townhomes,
  Timber Ridge, Roseleigh Park, Ansley Trails, The View at Groover's Lake, Laurelwood, Heron Mill
  Phases 1 and 2, NOVEL Douglasville and Fairhaven. Most are subdivision streets platted since, or a
  leasing-office address.
- **No address or land lot:** Shallowford Pointe (Toll Brothers, an intersection), Marietta Crossing
  Townhomes and Town Green Apartments Phase 2.

Data-quality flags, not fixed:
- Walters Creek (`f323af15`) and Richardson Family Trust (`17da8205`) cite the same Mt. Vernon Rd
  tract, so they're probably duplicates. Richardson's 40.5% shortfall is the missing
  `09791820019` (35.64 ac).
- 890 Canton Rd (`593cb94d` / `8a1c18e8`) and Horizon/Wilshire (`6f4c55cc` / `27d61da3`) are
  duplicate staged pairs.
- Since the Douglas adapter write-up, 38 Douglas records have been committed, 20 of them with
  parcel IDs. Those weren't in that dry run.

### Drawn (2026-11-26)

On request, all **67** proposed and earlier-reported records were drawn from fresh county fetches:
the 44 inferred-ID rows above, the 6 Cobb records with cited IDs and the 17 staged Douglas records.
- Each is written with the standard RPCs, so it's `parcel_fetch` and dashed until reviewed, and the
  committed pins are inside their shapes.
- Every write was gated on `geometry IS NULL` at write time, because the committed RPC has no
  never-replace guard. The two hand-drawn Cobb boundaries (`28e32547`, `1ce2954d`) are unchanged.
- The inferred-ID staged rows carry "parcel ids inferred 2026-11-26 (…), not cited by the source"
  in `parcel_fetch_note`. The IDs are in `geometry_source_parcels`; `parcel_numbers` (what the source
  cited) was left alone.

Outcome:

| | Drawn | Within tolerance | Flagged (`geometry_needs_review`) | No stated acres |
|---|---|---|---|---|
| Douglas | 37 | 22 | 8: Meadow Hill ×2, Shree ×2, Veterans Memorial, Richardson, Norhaven, Lithia | 7 |
| Cobb | 30 | 16 | 7: Shallowford ×2, Accent ×2, Haven ×2, Hudson Road | 7 |

Accent Marietta (23.9%, only the land lot 1239 parcel was found) and The Haven (158.6%, the whole
church tract) were drawn **flagged** as asked. Chestnut Grove, Lithia Investments, Kensington Park
and The Haven are drawn from the IDs that resolved, with the missing ones recorded as `partial`.

The Cobb server returned HTTP 400 on every query, even `returnCountOnly`, from about 06:55Z. It was
back at 07:06Z with the same 280,023 rows. This looks like its nightly refresh, which is one more
reason the adapter has a retry.

### Douglas committed records with cited IDs (2026-11-26)

20 committed Douglas records have parcel IDs. They were committed after the Douglas adapter write-up.
- 9 already had `parcel_fetch` boundaries, drawn on approval, and were left alone.
- The other **11 were drawn** with the same `geometry IS NULL` gate: 10 within tolerance and 1
  flagged. Norhaven is the flagged one, at 8.21 vs 7.39 ac (11.1%).
- Town Green has no stated acreage.
- Chestnut Grove is drawn from `09021820018` alone. `09021820083` is still missing.
- All are MultiPolygons with the pin inside, dashed until reviewed.

Data-quality flag, not fixed: committed Douglas has duplicates.
- DRB Rose Ave appears 3 times: `45a38240`, `8eea9856`, `3c7cf13b`.
- Chapel Hill Crossing appears twice: `f1957ddf`, `e7ecacac`.
- Themis / Doris-Dorris Rd appears twice: `f6fde2be`, `8e0dda3f`.
