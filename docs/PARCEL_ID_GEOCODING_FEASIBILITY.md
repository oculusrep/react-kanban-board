# Resolving a GA parcel ID to a centroid — feasibility

**Date:** 2026-09-18 · **Branch:** `feature/research-cluster-grouping` · **Status:**
investigation only, nothing built, no code changed.

**Scope guard:** this would be an *additional* location source. The existing
`address` → Google geocode path is not touched by anything proposed here.

---

## Verdict

| Question | Answer |
|---|---|
| Does Forsyth expose a public parcel endpoint? | **Yes**, and it returns centroids directly |
| Does it need auth / ESRI credentials? | **No.** Anonymous HTTPS GET, HTTP 200, no token, no referrer check |
| Is there a statewide GA parcel layer? | **No** free, queryable one. Confirmed dead end — details below |
| Does the data in OVIS carry usable parcel IDs? | Yes — and they match Forsyth's format exactly |
| Would it fix the problem? | Partly. **~80%** of parcel IDs resolve; the misses are structural, not fixable |
| How many GA counties does this cover? | Verified working for **8 of 20** counties probed. Coverage is per-county and genuinely patchy |

Recommendation: **worth building, narrowly.** Forsyth + Cumming alone is a real
win, the endpoint is free and stable, and the work is small. But it must be built
as a *per-county adapter registry* with Forsyth as the first entry, not as a
general "GA parcel geocoder" — there is no such thing to build against.

---

## 1. Forsyth County — confirmed working

```
https://geo.forsythco.com/gis/rest/services/Public/Tax_Parcel/FeatureServer/0
```

- **No authentication.** `curl` with no token, no API key, no ESRI login → `200`.
  No ESRI credentials are involved anywhere in this proposal.
- `capabilities: Query` — read-only, nothing else exposed.
- 105,470 parcel rows, `maxRecordCount` 15,000, updated **nightly** from the
  county's Parcel Fabric.
- Parcel number field is **`PARCELID`**; also carries `SITEADDRESS`, `ZONING`,
  `STATEDAREA` (acres), `USEDSCRP`, and a `Link` to the property record.
- `supportsReturningGeometryCentroid: true` — **we never have to fetch or parse a
  polygon.** Ask for `returnCentroid=true&returnGeometry=false&outSR=4326` and
  the response is a WGS84 lat/lng, ready to store.

Working query (this is the whole integration):

```
GET .../FeatureServer/0/query
  ?where=PARCELID LIKE '220%017'
  &outFields=PARCELID,SITEADDRESS,ZONING,STATEDAREA
  &returnCentroid=true&returnGeometry=false&outSR=4326&f=json

→ { "features": [{ "attributes": {...}, "centroid": { "x": -84.089607, "y": 34.233976 } }] }
```

### The one format landmine

`PARCELID` is stored **space-padded**: `"220   017"`, not `"220-017"`. Our data
writes it as `220-012`, `PIN 153-034`, `C37-002`.

`REPLACE(PARCELID,' ','')` in a `where` clause **fails** (`400 Unable to perform
query operation`) — the service enforces standardized queries. So the lookup has
to be a `LIKE` with the ID's alphanumeric runs joined by `%`
(`220-017` → `PARCELID LIKE '220%017'`), then verified client-side by comparing
normalized strings.

**Normalization is provably lossless here.** Pulled all 105,470 `PARCELID`s and
normalized (strip non-alphanumerics, uppercase):

```
total rows        105,470
distinct raw ids  105,137
distinct normed   105,137     <- identical, so no two parcels collide when normalized
normalized keys mapping to >1 raw spelling: 0
```

98 normalized keys return **multiple rows** — those are the condominium parcels
the layer description warns about ("redundant geometry ... multiple condominium
units"), one of which has 125 rows. They share a footprint, so any of them gives
the same centroid; take the first.

---

## 2. Hit rate — and why the misses are structural

Tested 31 real parcel IDs lifted from `municipal_project_staging.parcel_boundary_notes`:

**25 / 31 resolved (81%).**

The 6 misses — `220-012`, `080-264`, `080-265`, `080-009`, `C37-001`, `C37-002` —
are not lookup failures. Those parcel numbers **no longer exist**. The district
prefixes are all alive (`220` has 590 parcels, `C37` has 130), the specific
numbers are retired. `C37-001/002` are now the `C37-010`…`C37-016` lots on
*Westend Way*.

That is the important finding, and it will not go away:

> The parcel fabric is **current**. P&Z and rezoning records reference
> **pre-development** parcel numbers — which are exactly the ones the approved
> development then retires by re-platting. The records we most want to place are
> the ones most likely to have a dead parcel ID.

So treat ~80% as the realistic ceiling, not a bug to fix. A miss is not harmful —
it just leaves the row where it is today.

---

## 3. Does OVIS have the parcel IDs? Yes — and the schema already anticipated this

`municipal_project` and `municipal_project_staging` **both already have a
`parcel_numbers` ARRAY column.** It is essentially unpopulated:

| table | rows | rows with `parcel_numbers` |
|---|---|---|
| `municipal_project_staging` | 346 | **0** |
| `municipal_project` | 352 | 16 |

The IDs are instead sitting in free text in `parcel_boundary_notes`:

- `"Parcel 220-012 (sketch plat parcel); 39 lots on R2R land"`
- `"Parcels 080-264, 080-265, 080-009; 40.45 acres"`
- `"Parcels PIN 153-034 and PIN 153-001; ~31.90 acres total"`
- `"Parcels C14-043, C14-044, C14-066, C15-208, P/O C15-054"`

Multi-parcel is the common case, not the exception.

**The cheaper half of this feature is getting the agent to populate
`parcel_numbers` at staging time** rather than regex-scraping prose afterwards.
The column is already there and already flows through to the committed table.

---

## 4. The actual problem is worse than "never geocodes"

It isn't that these rows have no coordinates. **All 352 committed projects have a
`centroid`.** The failure is that some of those centroids are *fabricated* —
the fallback address geocodes to a county or city centroid, which is worse than a
null because it looks like a real location.

Stacked centroids in production right now:

| lat, lng | projects stacked there | what they are |
|---|---|---|
| 34.2359, -84.1435 | **4** | the Forsyth County centroid |
| 34.2073, -84.1402 | **3** | the Cumming centroid |

Two of the four Forsyth ones have the parcel IDs *in the address field itself*:
`"Parcel 097-056 Forsyth County District 1 GA"` and
`"Parcels 144-082 144-092 144-091 144-090 144-078 Forsyth County District 1 GA"`.

Both resolve against the endpoint, and the correction is large:

| parcel | resolved centroid | distance from the county centroid it currently sits on |
|---|---|---|
| `097-056` | 34.269031, -84.177153 | **4.8 km** |
| `144-082` | 34.308268, -84.151149 | **8.1 km** |

This also explains a second-order bug: these fake centroids are what the
`GEOMETRIC_CENTER` / `APPROXIMATE` guard already excludes from proximity dedupe
(see `lowPrecisionGeo`). Real parcel centroids would let those rows **rejoin**
dedupe instead of being permanently exempt.

---

## 5. Statewide layer — no. Checked properly.

| Candidate | Result |
|---|---|
| **GA GIS Clearinghouse** (`data.georgiaspatial.org`) | `302 → login.asp`. **Gated**, not an open API |
| **Georgia GIO** (`gio.ga.gov`) | Portal only; parcels are county-maintained, no statewide service published |
| **GDOT** (`gis.dot.ga.gov`) | Unreachable. GDOT publishes roads (ARNOLD), not parcels |
| **ArcGIS Online, statewide GA parcels** | Searched `Feature Service` + `Map Service`: **no statewide GA parcel service exists.** Only per-city / per-county layers |
| **Regrid USA Nationwide Parcel Boundaries** | `capabilities: Map,TilesOnly,Tilemap`, `singleFusedMapCache: true` — **raster tiles, not queryable by attribute.** Cannot answer "where is parcel 220-017". Regrid's actual queryable data is a paid licence |
| **GIS1 clearinghouse** | Commercial aggregator; advertises parcel data for ">20% of Georgia counties" — i.e. itself incomplete, and paid |

**Conclusion: there is no free statewide shortcut.** It is per-county endpoints or
nothing. That is the single biggest constraint on this feature.

---

## 6. County coverage — the honest numbers

Probed 20 counties (the 13 OVIS has actually researched, plus 7 likely-next metro
ones). **Verified = responds to an anonymous attribute query and exposes a
parcel-number field on a polygon layer.**

| County | Status | Parcels | Field | Note |
|---|---|---|---|---|
| Forsyth | ✅ | 105,470 | `PARCELID` | county-hosted, `geo.forsythco.com` |
| Gwinnett | ✅ | 309,861 | `PIN` | |
| DeKalb | ✅ | 245,518 | `PARCELID` | |
| Bibb / Macon-Bibb | ✅ | 68,899 | `PARCELID` | 2nd-biggest research footprint |
| Columbia | ✅ | 66,097 | `PIN` | covers Grovetown |
| Jackson | ✅ | 45,046 | `PIN` | |
| Decatur | ✅ | 8,431 | `PARCELID` | covers Bainbridge |
| Fulton | ⚠️ | 27,033 | `ParcelID` | **partial** — Fulton has ~340k parcels; this is an EnerGov subset |
| Cobb | ⚠️ | 11,485 | `PIN` | **partial** — a "Zoning by Parcel" layer, not the fabric |
| Dawson | ⚠️ | 1,982 | `PARCELID` | **Dawsonville city only**, not the county |
| Hall | ❌ | — | — | **biggest research footprint (80 staged rows).** Viewer is an AGOL Experience; parcel data is behind qPublic, no open REST layer found |
| Paulding, Clayton, Polk, Elbert, Fayette, Coweta, Floyd, Cherokee, Barrow | ❌ | — | — | no public queryable parcel layer found |

**8 of 20 fully usable, 3 partial, 9 none.**

Two caveats, both pointing the same way:

1. **This is a floor, not a ceiling.** The ArcGIS Online search *missed Forsyth*,
   which demonstrably works — county-hosted ArcGIS Server instances aren't
   indexed by AGOL. Some of the 9 "none" counties may have an endpoint under a
   hostname I didn't guess. Each one is a manual hunt.
2. **Which is exactly why coverage can't be assumed.** There is no registry, no
   naming convention, and no consistent field name (`PARCELID` / `PIN` /
   `ParcelID`). Every county is bespoke work.

Note Hall County is the worst case: the most-researched county, and the one
without an endpoint.

---

## 7. What it would take to build

Roughly a day, in four pieces. Nothing here is hard; the risk is all in coverage.

**A. Populate `parcel_numbers` (highest value per unit of effort).**
Have the research agent emit parcel IDs into the existing `parcel_numbers` array
at staging time. Fall back to a regex over `parcel_boundary_notes`
(`/(?:parcels?|pins?)[^0-9A-Za-z]*([A-Z]?\d{2,3}[\s-]\d{3})/gi`) for the ~250
existing rows. Normalize on write: strip non-alphanumerics, uppercase.

**B. A per-county adapter registry.**

```ts
// one entry per county; adding a county is adding a row here, nothing else
{ county: 'Forsyth', layer: 'https://geo.forsythco.com/.../Tax_Parcel/FeatureServer/0',
  idField: 'PARCELID', match: 'padded-like' }
```

Keyed off the row's municipality → county. No entry = no attempt, silently. Call
it server-side (an edge function) so results can be cached and we aren't hitting
a county server from every browser.

**C. A distinct location source — this is the part that matters.**
Add `location_source` to `municipal_project` / `_staging`:
`'address_geocode' | 'parcel_centroid' | 'manual'`. **`address_geocode` stays the
default and the existing path is unchanged.** Parcel resolution only fills in a
centroid where the address geocode came back `GEOMETRIC_CENTER` / `APPROXIMATE`,
or where it is missing. Store the resolved parcel IDs and the source layer
alongside, so a stale centroid is traceable to the fabric version that produced it.

For multi-parcel rows, resolve each and use the **area-weighted mean of the
centroids** (`STATEDAREA` is right there), not a naive average — otherwise five
small lots outvote one 178-acre tract.

**D. A distinct pin style.**
A parcel centroid is a *parcel* location, not a street address — it can sit
hundreds of feet from the building. Render it differently (outline/hollow pin vs
filled) with the source in the tooltip, so nobody reads it as surveyed precision.
Per the brand palette, Steel Blue `#4A6B94` outline reads as "derived" against
the solid Deep Midnight Blue `#002147` address pins.

Then, and only then: let parcel-centroid rows back into proximity dedupe, which
they're currently excluded from.

---

## 8. What I would not do

- **Don't touch the address path.** Address remains the primary source.
- **Don't build a generic "GA parcel geocoder."** There's nothing statewide to
  build it on; a registry that covers 8 counties honestly beats an abstraction
  that pretends to cover 159.
- **Don't chase Regrid/GIS1 yet.** Both are paid, and neither is queryable in the
  form we need without a licence conversation.
- **Don't cache county parcel fabrics locally.** Forsyth alone is 105k rows and
  updates nightly; a stale local copy reintroduces the retired-parcel problem on
  purpose.

---

## 9. Suggested order

1. **A + B + C for Forsyth only**, behind a flag. Forsyth + Cumming is 50 staged
   rows and the 7 stacked fake centroids above — a measurable, checkable win.
2. Verify against the two known-good cases (`097-056` → 4.8 km correction,
   `144-082` → 8.1 km).
3. Add Bibb and Columbia (both confirmed) — that covers the #2 and #3 research
   footprints.
4. Only then decide whether Hall is worth a manual endpoint hunt or a qPublic
   conversation. It's the biggest footprint and the hardest target.

## Reproducing any of this

Probe scripts used for this report are throwaway and live in the session
scratchpad; every number above is reproducible with the single `curl` in §1 plus
the SQL in §3–§4. No credentials needed for the endpoint work.
