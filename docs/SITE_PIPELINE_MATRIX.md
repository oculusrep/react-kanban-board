# Housing pipeline: one count, two variants, a weighted index

**Built 2026-09-27.** Migration `20260927085437_site_pipeline_matrix`.

## Why

`MunicipalUnitsScreenshotModal` counted stage x catchment units in the browser with turf; site
research counted its own way in `queryMunicipalProjects` (centroid, one ring, one phase). They
drifted: the Macon deep pass reported **"860 units"** — Under Construction within 3 mi — where the
3 mi pipeline is 1,732 and the 10-minute drive shed is 2,478 by the modal's own test. The count now
lives in SQL and both callers use it.

## `public.site_pipeline_matrix(lat, lng, households, site_submit_id, isochrones)`

Returns, as jsonb:

- **`bands`** — one entry per catchment (1mi, 3mi, 5min, 10min), each with per-phase cells carrying
  **both** membership tests, plus `weighted_units` and `weighted_index`.
- **`projects`** — every placed project within 10 mi, with distance, drive-time band, weights, and a
  `recently_completed_timing_unknown` flag.
- **`pending_unreviewed`** — agent-discovered rows for this site's research runs. Exported, never totalled.
- **`coverage`** — projects on file within 10 mi, last collected, research runs for the site.
- **`weights`** — what was applied, read from config.

### Two variants, labelled

| | counts a project when | used for |
|---|---|---|
| `units_centroid` | its pin sits inside the catchment | the weighted index |
| `units_intersects` | its drawn boundary clips the catchment | slides, and matching the Demo Map Slide |

Intersects credits a 600-unit project in full to a ring its edge touches — right for a slide, wrong
for a density index. Macon: 3 mi is 1,732 centroid / 1,822 intersects; the 10-minute shed is 1,924 /
**2,478**, which is within three units of the ~2,481 on the Demo Map Slide.

### Weighted index

`index = sum(units x phase_weight x distance_weight) / households in that band`, centroid membership.
Weights are rows, not code: `pipeline_phase_weight` and `pipeline_distance_weight`.

| Phase | Weight | | Distance | Weight |
|---|---|---|---|---|
| Under Construction | 1.00 | | <= 1.0 mi | 1.00 |
| Approved | 0.60 | | 1.0-2.0 mi | 0.70 |
| Planning | 0.25 | | 2.0-3.0 mi | 0.50 |
| Recently Completed | **0.00** | | beyond | 0 |
| unreviewed | 0.00 (excluded) | | | |

**Recently Completed weights 0** because Esri `_CY` households are modelled current-year estimates
(`BlockApportionment:US.BlockGroups;PointsLayer:US.BlockPoints`), so occupied units are already in the
denominator; counting them again double-counts. **Residual:** `esri_data_vintage` is empty, so a very
recently occupied project may not be in the estimate yet. `municipal_project_v` has no completion date
column, so every Recently Completed row is flagged `recently_completed_timing_unknown` and carries the
caveat in `pipeline.csv` notes. Surfaced, never adjusted for.

Macon at deploy: 1mi 0.0259, 3mi 0.0589, 5min 0.0000, 10min 0.0562. **No threshold is set** — that
gets calibrated across sites Starbucks has already approved or passed.

### Coverage indicator

An empty result is never "no material pipeline". `coverageVerdict` distinguishes a real thin pipeline
from a COVERAGE GAP (nothing collected here, or Market Research never run), and `deep_pass` v10 forbids
resting the archetype call on an uncollected geography.

### Isochrones

Taken from the `esri_enrichment_log` cache: **nearest coordinate first, then newest**. Drive-time sheds
are point-sensitive — a pull 17 m away has a 27.0 sq mi 10-minute shed against 33.5 at the site
coordinate, which silently moved two projects out of the band during development
(docs/ESRI_DRIVE_TIME_POINT_SENSITIVITY.md). The response reports `isochrones_pulled_m_from_site`.

## pipeline.csv

`flag, name, units, phase, distance_mi, drive_time_band, street, city, state, zip, lat, lng,
status_source, source, notes`. CHECK rows sort to the top (unreviewed, no unit count, or unplaceable),
blanks stay blank, nothing is filtered out.

## Esri drive-time sheds: why they are small (report only)

All 24 logged 5-minute sheds are 2.4-4.7 sq mi; at Macon the 5-minute shed is 3.16 sq mi against a
3.14 sq mi 1-mile circle. `esri-geoenrich` sends `travelMode: "Driving"` with no `timeOfDay`. Esri's
own documentation says a service area solved without a time of day uses **static travel times** —
"the results are based on static travel times — the travel times on a network edge don't vary
throughout the day" — and that traffic applies only when a date and time are set AND the network
carries traffic data. The GeoEnrichment REST reference documents no default travel mode and says
nothing about traffic. So the sheds are free-flow, posted-speed, time-of-day-independent.

To change it: add `timeOfDay` (epoch milliseconds) and optionally `timeOfDayIsUTC` to the
`studyAreas` entry in `enrichDriveTime`, and pick a travel mode deliberately. That makes the number
traffic-aware but also time-dependent: a shed pulled at 8am and one at 2pm stop being comparable, and
cached rows from before the change would mix with rows after it. Not blocking anything; flagged only.
