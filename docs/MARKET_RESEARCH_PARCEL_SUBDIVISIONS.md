# Market Research — Parcel subdivisions pass

**Purpose:** find built-out neighborhoods from the county parcel layer, not
from search results. It complements the Gemini-only
[recently built pass](MARKET_RESEARCH_RECENTLY_BUILT.md), which under-reports
because each run returns a different list.

**Code:**
- `supabase/functions/_shared/subdivision-layers.ts`: the layer registry, the
  parcel fetch, and grouping.
- `supabase/functions/_shared/research-parcel-subdivisions.ts`: the pass.
- Edge function `research-recent-built`, modes `parcel_preview` and
  `parcel_run`.
- Migration `20261116131946_research_parcel_subdivisions`.
- UI:
  - `ParcelSubdivisionsButton` ("🧱 Parcel subdivisions", in the site
    sidebar's Market research panel, next to "Recently built only").
  - `EstablishedSubdivisionLayer` (map layer **Established (pre-2020)**, in
    both layer menus).

## Rules

1. **Parcels.** The pass takes every parcel with a subdivision name
   (`SUBDIVISIO`) within the site radius, from each layer in
   `SUBDIVISION_LAYERS` whose municipalities fall in the radius.
   - Henry County has two layers: the City of Locust Grove layer and the
     county layer.
   - A parcel that appears in both layers is counted once (the city layer
     wins).
   - Parcels zoned commercial, office or industrial (C*, OI, M*, I*, LI, BP…)
     are dropped.
2. **Groups.** Parcels are grouped by subdivision name. Groups are skipped when:
   - the name is blank;
   - the name isn't residential ("Professional Center", "Business Park"…);
   - it's a mobile home park (MHP);
   - it has fewer than **25** parcels.
3. **Already in OVIS?** Each group is checked with
   `research_parcel_subdivision_lookup`. The parcels are unioned into one
   polygon, and the group matches an existing record when:
   - the name matches, within the run's municipalities; or
   - a committed or staged record's pin is inside the polygon; or
   - a record's boundary overlaps the polygon by at least 25% of the smaller
     shape.

   A record matched by name belongs to that subdivision. It is removed from
   other subdivisions' spatial matches, because a misplaced pin can sit inside
   a neighboring subdivision. A matched subdivision is never staged again:
   - if OVIS has fewer units than the parcel count (by more than 5%), it gets
     a pending **replace** suggestion, "OVIS X → Parcels Y", in the approval
     modal's suggestion box;
   - otherwise it is logged only.
4. **Year built (Gemini, live search).** Year built isn't in either Henry
   County parcel layer (it's only in qPublic), so it comes from a web search.
   The prompt is: "When was the <subdivision> neighborhood in <city>, GA built?
   Year first homes were completed and year built out. Cite sources."
   - Gemini's grounding citations count as sources.
   - Listing and aggregator pages are removed (`source-rules.ts`). If no other
     source is left, there is no year.

   The year that decides is the build-out year, or the majority-completion
   year if there is no build-out year:

   | Answer | Result |
   |---|---|
   | 2020 or later | Staged **Recently Completed**, `year_completed` set |
   | Still building, first homes 2015+ (or unknown), no majority year | Staged **Under Construction** |
   | Before 2020 | `established_subdivision` → **Established (pre-2020)** layer |
   | No sourced year, or "still building" with first homes before 2015 | Logged (`unknown_year`) |

   A subdivision already in the Established layer isn't asked again.
5. **Staged record.**

   | Field | Value |
   |---|---|
   | `total_housing_units` | Parcel count (`units_confidence 'reported'`) |
   | `source` | "<layer>, N parcels ; <sources>" |
   | `discovery_source` | `parcel_layer` |
   | Boundary | Union of the parcels (`geometry_source 'parcel_fetch'`, set after the run leaves `running`) |
   | Card tag | "🧱 PARCEL LAYER" |

   The parcel count may include a few common-area lots.
6. **Post-run steps:** name dedupe, then distance check. Parcel-layer
   Recently Completed rows join the summary's `recent` bucket, the same as
   the recently built pass. Under Construction rows count in the pipeline
   buckets.

The **Established layer** is the `established_subdivision` table. Each row has
the name, city, parcel count, first / built-out / majority years, the basis,
the sources and the polygon. It is unique per (county, name). It's reference
data only and never counts toward a pipeline or growth total. It can be read
by internal users (RLS `is_internal_user()`). Only the service role writes it.

**Logs:** every subdivision gets a row in `research_recent_log` with
`basis = 'parcels'` and `parcel_count`. Outcomes are `staged`, `established`,
`unknown_year`, `replace_suggested`, `dropped_equal` and `dropped_lower`.

## Layers

| Layer | URL | Notes |
|---|---|---|
| City of Locust Grove | `arcgis.co.henry.ga.us/…/Locust_Grove/Locust_Grove/MapServer/1` | Answers even when the county layer hangs |
| Henry County | `arcgis.co.henry.ga.us/…/Parcels/MapServer/12` | Same Imperva-fronted server as the parcel adapter. Every query returned 503 "Wait timeout" for about an hour on 2026-11-16, then it recovered. A layer that doesn't answer is reported in the summary and in Telegram, and the run continues without it. |

No other county is registered yet. Butts County (Jenkinsburg) has no layer.

## First run — Pad Sites (Locust Grove), 5 mi, 2026-11-16

**Run a387cbd5.** An earlier run, ebd18e66, was superseded: its polygons
weren't saved, and it hadn't used the grounding citations.

- **Parcels:** 3,977 from the Locust Grove layer and 8,855 from the Henry
  County layer, which come to 8,103 residential parcels in 77 subdivisions of
  25+ parcels.
- **Skipped:** Skyland MHP (394), Grove Professional Center, and 19
  subdivisions under 25 parcels.

| Outcome | Subdivisions | Parcels |
|---|---|---|
| Staged Recently Completed | 9 | 911 |
| Staged Under Construction | 4 (Brighton 295, Indian Grove 88, Peeks Point 42, and Patriots Point 135, which was staged by hand; see below) | 560 |
| Established (pre-2020) | 22 in the layer | 2,310 |
| Already in OVIS, replace suggested | 7 | |
| Already in OVIS, logged | 7 | |
| No sourced year | 34 | |

**Cost:** $2.01 for this run, plus $2.53 for the superseded run.

**Replace suggestions (pending):**
- Berkeley Lakes 62 → 262
- Bunn Farms 376 → 406
- Evergreen Crossing 123 → 190
- Peeksville Landing 44 → 50
- Copperfield 26 → 28
- Liberty Grove (staged, no count) → 138
- Cedar Ridge 87 → 224. **Probably wrong:** the 224-parcel Cedar Ridge is
  4.99 mi north, and the 87-unit record is a Locust Grove phase. It matched on
  name only. Dismiss unless confirmed.

**Gemini run-to-run variance is real here too.** Kimbell Farm (built out 2021)
and Al-Jennah (2020) were dated on the first run and not on the second, and
Tanger Ridge went the other way.

**Patriots Point** (135 parcels) had no sourced year on two searches. It was
staged as Under Construction because the Pad Sites slide lists it that way. Its
notes say so.

### Against the Pad Sites slide's built-out list

| Slide | Units | Parcel layer | Result |
|---|---|---|---|
| Richmond Park | 160 | 124 | Established, built out 2006 |
| Jubilee | 227 | 138 ("Jubliee") | Established, 2019 |
| Leesburg Plantation | 53 | 53 | Established, 2004 |
| Waters Edge | 175 | 145 | Established, 2007 |
| Nine Oaks | 124 | 77 | Staged Recently Completed, 2024 |
| Indian Grove | 88 | 88 | Staged Under Construction (first homes 2020, still building) |
| Berkshire @ Linden Park | 82 | 80 | Staged Recently Completed, 2020 |
| Hawthorn @ Linden Park | 160 | 94 | Staged Recently Completed, ~2021 |
| Carriage Gate | 190 | 166 | Established, 2016 |
| Grove Park | 165 | 178 | Established, 2003 |
| Locust Grove Station | 1,665 | No single subdivision. Its "at Locust Grove Station" sections total 339 (see below), plus OVIS Cedar Ridge at LGS (224) | — |
| Grove Village | 245 | 248 | Staged Recently Completed, 2021 |

The Locust Grove Station sections:
- Elmstone Commons 122: no year.
- Collinswood 90: matched OVIS Cedar Ridge at LGS.
- Al-Jennah 75: only listing sources.
- Brookdale 52: Recently Completed, 2022.
