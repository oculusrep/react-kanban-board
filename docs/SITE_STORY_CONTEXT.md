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

**Prompts:** deep_pass **v12**, archetype_call **v14** active.

**Executive summary (archetype_call v14, 2026-09-28).** Six lines at the top of every first-pass
report — city – corner, the story in the 2–3 numbers that carry it, the pitch, the risk, the call.
Written last, printed first, and it introduces nothing: every figure in it is already sourced in
the body, which is why it is the one place rules 1, 1a and 6 are suspended. "At this corner" claims
take the 1 mi ring and nothing wider, and the Risk line names the unresolved question when the call
hinges on one. The demographics "missing" banner still leads the page, now above the summary.

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
