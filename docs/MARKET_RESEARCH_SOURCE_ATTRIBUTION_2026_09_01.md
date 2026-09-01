# Market Research — Source Attribution Analysis (2026-09-01)

**Question asked:** which research phases are actually producing results, so we can decide what to cut?

**Short answer: this analysis cannot answer that question, and no analysis of the existing data can.** The attribution data needed to answer it was never captured. What follows documents what the data does and does not support, the three specific reasons the obvious reading is wrong, and the schema change made so the question becomes answerable going forward.

> **Do not use the bucket percentages in this document to cut a research phase.** Every one of the three "zero-result" phases is zero for a reason unrelated to its effectiveness. See [Why the zeroes are not evidence](#why-the-zeroes-are-not-evidence).

---

## Scope

The 10 most recent `research_run` rows, 2026-08-10 → 2026-08-19: **65 staged records, 7,330 housing units.**

Every committed `municipal_project` row in this window traced back to a staging row (0 orphans), so `municipal_project_staging` is the complete universe and there is no double-counting between staged and committed.

Municipalities covered by these runs' checklists:

| Municipality | Kind | Runs |
|---|---|---:|
| Columbia County, GA | county | 6 |
| Grovetown, GA | city | 6 |
| Hall County, GA | county | 3 |
| Cobb County, GA | county | 1 |

**Cost per run is not recorded anywhere.** At the time of this analysis no cost, token, or spend column existed on any research table; the only such column in the database was `google_places_api_log.estimated_cost_cents`, which is unrelated. No cost figures are estimated in this document. This gap has since been closed — see [Schema changes](#schema-changes-made-as-a-result).

---

## The core caveat: `source` is a citation, not a label

`source` is free text and functions as a **full citation trail**, not a category. **30 of 65 records (46%) cite two or more source types in a single value.** A representative example:

> "Columbia County PC agenda 2024-11-21 (event 2062) - RZ24-11-04 Major PRD Revision; Columbia County BOC agenda 2024-12-03 (event 2108) - approved; WJBF News Dec 3 2024; Augusta Press 'Grovetown subdivision looking to expand' (Feb 2022 PC for 789-lot master plan)"

Which phase found that record? The string cannot say. Any single-bucket classification of it reflects **which citation the agent happened to list first** — an ordering artifact of prose composition, not a fact about discovery.

This has a specific consequence: the headline `pz_agenda` 80.8% / `news` 10.4% split below **is not a measurement**. It is an artifact. Do not treat the gap between those two numbers as meaningful.

A secondary effect: nothing landed in `unclassified` (0 of 65), but that is not a clean bill of health either. It means the `pz_agenda` pattern is broad enough to match any string containing "agenda", "plat", "rezoning", "BOC", or "CivicClerk" — and 62 of 65 strings contain at least one. Zero unclassified means "the classifier matched," not "the attribution is trustworthy."

---

## Table A — Totals across all 10 runs

### Primary bucket (first-mentioned source type)

| Bucket | Records | Units | % of units |
|---|---:|---:|---:|
| pz_agenda | 53 | 5,924 | 80.8% |
| news | 9 | 761 | 10.4% |
| permit_portal | 3 | 645 | 8.8% |
| builder_site | 0 | 0 | 0% |
| activity_pdf | 0 | 0 | 0% |
| econ_dev | 0 | 0 | 0% |
| unclassified | 0 | 0 | 0% |

### Any-mention (bucket cited anywhere in the string)

The more honest view — it does not depend on citation ordering.

| Bucket | Records mentioning | Units |
|---|---:|---:|
| pz_agenda | 62 | 7,106 |
| news | 26 | 3,181 |
| builder_site | 8 | 1,100 |
| permit_portal | 3 | 645 |
| econ_dev | **0** | — |
| activity_pdf | **0** | — |

The two views disagree sharply for `news` (9 records as primary, 26 by any-mention) and `builder_site` (0 as primary, 8 by any-mention). That disagreement *is* the ordering artifact, made visible. `builder_site` never leads a citation but corroborates 8 records — it behaves as an enrichment step, not a discovery step.

---

## Table B — Per run

Cells are `records / units`.

| Run | Mode | State | Date (ET) | Recs | Units | pz_agenda | news | permit_portal | Unclass |
|---|---|---|---|---:|---:|---|---|---|---:|
| 585d9b11 | quick | approved | 08-19 23:20 | 3 | 309 | 0 / 0 | **3 / 309** | 0 / 0 | 0 |
| acfba526 | deep | approved | 08-13 12:55 | 8 | 557 | 8 / 557 | 0 / 0 | 0 / 0 | 0 |
| f3545607 | deep | approved | 08-13 12:13 | 7 | 572 | 6 / 500 | 1 / 72 | 0 / 0 | 0 |
| c9483b42 | deep | approved | 08-13 11:41 | 8 | 1,210 | 6 / 1,136 | 2 / 74 | 0 / 0 | 0 |
| c8069798 | deep | approved | 08-13 11:11 | 13 | 868 | 13 / 868 | 0 / 0 | 0 / 0 | 0 |
| 53fa13cf | deep | approved | 08-13 10:29 | 4 | 560 | 4 / 560 | 0 / 0 | 0 / 0 | 0 |
| 99b24098 | deep | approved | 08-13 10:04 | 8 | 733 | 5 / 427 | 3 / 306 | 0 / 0 | 0 |
| ee1be095 | deep | awaiting_review | 08-10 20:45 | 4 | 655 | 4 / 655 | 0 / 0 | 0 / 0 | 0 |
| a14c3e7b | deep | awaiting_review | 08-10 20:39 | 10 | 1,866 | 7 / 1,221 | 0 / 0 | **3 / 645** | 0 |
| 25596581 | deep | **failed** | 08-10 19:41 | 0 | 0 | — | — | — | — |

**Runs producing zero `permit_portal` records: 9 of 10** (8 of 9, excluding the failed run that produced nothing at all).

---

## Why the zeroes are not evidence

This is the most important section in the document. Three phases show zero, and in **all three cases the zero is structural, not a performance result.**

### `econ_dev` — the phase does not run

Zero records because **the capability was never built.** `econ_dev` depends on ingesting econ-dev open-records email attachments, and email capability does not exist in the agent. The phase has never executed a single time.

Cutting it based on this data would be cutting something that was never tried.

### `activity_pdf` — the phase is out of geography

Zero records because **`activity_pdf` is Macon-specific**, and none of these 10 runs touched Macon. Confirmed against the checklists: the runs covered Columbia County, Grovetown, Hall County, and Cobb County only.

The monthly permit-activity report PDF is a Macon artifact. In a Columbia County or Hall County run there is nothing for this phase to read. Its zero is a geography mismatch, and says nothing whatsoever about how well it works in Macon.

### `permit_portal` — the records exist; the run died before review

This one is subtler and easy to misread.

`permit_portal` produced 3 records / 645 units, all in run `a14c3e7b` (2026-08-10). That run is still `awaiting_review` with **10 staged / 0 reviewed** — nothing in it was ever triaged. The run halted on billing before anyone looked at it.

So the true statement "permit_portal has contributed zero records to the live `municipal_project` table" is **causally misleading**. Zero committed reflects a run that died before review, not a reviewer looking at permit-portal records and rejecting them. No human has ever evaluated this phase's output.

*Precision note:* `a14c3e7b` is a **standalone** deep run — `sweep_id IS NULL`, not a sweep chunk. The sweep in this window that ended `complete_with_failures` (`f4b86098`, 6 chunks) is a different one, containing the failed run `25596581`. The conclusion is unchanged — dead run, not a rejection — but the record should be accurate about which.

---

## What can and cannot be concluded

**Can be concluded:**
- `pz_agenda` sources are present in nearly everything the agent finds — 62 of 65 records, 7,106 of 7,330 units. It is doing real work.
- `builder_site` functions as corroboration rather than discovery (0 primary, 8 any-mention).
- The 46% multi-source rate means per-record attribution from `source` is unrecoverable retroactively.

**Cannot be concluded:**
- ~~Anything about `econ_dev`~~ — never ran.
- ~~Anything about `activity_pdf`~~ — never in scope geographically.
- ~~Anything about `permit_portal`'s quality~~ — its only output was never reviewed.
- Anything about the true `pz_agenda` vs `news` ratio — ordering artifact.
- Anything about cost-effectiveness of any phase — cost was not recorded.

**Net: no research phase should be cut on the basis of this data.** The analysis established that the instrumentation was missing, not that any phase underperforms.

---

## Schema changes made as a result

Two additive migrations, applied 2026-09-01. Neither alters `source`, which remains the full free-text citation and is still required.

### `discovery_source` — [`20260901120100_discovery_source.sql`](../supabase/migrations/20260901120100_discovery_source.sql)

A single-valued companion field on `municipal_project_staging` and `municipal_project`, recording **which phase actually found the record**:

`pz_agenda` | `news` | `permit_portal` | `activity_pdf` | `builder_site` | `econ_dev` | `other`

- Nullable, **deliberately not defaulted** — a default would manufacture attribution that was never observed, which is precisely the failure this column exists to fix. NULL means "not reported" and must stay distinguishable from a real value.
- CHECK-constrained to the closed set, *and* normalized via `normalize_discovery_source()`. Both, because a bare constraint would be dangerous: `submit_research_report` stages a whole batch in one statement, so one unrecognized string would abort all of a run's records. Unrecognized non-empty input becomes `'other'` rather than killing the batch; blank becomes NULL.
- Threaded through `submit_research_report`, `approve_research_staging_rows`, `get_sweep_staging`, `municipal_project_v`, the MCP tool schema, the approval UI (dropdown), and the map slideout.
- At approval, reviewer override uses a **key-presence test rather than `COALESCE`** (a deliberate departure from the `location_description` / `parcel_boundary_notes` pattern). Under `COALESCE` an explicit null falls back to the staged value, making a *wrong* agent attribution impossible to retract — the opposite of the column's purpose. Absent key = no override; present-but-null = deliberate clear.

### Cost tracking — [`20260901120000_research_run_cost_tracking.sql`](../supabase/migrations/20260901120000_research_run_cost_tracking.sql)

`estimated_cost_cents` (integer cents, not float dollars), `input_tokens`, `output_tokens` (bigint) on `research_run`. All nullable; existing rows read as "not measured," never "free."

Not added to `research_sweep_chunk`: it is strictly 1:1 with `research_run` (verified — 30 chunks / 30 distinct run ids / max 1 chunk per run), so per-chunk cost is `chunk → research_run_id → research_run`. Duplicating would create two places to write one number.

**These columns stay NULL until OpenClaw sends the figures.** Nothing on the OVIS side can derive them — `ovis-research-trigger` reads back only `openclaw_run_id`, and the token counts live in the agent's own LLM responses. The write path exists (`submit_research_report` takes three optional trailing params, exposed on the MCP tool); the OpenClaw-side payload change is outstanding.

---

## To make this analysis answerable next time

1. **Agent emits `discovery_source`** on each candidate record. *(Prompt change — Mike's; the schema field is optional and already live.)*
2. **OpenClaw sends usage** on the end-of-run `submit_research_report` call: `estimated_cost_cents`, `input_tokens`, `output_tokens`.
3. **Re-run this analysis** once a meaningful number of runs carry both. Then phase-level cut decisions have a real basis — cost per committed unit, per phase.
4. **Before cutting anything, confirm the phase actually ran** in the window being measured, and in a geography where it applies. That check is what this analysis' first pass got wrong.

Deployment note: the MCP schema change is inert until `ovis-research-mcp` is deployed. Backward compatibility holds either way — the 4-arg call from the currently deployed function resolves to the new 7-arg signature via defaults.

---

## Reproducing

Classifier used throughout (`regexp_instr` returns first-match position, 0 if absent; primary bucket = lowest nonzero position):

```sql
WITH last10 AS (
  SELECT id, research_mode, triggered_at, state
  FROM research_run ORDER BY COALESCE(triggered_at, created_at) DESC LIMIT 10
),
pos AS (
  SELECT s.research_run_id, s.source, COALESCE(s.total_housing_units,0) AS units,
    regexp_instr(s.source,'(accela|citizen access|citizens portal|energov|hsub[0-9]|permit (record|number)|citizenserve)',1,1,0,'i') AS p_permit,
    regexp_instr(s.source,'(activity report|permit activity|monthly (permit|building))',1,1,0,'i') AS p_actpdf,
    regexp_instr(s.source,'(builder website|builder site|\.com/communities|communities/|community page|jome\.com|trulia|globe ?newswire)',1,1,0,'i') AS p_builder,
    regexp_instr(s.source,'(economic development|econ dev|development authority|open.records|chamber of commerce)',1,1,0,'i') AS p_econ,
    regexp_instr(s.source,'(augusta press|augusta chronicle|augusta today|wrdw|wjbf|eastcobbnews|gainesville times|citizenportal\.ai|news|press release|article|chronicle|times)',1,1,0,'i') AS p_news,
    regexp_instr(s.source,'(planning commission|planning panel|p&z|pc agenda|pc minutes|city council|board of commissioners|boc |civicclerk|agendacenter|agendapub|agenda|minutes|rezoning|rz ?[0-9]|preliminary plat|final plat|concept(ual)? plan|documentcenter)',1,1,0,'i') AS p_pz
  FROM municipal_project_staging s JOIN last10 r ON r.id = s.research_run_id
),
cls AS (
  SELECT pos.*, (SELECT b FROM (VALUES ('permit_portal',p_permit),('activity_pdf',p_actpdf),
      ('builder_site',p_builder),('econ_dev',p_econ),('news',p_news),('pz_agenda',p_pz)) v(b,p)
    WHERE p > 0 ORDER BY p, b LIMIT 1) AS primary_bucket
  FROM pos
)
SELECT COALESCE(primary_bucket,'unclassified') AS bucket, count(*) AS records,
       sum(units) AS total_units,
       round(100.0*sum(units)/NULLIF((SELECT sum(units) FROM cls),0),1) AS pct_units
FROM cls GROUP BY 1 ORDER BY 3 DESC;
```

Staged-vs-committed overlap check (establishes staging as the full universe):

```sql
SELECT r.id,
  (SELECT count(*) FROM municipal_project_staging s WHERE s.research_run_id = r.id) AS staged,
  (SELECT count(*) FROM municipal_project p WHERE p.source_research_run_id = r.id
     AND NOT EXISTS (SELECT 1 FROM municipal_project_staging s
                     WHERE s.approved_municipal_project_id = p.id)) AS live_orphans
FROM last10 r;   -- live_orphans = 0 for all 10
```

Once `discovery_source` is populated, the whole classifier above collapses to a `GROUP BY discovery_source` — which is the point.

---

## Related

- [`market-research-agent-spec.md`](market-research-agent-spec.md) — agent contract and field semantics
- [`MARKET_RESEARCH_DEDUPE_SAFETY_NET.md`](MARKET_RESEARCH_DEDUPE_SAFETY_NET.md) — duplicate detection
- [`MARKET_RESEARCH_AGENT_PHASE_F.md`](MARKET_RESEARCH_AGENT_PHASE_F.md) — OpenClaw wiring runbook
