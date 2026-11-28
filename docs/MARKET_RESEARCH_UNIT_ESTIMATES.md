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

## Name dedupe at submit time (migration 20261114064143)

`research_auto_dedupe_by_name(p_run_ids, p_dry_run)` runs from
`ovis-research-mcp` on final submit **before** the Gemini estimator (so we
don't pay to estimate a duplicate) and again after it (estimates can make two
copies comparable). The existing open-time `auto_resolve_research_duplicates`
still runs when the approval screen opens.

**Group** = same `research_name_key(project_name, phase_label)` + same
municipality, across pending staged rows (in runs not in flight) **and**
committed `municipal_project` rows. The key normalizes case, punctuation,
parentheticals (except ones naming a phase), "ph 2" → "phase 2", and a
trailing "subdivision" / "community" / "development". Phases stay in the key:
"Grove Park" ≠ "Grove Park Phase 2".

Within a group that has at least one count:

| Case | Action |
|---|---|
| Staged copy with no count | Rejected: "Duplicate without unit count — kept &lt;id&gt;" |
| Counted copies, all the same count | Keeper = firmest (committed > approved > reported/NULL > estimated, then newest). Others rejected: "Duplicate — kept &lt;id&gt;" |
| Counted copies with different counts | Nothing auto-resolved. Each staged counted copy gets `count_conflict` (a snapshot of every copy). The approval screen shows **≠ COUNT CONFLICT** and a side-by-side panel. |

- It rejects and never deletes, so Undo works. Undo sets `auto_dedupe_skip`
  so the row isn't re-rejected. Pairs the reviewer marked "not duplicates" are
  left alone.
- Nothing is merged into the keeper except a parcel ID or an acreage it
  doesn't already have.
- It doesn't match renamed projects ("NOVEL Turner Lake (formerly Render
  Turner Lake)"), or the same case filed under two names (PP25-000004
  Bellwood / McGiboney Manor).

### Estimator prompt fix (same change)

The estimator now sends the agent's cited source and notes to Gemini and
refuses an unphased count when sources give per-phase counts. Before this,
Covington Creek Springs (Phase 2, 71 lots in its own cited source) was given
52, which is Phase 1's count (PP21-000002, build-to-rent, built 2024). That
record was corrected to 71, Phase 2, `units_confidence = 'reported'`.

### Applied to Alcovy Road, 2026-11-14

Rejected 7. Six were by the rule:

- Sinclair at Callaway Farm ×2
- Pointe Grand Covington (Hillpointe)
- Pickett Bridge Estates
- Easthampton Development
- Covington Creek Springs (the second Phase 2 copy)

NOVEL Turner Lake was rejected by hand (rename), keeping Render Turner Lake.

Flagged three count conflicts:

- Access Road Townhomes: 144 vs 143
- Grand Horizon Estates: 27/27/28/27
- The Quarry at Neely Farms: 514 vs 1300

No copies without a count needed rejecting.

## 5% tolerance (migration 20261114070306)

Counts in a same-name group that are within 5% of each other (max ≤ 1.05 ×
min) count as matching. The firmest copy is kept and the others are rejected
with "Duplicate (counts within 5%) — kept &lt;id&gt;". Only a wider spread is a
count conflict.

On Alcovy Road, 2026-11-14:

| Project | Result |
|---|---|
| Access Road Townhomes | 143 rejected; 144 kept (reported beats estimated) |
| Grand Horizon Estates | 28 and two 27s rejected; reported 27 kept |
| Quarry at Neely Farms | still flagged (514 vs 1,300) |

## Agent usage on the approval screen

`submit_research_report` takes optional `input_tokens`, `output_tokens` and
`cost_usd` (dollars), or the older `estimated_cost_cents`. They are stored on
`research_run`, and checkpoints don't wipe them. The approval screen shows
"Research agent: Xk in / Yk out tokens · $Z" next to the Gemini line. If no
run reported usage, it says "usage not reported", because none of the 120
runs so far did.

## Telegram (2026-11-14)

The only messages now sent: chunk started, chunk finished with N staged,
sweep ready for approval with N pending, and chunk failed with a one-line
reason. A standalone (non-sweep) run that fails to start still gets one
failure line. See `supabase/functions/_shared/research-telegram.ts`.

## Fill missing units (button on the run / sweep approval view)

This reruns only the post-run steps on an existing run or sweep, without
starting a new research run:

1. dedupe
2. Gemini unit backfill (current prompt, with the phase fix; earlier leads
   are re-asked)
3. acres × density fallback
4. dedupe again
5. anything still without a count stays a lead

The edge function is `research-fill-units` and it takes the caller's JWT. The
caller needs `can_approve_market_research`.

**Flow**

- **Preview** returns the record count and an estimated Gemini cost: records
  × the average cost per call from `research_unit_estimate`. It's an upper
  bound, because the first dedupe may remove some records before Gemini.
- **Confirm** runs one research_run per call, so no single call outlives the
  edge-function wall clock.
- **Result** shows how many got a count from Gemini, how many from
  acres × density, how many were deduped, how many are still leads, and the
  actual cost.

**Scope**

- Pending records (leads included) with no usable count. Records that already
  have an `'estimated'` count are skipped, so it's safe to run twice.
- **Include records rejected for no count** (checkbox) adds rejected records
  with no count whose reason is empty, or mentions a missing count or
  duplicate review. Auto-dedupe "Duplicate …" rejections are excluded.
  - They're restored to pending first, with the original rejection parked in
    `staging.fill_restored` (migration 20261114070813).
  - If one still gets no count, it goes back to rejected with exactly that
    reason. This also runs after a failure, so nothing is left half-restored.
- Committed records are never touched.

## Sweep summary + Agent reports (migration 20261114080749)

`get_research_summary(run_ids)` puts every **pending** record in exactly one
bucket. `get_sweep_summary(sweep_id)` is the same thing for a whole sweep.

| Bucket | Rule | Units |
|---|---|---|
| Ready | has a count; no open conflict, unresolved duplicate or `lead_reason` | total, plus the estimated part |
| Needs a decision | `count_conflict`, a pending `duplicate_of_project_id`, a `duplicate_of_staging_id` pointing at another pending row, or a `lead_reason` (distance / jurisdiction) | a range: per group, the smallest count to the largest |
| Leads | no usable count (null, ≤ 0, or flagged by the unit-count trigger) | not counted |

Units are counted after dedupe, so rejected and merged copies are already gone.

- **Approval screen:** a header for both run and sweep views. It recomputes
  live whenever a staged row's state, count, conflict or lead flag changes.
- **Telegram** "Sweep ready — <site>" uses the same function, one line per
  bucket.
  - It's sent once (`research_sweep.ready_notified_at`) after the sweep
    finishes **and** every chunk's post-run steps are done
    (`research_run.post_run_done_at`, set by the MCP after dedupe → Gemini →
    dedupe).
  - Senders: the MCP when the last post-run step finishes, and a sweeper in
    `ovis-sweep-tick` that covers finished sweeps from the last 3 days. A run
    whose flag never got set counts as done after 10 minutes.
  - **Parcel fetch is not part of this pipeline.** It still runs in the
    browser on a committed record, so it isn't waited on.
- **Agent reports** (sweep view, read-only): one collapsible entry per chunk,
  "Chunk 0 — undated sources" or "Chunk 3 — May–Oct 2025". Each shows the
  run's `needs_review`; a failed or gap chunk shows "no report".
  - Chunk numbers here are 0-based `chunk_index`. Telegram's "Chunk N/M" is
    1-based.
- **Single-run Needs review** is now at the top, collapsed to 3 lines, with
  Show all expanding to the full editable text.

## Address dedupe (pass 2) and its street-only guard

Migrations 20261114091739 and 20261114094321.

**Pass 2** groups copies by the same `research_address_key` in the same
municipality with the same unit count (within 5%), even when names or phases
differ.
- **Keeper:** a committed record, else the copy with a `permit_url`, else
  firmness.
- **Copied to the keeper:** whatever it's missing of permit_url, builder,
  parcel IDs and acreage. The other copies' sources are appended to its source.
- **Reject reasons:** "Duplicate (same address) — kept &lt;id&gt;", or
  "… counts within 5% …" when the counts differ slightly.

**Street-only guard.** When the address has no house number, same street plus
same count isn't enough. The pair also needs one of:
- a shared significant word in the names, from `research_sig_words`, which
  ignores street and place words and generic ones like Road, Subdivision,
  Phase, Mixed Use and Homes
- a shared significant word in builder/developer
- an overlapping parcel ID
- an overlapping case number, from `research_guard_case_numbers`. That adds
  plat, appeal and permit numbers like `PP23-000005` to the shared
  `research_case_numbers`, which only knows rezoning prefixes.

Without one of those, the pair is **flagged** instead of rejected: a duplicate
pointer plus an `auto_dedupe_note`, which counts as "needs a decision".

Re-checking Alcovy's 3 street-only pairs, all would still auto-clear:

| Pair | Evidence |
|---|---|
| Point Grand / Hillpointe | name word "hillpointe", builder, PP24-4 |
| Grand Reserve / Brown Bridge Road Mixed Use | builder (Thomas & Hutton / Reed Parker), PP23-5 and APP24-2. No shared name word. |
| Anderson Signature Homes, Oxford Road ×2 | name words "anderson", "signature", builder |
