# Market Research — post-run unit estimates

Goal: the approval queue shows only records that have a unit count. Everything
else sits in **Leads**, collapsed by default.

## What existed before (2026-11-14 audit)

- No `estimate_community` tool and no Gemini unit estimator in OVIS, `ovis-mcp`
  or `ovis-research-mcp`, on any branch. No `units_confidence` column.
- Leads already existed (commit c467f0da): pending rows with no usable count
  went to a collapsed "Leads" section. They were, however, **selected by
  default**, so Approve & Commit committed them along with everything else.

## What runs now

When the agent's **final** `submit_research_report` closes a run,
`ovis-research-mcp` runs `estimateMissingUnits()`
(`supabase/functions/_shared/research-unit-estimator.ts`) in the background
(`EdgeRuntime.waitUntil`). Checkpoint submits replace the staged set, so the
estimator runs only on final.

For every pending staged row with no usable count (null, ≤ 0, or
`units_needs_review`):

1. **Gemini 2.5 Flash + Google Search grounding.** Given name, phase,
   jurisdiction, address, location / cross-streets, builder and zoning. A count
   is accepted only if a source states one for this project. A count with no
   grounding source is discarded. Writes `total_housing_units`,
   `units_confidence = 'estimated'`, and appends Gemini's basis and sources to
   `notes`.
2. **Acreage × zoning density**, only if the count is genuinely missing (not a
   flagged 25), the row's text mentions acreage, and the zoning maps to a
   residential density (`DENSITY_RULES`: multifamily 14/ac, townhome 8,
   PUD/mixed 6, R-4+ 4, R-3 3.5, R-2 2.5, R-1 1.5, AR 0.5; commercial,
   industrial and institutional = none). Same tag, with the math in notes.
3. Otherwise nothing is written. The row has no count, so it is a lead.

The estimator is idempotent: a row with a previous non-error attempt is
skipped. Failed calls are retried on the next pass.

## Schema (migration 20261114062517)

| Object | Change |
|---|---|
| `municipal_project.units_confidence` | `'approved' \| 'reported' \| 'estimated' \| NULL`. Existing rows NULL. |
| `municipal_project_staging.units_confidence` | Same. Carried onto the committed row by `approve_research_staging_rows`, unless the reviewer typed a different count (then NULL). |
| `municipal_project_staging.lead_reason` | Non-null forces the row into Leads whatever its count (e.g. out of radius). |
| `research_unit_estimate` | One row per attempt: method (`gemini`/`density`/`lead`/`error`), units, acres, density, Gemini answer, sources, tokens, cost. Authenticated SELECT (internal users), service_role writes. |
| `research_run.unit_estimate_calls / unit_estimate_cost_cents / unit_estimate_ran_at` | Per-run totals, recomputed from the log after each pass. |
| `get_sweep_staging` | Returns `units_confidence`, `lead_reason`. |

`total_housing_units` stays a plain integer, so the map is unchanged.
`municipal_project_v` does not expose `units_confidence` yet.

Only `'estimated'` is written automatically. `'approved'` and `'reported'` are
reserved: nothing sets them yet.

## Cost

Recorded per call as tokens × list price plus $0.035 grounding fee (gemini-2.5-flash
paid tier: $0.30/M input, $2.50/M output including thinking, $35 per 1,000
grounded prompts after 1,500 free per day). The grounding fee dominates, about
3.7¢ per record. The recorded figure is an **upper bound**: under 1,500 grounded
prompts a day, grounding is free.

The approval screen shows "Unit estimates: N Gemini calls · $X.XX" for the
run(s) on screen.

## Approval screen

- An estimated count shows a dashed **EST. UNITS** badge. The source or math
  is in Notes.
- A `lead_reason` row shows **LEAD: …** and sits in Leads.
- Leads start **unselected**. The default commit is records with a count.

## First run: Alcovy Road deep sweep (607d4cc7), 2026-11-14

23 of the 64 pending records had no count.

| Result | Records |
|---|---|
| Count from Gemini | 13 |
| Count from acreage × density | 0 (no remaining record had both acreage text and residential zoning) |
| Still no count → Leads | 10 |

Cost: 23 calls, $0.88 (upper bound).

Also on this sweep:

- **Underwood Crossing Phase 2 & 3**: 185 S Underwood Dr geocodes (rooftop)
  9.6 mi from the site, so `lead_reason` was set and it moved to Leads.
- **The Sinclair at Callaway Farm**: 10500 Callaway Dr, 0.86 mi from the site.
  Stays in the queue. It is staged three times across chunks (1, 2, 4), not
  merged.

Things for the reviewer to check:

- Several projects are staged in more than one chunk and were not
  auto-merged: Grand Horizon Estates ×3, Render/NOVEL Turner Lake ×2,
  Covington Creek Springs ×2, Sinclair ×3. Window totals double-count them.
- Covington Creek Springs got 71 on one row and 52 on the other. 52 is a
  build-to-rent sale listing and may be a different phase.
- Neely Farm: Gemini found "110 homes" for the community, not Phase 1A, so it
  correctly stayed a lead.
