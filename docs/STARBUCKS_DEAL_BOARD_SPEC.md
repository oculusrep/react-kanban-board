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

**Recommendation:** add the board's own explicit fields to the `deal` record (or a small `deal_board_state` satellite table keyed 1:1 on `deal_id` if we'd rather not widen `deal`):

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

### 3.3 The reset event

Three actions cool a tile. All three set `ball_in_court_since = now()`:

1. A note is logged against the deal
2. A next action (task) is created against the deal
3. An existing next action's due date is changed

Implement as Postgres triggers rather than in application code — otherwise the email-triage layer and the voice layer will each need to remember to call it, and one of them won't.

Because OVIS notes are polymorphic, the note trigger fires on **`note_object_link`** (where `object_type = 'deal'` / `deal_id IS NOT NULL`), not on `note`. The action triggers fire on **`task`**.

```sql
-- 1. Note logged against a deal: AFTER INSERT ON note_object_link
--    WHEN (NEW.deal_id IS NOT NULL)
UPDATE deal SET ball_in_court_since = now() WHERE id = NEW.deal_id;

-- 2. Next action created: AFTER INSERT ON task
--    WHEN (NEW.deal_id IS NOT NULL)
UPDATE deal SET ball_in_court_since = now() WHERE id = NEW.deal_id;

-- 3. Next action due date changed: AFTER UPDATE OF due_at ON task
--    WHEN (NEW.deal_id IS NOT NULL AND NEW.due_at IS DISTINCT FROM OLD.due_at)
UPDATE deal SET ball_in_court_since = now() WHERE id = NEW.deal_id;
```

(If we adopt a `deal_board_state` satellite table instead of columns on `deal`, the trigger upserts that row instead. Same logic.)

Note: the legacy `activity` table also carries `deal_id` and is what `LogCallModal` writes. If "log a call" should also cool a tile, add a fourth trigger on `activity`. Flagged in §12 — v1 assumes notes + tasks only, since the slide-over's "Log a note" button (§7) writes a `note`.

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

OVIS already has the Starbucks stages in `deal_stage`. Observed labels and order (from `deal_submit_stage_map` seeding):

| sort_order | label | On board? |
|---|---|---|
| 0 | Pre-Submittal | yes (Starbucks-only; hidden from master kanban) |
| — | Submitted-Reviewing | yes (Starbucks-only) |
| 1 | Negotiating LOI | yes |
| 2 | At Lease/PSA | yes |
| 3 | Under Contract / Contingent | yes |
| 4 | Booked | yes / maybe (§12) |
| 5 | Executed Payable | maybe |
| 6 | Closed Paid | no (terminal, paid) |
| — | Lost | no (terminal, dead) |

That is more than eight live columns, so **Mike must pick the six-to-eight that belong on the board (§12).** The board reads columns from `deal_stage` (filtered + ordered by `sort_order`), so the choice is data, not code.

Rules:
- Six to eight columns maximum. Beyond eight, tiles get too narrow to read at distance.
- Column order is fixed left-to-right, from `deal_stage.sort_order`. It does not change.
- Empty columns still render, at reduced opacity. Seeing that a stage is empty is information.
- Column header shows stage name and a count.

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

Four elements. Nothing else.

```
┌──────────────────────────────┐
│▌ RIVERDALE — GA 85           │  ← site name, 600
│▌ Clayton County              │  ← city, dim
│▌                             │
│▌ [ Landlord · 24d ]  Chase → │  ← court chip + day count + instruction
└──────────────────────────────┘
 ↑ heat bar
```

Target ~200×90px. At 40 deals across 7 columns that's ~6 per column, which fits a 1080p or 4K screen comfortably with room to breathe.

Site name source: prefer the deal's linked `property`/`site_submit` site name; fall back to `deal.deal_name`. City comes from the linked property. (Confirm exact field during build.)

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
- **Change court** → sets `ball_in_court` and `ball_in_court_party` and resets the clock (`ball_in_court_since = now()`).

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

---

## 10. Build order

1. **Schema:** add the three board fields (`ball_in_court`, `ball_in_court_party`, `ball_in_court_since`) to `deal` (or a `deal_board_state` satellite); write the three reset triggers on `note_object_link` and `task`. Confirm `task` covers next-actions (it does).
2. **Backfill** `ball_in_court_since` — seed from each deal's most recent note (`note_object_link → note.created_at`) or `now()` if none. Expect the board to look wrong for the first few days until real data accumulates.
3. **Static board rendering** with fake heat, to tune visual density on the actual TV.
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

1. **Board columns.** OVIS has more than eight Starbucks stages (§4). Which six-to-eight are the board columns, and where does the board cut off on the paid/terminal end (does `Booked` / `Executed Payable` stay on the board)?
2. **Ball-in-court source of truth.** Recommended: the board keeps its own three trigger-owned fields, separate from the AI `deal_synopsis` and from `deal.current_handoff_holder` (§3.2). Confirm — or do you want the board to *drive* one of those existing signals instead (more integration, single source of truth)?
3. **Does a deal ever legitimately sit at `ball_in_court = none`,** or should the board force a choice at "Change court"?
4. **Archived / dead deals.** Derive on/off-board purely from stage (no migration), or add an explicit `is_active` flag (§3.5)? And should dead deals be reachable from the board at all, or only from the master pipeline?
5. **Does "log a call" (the `activity` table via `LogCallModal`) also cool a tile,** or only notes + tasks? v1 assumes notes + tasks (§3.3). Adding `activity` is one more trigger.
6. **Deal fields vs satellite table:** three new columns on `deal`, or a 1:1 `deal_board_state` table? (Recommendation: columns on `deal` unless we want to keep `deal` narrow.)

---

*Grounded against schema reconnaissance on 2026-08-25: `deal`, `deal_stage`, `client.starbucks_layer_enabled`, `deal_synopsis`, `note`/`note_object_link`, `task`. See `database-schema.ts` and `src/hooks/useKanbanData.ts`.*
