# Starbucks Deal Board — Decisions & Landmines

Companion to [STARBUCKS_DEAL_BOARD_SPEC.md](STARBUCKS_DEAL_BOARD_SPEC.md). Records design decisions that reverse or qualify the spec, and the sharp edges to watch when implementing them. Newest decisions at the bottom.

---

## D1 — Stage change from the slide-over (build step 7)

**What.** Add a stage control to the slide-over: a **dropdown** listing the four board stages (Pre-Submittal, Submitted-Reviewing, Negotiating LOI, At Lease/PSA) **plus Lost**, writing to `deal.stage_id`. **Not drag-and-drop.**

**This reverses the v1 deferral of stage changes.** Spec §2 ("What v1 is not") put *Kanban drag-and-drop between stages* out of scope, and §3 deliberately built the board to write only `deal_activity_state` (board-owned state), never pipeline fields. D1 walks that back — but via a dropdown, not DnD (the DnD deferral itself stands; drag on a wall TV is imprecise and error-prone).

**Why (the reason that overrides the deferral).** Forcing a trip to the master pipeline to fix a **miscategorized** deal means it doesn't get fixed. A deal sitting in the wrong column silently corrupts the board's whole signal — the counts, the columns, the "which deals are drifting" read. This is the same principle that put the three action buttons *in* the slide-over (spec §7: "If Mike has to navigate to the full deal record to log a note, he won't, and the board becomes decoration"). If fixing the category requires leaving the board, it won't happen, and a wrong board is worse than no board.

### Landmines

**L1 — This is the FIRST board write that touches SHARED pipeline data, not `deal_activity_state`.** Every board write so far (ball-in-court, blocked_on, on_agenda, notes, tasks) targets board-owned state or cooling triggers. `deal.stage_id` is co-owned with the master pipeline. Consequences to handle:

- **RLS.** Writes so far only needed the `deal_activity_state` policy. `deal` has its own update policy — confirm the board user can `UPDATE deal.stage_id` before wiring the control.
- **It propagates into the master pipeline.** `trigger_sync_deal_stage_to_site_submit` (migration `20260714120000`) fires `AFTER UPDATE OF stage_id ON deal` and updates the linked `site_submit.submit_stage_id` via `deal_submit_stage_map`. So a board stage change **also moves the site submit's stage in the master pipeline.** This is the existing bidirectional sync working as designed — but it means the board is no longer a read-mostly consumer of pipeline data; a stage change here has pipeline-wide effects. Test that a board-driven change lands correctly on the site submit and doesn't loop.
- **Our own trigger also fires.** `trg_clear_blocked_on_stage_change` (migration `20260825190000`) clears `blocked_on` when a deal leaves Pre-Submittal — desirable here, no action needed, just expected.

**L2 — Moving a deal OFF the four board stages removes it from the board.** Choosing **Lost** (or, later, any non-board stage) makes the deal vanish from the surface entirely, because the board only renders the four stages. A silent disappearance reads as data loss and is alarming on a wall display. **Require an explicit confirm for that case** — e.g. "This moves *{site}* to Lost and removes it from the board. Continue?" Changing *between* the four board stages needs no confirm (the tile just moves columns).
