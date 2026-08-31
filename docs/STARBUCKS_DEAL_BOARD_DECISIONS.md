# Starbucks Deal Board — Decisions Log

**Purpose:** the locked decisions behind `STARBUCKS_DEAL_BOARD_SPEC.md`, with the reasoning that produced them.

The spec says *what* to build. This says *why*, so that an ambiguity the spec doesn't cover can usually be resolved by reading the principles here rather than stopping to ask.

---

## How to use this file

**Read this before the spec, at the start of any session on this branch.**

When you hit a decision the spec doesn't cover:

1. Check §1 (Principles). Most ambiguities resolve against one of them.
2. Check §2 (Locked decisions) — the question may already be answered, or closely analogous to one that is.
3. Check §3 (Explicitly deferred). If it's there, don't build it, don't ask about it.
4. If none apply and the decision is **reversible** — naming, layout, ordering, file structure — decide it yourself, note it in §5, and keep going.
5. If it's **irreversible or expensive to undo** — schema shape, data loss, anything touching production, anything that changes what a color means — stop and ask.

**Ask anyway, regardless of the above, when:**
- Reconnaissance contradicts a stated assumption. Every high-value finding on this project came from this: `starbucks_layer_enabled` was false, notes were empty and `activity` held everything, the synopsis writer had never run. Report contradictions immediately; do not route around them silently.
- A decision here appears to be based on a factual error.
- The cheapest fix would violate a §1 principle.

**Maintenance:** when a decision is made in conversation, add it to §2 with its reasoning. When something in §5 gets confirmed or reverted, move or delete it. A stale decisions file is worse than none.

---

## 1. Principles

These override local convenience. If an implementation choice conflicts with one, the principle wins.

**1.1 The board never scrolls.**
The single hard constraint. The existing master pipeline is unused *because* it requires scrolling. A board that scrolls has failed regardless of how good it is otherwise. When content doesn't fit, shrink tiles or reduce what's on them — never add scroll.

**1.2 The board must never lie.**
Heat is trusted only if it's always right. A tile that stays hot after real work happened, or cools without human action, destroys the board's value permanently — the user goes back to checking the master pipeline manually and never fully returns. This is why the reset clock is a database trigger, not application code: no future writer can forget to fire it.

**1.3 Silence is the enemy, not disorganization.**
The board answers "which deals are drifting," not "what did I do today." Every design choice serves visibility of neglect. Features that improve organization but not visibility are not wins.

**1.4 Human action is the only signal.**
Heat responds to what a person did or didn't do. Never let an inferred, synced, or generated value drive heat. AI output can *suggest* — a prompt in the slide-over — but a human confirms.

**1.5 Cooling a tile takes under ten seconds, without leaving the board.**
If it requires navigating to the full deal record, it won't happen and the board becomes decoration. Protect this in every interaction design.

**1.6 Spend attention deliberately.**
Cool tiles should be visually boring. All energy goes to the tiles that need action. Anything that makes a calm board look busy is a regression.

**1.7 Absence should look like absence.**
Unclassified, unset, and no-history states render as visibly incomplete, not as neutral or fine. Gaps in the data are information the user needs to see.

---

## 2. Locked decisions

Do not reopen without the user. Reasoning included so you can reason *from* them.

### 2.1 The board owns its own clock
`deal_activity_state.ball_in_court_since` is board-owned and trigger-maintained.

**Not** `deal_synopsis.ball_in_court` (AI-generated — violates 1.4, and the writer has never successfully run), **not** `deal.current_handoff_holder` (document-scoped; a deal can be pre-LOI with no document and still have a ball in someone's court).

### 2.2 Reset is a database trigger
Fires on `note_object_link` insert, `task` insert, `task.due_at` change, and `activity` insert. Application code does not manage this.

Reasoning: three future writers — the board, email triage, the voice layer — plus manual SQL. Any one forgetting to reset violates 1.2. Triggers are invisible in app code, which is the accepted cost; document them in the migration.

### 2.3 `activity` is the primary touch signal
0 of 44 Starbucks deals had note links; 19 had activity. Notes are not where this history lives.

### 2.4 No Salesforce guard
There is no SF sync in OVIS and hasn't been for over a year. The `sf_*` columns are historical residue from a one-time migration. All `activity` inserts are human-originated by definition. A guard would wrongly exclude legitimate migrated history.

### 2.5 `ready` is a persistent value, not a transient state
A deal sitting in `blocked_on = 'ready'` for two weeks is precisely the neglect this board exists to expose (1.3). Renders hot regardless of clock, sorts to top of column, chip reads "Submit it."

### 2.6 Three discrete heat states, not a gradient
Cool / warm / hot. No continuum.

Reasoning: a gradient is unreadable at ten feet — it produces a wall of muddy orange with no perceivable threshold. Discrete steps give a hard edge the eye catches in peripheral vision. (Absence states — unclassified, no-history — are not heat; see 1.7, 2.18, 2.19.)

### 2.7 No green anywhere
Cool is slate. Green implies "done" and competes with red for attention, violating 1.6. A cool tile is not good — it is merely not currently a problem.

### 2.8 Chip text differs by court; color does not
Same palette both directions. Yours: "You owe a move." Theirs: "Chase them." Unset: "Set the court." Ready: "Submit it."

Reasoning: red says something is wrong. The chip says whether to work or to phone someone. Without it the board produces anxiety rather than direction.

### 2.9 Split tolerances, one clock
Your court: 3d warm / 7d hot. Their court: 10d warm / 21d hot. Ten days waiting on a landlord is normal; ten days sitting on your own move is not. Thresholds live in config, not inline — they will be tuned after a week of use.

### 2.10 `none` is not selectable; unclassified is the pre-classification state
`none` ("genuinely parked, nobody owing") is **not offered in the court picker.** Escape hatches get used on exactly the deals being avoided — a selectable "parked" would let a drifting deal be hidden. It remains a valid *stored* value and renders as needing attention if it ever appears, but the UI never sets it.

*Refined in-session:* the pre-classification default is `ball_in_court = NULL` (**unclassified**, 2.18), **not** `none`. The original draft made `none` the default that rendered as needing attention; that was superseded by 1.7 and the unclassified work — an unclassified deal is an *absence* (looks incomplete), not a hot deal. See 2.18.

### 2.11 Board membership derives from stage
No `is_active` flag. Four columns: Pre-Submittal, Submitted-Reviewing, Negotiating LOI, At Lease/PSA. Lost and all terminal/paid stages are off-board — once a lease is executed, nothing on this board can help.

### 2.12 Pre-Submittal is one column, grouped by blocker
`blocked_on` is a set of parallel blockers, not a sequence — a deal waits on one and then moves to Submitted. Subheads within the single column, fixed order: Ready → Pricing → Site plan → Under contract → Info → (unset).

### 2.13 Satellite table, named for the general case
`deal_activity_state`, 1:1 on `deal`. Not columns on `deal` — the reset trigger fires constantly, and writing to `deal` would trip every realtime subscriber in OVIS and add vacuum pressure.

Named `activity_state`, not `board_state`, because phase 3 generalizes this to the whole pipeline. Don't name a table after one view of it.

### 2.14 Starbucks is identified by flag, not client_id
`client.starbucks_layer_enabled = true`. Hardcoded IDs break when a third Starbucks entity appears — there are already two. Note this flag also gates the Starbucks map layer/portal.

### 2.15 The daily number is the only game mechanic
Count of tiles needing attention, target zero. No points, streaks, or badges — those reward touching things rather than closing them.

### 2.16 Parallel sessions use git worktrees
A feature branch alone does not isolate concurrent sessions; a `git checkout` in the shared checkout stomps all of them. Deal board work happens in the `-deal-board` worktree.

### 2.17 Stage change from the slide-over — dropdown, not drag-and-drop
A dropdown in the slide-over lists the four board stages **+ Lost** and writes `deal.stage_id`. **Not** drag-and-drop (DnD stays deferred, §3 — imprecise on a wall TV).

Reasoning: forcing a trip to the master pipeline to fix a *miscategorized* deal means it doesn't get fixed, and a deal in the wrong column silently corrupts the board's whole signal (1.3, and 1.5 — a fix that requires leaving the board won't happen). This qualifies the §3 "stage changes happen in the master pipeline" deferral: that holds for reclassification-by-workflow, but not for correcting an error you're staring at. Build step 7, after realtime — **not yet built.**

Landmines (also §4): this is the **first board write to shared pipeline data** — `deal.stage_id` propagates to `site_submit.submit_stage_id` via `trigger_sync_deal_stage_to_site_submit` (migration `20260714120000`). And moving a deal **off** the four board stages removes it from the board → **require a confirm** for that case.

### 2.18 Unclassified (`ball_in_court = NULL`) is a first-class absence state
A deal nobody has classified is `NULL` — never defaulted into a tolerance (1.4, 1.7). It renders as absence: solid dim left bar, "Set the court" chip, `{days}d`; it is **excluded from the "need attention" number** and shown in the daily tail as "N to classify." Setting a court (or any real touch) clears it.

Reasoning: the behavior this replaced — defaulting unset deals into the `none` tolerance and rendering them warm/hot "No one owns this" — was a bug: it fabricated heat from data we don't have (1.2, 1.4). Directed in-session. `ball_in_court` is therefore nullable with no default (migration `20260828120000`).

### 2.19 "No history" is a distinct absence state from unclassified
`seeded_fallback = true` (or no `deal_activity_state` row) means **no touch data at all** — the backfill clock is a `now()` placeholder. Renders as absence: dashed dim left edge, "no history" label, no day count; excluded from heat and the daily number; shown as "N no history." Cleared by the first real touch. Distinct from unclassified (2.18), which has a real clock but no court. 27 of 46 deals start here (§4).

---

## 3. Explicitly deferred

Not oversights. Do not build, do not ask about, do not add "small versions of" opportunistically.

| Deferred | Notes |
|---|---|
| A separate "today" or task view | Never. The board **is** the list. A second place to look means neither gets looked at. This is permanent, not phase-ordering. |
| Kanban drag-and-drop between stages | DnD stays deferred (imprecise on a wall TV). A **non-drag** stage change via a slide-over dropdown **is** in scope — see 2.17. |
| Deck completion progress bar | Phase 2, separate spec. Dependency chain already defined. |
| Rolling AI deal summary | Phase 2. Reserve space in the slide-over; wire nothing. |
| Weighted pipeline value / delta scoreboard | Phase 3. |
| Commission cash flow forecast | Phase 3. |
| Overdue-action heat, one-sided-momentum detection, time-in-stage heat | Real and wanted; deferred so v1 ships. |
| A fourth heat state for extremes | If needed later, use a non-color marker. A board that needs a legend has already lost. |
| Agenda ordering, per-item notes, meeting history | `on_agenda` is a boolean and a filter in v1. |
| Mobile layout | This is a TV, secondarily a desktop browser. |
| Other clients / the full pipeline | Phase 3, after v1 has been lived with. |
| Rewriting `deal-synopsis` | Broken and out of scope. Needs a current model (`gemini-1.5-pro` is retired) and a schema fix. Don't repair it in passing. |

---

## 4. Known landmines

- **`deal_synopsis` is empty and its writer has never run.** Don't read from it, don't assume it works.
- **`starbucks_layer_enabled` also gates the map layer/portal.** Changing it has effects outside the board.
- **The repo has ~1010 pre-existing TypeScript errors** and Vite skips `tsc`. Verify your own files typecheck; don't try to fix the rest.
- **27 of 46 deals have no history at all.** The board's first render is mostly empty states. That's accurate, not broken.
- **Migrations here apply to the production database.** There is no separate dev/sandbox DB yet; the app `.env` and the MCP Supabase project are both `rqbvcvwbziilnycqtmnc` (production). Even in auto mode, schema changes should be surfaced before they're applied.
- **Stage change (2.17) writes shared pipeline data.** `deal.stage_id` propagates to `site_submit.submit_stage_id` via `trigger_sync_deal_stage_to_site_submit` (`20260714120000`) — the first board write outside `deal_activity_state`. It has pipeline-wide effects; test it doesn't loop. Moving a deal off the four board stages removes it from the board → require a confirm.

---

## 5. Decisions made in-session

Append reversible calls made without the user, with a one-line reason. Reviewed periodically; anything wrong gets caught here rather than discovered later.

- **Live text-size control (A− / A+, default 135%, persisted to localStorage).** Added because the board was too small to read from ~10 ft on the office TV. Its 1.1 tension (scrolling at large scales) is resolved by the two-column Pre-Submittal below.
- **Removed `none` from the court picker.** It was incorrectly offered as "No one (parked)", violating 2.10. The picker now offers Us / Them + a "clear" (→ unclassified). `none` remains a valid stored value but is never set from the UI.
- **Two-column Pre-Submittal layout.** Tiles in the fat column flow into two sub-columns (blocker subheads preserved, 2.12) so big text and no-scroll coexist (1.1). **This is a symptom fix.** The root cause is that Pre-Submittal holds **23 of 50** deals because it is really *four blockers bucketed into one stage*. Revisit splitting Pre-Submittal into real `deal_stage` rows once classification is complete and the blocker distribution is visible — at that point the columns may want to be the blockers themselves, and the two-column hack goes away.
