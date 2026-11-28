# Market research: per-row unit-count review flag

2026-11-03. Branch `fix/market-research`.

## Problem (health check, 2026-11-03)

The market research agent stages real developments whose unit count no source
stated: P&Z rezonings that give acreage but no count, and builder sites that
list only "N homes available". It marked the gap three ways, varying by run:
`NULL`, `0`, or an invented **25**, which is the inclusion threshold. Its
stated reason, "to pass schema validation", was false: the MCP schema allowed
0, and the agent didn't treat null as an option.

- Across the 12 most recent runs with staged rows, 0–86% of rows per run had no
  real count. The Warner Robins sweep and Locust Grove were the worst; the
  Marietta runs were clean.
- The only signal was the run-level free-text `research_run.needs_review`.
  Nothing per row, and the 25+ threshold was enforced only by the prompt.
- 13 committed `municipal_project` rows had no real count: 2 NULL, 6 at 0,
  5 at a placeholder 25. Every one says so in its own notes.
- Every staged row ever recorded at exactly 25 (9 of 9) was a placeholder.

## Design: flag, don't block

A real development with an unknown count still belongs in the pipeline. There is
**no CHECK constraint on the unit count**, and approval is never refused.

Columns on both `municipal_project_staging` and `municipal_project`:

| column | type | meaning |
|---|---|---|
| `units_needs_review` | boolean not null default false | unit count needs a human look |
| `units_review_reason` | text | short why |

Trigger `flag_unit_count_for_review()` (BEFORE INSERT OR UPDATE OF
`total_housing_units`, on both tables) sets the flag when:

| condition | tables | reason |
|---|---|---|
| total NULL | both | `No unit count` |
| total 0 | both | `Unit count is 0 — a placeholder, not a sourced count` |
| total exactly 25 | staging | `Exactly 25 units (the threshold) — confirm it is sourced, not a placeholder` |
| notes call the count a placeholder/estimate | staging, insert only | `Agent notes say the unit count is a placeholder or estimate` |

- Changing the count to a positive number clears the flag, but only when its
  reason is one of the automatic ones above. A hand-written reason stays until
  a person clears it.
- A flag-only UPDATE doesn't fire the trigger, so a manual dismiss sticks.
- An UPDATE that sets the flag columns itself wins over the trigger.

`approve_research_staging_rows` carries the staged flag and reason onto the
committed row when the reviewer left the count alone. If the reviewer typed a
different count, the staged reason is dropped, and the `municipal_project`
trigger re-flags it if the count is still missing.

## UI

- **Approval modal** (`ResearchRunApprovalModal`):
  - A flagged row goes to *Needs attention*, never *Clean*.
  - It gets a `⚠ CHECK UNITS` chip plus a reason line on the row. The chip
    turns to `✓ UNITS ENTERED` once the reviewer types a count.
  - The summary line says "no unit count" instead of leaving the count out.
  - **Approve & Commit** lists every selected row that will commit flagged and
    asks for confirmation. The rows still commit, flagged.
- **Project slideout** (`MunicipalProjectSlideout`): a terracotta banner shows
  the reason. Saving a count clears an automatic flag (read back from the
  trigger). *Dismiss — count is unknown* clears it without inventing a number.

## Agent side

`ovis-research-mcp` `submit_research_report` schema: `total_housing_units` is
now `['integer','null']`. Its description tells the agent to send null rather
than 0, 25 or any other estimate. The server already stored non-integers as
NULL, so this changes the agent's guidance, not what the server accepts. The
edge function has to be deployed (from main, after merge) before the agent
sees it.

## Data cleanup (`20261103210500_null_placeholder_unit_counts.sql`)

11 committed rows had their placeholder count set to NULL and were flagged with
`Placeholder count removed 2026-11-03 — no source stated a unit count`:

- 0 → NULL: Falcon Landing Ph I, Waterside at Lake Lanier, Highland Gates,
  Magnolia Station Ph 4, Haselton Ph 3, Clark Farms Ph I.
- 25 → NULL: Hidden Crossing I, 950 Hwy 138 Townhomes, Tara JTB, Lake City
  Annexation Townhomes, Tillery Park PRD Revision. On 950 Hwy 138 and Lake City
  `townhouse_units` repeated the 25 and was cleared too.

Woodlands Phase 7 and Rex Road Townhomes were already NULL. The backfill flagged
them, along with one importer-sourced NULL row.

Side effect: `site_pipeline_matrix` sums only `total > 0`, so the five former 25s
no longer add 125 invented units to pipeline totals. They still appear as
projects.

## `municipality_id` NULL on staging rows is expected

`submit_research_report` resolves `municipality_id` by matching the boundary
name and state against `municipality`. If the town has never had a committed
project, there's no match and the column stays NULL. `approve_research_staging_rows`
creates the `municipality` row on first approval and backfills it. Locust Grove
and Henry County had no `municipality` row yet, so all 12 of that run's rows are
NULL. `boundary_municipality_id`, which is what matters, is set on all 12.
