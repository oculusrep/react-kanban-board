# OVIS — Starbucks Deal Board

**Build spec v1**

- **Owner:** Mike / Oculus Real Estate Partners
- **Target:** Wall-mounted display (office TV, landscape, driven from a Mac); secondarily a desktop browser
- **Scope:** Starbucks account only. Not the master pipeline.
- **Branch:** `feature/starbucks-deal-board`
- **Status:** Spec draft — grounded against the existing OVIS schema (see §3). Awaiting Mike's answers on §12 open items before schema work begins.

---

## 1. The problem this solves

Forty-odd active Starbucks deals in varying stages. The ones moving fast absorb all attention; the ones that have gone quiet disappear from memory entirely. The existing master pipeline requires scrolling, so it doesn't get looked at.

The board is a single non-scrolling surface where **neglect is visually loud**. It is not a task list. The question it answers is "which deals are drifting," not "what did I do today."

**Design constraint that overrides everything else:** all deals visible at once, readable from across the room, zero scrolling.

---

## 2. What v1 is not

Explicitly out of scope. Do not build these yet.

- Kanban drag-and-drop between stages
- A separate "today" or task view of any kind — the board *is* the list
- Deck completion tracking (phase 2, separate spec)
- Weighted pipeline value / scoreboard deltas (phase 3)
- Any other client or account
- Mobile layout — this is a TV, and secondarily a desktop browser
- Overdue-action logic, one-sided-momentum detection, time-in-stage heat

Those last three are real and worth building. They are deferred so v1 ships in one or two sessions rather than two weeks.

---

## 3. Data model

### 3.1 Reuse before creating — what OVIS already has

Reconnaissance of the current schema (migrations, `database-schema.ts`, `src/hooks/useKanbanData.ts`) found that **most of what this board needs already exists**. Getting this layer right is the point of the exercise: if the schema is correct, phases 2 and 3 become views rather than rebuilds. Here is the existing ground the board sits on.

| Concept the spec needs | Already in OVIS | Notes |
|---|---|---|
| Deal record | `deal` table | Has `stage_id`, `client_id`, `property_id`, `site_submit_id`, `owner_id`, `last_stage_change_at` |
| Stage / column | `deal_stage` table (`id`, `label`, `sort_order`, `active`) | Fixed left-to-right ordering comes free from `sort_order`. See §4. |
| Starbucks account filter | `client.starbucks_layer_enabled = true` | This is how a deal is identified as Starbucks — join `deal.client_id → client`. No name-matching. |
| Ball-in-court (existing) | `deal_synopsis.ball_in_court` (who, text), `ball_in_court_type`, `alert_level` (green/yellow/red), `days_since_activity`, `last_activity_at`, `stalled_threshold_days` | **AI-generated** by the `deal-synopsis` edge function (Gemini). See §3.2 for how this reconciles with the board's own clock. |
| Handoff holder (existing) | `deal.current_handoff_holder` (`us` \| `ll` \| null), `current_handoff_document` (`LOI` \| `Lease` \| null) | A second, document-centric "who has it" concept. Do not confuse with the board's `ball_in_court`. |
| Notes | `note` table + `note_object_link` (polymorphic) | Notes live once in `note`; a link row carries `object_type` and a per-entity FK (`deal_id`, `contact_id`, …). The reset trigger hooks `note_object_link`, not `note`. See §3.3. |
| Next actions / tasks | `task` table (`due_at`, `completed_at`, `status` ∈ open/in_progress/completed/cancelled, `deal_id`) | This **is** the next-actions table. No new table needed. See §3.4. |
| Archived / dead | No `is_active` flag today | Deals reach a terminal **"Lost"** `deal_stage` instead. See §3.5 and open item §12. |

**Key tension to resolve before coding (§12):** OVIS already has *three* overlapping "who owes the next move" signals — `deal_synopsis.ball_in_court` (AI), `deal.current_handoff_holder` (document handoff), and the new hard clock this board wants. The board must not become a fourth silent source of truth. Recommendation in §3.2.

### 3.2 Ball-in-court and the clock

The board's heat logic (§5) needs a **hard, trigger-maintained timestamp** — `ball_in_court_since` — that rolls cool→warm→hot deterministically at midnight. The existing `deal_synopsis` fields are AI-derived and refresh on the edge function's cadence, so they cannot be the clock. They also carry no reliable "since" timestamp the board can compute against.

**Recommendation:** add the board's own explicit fields to the `deal` record (or a small `deal_activity_state` satellite table keyed 1:1 on `deal_id` if we'd rather not widen `deal`):

| Field | Type | Notes |
|---|---|---|
| `ball_in_court` | enum | `us` \| `them` \| `none` |
| `ball_in_court_party` | text, nullable | Who specifically — "Landlord", "Starbucks RE", "GDOT", "Seller". Free text in v1; may FK to `contact` later. Displayed on the tile. |
| `ball_in_court_since` | timestamptz | **The clock.** Set whenever `ball_in_court` changes or a reset event (§3.3) fires. |

Rationale for a dedicated set of fields rather than reusing `current_handoff_holder` / `deal_synopsis`:
- `current_handoff_holder` is `us`/`ll` and scoped to document handoff (LOI/Lease). The board's `them` is broader than "landlord" (GDOT, Seller, Starbucks RE), and the board has a legitimate `none`. Overloading it would corrupt the handoff feature.
- `deal_synopsis` is a read model, regenerated wholesale by an AI job; giving it a human-writable authoritative clock would fight that job.
- Keeping the board's three fields distinct and trigger-owned means the reset semantics (§3.3) are unambiguous and testable.

Open item §12 asks Mike whether he'd rather the board *drive* `current_handoff_holder`/`deal_synopsis` (single source of truth, more integration work) or stay a clean separate layer (recommended for v1).

`ball_in_court = 'none'` means the deal is genuinely parked with nobody owing anything. It should be rare and it should look suspicious — treat it as "us" for heat purposes. A deal where nobody owes anything is a deal nobody is working.

### 3.2.1 Pre-Submittal blocker (`blocked_on`)

Pre-Submittal is the fattest column (22 of 37 live deals sit there — see §4). Ball-in-court alone doesn't discriminate within it; what matters at this stage is *what each deal is waiting on*. So the board carries a second board-owned enum, set **only for Pre-Submittal deals**:

| Field | Type | Notes |
|---|---|---|
| `blocked_on` | enum, nullable | `pricing` \| `site_plan` \| `under_contract` \| `info` \| `ready`. Non-null only while the deal is in Pre-Submittal; null (and ignored) in every other stage. |

- Board-owned and human-set (via the slide-over, alongside "Change court") — not derived and not AI-generated. Same rationale as the ball-in-court fields.
- Drives **subhead grouping inside the Pre-Submittal column** (§4) and a special heat rule for `ready` (§5.3).
- If we adopt a `deal_activity_state` satellite table, `blocked_on` lives there with the ball-in-court fields.
- Leaving Pre-Submittal (stage change to Submitted-Reviewing) should clear `blocked_on` to null. Flag as a small trigger/UI concern during build.
- `ready` is a **persistent** enum value, not a transient "cleared to go" flag. A deal sitting in `ready` for two weeks — ready to submit, still not submitted — is exactly the neglect the board exists to expose. Its day count keeps ticking and stays visible on the tile even though heat is pinned hot (§5.3).

### 3.2.2 Agenda flag (`on_agenda`)

A board-wide boolean for assembling the weekly Starbucks call agenda incrementally through the week — star a deal whenever it comes to mind, review the set before the call.

| Field | Type | Notes |
|---|---|---|
| `on_agenda` | boolean, not null, default `false` | Board-owned. Toggled by a star control on the tile (§6.4). Lives in `deal_activity_state` with the other board-owned fields. |

- A **"Agenda (n)"** button at the top of the board (near the daily number, §9) filters the board to only starred deals; `n` is the live count. Toggling it back shows the full board.
- In agenda view, clicking a tile opens the **same slide-over** (§7) — no separate UI.
- v1 is deliberately minimal: **no ordering, no per-item agenda notes, no "clear agenda" bulk action.** Just a flag, a filter, and a count. Ordering/notes are a phase-2 ask if the weekly-agenda habit sticks.
- Not stage-scoped — any deal on the board can be starred, in any column.

### 3.3 The reset event — BUILT (migrations `20260825190000`, `20260826120000`)

Four actions cool a tile. Each sets `ball_in_court_since = now()` via a Postgres trigger that **upserts** the `deal_activity_state` row (so a row is created on first touch — no pre-seeding needed):

1. **An `activity` row is logged against the deal** — the primary touch signal (see below)
2. A note is logged against the deal
3. A next action (task) is created against the deal
4. An existing next action's due date is changed

Implemented as triggers, not application code — otherwise the email-triage and voice layers each have to remember to call it, and one won't. All four call one `SECURITY DEFINER` function `reset_deal_activity_clock()`:

| # | Fires on | When |
|---|---|---|
| 1 | `AFTER INSERT ON activity` | `NEW.deal_id IS NOT NULL` |
| 2 | `AFTER INSERT ON note_object_link` | `NEW.deal_id IS NOT NULL` (notes are polymorphic — the link row carries `deal_id`, not the note) |
| 3 | `AFTER INSERT ON task` | `NEW.deal_id IS NOT NULL` |
| 4 | `AFTER UPDATE OF due_at ON task` | `NEW.deal_id IS NOT NULL AND NEW.due_at IS DISTINCT FROM OLD.due_at` |

**Why `activity` is #1, not an afterthought (resolves old open item #5):** recon found Starbucks deal history lives almost entirely in the legacy `activity` table (`LogCallModal` writes it) — **0 of the (then) 44 Starbucks deals had any `note_object_link` row**, while 19 had activity. For this account, logging a call *is* the touch that must cool the tile; notes are the supplement, not the reverse.

**All activity inserts are human-originated — no guard needed.** OVIS has no Salesforce sync and hasn't for over a year; the `sf_*` columns are one-time migration residue, and nothing else auto-writes `activity`. So every activity insert is a real human touch by definition, and firing on all of them is correct. There is no system-vs-human ambiguity to guard against. **Open item #5 is fully closed.**

### 3.3.1 The "no history" marker (`seeded_fallback`)

The step-2 backfill seeded `ball_in_court_since = now()` for the 27 Starbucks deals with no activity and no notes. Those clocks are placeholders, not real touches — rendering them as *cool* would lie (cool means "recently worked, not your problem"; these have zero history). So `deal_activity_state` carries a boolean `seeded_fallback`:

- `true` = the clock is a backfill placeholder, not a real touch.
- Trigger-cleared: the first real reset event (§3.3) sets `seeded_fallback = false`, because that event *is* the first real touch.
- A deal with **no row at all** is treated the same as `seeded_fallback = true` ("no history").

The board renders these as a distinct neutral **"no history"** tile (§6.4) and excludes them from warm/hot heat (§5.3, §8) and from the daily "need attention" number (§9) until a real touch lands.

### 3.4 Next actions

The board reads open tasks; v1 does not need a new task system — the `task` table already models this:

| Board need | `task` column |
|---|---|
| Which deal | `deal_id` |
| Title | `subject` |
| Due date | `due_at` |
| Open vs done | `status` (`open`/`in_progress` = open) and `completed_at` |

A deal's "current action" is the open task (`status IN ('open','in_progress')`) with the earliest `due_at`. Displayed on the slide-over, not the tile.

### 3.5 Which deals appear on the board

`deal` where:
- `client_id` joins to a `client` with `starbucks_layer_enabled = true`, **and**
- the deal's `deal_stage.label` is not a terminal/archived stage (i.e. not "Lost", and per §12 possibly not the paid-out terminal stages either — Mike to confirm which stages count as "on the board").

There is no `is_active` boolean today. Two options for Mike (§12): (a) derive on/off-board purely from stage (simplest, zero migration), or (b) add an explicit `is_active` / `board_visible` flag for deals that should leave the board without moving to Lost. Recommendation: derive from stage for v1; add the flag only if a real case appears.

---

## 4. Stage columns

**Four columns, fixed.** Confirmed against live data (§3.5 recon — 37 active Starbucks deals). All Starbucks deals today fall in these four stages; the paid/terminal stages hold zero Starbucks deals and are omitted.

| # | `deal_stage.label` | Live deals |
|---|---|---|
| 1 | Pre-Submittal | 22 |
| 2 | Submitted-Reviewing | 3 |
| 3 | Negotiating LOI | 10 |
| 4 | At Lease/PSA | 2 |

**Lost is off-board.** So are Under Contract / Booked / Executed Payable / Closed Paid — not because they're excluded by rule, but because no Starbucks deal is in them. (If a deal ever lands in one, it simply won't render; revisit only if that happens.)

Rules:
- Exactly these four columns, left-to-right in this order.
- Empty columns still render, at reduced opacity. Seeing that a stage is empty is information.
- Column header shows stage name and a count.

### 4.1 Pre-Submittal is one column, grouped by blocker

Pre-Submittal holds well over half the board (22 of 37). It stays **one column** — do not split it into two. Instead, tiles within it group under **subheads by `blocked_on`** (§3.2.1), in this fixed order:

```
PRE-SUBMITTAL                    22
──────────────────────────────────
▸ Ready                           3   ← always hot (§5.3), sorts to top
▸ Pricing                         6
▸ Site plan                       5
▸ Under contract                  4
▸ Info                            3
▸ (unset)                         1   ← no blocker chosen yet — looks suspicious, like ball=none
```

- Subhead order is fixed: **Ready → Pricing → Site plan → Under contract → Info → (unset)**. `ready` first because a ready-to-submit deal that hasn't been submitted is the most urgent thing on the board.
- Each subhead shows a count. A subhead with zero deals renders dim (or collapses — tune on the TV).
- Within a subhead, tiles order by the normal heat rule (§5.3).
- The other three columns have no subheads — they're plain tile stacks.

---

## 5. Heat logic

### 5.1 Thresholds

One clock — `now() - ball_in_court_since` — read through two different tolerances.

| Ball in court | Cool | Warm | Hot |
|---|---|---|---|
| **Us** | 0–2 days | 3–6 days | 7+ days |
| **Them** | 0–9 days | 10–20 days | 21+ days |
| **None** | — | 0–2 days | 3+ days |

Store thresholds in a config table or constants file, not inline. Mike will want to tune these after living with the board for a week. (A `loi_config`-style key/value table already exists as precedent for tunable config; a small `deal_board_config` table or a constants module is fine.)

### 5.2 The chip text differs, the color does not

Same palette in both directions. The instruction is what changes:

- Ball in our court, hot → **"You owe a move"**
- Ball in their court, hot → **"Chase them"**
- Ball nowhere, warm+ → **"No one owns this"**

This is the single most important detail in the spec. Red on its own tells Mike something is wrong; the chip tells him whether to work or to pick up the phone. Getting this wrong turns the board into anxiety rather than direction.

### 5.3 Ordering within a column

Hottest first, then by days descending. A red tile is always above an amber tile which is always above a cool tile. No manual ordering.

**`blocked_on = 'ready'` always renders hot,** regardless of its clock. A Starbucks deal that's ready to submit but hasn't been is a self-inflicted stall — the point is to make it impossible to ignore. Its chip reads **"Submit it"** (a third instruction alongside §5.2's two). In the Pre-Submittal column the Ready subhead sorts to the top and its tiles are hot; everything below it follows the normal clock-based heat.

Within a Pre-Submittal subhead, the same hottest-first rule applies. Across subheads, subhead order (§4.1) wins first, then heat within each.

**"No history" tiles (`seeded_fallback`, §3.3.1) are exempt from heat entirely.** Their clock is a placeholder, so they are never cool/warm/hot — they render in the neutral "no history" state (§6.4) and sort to the *bottom* of their column (below cool), since we can't rank an unknown. The instant a real touch clears the flag, they re-enter normal heat.

---

## 6. Visual design

### 6.1 Direction

This is a wall display in a working office, running eight hours a day. It should read as an **instrument panel**, not a web app — quiet when things are fine, unmissable when they aren't. Nothing decorative. Nothing that pulses, spins, or animates for its own sake.

The discipline: cool tiles should be almost boring. All the visual energy is spent on the hot ones. If the board is calm at a glance, it *is* calm.

> Note: OVIS's house palette (CLAUDE.md) is a light theme for the CRM. **The board is deliberately a separate dark instrument surface** and does not use the OVIS brand palette. This is intentional and scoped to the board only — do not "correct" it to brand colors.

### 6.2 Palette

Dark ground, because it sits on a lit screen in peripheral vision for hours and a white field is fatiguing.

| Token | Hex | Use |
|---|---|---|
| `--ground` | `#12161C` | Board background |
| `--column` | `#1A2029` | Column wells |
| `--tile-cool` | `#232B36` | Cool tile fill |
| `--text` | `#E8EDF3` | Site names |
| `--text-dim` | `#7C8899` | City, stage, counts |
| `--warm` | `#D9891F` | Warm state |
| `--hot` | `#D6453C` | Hot state |

Warm and hot apply as a **left edge bar (6px) plus a tinted fill** at low opacity — roughly 12% for warm, 18% for hot. Do not flood the whole tile in saturated red; forty tiles at full saturation is unreadable and the eye stops distinguishing them.

Deliberately **no green.** A cool tile isn't "good," it's just "not currently your problem." Green would imply completion and would compete for attention with the reds.

### 6.3 Typography

Site names carry the board — Mike reads them from ten feet away, so they need weight and width, not elegance. A condensed grotesque lets long site names fit a narrow tile without truncating.

- **Site name:** condensed grotesque, 600 weight, ~20px, tight tracking. Suggested: Roboto Condensed, Archivo Narrow, or Oswald.
- **Everything else:** the same family at 400, ~12px, `--text-dim`.
- **Day count:** tabular figures, so numbers don't jitter as they tick over.

One family, three weights. Resist adding a second.

### 6.4 Tile anatomy

Four elements plus one control. Nothing else.

```
┌──────────────────────────────┐
│▌ RIVERDALE — GA 85         ☆ │  ← site name, 600 · agenda star (top-right)
│▌ Clayton County              │  ← city, dim
│▌                             │
│▌ [ Landlord · 24d ]  Chase → │  ← court chip + day count + instruction
└──────────────────────────────┘
 ↑ heat bar
```

Target ~200×90px. At 40 deals across 7 columns that's ~6 per column, which fits a 1080p or 4K screen comfortably with room to breathe.

The **agenda star** (top-right) toggles `on_agenda` (§3.2.2). Filled when starred, hollow otherwise; dim until hovered/focused so it doesn't compete with the heat state. It is the one interactive affordance on the tile itself — everything else is click-to-open-slide-over. A day count still shows on `ready` tiles even though they're pinned hot (§3.2.1), so dwell time stays legible.

Site name source: prefer the deal's linked `property`/`site_submit` site name; fall back to `deal.deal_name`. City comes from the linked property. (Confirm exact field during build.)

**"No history" tile state (§3.3.1).** A `seeded_fallback` tile (or a deal with no `deal_activity_state` row) is neither cool nor hot — its clock is unknown. Render it distinctly: a **dashed** 6px left edge in `--text-dim` (not a solid heat bar), and in place of the court chip + day count, a single dim **"no history"** label. No day count (there's no real clock to show). It should read as "unrated," quietly — not alarming, but clearly not a worked-and-cool tile. Sorts to the bottom of its column (§5.3).

Do not add: last note preview, deal value, next action text, contact avatars, stage name (the column says it). Every one of these will be suggested and every one of them costs legibility.

### 6.5 Motion

One thing only: when a tile changes heat state, it cross-fades over ~400ms. No slide, no bounce. Respect `prefers-reduced-motion`.

Tiles do **not** animate on load. A board that reshuffles itself every time the screen wakes is a board Mike stops trusting.

---

## 7. Slide-over panel

Click a tile → panel slides from the right, ~420px, board stays visible and dimmed behind it.

Contents, in order:

1. Site name, city, stage, ball-in-court state with day count
2. **Rolling summary** — placeholder in v1, wired in phase 2. Reserve the space. (Phase 2 can source this from `deal_synopsis.status_summary`, which already exists.)
3. Last three notes, newest first, with timestamps (via `note_object_link` → `note`, ordered by `created_at`)
4. Current open action, if any (earliest-`due_at` open `task`)
5. Three buttons: **Log a note** · **Set next action** · **Change court**
6. Small text link at the bottom: **Open full deal**

The three buttons are the whole point. Cooling a tile must take under ten seconds without leaving the board. If Mike has to navigate to the full deal record to log a note, he won't, and the board becomes decoration.

- **Log a note** → inserts a `note` + a `note_object_link` (`object_type='deal'`, `deal_id`). Trigger cools the tile.
- **Set next action** → inserts/updates a `task` (`deal_id`, `subject`, `due_at`). Trigger cools the tile.
- **Change court** → sets `ball_in_court` and `ball_in_court_party` and resets the clock (`ball_in_court_since = now()`). **For Pre-Submittal deals, this control also sets `blocked_on`** (§3.2.1) — the two live together since both answer "why isn't this moving." Setting `blocked_on = 'ready'` should be a single obvious action, because it flips the tile hot on purpose.

Reuse the existing `NoteFormModal` / task creation paths where practical rather than reimplementing writes.

---

## 8. Refresh behavior

Live-updating via Supabase realtime subscription on the `deal`, `note_object_link`, and `task` tables. The board sits open on the TV for days; it must not require a manual reload.

Heat is computed **client-side** from `ball_in_court_since` so tiles roll from cool to warm to hot at midnight without a server round trip.

Add a small "last synced" timestamp in a corner at `--text-dim`, 11px. When the board is wrong, the first question is always whether it's stale.

---

## 9. The daily number

Single figure, top right of the board, larger than anything else on screen:

```
9 need attention
```

Count of tiles that are warm or hot. This is the game — the target is zero, and clearing the board is the win condition. No streaks, no points, no badges.

Below it in dim text: `4 yours · 5 theirs`. The split matters, because five deals waiting on landlords is a very different day from five deals waiting on Mike.

**"No history" deals are not counted here** — their clock is a placeholder, so they can't be "warm/hot" (§3.3.1). Show them as a separate dim tail on the same line, e.g. `4 yours · 5 theirs · 27 no history`. That number should shrink toward zero on its own as deals get their first real touch, which is its own kind of win.

### 9.1 Agenda control

Next to the daily number, an **"Agenda (n)"** button (§3.2.2). `n` is the live count of starred (`on_agenda = true`) deals. Clicking it filters the board to only those deals — same columns, same tiles, same slide-over on click — and toggles back to the full board. It's a filter over the existing board, not a separate screen. This is how the weekly call agenda gets built up through the week.

---

## 10. Build order

1. ~~**Schema**~~ **DONE (migration `20260825190000`):** 1:1 `deal_activity_state` satellite with the five board-owned fields; reset triggers on `note_object_link` + `task` (insert & `due_at` change); clear-`blocked_on`-on-leaving-Pre-Submittal trigger; RLS mirroring `deal`/`task`. Verified in a self-rolling-back functional test.
2. ~~**Backfill**~~ **DONE (migrations `20260826120000`, `20260826130000`):** added the `activity`-insert reset trigger (activity is the primary touch signal, not notes — see §3.3) and seeded `ball_in_court_since` for all Starbucks deals from the most-recent of `activity.activity_date` / `note_object_link.created_at`, falling back to `now()`. Result: **20 real seeds, 27 `now()` fallbacks** — the fallbacks are flagged `seeded_fallback` and render as "no history" (§3.3.1). `ball_in_court` and `blocked_on` left unset (Mike classifies manually). Starbucks filter now uses `client.starbucks_layer_enabled = true` (flag set on both clients).
3. ~~**Static board rendering**~~ **DONE:** full-screen route `/starbucks-board` (renders `fixed inset-0`, covers the app nav). Files: `src/lib/starbucksBoard.ts` (palette, heat/ordering/chip logic, all pure), `src/hooks/useStarbucksBoard.ts` (fetch + assemble columns/subheads/daily number), `src/pages/StarbucksDealBoardPage.tsx` (board UI). Heat computed client-side from `ball_in_court_since`; four columns, Pre-Submittal blocker subheads, "no history" tiles, agenda filter, daily number, click-to-refresh "synced" stamp. Not yet interactive (slide-over = step 5) and no realtime (step 6). Typechecks clean; `npm run build` passes. **Visual density is tuned on the actual TV — that's the point of this step.**
4. **Real heat calculation** (client-side from `ball_in_court_since`).
5. **Slide-over panel** with the three action buttons.
6. **Realtime subscription.**
7. **The daily number.**

Steps 1–5 are the shippable core. Live on the TV before touching realtime.

---

## 11. Route / surface

New page (a *destination*, per OVIS's overlay-UX two-tier model in `docs/OVIS_OVERLAY_UX.md`): e.g. `/starbucks-board`. The tile → slide-over interaction is an *overlay*, consistent with that doc — the slide-over panel components should take `objectType`/`objectId`-style props so they can later be reused from the map or master pipeline, not read `useParams`.

---

## 12. Open items for Mike

1. ~~**Board columns.**~~ **Resolved:** four fixed columns — Pre-Submittal, Submitted-Reviewing, Negotiating LOI, At Lease/PSA; Lost and all paid/terminal stages off-board (§4).
2. ~~**Starbucks filter.**~~ **Resolved:** `starbucks_layer_enabled` set `true` on both Starbucks clients; board filters on the flag. (Note: this flag also gates the Starbucks map layer / portal per recon — mentioned in case that surfaces elsewhere.)
3. **`blocked_on` domain.** Confirm the five values (`pricing` / `site_plan` / `under_contract` / `info` / `ready`) and the fixed subhead order (§4.1). Any Pre-Submittal blocker missing?
4. **Ball-in-court source of truth.** Recommended: the board keeps its own trigger-owned fields, separate from the (currently non-functional — see recon) AI `deal_synopsis` and from `deal.current_handoff_holder` (§3.2). Confirm — or drive one of those existing signals instead?
5. **Does a deal ever legitimately sit at `ball_in_court = none`,** or should the board force a choice at "Change court"?
6. **Archived / dead deals.** Derive on/off-board purely from stage (no migration), or add an explicit `is_active` flag (§3.5)? Reachable from the board at all, or only from the master pipeline?
7. ~~**Does "log a call" also cool a tile?**~~ **Fully closed: yes.** `activity` is the primary touch signal for Starbucks deals (0/44 had notes; 19 had activity), so the reset trigger fires on `activity` insert (§3.3). No `sf_id` guard is needed — OVIS has no Salesforce sync (the `sf_*` columns are historical migration residue), so every activity insert is a human touch by definition.
8. **Deal fields vs satellite table:** ~~open~~ **Decided:** a 1:1 `deal_activity_state` satellite table (named to generalize to the full pipeline in phase 3, not just this board view) holding all five board-owned fields (`ball_in_court`, `ball_in_court_party`, `ball_in_court_since`, `blocked_on`, `on_agenda`). Keeps `deal` from accreting view-specific state.

---

*Grounded against schema + live-data reconnaissance on 2026-08-25: 37 active Starbucks deals across four stages; `starbucks_layer_enabled` currently `false` on both Starbucks clients; `deal_synopsis` empty and its writer non-functional against the current schema (selects `deal.name`/text `stage` — neither exists). Tables referenced: `deal`, `deal_stage`, `client`, `deal_synopsis`, `note`/`note_object_link`, `task`. See `database-schema.ts` and `src/hooks/useKanbanData.ts`.*
