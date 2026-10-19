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
