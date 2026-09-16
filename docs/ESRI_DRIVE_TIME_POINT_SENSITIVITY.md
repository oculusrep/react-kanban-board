# Esri drive-time figures are sensitive to the start point

**Finding, 2026-09-15.** At the Macon site (site submit `fc0cd59c`, Capital City Bank – Starbucks,
Zebulon Road), the Esri 10-minute drive-time population moves by a third depending on which of three
points about 10 m apart the pull starts from. **Any drive-time number needs its pull coordinate recorded
next to it.** Straight-line rings are unaffected: the 1 mi and 3 mi ring figures matched exactly between
pulls.

## Same-day pulls (2026-09-15 15:44 ET, `esri-geoenrich`, 10-minute drive time only, cache bypassed)

| Start point | Coordinate | 10-min population | Daytime pop | Households | Median HH income | Area (sq mi) |
|---|---|---|---|---|---|---|
| July 26 pull point | 32.880405, −83.760981 | **27,599** | 25,452 | 11,185 | $102,555 | 35.90 |
| `site_submit.verified` (the point research treats as the site) | 32.880362, −83.760908 | **24,538** | 22,634 | 9,926 | $105,244 | 33.48 |
| Property coordinate (Sept 15 sidebar pull) | 32.880367, −83.761093 | **19,845** | 18,705 | 7,978 | $103,450 | 27.03 |

Distances between points: July ↔ verified 8.3 m, July ↔ property 11.3 m, verified ↔ property 17.3 m.

The polygons are nested: nearly all of the property-point polygon lies inside the verified-point polygon,
and nearly all of that lies inside the July-point polygon. Each extra meter east reaches more road network.

## Same point, different date

The July point re-pulled seven weeks later: 27,461 (35.98 sq mi) on 2026-07-26 → 27,599 (35.90 sq mi)
today. That is +0.5%, with the polygon slightly different, so there is small drift over time. The point
effect is about 40 times larger: 19,845 → 27,599 across 11 m on the same day.

Across the enrichment log, other sites pulled twice at the identical point returned identical figures;
pairs 11–94 m apart moved −28% to +5%.

## Request settings (identical for every pull)

`esri-geoenrich` → Esri GeoEnrichment `NetworkServiceArea`, `bufferUnits: Minutes`, `travelMode: "Driving"`,
no time of day; code unchanged since 2026-06-06. The only input that differed was the coordinate.

## Implications

- A drive-time figure without its coordinate cannot be compared or defended. `esri_enrichment_log` stores
  the coordinate per call; `site_submit.client_demographics` and the property's Esri columns do not.
- The sidebar pulls at the property coordinate; site research treats `site_submit.verified` as the site.
  At Macon those two points give 19,845 and 24,538.
- The "29,000" figure does not match any pull at any of the three points.

## What changed (2026-09-15, pending deploy)

- `site_submit.client_demographics.pull_point` = `{ latitude, longitude, source }`, written on every save
  (`saveClientDemographicsToSiteSubmit`; the create form's copy-from-property path carries the property's
  pull point). The property already recorded `esri_enriched_latitude` / `esri_enriched_longitude` on every
  save.
- The site submit sidebar's client-demographics enrichment pulls at the site coordinate by research's
  precedence (`site_submit.verified -> property.verified -> site_submit.sf_property -> property.lat`,
  `src/utils/resolveSiteCoordinate.ts`), as does the create form. Property enrichment stays at the
  property's own coordinate: those figures belong to the property and every site submit on it.
- Research snapshots carry `pull_point` (with `distance_from_site_m`) per ring and drive time, or null
  when not recorded; prompts `archetype_call` v8 / `deep_pass` v3 flag unrecorded and offset drive times.
- Backfill `20260915163047_backfill_client_demographics_pull_point`: 49 of 76 existing records recovered
  (45 exact matches in `esri_enrichment_log`, 4 copies of their property's figures); 27 stay unrecorded.
  Of the 49, 39 were pulled at the site coordinate (≤ 0.1 m); 10 were pulled 13.5–683.6 m away, the
  largest `a78add63` Walker Ridge, Cartersville (684 m) and `d4323b55` Bentley, Martin Rd & Falcon Pkwy (204 m).
