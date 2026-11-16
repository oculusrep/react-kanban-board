# Market Research — locate step

Finds **where** a project is when its address doesn't give a precise pin.
Code: `supabase/functions/_shared/research-locate.ts`. Migrations:
`20261115071823_research_locate`, `20261115072556_location_confidence_clear`,
`20261115073142_research_location_estimate_before`.

## Where it runs

1. **Post-run pipeline** (final `submit_research_report`, `ovis-research-mcp`):
   dedupe → Gemini units → **Gemini location** → dedupe → parcel fetch → Sweep ready.
2. **"Fill missing units & locations"** on the approval view (`research-fill-units`):
   same steps, run by run. A record with an earlier locate attempt is not re-asked
   (safe to run twice).
3. **One-off committed pass** (`locateCommitted`), run 2026-11-15 on all sites.

Needs edge secrets `GEMINI_API_KEY` and `GOOGLE_GEOCODING_API_KEY`. Without the
geocoding key the step is skipped and logged.

## Which records

Pending staged records with no precise pin, decided once per record and stored in
`location_precision`:

| value | meaning |
|---|---|
| `boundary` | has a parcel boundary → pin inside it |
| `precise` | own address geocodes ROOFTOP / RANGE_INTERPOLATED / intersection, and isn't just a road + city |
| `imprecise` | APPROXIMATE / GEOMETRIC_CENTER, or road + city only → **locate** |
| `no_address`, `failed` | → **locate** |

Committed records: no pin, or an `address_geocode` pin whose address now geocodes
imprecisely or is only a road + city. Never a `polygon` or `manual_pin` pin.

## The Gemini call

Gemini 2.5 Flash with live Google Search. The prompt is the one in the spec ("Where
exactly is <project> (<builder>) in <city>, <county> County, GA being built? …"),
followed by the record's own address, location text, parcel notes, source and notes.
It must not pick between phases. The answer is JSON: street_address, intersection,
side_of_road, landmarks_directions, parcel_ids, acreage, and facts with a source for each.

An answer is used only if it is grounded: it has grounding chunks, a fact cites a URL,
or the search ran and the facts cite results. Facts that cite "user context" (our own
text echoed back) are dropped.

## Write-back

- **Pin** — the street address, then the intersection, is geocoded. It becomes the
  pin only if **all** of these hold:
  - it's precise (ROOFTOP / RANGE_INTERPOLATED / a resolved intersection);
  - it's within 3 mi of the record's municipality boundary;
  - **road guard:** when the record names a road ("Dearing Road", "Hwy 212"), the
    candidate is on it. Otherwise Gemini has probably matched a different project.
    This happened in testing: "Covington Apartments (Dearing Road PUD)" came back as
    RENDER Covington on Delk Dr. When every candidate fails a guard, nothing from
    that answer is used (hint, parcels and acreage included).

  Staged: `located_lat/lng/address`, `location_confidence='estimated'`, and an
  **EST. LOCATION** tag on the card. On approve, the RPC uses this pin when the
  reviewer's address geocode isn't precise and there's no boundary
  (`centroid_source='research_locate'`). The tag carries through.

  Committed: `set_municipal_project_estimated_pin`. The old pin is kept in the log
  (`before.pin`).
- **Site distance (staged only):** after a pin is placed, it's checked against the
  run's radius. Outside it, `lead_reason` = "Outside the N-mile radius: estimated
  location … is X mi from the site". Committed records are never moved.
- **Directions and landmarks** (since 2026-11-16): the prompt asks for driving
  directions to the entrance (`directions`) and a list of landmarks to look for
  (`landmarks`: school, church, entrance sign, water tower, creek, power lines…) as
  separate fields. They're added **under** the record's own `location_description`
  as `Directions: …` and `Look for: …` lines, pin or no pin. With no pin, a
  `Pin hint: near <intersection>; <side of road>` line comes first. Nothing replaces
  the record's own text; a re-ask replaces only earlier Directions / Look for lines.
  Written only when the lines add at least 3 significant words the record didn't
  already have. (Before 2026-11-16 the hint replaced the text and the old text went
  to notes.) Directions come from web sources and aren't checked; treat them as a
  starting point.
- **Parcel IDs / acreage (staged only):** `parcel_boundary_notes` is prefixed
  "Parcel IDs: a, b; approx N acres", `parcel_numbers` gets the new IDs, and
  `parcel_fetch_status` is reset so the parcel fetch tries them. Filters:
  - real parcel numbers only: no "Land Lot …" / "District …", at least 4 digits,
    and no more than 10 IDs (more than that is a subdivision's lots, not the tract);
  - acreage under 2 is ignored (lot-size), and is skipped when the notes already
    state one.
- **Committed records** (added 2026-11-15): parcel IDs are written too, but only
  IDs in the record's county adapter format (`idPattern` on each adapter in
  `parcel-adapters.ts`; no adapter → none). Then the server-side parcel fetch
  (`fetchBoundariesForProjects`, same RPC and rules as the Fetch button) runs on
  them. Newton's adapter is the 2022 snapshot's short DXF id ("27-127"), so
  padded ("0013-144") and long qPublic ids ("0051000000075000") are rejected.
- **Sources** go in notes as `[Locate YYYY-MM-DD — Gemini web search] …` with facts
  and URLs.

## EST. LOCATION lifecycle

- Map: washed-out, dashed pin with a "?" corner.
- Project card: an EST. LOCATION panel with a **Confirm location** button, which
  sets `location_confidence='confirmed'`.
- Dragging the pin, drawing a boundary, or any other pin source clears the tag
  (trigger `municipal_project_clear_location_confidence`).

## Summary / Telegram

`get_research_summary` → `ready.with_precise_pin`: a boundary, a precise address, or
a located pin. Shown in the approval header and in "Sweep ready" as
"📍 N of M ready records have a precise pin".

## Log and cost

`research_location_estimate` has one row per Gemini call. Each row holds the answer,
parsed JSON, sources, tokens, Gemini cost (an upper bound: the grounding fee is
charged on every call) and geocode cost (0.5¢ per request). It also holds the
outcome, old/new hint and `before`: the record's fields before the write-back, so
any write-back can be undone exactly. Run totals are kept on
`research_run.locate_calls / locate_cost_cents`.

## First runs (2026-11-15)

| | staged (6 sweeps) | committed (all sites) |
|---|---|---|
| records checked | 96 classified, 62 already precise | 77 address pins re-checked, 69 precise |
| Gemini calls | 32 | 26 |
| pins placed (EST. LOCATION) | 15 | 14 |
| pin hints improved | 9 | 5 |
| parcel IDs found | 6 records with new valid IDs written | 9 answers had IDs (not written: pins and hints only) |
| moved to leads (outside radius) | 8 | — (never moved) |
| cost | $1.64 | $1.25 |

Two test passes on Alcovy ($0.49) were reverted: they exposed the grounding,
echo-hint and road-guard bugs fixed above. A parcel-ID bug (land-lot references
taken as parcel numbers) was cleaned from the logged `before` snapshots without new
calls.

Flag, not fixed: "DRB Group Old Kelleytown Road Subdivision" — the parcel fetch drew
a 1.01 ac partial boundary against 165.91 ac stated (101-01001006 missing from the
fabric). It's flagged for review by the existing variance rule.

## Follow-ups (2026-11-15, second pass)

- DRB Old Kelleytown: the 1.01 ac partial boundary was removed ("partial parcel —
  boundary removed" in notes). `parcel_fetch_status` stays `partial` so the fetch
  doesn't redraw it. Its EST. LOCATION pin (Kibbee Rd & Kelleytown Rd) stays.
- Committed parcel IDs from logged answers (no new calls):
  - Bellwood: 27-100A written, but not in the 2022 snapshot.
  - Grand Reserves: 0013-144 rejected (format).
  - Serenity Lake: Upson has no adapter, so nothing was written.
  - Keg Creek Landing: 4 Coweta IDs written. The fetch drew a **partial** boundary,
    72.88 ac against 247.93 ac stated (162 1280 002 missing), flagged for review.
  - Freedom Land Holdings (both records): 29 IDs, over the 10-ID cap, so none
    were written.
  - Five Newton records: padded IDs rejected.
  - Robins Royal: Houston County has no adapter.

## Forced re-ask (2026-11-16)

`relocateRecords(supabase, keys, [{ kind: 'staged' | 'committed', id }])` asks again
for the given records, even ones tried before. Edge entry: `research-fill-units`
with `{ mode: 'relocate', records: [...] }` (≤ 20 per call). A record that already
has a pin keeps it (`keepPin`): no geocoding, only directions / landmarks / parcel
IDs. A record with no pin can get one by the usual rules. Records with a boundary
and non-pending staged rows are skipped.

First run, 2026-11-16: the 8 "not on map" records, plus pinned records without a
boundary from the Senoia, Covington (Alcovy Road) and Locust Grove sites (committed,
and pending staged non-leads): 30 records, $1.48.

- 2 pins placed (EST. LOCATION, at the intersection Gemini gave): Pickett Bridge
  Estates (GA-212 & Pickett Bridge Rd), Grand Horizon Estates (GA-20 & Bailey Creek Rd).
- 15 records got directions and/or landmarks (Dobbs Landing included).
- 1 parcel-ID write (White Oak Farms); 14 found nothing new.
