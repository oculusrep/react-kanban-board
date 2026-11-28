# Commitment layer — TODO

Deferred work on the commitment / triage layer. Branch: `feature/commitments`.

## MCP tool `run_triage(mode)` — deferred 2026-10-29

Voice triage should be able to trigger an extraction run before briefing, so the
briefing reflects mail that arrived since the last run.

**Why it isn't built:** the `ovis-mcp` server source lives in the
`react-kanban-board-nnn-intake` worktree, on its own unmerged branch. Adding the tool
from `feature/commitments` would mean authoring on a different feature branch.
Decision (Mike, 2026-10-29): leave it for later, don't touch that worktree.

**What is already in place**, so the tool is a thin wrapper when someone does build it:

`extract-commitments` accepts `{ mode: 'incremental' | 'full', drain: true }` and returns

| field | meaning |
|---|---|
| `run_id` | row in `commitment_extraction_run` |
| `done` | whether the pass finished |
| `next_offset` | resume point if it didn't |
| `spent_today_usd` | against the $5/day cap |

So `run_triage(mode)` is one POST with `drain: true`, which returns when the pass is
done. If a full pass outruns the MCP response timeout, return `run_id` and add a
`triage_run_status(run_id)` tool that selects that row.

**Where to add it when the time comes:** the `ovis-mcp` tool list, alongside the
existing OVIS tools — either in the nnn-intake worktree, or in `main` after that
branch merges.
