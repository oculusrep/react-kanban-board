# Market Research — "Recently built" pass

**Purpose:** capture neighborhoods completed **since the 2020 Census (April 2020)**
so they can be added as Recently Completed records. It does **not** validate
existing records. Residential communities of 25+ homes or units, per municipality
in a site's radius. OVIS runs it with Gemini (live Google search); the OpenClaw
agent is not involved.

See also: [parcel subdivisions pass](MARKET_RESEARCH_PARCEL_SUBDIVISIONS.md),
which finds built-out neighborhoods from the county parcel layer instead of a
search list, and keeps pre-2020 ones on the Established (pre-2020) layer.

Code:
- `supabase/functions/_shared/research-recent.ts`
- edge function `research-recent-built`
- migrations `20261115081214_research_recently_built`, `20261115190712_research_recent_2020_rules`
- UI: `RecentlyBuiltButton`, `RecentUnitSuggestions` (in the approval modal)

## Rules (2026-11-15, "2020 rules")

Every community Gemini returns is looked up in OVIS (`research_recent_lookup`:
committed records first, then other runs' pending/approved staged rows; same name
ignoring phase, or same street address with a house number) **before anything is
staged**:

| Case | What happens |
|---|---|
| Not in OVIS, with completion evidence | Staged as a new Recently Completed record |
| Not in OVIS, no real completion evidence | Logged only (`dropped_no_evidence`) |
| In OVIS, Gemini count > OVIS count by more than 5% (or OVIS has none) | A pending **replace** suggestion: "OVIS X → Gemini Y (source)" with one-click Replace / Dismiss. Never applied automatically. |
| In OVIS, equal / lower / no Gemini count | Logged only (`dropped_equal` / `dropped_lower` / `dropped_no_count`). Nothing in the queue. |

All of it is in `research_recent_log` (one row per community, `outcome`, and
`state` = logged / pending / replaced / dismissed). No "mark Recently Completed"
suggestion and no unit-review flag is ever raised on an existing record.

**Completion evidence** (new records only) — one of: sold out / builder closeout,
certificate of occupancy, final-phase plat recorded, apartments in lease-up. Gemini
labels evidence loosely, so the label stands only when its one-line detail says it
(`evidenceHolds`): e.g. "move-in ready homes available" or "listings show Closed"
do not count as sold out; "only 2 homes remaining, model closed" counts as
closeout; a rental "built in 2021, units for rent" counts as lease-up.

**Unit counts** — a count stands only when its source is not a listing or
aggregator page (Zillow, Redfin, Realtor.com, Homes.com, Apartments.com,
NewHomeSource, Livabl, after55, …; `LISTING_HOST`). Gemini cites
`vertexaisearch…/grounding-api-redirect` links; they are resolved to the real URL
first (they also expire). A count with an unresolvable source is not used.

**Cutoff** — completed April 2020 or later. A 2020 completion with no month is kept.

## Triggers

- **Checkbox** on research confirm and sweep confirm: "Include recently built
  (since 2020)", **on by default**. A sweep runs it **once** (tagged with the
  sweep's `sweep_id`), not per chunk.
- **"🏘 Recently built only" button** in the site sidebar's Market research runs
  panel. It runs only this pass plus its post-run steps, for sites that have
  already been researched. It shows the estimated cost first: ~5¢ per municipality
  for the search, plus locating. The estimate uses averages from earlier runs once
  there are some. Requires `can_approve_market_research`.

## The search

One Gemini call per municipality (`get_municipalities_in_radius_for_site`). The
prompt is the one in the spec ("List residential communities of 25+ homes or units
in <municipality>, GA completed or substantially built out since 2020. For each:
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

1. (Already-in-OVIS is decided before staging — see Rules.)
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
- **Map:** a separate system layer, **Recently Built (since 2020)**, with teal pins.
  It contains every municipal project whose effective status is Recently
  Completed. The Municipal Projects layer now shows the pipeline only, so "built
  since 2020" and "coming" can be shown separately. It's in both layer menus.

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

## Re-run under the 2020 rules — Locust Grove, 2026-11-15

The first run's 11 pending rows were rejected as "Superseded" (reversible).

- **Run b25f7224** (2020 rules, before the evidence-text check): 9 found, 4 already
  in OVIS (all dropped silently: Norman Estates equal; Springs at Locust Grove,
  River Oaks and Oak Ridge Meadows had counts only from listing pages), 5 staged.
  The evidence-text check was added after this run. Broder Farms and The Pointe at
  Heron Bay fail it ("listings show Closed"; "move-in ready homes available"), so
  they were superseded and logged. The other 3 were kept.
- **Run fa74e988** (with the evidence-text check): 1 found (Springs at Locust
  Grove, equal count → dropped). Henry County came back empty without Gemini even
  searching. $0.16.
- **Left in the queue:** Station 75 Apartments at McDonough (2021, no count, inside
  radius); Havenwood Grove Senior (2020, count removed: only source after55.com);
  Cambria at Traditions (lead: 13.8 mi). No replace suggestions.

**Known limitation:** one Gemini call per municipality gives a different list each
run (21 / 9 / 1 communities on three runs of the same site). A single run
under-reports.

## Multi-search run — Locust Grove, 2026-11-16 (run 8e3f866b)

8 searches (Jenkinsburg has no OVIS builders, so no builder-led search there).

- **Found 13** (2 merged duplicates): Locust Grove rental 7, builder-led 5,
  single-family 1. Henry County: 0 on all three. Gemini read 44 sources and
  explained it: the big subdivisions are still selling or inside city limits.
  Jenkinsburg: 0.
- **Already in OVIS: 5, dropped silently.** Havenwood Grove Senior and Springs at
  Locust Grove had equal counts. Bunn Farms had OVIS 109 vs Gemini 478, but the
  478 came only from a listing page, so no suggestion. Station 75 and a
  "Havenwood Grove" variant had no count.
- **No completion evidence: 3, logged.**
  - Avilla Holloway: opens mid-2026.
  - Quinn Residences and The Levi: labelled lease-up, but the detail is listing
    text that doesn't say they're leasing.
- **Staged: 3.**
  - Liberty Grove (build-to-rent, lease-up; no count, year or address).
  - Heron Bay-Northridge (2021) and Heron Bay-The Summit (2020), both sold out
    (D.R. Horton) but 6.0 mi out, so they're leads.
- **Unit-count step:** 3 tried, none found a non-listing count.
- **Cost: $0.60** ($0.43 search + $0.11 unit count + $0.06 locate).

Unit-count step on the earlier run's records:
- Havenwood Grove Senior: 56 (lchousing.com).
- Station 75 Apartments: no non-listing source, so it stays without a count.
