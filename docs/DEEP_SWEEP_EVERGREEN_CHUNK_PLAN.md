# Deep Sweep: an undated chunk (plan, NOT built)

This is the OVIS side of "fix (a)" from the Alcovy Road sweep review
(2026-11-14). Status: the requirements are recorded here. Mike is changing the
agent prompt first, so nothing is built yet.

## Goal

Add a chunk that isn't tied to a date range and runs **once per sweep**. It
covers builder sites, news, community and apartment pages, and known
subdivisions in the radius. The six 6-month chunks then cover only date-bound
sources: minutes, agendas, permits and plats.

On Alcovy Road, sources that aren't date-bound made up about 25% of agent
effort and staged rows. Each chunk repeated them, and 44% of the 71 staged
rows re-staged a project an earlier chunk had already found.

## What the sweep loop needs

1. **`research_sweep_chunk`**
   - Add `kind text NOT NULL DEFAULT 'window'`, CHECK in
     (`'evergreen'`, `'window'`).
   - `window_start` and `window_end` are NOT NULL today. Relax both to
     nullable, and add a CHECK: windows are required when kind = `window`
     and NULL when kind = `evergreen`.
2. **`create_sweep_with_chunks`**
   - Insert the evergreen chunk as `chunk_index` 0 and shift the window
     chunks to 1..N.
   - `total_chunks` becomes N+1.
   - Run it first, so the window chunks can skip projects it already staged.
3. **`advance_sweep`**
   - Sequencing doesn't change. It fires the lowest pending `chunk_index`.
   - Its `fire` payload must carry `kind`.
   - The "two consecutive dead chunks" circuit breaker can stay as is.
4. **`ovis-sweep-tick`**
   - For an evergreen chunk, post to the trigger with no `pz_window_*` or
     `permit_window_*`, and with an explicit `research_scope: 'evergreen'`.
5. **`ovis-research-trigger`**
   - Accept `research_scope` (`window` is the default, so current behaviour
     is unchanged).
   - It currently insists on explicit windows for sweep chunks. Skip that
     check for evergreen.
   - `buildOpenClawMessage` must state the scope plainly: "undated sources
     only: builder, news, community, subdivisions" versus "date-bound
     sources only, window X–Y".
6. **`research_run`**
   - Add `research_scope text` (`window` / `evergreen`) so the approval
     screen, the coverage view and the dedupe can tell which chunk is which.
7. **`rerun_sweep_gaps` / `get_sweep_gaps` / the sweep coverage UI**
   - An evergreen chunk has no window. Gaps should list it as "undated
     sources" and not try to draw it on the date timeline.
   - Re-run must fire it without windows.
8. **Telegram**
   - Unchanged. Messages read "Chunk 1/7 started"; the 1-based numbering
     already comes from `total_chunks`.

## What the checklist needs

- **Keep the per-municipality checklist for evergreen chunks.** Staged
  records require a `boundary_municipality_id`, and per-municipality status is
  how coverage is judged. The agent marks each municipality complete once it
  has searched builder and news sources for it.
- **Optional, worth it:** an MCP tool `get_sweep_known_projects(sweep_id)`.
  It would let each window chunk see the names and case numbers already staged
  in the sweep, and skip or enrich them instead of re-staging. Today the
  name dedupe catches exact repeats only after the fact, and renames slip
  through.
- **Optional:** on submit, warn (don't reject) when an evergreen run stages
  `pz_agenda` / `permit_portal` records, or a window run stages `news` /
  `builder_site`. That would show whether the prompt split holds.

## Order of work

1. Mike updates the agent prompt so it understands `research_scope`.
2. Migration (items 1, 2, 6), RPC changes (2, 3, 7), then the edge functions
   (4, 5).
3. Test with one sweep before making it the default for Deep.
