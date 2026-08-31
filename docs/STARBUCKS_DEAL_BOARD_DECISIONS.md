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
No `is_active` flag. Four board deal-stages: Pre-Submittal, Submitted-Reviewing, Negotiating LOI, At Lease/PSA. Lost and all terminal/paid stages are off-board — once a lease is executed, nothing on this board can help. (Membership is further narrowed by 2.22.)

### 2.22 Dead-site deals are off the board (regardless of deal stage)
A deal whose linked `site_submit` is in a **declined/dead** submit-stage — **Pass, Lost / Killed, Use Declined, Use Conflict, Not Available** (`DEAD_SUBMIT_STAGES`, matching the map's declined set in `stageMarkers.ts`) — is excluded from the board **regardless of its deal stage**. The site is already passed/killed; the deal doesn't belong on a board about *live* work. A deal with **no** linked site_submit is kept (nothing declared it dead).

This dropped the board from **39 → 30** (9 deals sat on a dead site while their deal stage still put them on the board). Membership is now: Starbucks client **and** deal-stage ∈ the four board stages **and** (no site_submit **or** site_submit not dead).

**This is also the mechanism that makes the "Pass" action work (§2.23).** Verified: setting `site_submit → Pass` does **not** change the linked deal's stage — the bidirectional stage sync only fires for stages present in `deal_submit_stage_map`, and `Pass` is not mapped (a test flipped a site to Pass; the deal stayed Pre-Submittal). So the Pass action just writes the site_submit; this rule removes the deal from the board, and the deal record itself stays put. Because membership now depends on `site_submit`, the board subscribes to `site_submit` realtime too (a pass/kill done on the map reflects live).

### 2.23 The kill/pass action — one action, labeled by stage, one input written to two places
The slide-over has **one** remove-from-board action, labeled by stage:

- **Early (Pre-Submittal / Submitted-Reviewing, with a linked site_submit) → "Pass on this site".** One reason input, written twice:
  1. `site_submit.pass_reason` (free text) + `site_submit.pass_reason_category` (structured dropdown: **Pricing / Site control / Traffic / Client declined / Competition / Other**) — a dedicated field, **not** the generic `site_submit.notes`, so the **client site report** can show a pass-reason breakdown rather than 40 unique sentences (migration `20260831150000`).
  2. A **narrative note on the deal** (via `insertDealNote`) so the "why" is in deal history and readable by the synopsis later.
  Then `site_submit → Pass`. The tile drops via §2.22; **the deal record stays at its stage** (Pass isn't synced to the deal).
- **Later (Negotiating LOI / At Lease/PSA), or any early deal with no site_submit → "Mark lost".** Canonical OVIS deal-kill: required `deal.loss_reason` + `deal.stage_id = Lost` (the stage-sync trigger flips the site to `Lost / Killed`), **plus the same narrative note** on the deal. `Lost` is off-board so the tile drops. No category (that's a site/pass concept).

A required reason is enforced in the same step (not a second modal). Both paths write a note, so the history/synopsis sees every removal. The reason input writing to two places from one action is the point: structured field for reporting + narrative note for humans/AI.

### 2.24 Parked — a board-owned, cross-stage waiting state
"Parked" is for a deal waiting on something **long-horizon** (e.g. landlord confirming water/sewer feasibility) — no chasing needed, it shouldn't burn on the board.

- **Board-owned field, NOT a `deal_stage`.** `deal_activity_state.parked_until` (DATE, migration `20260831160000`). Parking cuts across stages — a deal can be parked at Pre-Submittal, Submitted-Reviewing, or Negotiating LOI — and **its real deal stage and `site_submit` are unchanged while parked**, so the client site report stays accurate.
- **Requires a review date; no indefinite parking.** While `parked_until` is in the **future** the deal is parked (off the board). On/after that date it **returns automatically** (client-side; `isParked` = `parked_until > today`), in whatever column its stage puts it, **with the clock running from the review date** — the park action sets `ball_in_court_since = parked_until`, so once it returns `days-since` counts from then. (The park note is written *first* so its reset-trigger stamp is then overwritten by the review date.)
- **Excluded from the daily number and all columns / band / to-classify** — parked deals are pulled out before any of those are computed.
- **Header item "Parking lot (n)"** next to the to-classify counter, but **quiet** (dim, never hot — parking must not burn). Click → a full-height list (same pattern as triage; Escape exits) showing each parked deal's **site name, the stage it's parked at, and the review date**; click a row → slide-over (to un-park or act).
- **Park is available from both the slide-over and the triage queue** (`ParkControl`, shared). Un-park (from the slide-over / parking lot) clears `parked_until` and starts the clock now.

### 2.25 Manual priority ("urgent") — a separate channel from heat, auto-expiring
Manual "this matters most" priority, independent of heat.

- **Board-owned field, auto-expiring:** `deal_activity_state.urgent_until` (TIMESTAMPTZ, migration `20260831170000`). Marking urgent sets `urgent_until = now + URGENT_TTL_DAYS` (**7 days, in config beside the heat thresholds**); it auto-clears client-side when passed (`isUrgent` = `urgent_until > now`). **Re-tap to renew.**
- **Why auto-expiry, not a user-picked date:** urgent is a *"now"* state (uniform, short horizon), unlike parking's *"defer until X"* (variable future). A date picker is friction on the wrong axis, and a permanent flag becomes wallpaper — an automatic TTL kills both. (If *volume* ever becomes the wallpaper — too many urgent at once — add a small cap; not built yet.)
- **Sorts to the top of its column regardless of heat** (`compareDeals`: urgent first, then heat, then days). A deal can be urgent-and-fresh or urgent-and-neglected — different situations, both surfaced at the top.
- **Does NOT change the heat color.** Heat means only "nobody has touched this" and must keep meaning only that. The tile marker is a distinct **`▲` in a cool accent (`PALETTE.urgent`, `#6AA6FF`)** — deliberately outside the warm/hot spectrum, and not green.
- **Set from the slide-over and the triage queue** (`UrgentToggle`, shared; optimistic so it reflects immediately). Urgent does not remove the deal from the board — it stays in its column, pinned to the top.


### 2.12 Pre-Submittal blockers, the ready-to-submit band, and the triage counter
`blocked_on` is a set of parallel blockers, not a sequence. **`blocked_on = awaiting_ll | site_control`** — just two (migrations `20260831130000`, `20260831140000`). The board is **five columns**: Awaiting landlord · Awaiting site control · Submitted-Reviewing · Negotiating LOI · At Lease/PSA. The first two carry a small "Pre-Submittal" super-label. This retires the "one column with subheads" design, the two-column-grid stopgap (§5), *and* the Unset/Ready columns.

Two Pre-Submittal states are **not** columns:

- **Ready to submit** — a *derived* state (Pre-Submittal, **classified** [court set], **no blocker**): nothing is stopping it, so submit it. Renders in a **full-width band above the columns**, hot, chip "Submit it", sorted top. **The band is hidden entirely when empty** — no labeled empty strip. It's usually empty (a ready deal moves to Submitted quickly), so it costs nothing when there's nothing to act on. Ready-to-submit is the *absence* of a blocker, not one of them — a band says "clear these first"; a column would make it one option among several.
- **To classify** — a Pre-Submittal deal, **no blocker**, **not yet classified** (no court). Off-board entirely; surfaced only by the header counter + triage queue (2.20). New deals arrive here.

Details:
- **`awaiting_ll`** ("Awaiting landlord") collapses the former `pricing` + `site_plan`. Two booleans `needs_pricing` / `needs_site_plan` detail it; the tile tag reads **Pricing / Site plan / Both**. **At least one is required** (DB invariant `deal_activity_state_awaiting_ll_needs`; the UI enforces it too).
- **`site_control`** ("Awaiting site control") is the former `under_contract`, renamed.
- **`info` and `ready` were dropped** as enum values (`info` → unclassified; `ready` → derived band). A real new blocker gets named when it actually emerges during classification — not speculatively.
- Implied court on pick (overridable): `awaiting_ll` / `site_control` → them. Classifying with **no blocker + court** = ready-to-submit.

### 2.20 Unclassified is a header counter + triage queue, never a column or a modal
Removing Unset as a column, the unclassified Pre-Submittal deals become a single **"N to classify" counter** at the top of the header, left of the daily number. **When non-zero it renders hot and is the loudest element in the header — louder than the daily number** — because an unclassified deal corrupts every other figure on the board (it can't be placed or heated, so it silently drags the counts). **At zero it disappears.**

Clicking it opens a **triage queue**: one deal at a time, full-height, showing site name, city, stage, and any history; set court + blocker, then advance automatically; Escape exits; progress is saved per deal.

**No blocking modal on load.** A deal arriving unclassified must never interrupt what Mike is doing — the counter is passive; triage is opt-in. Designed for the **steady state of 2–3 new deals a week**, not a one-time bulk pass.

### 2.21 Accounts are clients; the board filters off client_id (phase-3 mechanism)
Both Starbucks entities (client `Starbucks` and `Starbucks - JW (Coastal GA)`) are on the board. An **account is a client**, and all account behavior keys off **`client_id`** so the exact same mechanism carries the full pipeline in phase 3 — nothing is hardcoded to these two clients in the logic.

- **Tile token.** Each tile shows a short, **dim, text-only** account label (e.g. `SBUX`, `JW`) — no color (1.6). So account is legible in the "All" view.
- **Header filter.** Segmented `All / <accounts…>` (shown only when >1 account), keyed on `client_id`, persisted across reload.
- **Short labels are curated, with a derived fallback.** `client_id → { token, filter }` is a small map (`SBUX`/`Starbucks`, `JW`/`Coastal GA`); unknown clients (phase 3) fall back to a token derived from the client name. Default + override, not pure heuristic. (Could later move to a `client` column.)
- **Agendas are per-account.** The header shows `Agenda: SBUX 6 · JW 3`; clicking one enters agenda view **scoped to that account only**, so clearing stars after a call touches only that account's deals — a natural consequence of scoping, not a new bulk action. `on_agenda` stays a per-deal boolean; "per-account" is a grouping of the view and counts, not a new field.
- **The triage queue respects the account filter** (its deal list is the account-filtered to-classify set).

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
- ~~**Two-column Pre-Submittal layout.**~~ **Superseded** (2.12): the blockers are now real board columns, so the two-column-grid stopgap is gone. Its "revisit" — split Pre-Submittal by blocker — is what happened, at the board-column level rather than `deal_stage` rows. (Whether the blockers should become real `deal_stage` rows, so the split is shared with the master pipeline, is still open — revisit once the blocker distribution is visible post-classification.)
