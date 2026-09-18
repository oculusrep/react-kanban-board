# Pulling parcel polygons, not just centroids — scope

**Date:** 2026-09-18 · **Branch:** `feature/research-cluster-grouping` · **Status:**
scope only, nothing built.

Follow-up to [PARCEL_ID_GEOCODING_FEASIBILITY.md](PARCEL_ID_GEOCODING_FEASIBILITY.md),
which covered resolving a parcel ID to a point. This covers the polygon.

Everything below was verified against the live Forsyth FeatureServer and the
production database. Write tests ran inside a transaction and rolled back.

---

## The four questions, answered

### 1. Same field as hand-drawn polygons, or a separate one?

**Same field — `municipal_project.geometry` — but the column type is the blocker,
not the provenance.**

```
geometry_columns: municipal_project.geometry → type POLYGON, srid 4326, 2d
```

It is typed `POLYGON`, not `GEOMETRY` or `MULTIPOLYGON`. Verified live that this
is enforced, not cosmetic:

```
MULTIPOLYGON WRITE: REJECTED -> Geometry type (MultiPolygon) does not match column type (Polygon)
```

So:

- A **single** fetched parcel → always a simple Polygon (0 MultiPolygons in a
  600-parcel sample). Writes to the existing field with no schema change.
- A **contiguous** multi-parcel union → also a single Polygon (verified, §2).
  Writes fine.
- A **non-contiguous** union → MultiPolygon → **rejected by the column.**

Recommendation: **widen the column to `MULTIPOLYGON` (or plain `GEOMETRY`) and
store `ST_Multi(...)` uniformly.** The read path is already ready —
`polygonPathsFromGeoJson` in `MunicipalProjectLayer.tsx:131` already handles
MultiPolygon. The only other blocker is the drawer's edit guard (§3).

**Style: don't give it a different colour.** There is an existing deliberate
decision here, and it should be respected —
`MunicipalProjectLayer.tsx:374`:

> *Pin color: agent rows override to navy so they're spot-able at a glance.
> Polygon color: always use the stage color chain so agent polygons blend in with
> manually-entered ones (the navy signal on the pin is enough).*

A fetched polygon is *more* trustworthy than a hand-drawn one, not less, so
flagging it as suspect would be backwards. If a visual distinction is wanted, use
a **dashed stroke** (a stroke *pattern*, leaving the stage colour chain and the
global style controls in `useMunicipalProjectPolygonStyle` untouched) and only
until it has been reviewed once.

### 2. Multi-parcel records: union into one shape?

**Yes — `ST_Union`. Verified on every real multi-parcel record in production:**

| record | parcels | union type | vertices (before → after) | union acres | sum of parts | acreage in `parcel_boundary_notes` |
|---|---|---|---|---|---|---|
| Bannister Rd | 5 | **ST_Polygon**, 1 part | 102 → 82 | 39.4 | 39.4 | "38.717 acres combined" |
| District 2 | 8 | **ST_Polygon**, 1 part | 170 → 84 | 77.6 | 77.6 | "77.358 acres" |
| Dahlonega/Elm, Cumming | 4 | **ST_Polygon**, 1 part | 69 → 50 | 5.9 | 5.9 | "~6.48 acres" (4 parcels **plus part of a fifth**) |

Three things this proves:

- Shared boundaries dissolve — the vertex count drops, so the union is a genuine
  merged outline, not stacked shapes.
- **Union area equals the sum of the parts exactly** in all three cases, so these
  parcel sets are contiguous with no overlaps and no slivers.
- The union cross-checks against the acreage the agent recorded in prose, within
  ~2%. That is a free validation signal: **if the union area disagrees with the
  stated acreage by more than a few percent, something is wrong** — a bad parcel
  ID, a missing parcel, or a retired one. The Cumming row is the honest case: it
  comes in low because the source says "4 full parcels plus part of a fifth", and
  we can only fetch whole parcels.

Handle non-contiguous as the exception: union → if `ST_NumGeometries > 1`, store
it as a MultiPolygon (needs the column widened) and flag it for review.

**Do not fall back to a convex hull.** Measured on a deliberately disjoint pair:
hull **5,301.9 acres vs 504.9 acres true** — a 10× overstatement. A hull would
swallow everything between two parcels.

### 3. Should a fetched polygon be editable?

**Yes, and it already is — no new UI required.**

`MunicipalProjectDrawer.tsx` enters edit mode on any existing geometry whose type
is `Polygon` (`MunicipalProjectDrawer.tsx:48`), loads it into terra-draw's select
mode, and the slideout already offers *Edit polygon* / *Clear polygon*. A fetched
single Polygon drops straight into that flow.

Three caveats:

- **MultiPolygon is explicitly not editable today** (same line, and the comment
  says so: *"the writer only produces single Polygons anyway"*). Widening the
  column makes that assumption false. Either teach edit mode to handle it or
  block editing on multipart geometry with a clear message.
- **Holes are real and terra-draw editing may drop them.** Parcel `161-001` (the
  563-acre tract) has **2 interior rings**. Rare — 1 in 600 — but the failure is
  silent: edit a holed polygon, save, and the holes are gone. Guard before
  shipping edit-on-fetched.
- **An edit must change the provenance** to `parcel_fetch_adjusted` (§4),
  otherwise a hand-tuned boundary still claims to be the authoritative parcel and
  the next refetch would be entitled to overwrite it.

That last point is the real answer to *"so I can adjust it where the parcel
boundary isn't the development boundary"*: yes, and the adjustment has to be
sticky against re-fetch.

### 4. How do we mark sourced vs hand-drawn?

**A new column. Do not reuse `source_research_run_id`** — that marks how the
*record* was found, not how the *polygon* was made. An agent-found record can
carry a hand-drawn polygon, and today many do.

```sql
alter table municipal_project
  add column geometry_source text
    check (geometry_source in ('hand_drawn','parcel_fetch','parcel_fetch_adjusted')),
  add column geometry_source_parcels text[],   -- the parcel ids actually unioned
  add column geometry_fetched_at timestamptz;  -- which nightly fabric it came from
```

- Backfill existing rows with `'hand_drawn'` (all 264 current polygons are).
- `geometry_source_parcels` is what makes a refetch safe and a stale polygon
  diagnosable — it records which parcels *actually* resolved, which is not the
  same as `parcel_numbers` (retired IDs won't be in it).
- `geometry_fetched_at` matters because the fabric updates nightly and re-plats
  retire parcels. See the retired-parcel finding in the feasibility doc.

**Landmine:** `municipal_project_v` enumerates its columns explicitly (it was
created from `mp.*`, which expanded at creation time). New columns will **not**
appear until the view is recreated. Per CLAUDE.md, pull the current definition
with `pg_get_viewdef` and rebuild from that — never from an older migration file.

---

## Implementation notes worth knowing before starting

**Use `f=geojson`, never `f=json`.** Verified — the two formats wind rings
oppositely:

| | outer ring | holes |
|---|---|---|
| `f=geojson` | CCW | CW | ✅ RFC 7946, what PostGIS/GeoJSON consumers expect |
| `f=json` (Esri) | CW | CCW | ❌ inverts holes downstream |

Esri's `f=geojson` rewinds correctly, so take it and don't hand-roll the
conversion from `rings`.

**Payloads are small.** Per record: 6–172 vertices, 3–7 KB of GeoJSON. A whole
multi-parcel record is one HTTP call (`where` with OR'd `LIKE`s) and a few KB.
Nothing here needs batching or caching beyond ordinary politeness to a county
server.

**Don't copy the drawer's centroid math server-side.** `persistPolygon`
(`MunicipalProjectDrawer.tsx:150-156`) sets the centroid to the *average of the
outer ring's vertices*. That is not a centroid — it is vertex-density weighted,
and for a concave or holed parcel it can land outside the shape. For fetched
geometry use `ST_PointOnSurface` (guaranteed inside) or `ST_Centroid`, computed
in the database.

**Query recipe** (one call per record):

```
GET .../Tax_Parcel/FeatureServer/0/query
  ?where=PARCELID LIKE '144%082' OR PARCELID LIKE '144%092' OR ...
  &outFields=PARCELID,STATEDAREA
  &returnGeometry=true&outSR=4326&f=geojson
```

then server-side: verify each returned `PARCELID` normalizes to one we asked for,
`ST_Union`, `ST_Multi`, compare area against the stated acreage, write.

---

## Suggested order

1. Schema: widen `geometry` to MULTIPOLYGON, add the three provenance columns,
   backfill `'hand_drawn'`, **recreate `municipal_project_v` from its live
   definition**.
2. Edge function: parcel IDs → fetch → union → area cross-check → write geometry,
   centroid (`ST_PointOnSurface`), and provenance. Forsyth only, behind a flag.
3. Slideout: a *Fetch parcel boundary* action on records with parcel IDs, showing
   the area cross-check before it writes.
4. Guard edit mode on multipart and holed geometry; flip provenance to
   `parcel_fetch_adjusted` on any manual edit.
5. Only then consider a dashed stroke for un-reviewed fetched polygons.

Steps 1–3 are the useful half. 4 is not optional if 3 ships — an un-guarded edit
silently drops holes.

## What this does not change

The address → geocode path, and the pin. This is purely additive geometry; a
record with no resolvable parcel behaves exactly as it does today.
