# Market research: checkpoint submits and the `final` flag

Shipped 2026-11-10. Migration `20261110213319_research_submit_final_flag.sql`.

## Why

On 2026-11-10 the Senoia Quick run (`01b79c02`) marked all three municipalities complete
(7 projects noted in its checklist), then the agent stopped before its single end-of-run
`submit_research_report`. Nothing reached staging, and the reaper failed the run 90 min later.
All findings were lost.

The fix on the agent side: submit cumulatively after each municipality. That needed two
OVIS-side changes, because every submit used to move the run to `awaiting_review`:

- **The sweep engine fired the next chunk early.** `advance_sweep` treats `awaiting_review` as
  done, so a Deep Sweep chunk's first checkpoint started the next chunk while the agent was
  still running. Two agents running at once is what caused the Hall rate-limit collisions.
- **The run became reviewable mid-flight.** Any approve or reject made every later checkpoint
  fail with `run_already_reviewed`.

## Contract

`submit_research_report(run_id, candidates, needs_review, alt_avenues, cost, in_tok, out_tok, final)`

| Call | Staged rows | Run state |
|---|---|---|
| `final` omitted or false (checkpoint) | replaced by this batch | `running` (pending/failed → running; awaiting_review stays) |
| `final: true` | replaced by this batch | `awaiting_review`, `completed_at = now()` |
| any call on a cancelled / approved / archived run | — | refused: `run_closed` |
| any call after a reviewer acted on a row | — | refused: `run_already_reviewed` |

- **Replace, not append.** Each call deletes the run's `pending` rows and inserts the batch.
  Every call must carry every record found so far.
- **`needs_review` / `alt_avenues` are overwritten** by each call, and a null clears them. Carry
  them cumulatively. Usage figures are COALESCE-with-existing.
- **The default is false on purpose.** A forgotten flag leaves the run open. The reaper fails it
  after 90 min idle and the staged rows survive. That is safer than closing early, which fires
  the next sweep chunk on top of a live agent.
- The edge function only treats a strict boolean `true` as final; `"true"`, `1` and the like are
  checkpoints.
- Each call updates `research_run.updated_at`, so every checkpoint resets both the reaper's idle
  clock and the sweep engine's stall clock (both read `research_run_last_activity`).
- The run row is locked `FOR UPDATE`, which serializes concurrent submits on one run.
- Returns `{staged_count, final, state}` (was a bare int). The MCP tool echoes it to the agent.

## In-flight review guard

Trigger `municipal_project_staging_00_in_flight_guard` (BEFORE UPDATE) raises `run_in_flight` when a
row's run is `pending` or `running`. It covers every review RPC: approve, reject, unreject, merge,
unmerge and not-duplicate. That includes `approve_research_staging_rows`, which never checked run
state and would have set an in-flight run to `approved`.

Updates that only touch `duplicate_of_staging_id` / `merged_into_staging_id` / `updated_at` pass
through. Those are the `ON DELETE SET NULL` cascades fired when another in-flight run's checkpoint
replaces the rows they pointed at. The trigger is named `00_` so it fires before the other
BEFORE UPDATE triggers, and the diff sees only what the statement changed.

UI (`ResearchRunApprovalModal`):
- **Single run:** a `pending`/`running` run opens read-only with an "Agent still running — N
  records saved so far" banner.
- **Sweep:** rows from a chunk whose run is still in flight are held out of the review list, and a
  count is shown.

## Sweep engine: no change needed

`advance_sweep` marks a chunk `done` only when its run is `awaiting_review` / `approved` /
`archived`. A checkpointed run stays `running`, so the engine waits (stall detection still
applies). `approved` / `archived` can't be reached from an in-flight run, because the guard
blocks the approval that would set them. `awaiting_review` is set only by `final: true`. The
other path out of `running` is `failed` / `cancelled` (reaper, orphan, cancel), and the engine
treats that as a failed chunk, as before.

## Verified (rolled-back transaction against prod, 2026-11-10)

1. Checkpoint with `p_final` omitted (named args, as PostgREST calls it) gives `running`, with
   `completed_at` NULL.
2. Raw UPDATE, `approve_research_staging_rows` and `reject_research_staging_row` (impersonated as
   `authenticated`) on the in-flight run are all blocked with `run_in_flight`.
3. A sweep chunk run that checkpoints gives `advance_sweep` → `none` and the chunk stays `running`.
   After `final: true`, the chunk goes `done` and the next chunk fires.
4. An FK SET NULL cascade onto another in-flight run's row is allowed.
5. `final: true` gives `awaiting_review` and the run becomes reviewable. A later checkpoint does not
   regress it. After a review action, a further submit is refused (`run_already_reviewed`).
6. A cancelled run is refused (`run_closed`).
7. Grants: anon/authenticated have no EXECUTE, service_role does, and the old 7-arg signature is gone.

## Known edges

- A reaped (`failed`) run is still a **true gap** to `get_sweep_gaps` even if it holds checkpointed
  rows, so Re-run gaps re-researches that window. Its staged rows remain reviewable in the
  approval modal.
- A late checkpoint on a reaped run revives it to `running`. If that run was a sweep chunk, the
  chunk is already `failed` and the engine has moved on.
