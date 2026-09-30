# Site Story — project context

**State as of 2026-09-28. `main` at `68ace001`. Nothing in flight.**

Site Story is the in-app AI research thread on Starbucks site submits: an archetype call (Step 1),
a deep pass (Step 2), a brief written from the finished record, and record Q&A. It reads OVIS data
and the open web, writes a report to the thread and CSV/KML exports to the site submit's Dropbox
folder.

---

## Shipped 2026-09-28

**`site_pipeline_matrix`** — one SQL function, 4 phases × 4 geographies (1 mi, 3 mi, 5-min, 10-min
drive), **both** centroid and intersects variants labelled, a weighted index with tunable weights
in `pipeline_phase_weight` / `pipeline_distance_weight`, and a coverage verdict. Called by both
`MunicipalUnitsScreenshotModal` and the deep pass — the browser's turf implementation is gone. Two
implementations drift, which is why the deep pass had reported 860 units against a real 3 mi
pipeline of 1,732.

**`pipeline.csv`** and **`generators.csv`**. generators.csv carries the **researched categories
only** — churches, hospitals and medical, civic, hotels. Retail (grocery, big box, home
improvement, drug, fitness, destination retail) is still queried, still handed to the model and
still part of the co-tenancy read; it is not exported, because those locations are already in Sites
USA. An export filter, not a research change.

**KML by municipality.** One file per municipality holding a project within 10 mi, each carrying
that municipality's **whole** project set — the radius picks which files you get, never what is
inside one. Three markings, all in the shared `buildKml` so the export button gets them too:
`[UNVERIFIED]` (agent-discovered), `[NO BOUNDARY]` (point placemark, no polygon on file),
`[BOUNDARY UNCONFIRMED]` (parcel-fetched, unchecked). Completeness leads the run footer.

**IPEDS higher education** — a third group inside `query_nearby_schools`, so schools.csv and the
banded totals come from **one source** and cannot disagree. Three groups, three vintages, **never
summed**: an IPEDS headcount for 2023 and an NCES 2024-25 school year are unlike things across
unlike years. 6,163 institutions loaded, all geocoded, 5,823 with enrollment.

**merchant_location guards consolidated** into `_shared/merchant-brand-guards.ts` — one definition,
imported by ingest, map render and generators. Read-side brand recovery in the generators query
corrects mis-filed rows from the location name (strict prefix rule) without writing anything back
to the table.

**Ops.** `verify_jwt` pinned in `config.toml`; `cron_http_post_verified` checks the response status
of the previous call and emails on failure; JWT audit doc.

**Prompts:** deep_pass **v13**, archetype_call **v18**, employer_headcount **v2** active.

**Executive summary (archetype_call v14, 2026-09-28).** Six lines at the top of every first-pass
report — city – corner, the story in the 2–3 numbers that carry it, the pitch, the risk, the call.
Written last, printed first, and it introduces nothing: every figure in it is already sourced in
the body, which is why it is the one place rules 1, 1a and 6 are suspended. "At this corner" claims
take the 1 mi ring and nothing wider, and the Risk line names the unresolved question when the call
hinges on one. The demographics "missing" banner still leads the page, now above the summary.

**Category 7 and growth sensitivity (archetype_call v15, 2026-09-28).** The body fixes the summary
depends on. Category 7 is non-Starbucks coffee competition within 1 mi — each operator geocoded for
distance, drive-thru sourced or blank, classified national_dt / local_dt / institutional / cafe as
the deep pass already classifies them, and only the two drive-thru types countable. It is the one
category with **no OVIS tool behind it**: there is no non-Starbucks coffee layer, so it runs on
web_search plus geocode_address, and `STEP1_SEARCH_BUDGET` went 12 → 16 so it does not take its
searches from the other six. Cost moves with the budget; the sniff test was ~$1.10.

Growth sensitivity in Category 2: pipeline units ÷ existing households per band, centroid counts,
both operands printed beside every ratio. Plus the single-project test — one project over 50% of a
band's Under Construction or Approved units is named and the ratio printed with and without it. The
Risk line is required to carry both findings when the body found them.

**One pipeline total in the summary (archetype_call v16, 2026-09-28).** v15's growth sensitivity is
unchanged in the body. The Executive summary now states the residential pipeline as `total_units_
centroid` for **one named band** — every phase the matrix holds, Recently Completed through
Planning — and nothing else: **no ratios, no percentages, no units-per-household, no phase
breakdown**. The Risk line's single-project finding is expressed in units, not a ratio. Category 2
also prints that all-phase total so the summary quotes a figure that exists in the body rather than
introducing one. `site_pipeline_matrix` sums it across every phase itself, so the summary cites a
tool total and does no arithmetic — but it therefore includes standing units, so both body and
summary say what the figure spans ("completed through planning") instead of calling it pipeline.
Macon 3 mi is 1,732 centroid / 1,822 intersects against 9,482 households.

**The summary's pipeline band is 3 mi, always (archetype_call v17, 2026-09-28).** It was "one named
band", the model's choice. Growth arrives across a trade area, and leaving the band open let the
summary pick the one that flattered the site. This is the single deliberate exception to the
at-this-corner rule that pins everything else in the summary to 1 mi, and the prompt says so where
the exception is written. Macon's 1 mi band is 162 units, 80 of them Recently Completed and
standing — a fair illustration of why the narrower band was the wrong default.

**Coffee is context, not risk (archetype_call v18 + deep_pass v13, 2026-09-29).** Starbucks is not
deterred by competition; another operator's morning drive-thru on the corridor mostly proves the
corridor sells morning coffee. Both passes changed together:

- **Scope 1 mi, non-Starbucks.** Beyond it: not researched, listed, counted or mentioned, in any
  section. Enforced in code, not just prompt — `recordCoffeeCompetitor` rejects a row past the mile
  and `buildCompetitorsCsv` drops one. Coffee brands also came out of the duplication analysis,
  which was a side door for a unit beyond the mile.
- **Starbucks' own Atlas rows keep 5 mi in competitors.csv.** One file, two scopes, on purpose:
  coffee context at 1 mi, Starbucks' network further out. Cutting Starbucks to 1 mi would have
  deleted the cannibalization figure (nearest store 3.1 mi at Macon) while the prose kept citing it.
- **No count of coffee operations anywhere.** `densityCountable()` and `counts_toward_density` are
  deleted rather than left as an invitation to write the claim back. No drive-thru confirmation
  either — the lane-sourcing rule and "unconfirmed lane" are both gone.
- **Never a story carrier, never moves the call.** "Coffee competition" is out of `story_carriers`;
  WHITE_SPACE is never ruled out over a non-Starbucks operator. Barred from the exec summary's Risk
  line and from the deep pass's VERDICT objection line and OBJECTIONS section; allowed in the story
  / Pitch / HEADLINE / WHY HERE as demand validation.

**Hard rule 8a, deep pass: a spent search budget is not a finding.** "budget exhausted — absence not
confirmed", with what was still unsearched. The 2026-09-28 Macon run spent 33/33 searches and then
reported no civic building within 5 mi — which may have been true and may have been the budget.
Searches freed by dropping lane confirmation go to generators and employers, with a stated spend
order.

**Employer headcount enrichment (employer_headcount v2, 2026-09-30).** A Gemini pass over the
employers the deep pass recorded, filling `headcount` where it can and adding a `headcount_source`
column to employers.csv. It is additive: it never overwrites a headcount the deep pass sourced, and
a failure leaves every row exactly as recorded.

**A number is accepted only with a source Google Search actually RETRIEVED**, taken from
`groundingMetadata`, never from the URL the model typed. This is load-bearing, not belt-and-braces:
asked bare, the model returned 328 for Piedmont Macon North, 500 for Georgia Farm Bureau and 121 for
Wesleyan College with **zero search queries issued** and invented URLs beside them. `csv.ts` drops
any headcount reaching `buildEmployerRow` without a source, so an unsourced figure cannot reach
committee even if a later caller forgets.

Two Gemini findings worth keeping:

- **Asked for bare JSON, gemini-3.8-flash does not search at all** — `webSearchQueries` empty every
  time. v2 asks for prose then a fenced JSON block, which keeps Search in the loop. That one change
  took Macon from 0 of 3 filled to 2 of 3.
- **`thinkingBudget` is load-bearing.** Uncapped, the model spent its entire output allowance
  thinking (3,955 thought tokens) and returned a response with **no content parts at all**, which
  is indistinguishable from "no headcount published". Capped at 2,048 with 8,192 output tokens.

Separately, `gemini-2.0-flash` now 404s ("no longer available"). The repo still pins `gemini-1.5-pro`,
`gemini-1.5-flash` and `gemini-2.5-flash` in `_shared/gemini.ts` and `_shared/gemini-agent.ts`, which
means **email triage and deal synopsis may be silently broken**. Not touched here; flagged.

**Not built: road names per AADT segment.** Asked for in the same round and blocked on data.
`streetlight_segment` has `road_name` and `road_type` null on all 1,225,544 rows, including all 170
that carry a count, so there is no name to print and no way to label a limited-access segment. The
only road names in the database are 116 GDOT segments in `traffic_cache`, a single 18-tile fetch
from 2026-03-23 that no application code reads. Category 5's ban on searching for the road name
stands.

---

## Standing decisions

**Scope boundary** (in CLAUDE.md). Site Story **reads** municipality and project data and never
fixes, improves or backfills it. Polygon coverage, parcel-fetch accuracy, boundary confirmation,
deduplication and discovery quality are Market Research / Market Planning. Flag and move on.

**Empty is not little.** A coverage gap is reported as unknown, never as a finding. Banned
vocabulary for an uncollected pipeline: thin, light, limited, modest, absent.

**GROWTH can be CANNOT BE ASSESSED** — prose only, never a JSON value. `research_thread` constrains
`archetype_primary` to five values; a sixth fails the write and kills the run at finalize.

**Direction-of-market claims need a named source**, to the same standard as a number. Growing,
declining, stable, emerging. Decline binds as hard as growth.

**Cost.** Sniff test = archetype pass alone, ~**$1.10**, ~2¾ minutes, 9–12 searches. Deep pass
**$4–8** after (36-search budget; the one completed v12-era run spent $3.94 on 31 searches).

---

## Open, in priority order

1. **Run on 3–4 sites Starbucks approved or passed.** Needed before the archetype threshold can be
   set. **Nothing else unblocks it.**
2. **Archetype MATURE/GROWTH tie-breaker** — waiting on 1. Diagnosed as a stability problem, not a
   disagreement: byte-identical snapshots produced both calls, and the prompt has no tie-breaker
   for a built-out base with a live pipeline.
3. **merchant_location re-home** (~1,069 rows, strict prefix rule) and the **Bassett contains-test
   defect** ("Nikki Bassett, Realtor" matching brand Bassett). Both change the merchant map;
   scheduled separately. Detail in EDGE_FUNCTION_JWT_AUDIT.md.
4. **Four missing archetypes** — [ARCHETYPE_OPEN_DECISION.md](ARCHETYPE_OPEN_DECISION.md). Revisit
   when a site does not fit the five, and note which site.
5. **PPTX exporter spec** — waiting on more sites for layout.
6. **Watch the VERDICT block** — v11 led with "860 units Under Construction within 3 mi", correctly
   scoped but one cell of a matrix whose full 3 mi pipeline is 1,732. Watch whether it keeps
   defaulting to the UC-only figure when the MATURE/GROWTH call depends on that number. No prompt
   change; two or three more sites first.

---

## Where things are

| | |
|---|---|
| Generators, brand guards, recovery | [SITE_RESEARCH_GENERATORS.md](SITE_RESEARCH_GENERATORS.md) |
| Higher ed | [IPEDS_HIGHER_ED.md](IPEDS_HIGHER_ED.md) |
| Pipeline matrix | [SITE_PIPELINE_MATRIX.md](SITE_PIPELINE_MATRIX.md) |
| Background runs, container handling | [SITE_RESEARCH_BACKGROUND_RUNS_DESIGN.md](SITE_RESEARCH_BACKGROUND_RUNS_DESIGN.md) |
| Brief pass | [SITE_RESEARCH_BRIEF_PASS.md](SITE_RESEARCH_BRIEF_PASS.md) |
| Deep pass plan, as built | [SITE_RESEARCH_STEP2_DEEP_PASS_PLAN.md](SITE_RESEARCH_STEP2_DEEP_PASS_PLAN.md) |
| JWT audit, merchant open items | [EDGE_FUNCTION_JWT_AUDIT.md](EDGE_FUNCTION_JWT_AUDIT.md) |
| Archetype open decision | [ARCHETYPE_OPEN_DECISION.md](ARCHETYPE_OPEN_DECISION.md) |
| Drive-time point sensitivity | [ESRI_DRIVE_TIME_POINT_SENSITIVITY.md](ESRI_DRIVE_TIME_POINT_SENSITIVITY.md) |
| Prompt bodies | `docs/PROMPT_archetype_call_v13.md`, `docs/PROMPT_deep_pass_v12.md` |
