# Market Research — "Recently built" pass

Finds residential communities of **25+ homes or units completed or substantially
built out since 2021**, per municipality in a site's radius. OVIS runs it with
Gemini (live Google search). The OpenClaw agent is not involved.

Code:
- `supabase/functions/_shared/research-recent.ts`
- edge function `research-recent-built`
- migration `20261115081214_research_recently_built`

## Triggers

- **Checkbox** on research confirm and sweep confirm: "Include recently built
  (since 2021)", **on by default**. A sweep runs it **once** (tagged with the
  sweep's `sweep_id`), not per chunk.
- **"🏘 Recently built only" button** in the site sidebar's Market research runs
  panel. It runs only this pass plus its post-run steps, for sites that have
  already been researched. It shows the estimated cost first: ~5¢ per municipality
  for the search, plus locating. The estimate uses averages from earlier runs once
  there are some. Requires `can_approve_market_research`.

## The search

One Gemini call per municipality (`get_municipalities_in_radius_for_site`). The
prompt is the one in the spec ("List residential communities of 25+ homes or units
in <municipality>, GA completed or substantially built out since 2021. For each:
name, builder, year opened or completed, total homes/units, street address or
nearest intersection. Cite a source for each.").

For a county, it asks about unincorporated areas only. The answer is JSON.

Dropped before staging:
- ungrounded answers, and communities with no source;
- communities with a stated count under 25, or a year before 2021;
- repeats across municipalities. A county answer often repeats the city's, and
  the city copy is kept.

## Staged record

| field | value |
|---|---|
| research_run | `research_scope = 'recent_built'`, `recent_muni_ids`, `recent_calls`, `recent_cost_cents` |
| status | Recently Completed |
| discovery_source | `gemini_recent` |
| year_completed | year opened / completed (new column; carried to `municipal_project` on approve) |
| total_housing_units | only if a source states it; `units_confidence = 'reported'`. Otherwise blank. The unit estimator and Fill skip these rows. |
| address | street address, else the intersection |
| source / notes | the URLs; the type, year and count with their source |

## Post-run steps

1. **Already in OVIS** (`research_recent_known`): matches a committed
   `municipal_project`, or another run's pending/approved staged row. A match means
   the same name ignoring phase, or the same street address with a house number,
   within the run's municipalities. A matched recent row is rejected as "Already in
   OVIS — project/staged record "X" (status)". **The existing record is never
   changed.** If it's still "Under Construction" while Gemini says it's complete,
   the reject reason shows both: a cue to update its status by hand.
2. Name dedupe → **locate** (pins / hints / parcel IDs; it stops starting new
   calls at the edge-function time budget) → dedupe → **parcel fetch**.
3. **Distance check** (`research_distance_check`, now also run after the parcel
   fetch in the normal post-run job and in Fill): a record is moved to leads with
   "Outside the N-mile radius: … is X mi from the site" when its boundary, located
   pin or precise address point (`address_lat/lng`, stored by locate's
   classification) is outside the radius.

## Where it shows

- **Summary** (`get_research_summary.recent`): kept out of the pipeline buckets.
  The approval header shows "🏘 N recently built · X units", plus how many have no
  count and how many are outside the radius.
- **Telegram**:
  - Sweep ready adds the 🏘 line.
  - A standalone run sends its own 3 lines: the 🏘 line, then "already in OVIS ·
    outside the radius · cost".
- **Approval card:** "🏘 RECENTLY BUILT · <year>" tag.
- **Map:** a separate system layer, **Recently Built (since 2021)**, with teal pins.
  It contains every municipal project whose effective status is Recently
  Completed. The Municipal Projects layer now shows the pipeline only, so "built
  since 2021" and "coming" can be shown separately. It's in both layer menus.

## First run — Locust Grove (Pad Sites), 5 mi, 2026-11-15

3 searches (Locust Grove, Jenkinsburg, unincorporated Henry County).

- **Found:** 21; 1 dropped (count under 25 or year before 2021); 20 staged.
- **Already in OVIS: 9.**
  - Berkeley Lakes is committed as Under Construction.
  - 8 are pending sweep records, all Under Construction: Springs at Locust Grove,
    Bridle Creek, Evergreen Crossing, Cooper Park, Echo Glen at Eagles Landing,
    Heritage Point, Norman Estates, Cambria.
- **Outside the radius: 7.**
- **Recently built in radius: 4 · 415 units (1 without a count).**
  - Oak Ridge Meadows Active Adult is pinned.
  - 673 England Chapel Rd Apartments, Grandview and Kendall Grove have no precise
    pin, so whether they're inside the radius is unverified.
- **Cost:** $0.51 ($0.20 search + $0.31 locate). The estimate was $0.69.
