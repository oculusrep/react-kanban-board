# Deep-Sweep "Re-run gaps" + sequencing hardening

Branch: `feature/sweep-rerun-gaps`. Builds on the Automated Deep-Sweep chunk loop
(`research_sweep` / `research_sweep_chunk`, `advance_sweep`, `ovis-sweep-tick`).

## What shipped

A **"Re-run gaps"** action in the sweep approval view (`ResearchRunApprovalModal`
in sweep mode). When a sweep finished with gaps, one click re-fires the failed
6-month chunks — sequentially, through the existing tick engine — with a
confirmation dialog whose cost estimate scales to the number of gap chunks.

Plus the three fixes the Aug 10 Hall County sweep exposed (see incident below):
raised chunk timeout, a run-state-based gap definition, false-gap healing, and a
sweep cancel / orphan-cleanup path.

## The Aug 10 Hall County incident (root cause)

Sweep `f4b86098-570e-47fc-ae83-4441ea520b9a` reported **4 of 6 chunks failed**.
The per-chunk data told a different story:

| chunk | window | chunk.state | run.state | run mins | staged |
|-------|--------|-------------|-----------|----------|--------|
| 0 | Feb–Aug 26 | done | awaiting_review | 22.4 | 17 |
| 1 | Aug 25–Feb 26 | **failed** | awaiting_review | **32.4** | **5** |
| 2 | Feb–Aug 25 | done | awaiting_review | 23.8 | 8 |
| 3 | Aug 24–Feb 25 | **failed** | awaiting_review | **33.2** | **10** |
| 4 | Feb–Aug 24 | failed | failed | 26.0 | 0 |
| 5 | Aug 23–Feb 24 | failed | failed | 26.0 | 0 |

**Only chunks 4 & 5 are real gaps.** Chunks 1 & 3 hit the **25-minute chunk
timeout**, were marked `failed`, but their agents were *alive* — they finished at
32 and 33 minutes and staged 5 and 10 real records.

Two consequences, both verified from the data:

1. **False gaps.** The naive "re-run every `chunk.state='failed'`" would re-fire
   chunks 1 & 3 and **duplicate 15 staged records**.
2. **Concurrency (the sequencing bug).** When chunk 1 timed out at 22:22, the next
   tick fired chunk 2 at 22:23 — while chunk 1's agent lived until 22:28. **~5–6
   minutes of two concurrent agents** (same pattern for chunks 3→4). The sweep's
   chunks fired strictly sequentially (~1 s after each prior *terminal*); the
   overlap came entirely from advancing the sweep on a **timeout that assumed a
   slow-but-alive agent was dead.** Two concurrent agents is the mechanism that
   trips the Firecrawl/Anthropic rate limits.

A late-submit race also left chunks 1 & 3 self-contradictory: the orphan path set
the run `failed`, then the agent's late `submit_research_report` overwrote it back
to `awaiting_review`, so `chunk.state='failed'` but `run.state='awaiting_review'`.

## Design

### Gap = the RUN's terminal state, not the chunk's

A chunk is a **true gap** only if its `research_run` is absent or in a
non-successful terminal state (`failed`/`cancelled`). A chunk whose run reached
`awaiting_review`/`approved`/`archived` **has coverage** (its records already
appear in `get_sweep_staging`, which joins on `sweep_id` regardless of chunk
state) and is never re-fired. This is the authoritative signal the feature request
called for. `get_research_coverage` already agrees — it counts runs with
`state <> 'failed'`, so chunks 1 & 3 read as covered there too.

### Re-run reuses the sequential engine

`rerun_sweep_gaps` resets true-gap chunks to `pending`, bumps the sweep's timeout
to ≥ 45 min, and sets the sweep back to `running`. That is exactly the state the
tick engine already drives **one chunk at a time** — so re-runs are sequential by
construction, never parallel. No new firing path.

Idempotency:
- Successful chunks are untouched → no duplicate staging.
- Mislabeled "failed" chunks whose run actually succeeded are **healed** to `done`
  (not re-fired).
- Dead runs are detached (`research_run_id → NULL`) and kept as audit; they carry
  0 staging, so nothing double-counts.

## Backend (`supabase/migrations/20260811120000_sweep_rerun_gaps.sql`)

- `research_sweep.chunk_timeout_minutes` **default 25 → 45** (dense-county Deep
  runs took 32–33 min; existing sweeps keep their stored value, and a re-run bumps
  its sweep to ≥ 45). Post-fix runs (see cost note) should be faster — the value
  can be tuned down later.
- `get_sweep_gaps(sweep_id)` — read-only jsonb: `{sweep_state, gap_count,
  healable_count, gaps:[{chunk_index, window_start, window_end}]}`. Authoritative
  run-state classification; used by the approval view to render the button + cost.
- `rerun_sweep_gaps(sweep_id)` — heal false gaps → reset true gaps → bump timeout →
  set `running`. Same per-sweep advisory lock as `advance_sweep` (can't race a
  tick). Returns `{reset_count, healed_count, sweep_state}`.
- `cancel_sweep(sweep_id)` — stop a running sweep; terminate the in-flight chunk's
  run so it can't linger at `state='running'` (related cleanup item).
- `cancel_research_run` — extended so cancelling a sweep-child run also terminalizes
  its chunk (defensive; the standalone-run Cancel button hides sweep children).

### Deploy

DB migration is applied with `supabase db push` (not by the Vercel/git-push
deploy, which only builds the frontend).

## Frontend

- `ResearchRunApprovalModal` (sweep mode): loads `get_sweep_gaps`; shows a
  **"Re-run N gaps"** button (gated on `can_run_market_research`, finished sweep,
  `gap_count > 0`) with an inline confirmation listing the gap windows and a scaled
  cost estimate; a passive note surfaces any healable chunks. Calls
  `rerun_sweep_gaps`, then refreshes + closes.
- `PastResearchRunsPanel`: **Cancel** button on still-running Deep Sweep rows.
- `SiteSubmitSidebar`: wires `onRerun` (toast + refresh) and the cancel-sweep
  handler.

## Cost estimate (open item — do NOT hard-change yet)

The confirm dialog said **~$18** for 6 chunks; Hall actually cost **~$32** (dense —
32 BOC meetings vs ~10/chunk in Macon; ~$5.3/chunk). Part of that was an
**unrelated OpenClaw bug routing all PDF reads to Opus**, now fixed on the OpenClaw
side. Per the request, **re-baseline against a post-fix Deep run before changing
the per-chunk number.** Until then the re-run estimate uses the existing
`PER_CHUNK_COST_USD = 3` as a labeled floor ("dense counties can run higher"), and
the constant carries a TODO.

## Verified

- `get_sweep_gaps` classification run read-only against the Hall sweep →
  `gap_count = 2` (chunks 4, 5), `healable_count = 2` (chunks 1, 3). Correct.
- Changed frontend files typecheck clean (two pre-existing errors in
  `SiteSubmitSidebar.tsx` — JSX namespace, EmailComposer `onSend` — predate this
  branch).

## Not done / follow-ups

- Live e2e of an actual re-run (real OpenClaw spend) — needs Mike.
- Cost re-baseline after a post-Opus-fix Deep run.
- The 45-min timeout still advances on a *time* assumption; OVIS can't confirm an
  OpenClaw agent is truly dead. A heartbeat/liveness signal from OpenClaw would let
  the sweep advance on confirmed-terminal instead of a timer (out of scope — no
  agent changes this branch).
