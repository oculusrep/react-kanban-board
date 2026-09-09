# OVIS — Starbucks Deal Board

**Build spec v1**

- **Owner:** Mike / Oculus Real Estate Partners
- **Target:** Wall-mounted display (office TV, landscape, driven from a Mac); secondarily a desktop browser
- **Scope:** Starbucks account only. Not the master pipeline.
- **Branch:** ~~`feature/starbucks-deal-board`~~ **merged to `main` (2026-09-07) and live in production.**
- **Status:** **v1 SHIPPED.** Live at https://ovis.oculusrep.com/starbucks-board. Every §10 build step is done; the §12 open items are all closed. This file is now a record of what exists, not a plan — amend it when the board changes, and keep `STARBUCKS_DEAL_BOARD_DECISIONS.md` as the reasoning of record.
- **In flight, not in the doc:** classification is still being done on the TV. As of 2026-09-01, 13 of 46 deals had a court set — the board's heat is only as real as that pass. Nothing else is pending.

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
| `ball_in_court` | enum, **nullable** | `null` \| `us` \| `them` \| `none`. **`null` = unclassified** (nobody has set who owes) — see the critical note below. |
| `ball_in_court_party` | text, nullable | Who specifically — "Landlord", "Starbucks RE", "GDOT", "Seller". Free text in v1; may FK to `contact` later. Displayed on the tile. |
| `ball_in_court_since` | timestamptz | **The clock.** Set whenever `ball_in_court` changes or a reset event (§3.3) fires. |

Rationale for a dedicated set of fields rather than reusing `current_handoff_holder` / `deal_synopsis`:
- `current_handoff_holder` is `us`/`ll` and scoped to document handoff (LOI/Lease). The board's `them` is broader than "landlord" (GDOT, Seller, Starbucks RE), and the board has a legitimate `none`. Overloading it would corrupt the handoff feature.
- `deal_synopsis` is a read model, regenerated wholesale by an AI job; giving it a human-writable authoritative clock would fight that job.
- Keeping the board's three fields distinct and trigger-owned means the reset semantics (§3.3) are unambiguous and testable.

Open item §12 asks Mike whether he'd rather the board *drive* `current_handoff_holder`/`deal_synopsis` (single source of truth, more integration work) or stay a clean separate layer (recommended for v1).

`ball_in_court = 'none'` means the deal is genuinely parked with nobody owing anything. It should be rare and it should look suspicious — treat it as "us" for heat purposes. A deal where nobody owes anything is a deal nobody is working.

**CRITICAL — `null` (unclassified) is NOT `'none'`, and must never be silently heated (migration `20260828120000`).** `null` means Mike hasn't told the board who owes yet; `'none'` is a deliberate human classification (parked). Defaulting an unclassified deal into *any* tolerance is a bug — it fabricates heat from data we don't have. So `computeHeat` returns a dedicated **`unclassified`** state for `null`, resolved *before* any tolerance is consulted (spec §5.1): the tile renders neutral with a **"Set the court"** chip (§6.4), is exempt from heat, and is excluded from the "need attention" number (shown as "N to classify", §9). `ball_in_court` is therefore nullable with **no default** — new rows (from a reset-clock touch) start `null` until a human classifies them. This is the same discipline as `seeded_fallback`/"no history" (§3.3.1): the board says "I don't know" rather than guessing.

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
| 1 | `AFTER INSERT ON activity` | `NEW.deal_id IS NOT NULL AND NEW.email_id IS NULL AND NEW.sf_id IS NULL` — **amended 2026-09-05**, see below |
| 2 | `AFTER INSERT ON note_object_link` | `NEW.deal_id IS NOT NULL` (notes are polymorphic — the link row carries `deal_id`, not the note) |
| 3 | `AFTER INSERT ON task` | `NEW.deal_id IS NOT NULL` |
| 4 | `AFTER UPDATE OF due_at ON task` | `NEW.deal_id IS NOT NULL AND NEW.due_at IS DISTINCT FROM OLD.due_at` |

**Why `activity` is #1, not an afterthought (resolves old open item #5):** recon found Starbucks deal history lives almost entirely in the legacy `activity` table (`LogCallModal` writes it) — **0 of the (then) 44 Starbucks deals had any `note_object_link` row**, while 19 had activity. For this account, logging a call *is* the touch that must cool the tile; notes are the supplement, not the reverse.

**~~All activity inserts are human-originated — no guard needed.~~ WRONG — corrected 2026-09-05
(migration `20260905172258`).**

The original claim was that nothing auto-writes `activity`, so every insert is a real human touch.
That was true when written and false within days: **`email-triage` inserts one `activity` row per
deal tag**, and those rows fired this trigger. 186 such inserts in the 7 days before the fix.

The damage was exactly what this board exists to prevent — **18 of 63 tiles were showing a fresh
clock whose last cause was an INBOUND email nobody had replied to.** Worst case read *2 days* when
the true figure was **194**. Four Starbucks tiles were cooled by a single Google Chat notification
(`chat-noreply@google.com`); two more by a real-estate news blast. A stale board is bad; a lying
board is worse (1.3), and it was lying one tile in three.

**The board now goes email-blind:**
```sql
WHEN (NEW.deal_id IS NOT NULL AND NEW.email_id IS NULL AND NEW.sf_id IS NULL)
```

*Why email-blind rather than direction-aware:* ball-in-court needs judgment the board does not yet
have. 10 of the 28 bad clocks came from **outbound** mail (including intra-firm mike↔arty), and 6
from non-correspondence entirely. Direction is not the signal. Email cools nothing until the
commitment model can classify it — see `docs/email-triage-spec.md` §4.

*The `sf_id` guard closes the item deferred in `20260826120000`'s own header.* The 5,532
Salesforce-imported "Email" rows carry `email_id IS NULL`, so the email predicate alone would not
stop them if that sync ever resumes. Verified before writing: 2,827 rows have `email_id` (all
`activity_type='Email'`, all `sf_id` null); 11,277 have `sf_id` (last insert 2025-10-02); **64 are
hand-logged Task/Call rows with neither, and those still reset the clock** — which is the whole
point. Zero rows carry both.

*Existing rows were left frozen.* 28 of 63 tiles held a value set by email; only 5 had any
non-email cause to recompute from, so recomputing would have produced a board where some tiles are
honest and some are not with no way to tell which. Frozen decays in the right direction — once the
trigger stops firing the fake timestamps age toward looking neglected, which is where the truth is.
Full option analysis in `docs/email-triage-spec.md` §14.

**Open item #5 is closed, but not for the reason originally given.** It is closed by a guard, not
by the absence of a need for one.

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

## 4. Columns — five, plus a band and a counter

Decisions §2.12, §2.20. The board is **five columns**, left→right:

| # | Column | Source | Group |
|---|---|---|---|
| 1 | Awaiting landlord | `blocked_on = 'awaiting_ll'` | Pre-Submittal |
| 2 | Awaiting site control | `blocked_on = 'site_control'` | Pre-Submittal |
| 3 | Submitted-Reviewing | `deal_stage.label` | — |
| 4 | Negotiating LOI | `deal_stage.label` | — |
| 5 | At Lease/PSA | `deal_stage.label` | — |

The first two carry a small **"Pre-Submittal"** super-label. Routing (`columnKeyForDeal` in `starbucksBoard.ts`): Pre-Submittal deals route by `blocked_on`; everything else by stage. **Lost + all paid/terminal stages are off-board.** Two Pre-Submittal states are deliberately **not** columns:

- **Ready-to-submit band** — a full-width strip *above* the columns for Pre-Submittal deals that are **classified but have no blocker** (nothing's stopping them). Hot, "Submit it", sorted top. **Hidden entirely when empty** (usually is). See §4.2.
- **"To classify" band + counter + triage** — Pre-Submittal deals with **no blocker and no court** belong to no column. They surface in three places: the header counter (§9), its triage queue, and a **dim full-width band** below the ready band whose tiles carry the **"Set the court →"** instruction. The band is **hidden entirely when empty**. Two surfaces, not one, because the counter is a *number* — it tells you how many are unclassified but not *which sites*, and a tile you can see and click is how the board asks for a decision everywhere else (§1.5). Dim, not hot: the header's red number does the shouting, and the ready band stays the loudest thing under the header.

Rules:
- Empty columns still render, at reduced opacity. An empty column is information.
- Column header shows the name and a count.

### 4.1 Awaiting landlord detail + density

- **Awaiting landlord** collapses pricing + site plan. Two booleans `needs_pricing` / `needs_site_plan` detail it; the tile shows a **Pricing / Site plan / Both** tag, and the classify controls require at least one (DB invariant `deal_activity_state_awaiting_ll_needs`).
- **Density.** Bands wrap horizontally, so neither steals column width. A column over `DENSE_THRESHOLD` tiles uses a **compact tile** (one line: heat bar · site name · optional detail tag · a small right token · star; city dropped). The `A−/A+` text-scale control (persisted) tunes for viewing distance. (With Unset gone, no column is chronically overloaded — new unclassified deals go to the counter, not a column.)

### 4.2 Ready-to-submit band (decisions §2.12)

`readyToSubmit` = `stage = Pre-Submittal AND blocked_on IS NULL AND ball_in_court IS NOT NULL` (a classified deal with nothing blocking it). Rendered `hot`, chip **"Submit it"**, in a full-width band above the columns — the loudest thing under the header. **The band is not rendered at all when there are no ready deals** (don't leave a labeled empty strip).

---

## 5. Heat logic

### 5.1 Thresholds

One clock — `now() - ball_in_court_since` — read through two different tolerances.

| Ball in court | Cool | Warm | Hot |
|---|---|---|---|
| **Us** | 0–2 days | 3–6 days | 7+ days |
| **Them** | 0–9 days | 10–20 days | 21+ days |
| **None** | — | 0–2 days | 3+ days |

Store thresholds in a config table or constants file, not inline. Mike will want to tune these after living with the board for a week. (A `loi_config`-style key/value table already exists as precedent for tunable config; a small `deal_board_config` table or a constants module is fine.) Currently in `src/lib/starbucksBoard.ts` (`HEAT_THRESHOLDS`).

**A tolerance is only ever applied to a *classified* deal.** `computeHeat` resolves the exempt states first — `seeded_fallback` → `no_history`, `blocked_on='ready'` → hot, `ball_in_court IS NULL` → `unclassified` — and only reaches the table above for `us`/`them`/`none`. An unclassified deal is never assigned a tolerance (§3.2).

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

**Two "unrated" tile states — both quiet, but distinct:**

- **Unclassified (`ball_in_court IS NULL`, §3.2).** The deal has a real clock but no assigned court. Render a **solid** 6px `--text-dim` left bar and, in place of the court chip, a `{days}d` figure plus a **"Set the court →"** prompt in `--text` (a legible nudge, not an alarm — no warm/hot color). It is a call to action, not a warning.
- **"No history" (`seeded_fallback`, §3.3.1).** No touch data at all (placeholder clock). Render a **dashed** 6px `--text-dim` left edge and a single dim **"no history"** label — no day count. It reads as "we don't know yet."

Both are neither cool nor hot, sort to the bottom of their column (§5.3), and are excluded from the daily number (§9). Neither is ever heated by a tolerance.

Do not add: last note preview, deal value, next action text, contact avatars, stage name (the column says it). Every one of these will be suggested and every one of them costs legibility.

### 6.5 Motion

One thing only: when a tile changes heat state, it cross-fades over ~400ms. No slide, no bounce. Respect `prefers-reduced-motion`.

Tiles do **not** animate on load. A board that reshuffles itself every time the screen wakes is a board Mike stops trusting.

---

## 7. Slide-over panel — BUILT (step 5)

Implemented in `src/components/starbucksBoard/DealSlideOver.tsx` (420px, dark, dimmed board behind). Click a tile → opens; the star on a tile toggles `on_agenda` without opening it.

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
- **Change court** → sets `ball_in_court` and `ball_in_court_party`, resets the clock (`ball_in_court_since = now()` by default — see **Clock started** below), and clears `seeded_fallback` (a human classification means the tile is no longer "no history"). **For Pre-Submittal deals, this control also sets `blocked_on`** (§3.2.1) — the two live together since both answer "why isn't this moving." Setting `blocked_on = 'ready'` flips the tile hot on purpose.
- **Clock started (editable).** The classify controls carry a date picker that defaults to **today**; saving with it untouched stamps `now()`, exactly as before. Change it and the save writes **that date's local midnight** instead — which is what `daysSince()` measures against (local calendar days, Eastern; CLAUDE.md). Future dates are blocked (`maxDate = today`): the clock measures elapsed silence, and a future start would read as 0d forever. **Why it's editable:** classification and the last real touch are different events. Classifying a deal you last spoke about three weeks ago would otherwise reset it to 0d and hide it from the board's whole purpose — the clock would record when you filed the paperwork, not when the site went quiet. The field also shows the deal's *current* clock (`now 8/24 (16d)`) so a backdate is made against a visible baseline rather than from memory.
- **Blocker → implied court (step-5 addition).** When Mike picks a Pre-Submittal `blocked_on`, the court pre-selects: `pricing`/`site_plan`/`under_contract` → **them**, `ready`/`info` → **us**. He can override before saving. Saves a click across the ~23 Pre-Submittal deals. (`IMPLIED_COURT` in `src/lib/starbucksBoard.ts`.)
- **Log a note** → inserts a `note` + a `note_object_link` (`object_type='deal'`, `deal_id`). Trigger cools the tile.
- **Set next action** → inserts a `task` (`deal_id`, `subject`, `due_at`, `owner_id`/`created_by_id` = `useAuth().userTableId`, `category_id` via `getCategoryIdByName('other')`). Trigger cools the tile.

Writes are done directly here rather than reusing `NoteFormModal` (which is a heavier, light-themed modal) — the slide-over's inline fields keep "cool a tile" under ten seconds.

**Stage change (build step 7, not yet built).** The slide-over will also carry a **stage dropdown** (four board stages + Lost → `deal.stage_id`, not drag-and-drop) so a miscategorized deal can be re-filed without leaving the board. This is the first board write to shared pipeline data and needs a confirm when it moves a deal off the board — see [STARBUCKS_DEAL_BOARD_DECISIONS.md](STARBUCKS_DEAL_BOARD_DECISIONS.md) §D1.

---

## 8. Refresh behavior — BUILT (step 6, migration `20260831120000`)

Live-updating via a Supabase realtime channel. Rather than subscribing to each source table, the board subscribes to the two tables every change funnels through: **`deal_activity_state`** (every cool/classify/blocker/agenda write lands here — directly or via the reset-clock triggers on `note_object_link`/`task`/`activity`) and **`deal`** (stage moves + new deals). Both publish OVIS-wide, so the handler **debounces 600ms** and re-runs the server-filtered board query (~50 Starbucks rows) — cheap, and it decides what actually changed. The "synced" stamp updates on every realtime refetch. The board sits open on the TV for days; it must not require a manual reload.

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

On-board deals with no court ("no court") and no-history deals are not counted here — neither can be warm/hot (§3.2, §3.3.1). They show as a dim tail: `4 yours · 5 theirs · 3 no court · 27 no history`.

### 9.0 The "to classify" counter (loudest element — decisions §2.20)

Left of the daily number, a **"N to classify"** counter for Pre-Submittal deals with no blocker and no court. **When non-zero it renders hot and is the largest thing in the header — louder than the daily number** — because an unclassified deal corrupts every other figure (it can't be placed or heated). **At zero it disappears.** Click → the triage queue: one deal at a time, full-height, showing site/city/stage/history; classify (court + blocker) → auto-advance; Escape exits; saved per deal. **Never auto-opens** — a newly-arrived unclassified deal must not interrupt. Built for ~2–3 new deals/week, not bulk.

**Triage carries the slide-over's full action set, not just classify.** Deciding a deal's court usually surfaces the thing you could do about it right now, and a fix that needs you to leave the surface doesn't happen (§1.5). So the queue also mounts `TouchControls` (Log a note / Set next action) and `KillPassAction` (Pass / Mark lost). The two behave differently on save, because they mean different things: **a touch cools the tile but does not classify it**, so the queue stays on the current deal and refreshes its history; **a pass/lost removes the deal from the board**, so it advances.

### 9.1 Agenda control

Next to the daily number, an **"Agenda (n)"** button (§3.2.2). `n` is the live count of starred (`on_agenda = true`) deals. Clicking it filters the board to only those deals — same columns, same tiles, same slide-over on click — and toggles back to the full board. It's a filter over the existing board, not a separate screen. This is how the weekly call agenda gets built up through the week.

---

## 10. Build order

1. ~~**Schema**~~ **DONE (migration `20260825190000`):** 1:1 `deal_activity_state` satellite with the five board-owned fields; reset triggers on `note_object_link` + `task` (insert & `due_at` change); clear-`blocked_on`-on-leaving-Pre-Submittal trigger; RLS mirroring `deal`/`task`. Verified in a self-rolling-back functional test.
2. ~~**Backfill**~~ **DONE (migrations `20260826120000`, `20260826130000`):** added the `activity`-insert reset trigger (activity is the primary touch signal, not notes — see §3.3) and seeded `ball_in_court_since` for all Starbucks deals from the most-recent of `activity.activity_date` / `note_object_link.created_at`, falling back to `now()`. Result: **20 real seeds, 27 `now()` fallbacks** — the fallbacks are flagged `seeded_fallback` and render as "no history" (§3.3.1). `ball_in_court` and `blocked_on` left unset (Mike classifies manually). Starbucks filter now uses `client.starbucks_layer_enabled = true` (flag set on both clients).
3. ~~**Static board rendering**~~ **DONE:** full-screen route `/starbucks-board` (renders `fixed inset-0`, covers the app nav). Files: `src/lib/starbucksBoard.ts` (palette, heat/ordering/chip logic, all pure), `src/hooks/useStarbucksBoard.ts` (fetch + assemble columns/subheads/daily number), `src/pages/StarbucksDealBoardPage.tsx` (board UI). Heat computed client-side from `ball_in_court_since`; four columns, Pre-Submittal blocker subheads, "no history" tiles, agenda filter, daily number, click-to-refresh "synced" stamp. Not yet interactive (slide-over = step 5) and no realtime (step 6). Typechecks clean; `npm run build` passes. **Visual density is tuned on the actual TV — that's the point of this step.**
4. ~~**Real heat calculation**~~ **DONE** — delivered inside step 3; heat is computed client-side in `starbucksBoard.ts` from `ball_in_court_since`, never stored.
5. ~~**Slide-over panel**~~ **DONE:** `DealSlideOver.tsx` — Change court (+ blocker with implied-court pre-select), Log a note, Set next action, recent notes, current open action, Open full deal. Tile click opens it; star toggles `on_agenda`. Dense-tile density fix for Pre-Submittal (§4.1). Typechecks clean; build passes.
6. ~~**Realtime subscription**~~ **DONE (migration `20260831120000`):** channel on `deal_activity_state` + `deal`, debounced refetch (§8).
7. ~~**Kill / Pass action**~~ **DONE (migration `20260831150000`):** the first board write to shared pipeline data — implemented as the **remove-from-board** action, not a general stage dropdown. `KillPassAction.tsx` in the slide-over, labeled by stage: **"Pass on this site"** (early → writes `site_submit.pass_reason` + `pass_reason_category` + a deal note, sets site → `Pass`; tile drops via §2.22, deal stays put) or **"Mark lost"** (later / no site_submit → `deal.loss_reason` + stage `Lost` + a deal note). Required reason in-step; decisions §2.22–§2.23. Also excludes dead-site deals from membership (board 39 → 30). Verified with rolling-back DB tests; typecheck + build pass.
   - **Between-stage move also DONE:** a **Stage dropdown** (four board stages) in the shared `ClassifyControls` (slide-over + triage) writes `deal.stage_id` — decisions §2.26. It propagates to `site_submit` via the sync trigger and clears `blocked_on` when leaving Pre-Submittal; no confirm (stays on board). Lost stays in the kill action.

8. ~~**Board-owned waiting + priority states**~~ **DONE (migrations `20260831160000`, `20260831170000`):** `parked_until` → the quiet "Parking lot (n)" (decisions §2.24) and `urgent_until` → the ▲ marker with a 7-day auto-expiry TTL, a channel separate from heat (§2.25). `ParkControl.tsx`, `ParkingLot.tsx`, `UrgentToggle.tsx`.
9. ~~**Accounts**~~ **DONE:** `client_id`-keyed All / Starbucks / Coastal GA filter, dim tile token, per-account agenda chips — decisions §2.21. The mechanism is the phase-3 one; nothing is hardcoded to these two clients.
10. ~~**Triage gets the full action set**~~ **DONE:** `TouchControls.tsx` extracted out of `DealSlideOver` (Log a note / Set next action) so the slide-over and the triage queue share one implementation, and `KillPassAction` mounted in triage too — §9.0.
11. ~~**Email-blind clock guard**~~ **DONE (migration `20260905172258`):** the correction described in §3.3 — email-triage activity no longer cools a tile.
12. ~~**A way in**~~ **DONE:** hamburger-menu entry (§11).

(The daily number, §9, was delivered in step 3's header — no separate step.)

**All steps are done and merged to `main`.** What remains is not build work: living with the board on the TV and finishing the manual classification pass that gives its heat meaning.

---

## 11. Route / surface

New page (a *destination*, per OVIS's overlay-UX two-tier model in `docs/OVIS_OVERLAY_UX.md`): `/starbucks-board`, registered in `App.tsx` behind `CoachRoute` like the rest of the app. The tile → slide-over interaction is an *overlay*, consistent with that doc — the slide-over panel components should take `objectType`/`objectId`-style props so they can later be reused from the map or master pipeline, not read `useParams`.

**Getting to it.** The page renders `fixed inset-0`, covering the app nav — so nothing on screen points back at it and for a while the only way in was typing the URL. There is now a **📺 Starbucks Deal Board** entry in the hamburger menu's Navigation section (`Navbar.tsx`), which closes the menu on navigate; the other entries in that section don't, and left open the menu's `z-[10000]` backdrop sits on top of the fullscreen board.

**Getting back out.** The header's first control is a dim, text-only **← Pipeline** button (left of the STARBUCKS title) that navigates to `/master-pipeline`. Before it, the only exit from a board that covers the whole viewport was the browser's back button. It's deliberately quiet rather than a real button — it's chrome, and nothing on a wall display competes with the deals (decisions §1.6). Escape is *not* bound to exit at board level: it already closes the triage queue and the parking lot, and on a TV a stray keypress should never drop the board.

**`Navbar.tsx` has two hamburgers, and they swap at `xl` (1280px).** The one labeled "Mobile: Hamburger Menu Button" is `xl:hidden`; at desktop width it is gone and a *different* hamburger — the one labeled "Reports Menu", a dropdown at the left of the desktop nav — is the one you actually see. The board is in **both**, first item in the desktop dropdown. If you add anything else to "the hamburger menu" here, put it in both or it will be invisible at the width the person asking is sitting at.

---

## 12. Open items for Mike

1. ~~**Board columns.**~~ **Resolved:** four fixed columns — Pre-Submittal, Submitted-Reviewing, Negotiating LOI, At Lease/PSA; Lost and all paid/terminal stages off-board (§4).
2. ~~**Starbucks filter.**~~ **Resolved:** `starbucks_layer_enabled` set `true` on both Starbucks clients; board filters on the flag. (Note: this flag also gates the Starbucks map layer / portal per recon — mentioned in case that surfaces elsewhere.)
3. ~~**`blocked_on` domain.**~~ **Resolved (decisions §2.12, migrations `20260831130000` / `20260831140000`):** two values, not five — `awaiting_ll` (collapses `pricing` + `site_plan`, detailed by the `needs_pricing` / `needs_site_plan` booleans) and `site_control` (renamed `under_contract`). `info` became unclassified; `ready` became the derived band. A further blocker gets named when one actually emerges in classification, not speculatively.
4. **Ball-in-court source of truth.** Recommended: the board keeps its own trigger-owned fields, separate from the (currently non-functional — see recon) AI `deal_synopsis` and from `deal.current_handoff_holder` (§3.2). Confirm — or drive one of those existing signals instead?
5. ~~**Does a deal ever legitimately sit at `ball_in_court = none`?**~~ **Resolved (decisions §2.10, §2.18):** no — `none` is never set from the UI. The picker offers Us / Them plus a clear (→ unclassified, `NULL`), which is a first-class absence state rather than a tolerance. `none` remains a legal stored value only so old rows don't break.
6. ~~**Archived / dead deals.**~~ **Resolved (decisions §2.22, §2.23):** derived, no `is_active` flag. A deal drops off the board when its `site_submit.submit_stage` is one of Pass / Lost-Killed / Use Declined / Use Conflict / Not Available, or when its own stage leaves the board — and the kill/pass action writes exactly that (board went 39 → 30). Off-board deals stay reachable from the master pipeline, not from here.
7. ~~**Does "log a call" also cool a tile?**~~ **Fully closed: yes.** `activity` is the primary touch signal for Starbucks deals (0/44 had notes; 19 had activity), so the reset trigger fires on `activity` insert (§3.3). No `sf_id` guard is needed — OVIS has no Salesforce sync (the `sf_*` columns are historical migration residue), so every activity insert is a human touch by definition.
8. **Deal fields vs satellite table:** ~~open~~ **Decided:** a 1:1 `deal_activity_state` satellite table (named to generalize to the full pipeline in phase 3, not just this board view) holding all five board-owned fields (`ball_in_court`, `ball_in_court_party`, `ball_in_court_since`, `blocked_on`, `on_agenda`). Keeps `deal` from accreting view-specific state.

---

*Grounded against schema + live-data reconnaissance on 2026-08-25: 37 active Starbucks deals across four stages; `starbucks_layer_enabled` currently `false` on both Starbucks clients; `deal_synopsis` empty and its writer non-functional against the current schema (selects `deal.name`/text `stage` — neither exists). Tables referenced: `deal`, `deal_stage`, `client`, `deal_synopsis`, `note`/`note_object_link`, `task`. See `database-schema.ts` and `src/hooks/useKanbanData.ts`.*
