# Task System v2 — Design Spec

**Status:** Phase 1 complete and live (2026-05-02)
**Branch:** `feat/task-system-v2` (20 commits ahead of main as of cutover)
**Author:** Claude + Mike (design interview, 2026-04-30)
**Replaces:** `docs/TASK_MANAGEMENT_SYSTEM.md` (v1, deleted at cutover)
**Companion docs:**
- [TASK_SYSTEM_V2_PHASE_1_PLAN.md](TASK_SYSTEM_V2_PHASE_1_PLAN.md) — Phase 1 PR-by-PR status
- [OVIS_OVERLAY_UX.md](OVIS_OVERLAY_UX.md) — overlay UX principle that emerged during build

---

## Phase 1 — built and live

The schema, capture flows, all-tasks list, object-page integrations, completion timeline posts, and v1 cutover all shipped. 253 v1 tasks were migrated. `/tasks` now serves the new page; the v1 page is deleted.

**What's live (in addition to what's spec'd below):**
- `OpenTasksPanel` composable mounted on every object's sidebar / detail page (per the overlay UX principle).
- `TaskDetailSlideout` overlay — click any task row anywhere → full edit slideout, no page navigation.
- `TaskLinksEditor` — add / change / clear any of the six linkable object types from inside the slideout.
- Editable `completed_at` field with backdating support before or after completion.
- Completion → object timeline posts working for both timeline systems (activity-style for deal/client/contact/assignment, chat-style for property/site_submit).

**Resolved during build (changes from the original spec text):**
- §6.1 / §17.2: unlinked migrated tasks land in **`other`** (not `personal`). User-confirmed 2026-05-02 after spot-checking real data — `personal` stays clean for actual personal reminders, `other` becomes the triage bucket.
- §7.1: link cardinality is **single FK per type** (one client + one deal + one contact, etc.). User considered junction-table multi-link 2026-05-02 and chose to defer; Brain Dump handles the multi-prospect case better.

**Phase 2+ remain unbuilt** — see §18 Implementation Phases for the order.

---

---

## 1. Overview

OVIS today uses the `activity` table to store both events (calls, emails, meetings, notes) and tasks. The current task UI (`TaskDashboardPage`) is a flat filterable list. It works but doesn't help you decide *what to do next*, doesn't protect focus time, and doesn't give the team visibility into each other's plans.

v2 replaces this with a planning-and-execution system built around **themed time blocks**, **prioritized commitments**, and **clean separation of tasks from activity**. The dashboard becomes somewhere you visit multiple times a day to plan, execute, and triage — not just a todo list.

Hunter's prospecting workflow gets unified into the same task model so prospecting calls and follow-ups appear inside the daily Prospecting block alongside everything else, without losing any of Hunter's existing AI automation.

---

## 2. Goals

1. **Surface the right next move.** When you sit down to work, the dashboard tells you what to do — not by giving you a long list, but by showing the current block's queue.
2. **Protect focus time.** Themed blocks (Prospecting, Pipeline, OVIS, Email) carve the day into purposeful chunks. Reactive work has its own slot instead of eating the day.
3. **Give the team visibility without clutter.** Peer-to-peer assignment with a "Watching" lane that doesn't pollute your active work.
4. **Make tasks first-class data.** Split out of `activity` so the schema, queries, and UI fit the use case.
5. **Preserve Hunter's automation.** Don't break what works.

## 2a. Non-goals (v1)

- AI auto-categorization or auto-scheduling (Motion-style "smart fill") — deferred to v2.
- Mobile push notifications — deferred until OVIS has a mobile app/PWA.
- Migrating deal/contact/etc. off the activity-style timeline onto the chat-style timeline that exists on `site_submit` and `property` — separate follow-up project.
- Pushing time blocks back to Google Calendar — pull-only sync this round.
- Comments on tasks (separate from completion notes) — likely v2.
- Bulk actions, saved filter sets, task templates — v2.

---

## 3. Design Principles

These were established during the interview. They settle ambiguities later in the doc.

- **The user plans; the system supports.** No wizards, no forced sequences. The dashboard is the planning surface; you flip to "Tomorrow," edit, close.
- **One concept per surface.** Personal reminders are tasks. Recurring items are tasks. Brain dumps are tasks. Hunter calls are tasks. Less to learn, less to maintain.
- **Sparingly used signals stay meaningful.** A single "High" flag instead of P1–P4 (avoids priority inflation). One "Top 3 today" lane instead of a deep priority hierarchy.
- **Capture is fast; planning is intentional.** Three seconds to capture a task; minutes (not seconds) to plan a day.
- **Calendar overrules; OVIS reacts.** External commitments win. The system surfaces conflicts; you resolve them.
- **No rigid auto-routing.** Newly assigned tasks, brain-dumped tasks, and uncategorized captures all land in the same Inbox lane and get triaged manually.

---

## 4. Data Model

### 4.1 New tables

```
task
├── id (uuid, pk)
├── subject (text, required)
├── description (text, nullable)
├── status (enum: open | in_progress | completed | cancelled)
├── category_id (fk → task_category, NOT NULL)       -- user-extensible, see §5.1
├── category (text, legacy, kept in sync — drops in a follow-up migration)
├── owner_id (fk → user)
├── assigned_by_id (fk → user, nullable)             -- who delegated this
├── parent_task_id (fk → task, nullable)             -- subtask support (1 level)
├── project_id (fk → task_project, nullable)         -- multi-week umbrella, optional
│
├── duration_minutes (int, nullable)                 -- required to schedule into block
├── high_flag (bool, default false)                  -- single sparingly-used priority flag
├── top3_date (date, nullable)                       -- if pinned to "Top 3" for a specific day
├── triaged_at (timestamptz, nullable)               -- explicit ✓ Mark Triaged stamp (see §7.4.1)
├── blocked_at (timestamptz, nullable)               -- Awaiting / blocked stamp (see §6.9)
├── blocked_reason (text, nullable)                  -- free text shown in Awaiting lane
├── due_at (timestamptz, nullable)                   -- alerts & overdue, NOT a sort key
├── remind_at (timestamptz, nullable)                -- personal reminder ping
├── private_completion (bool, default false)         -- skip auto-post to object timeline
│
├── recurrence_rule_id (fk → task_recurrence_rule, nullable)
├── recurrence_parent_id (fk → task, nullable)       -- spawned instances point to template
│
├── signal_strength (enum, nullable)                 -- HOT | WARM_PLUS | WARM | COOL (Hunter)
│
├── client_id, deal_id, property_id, site_submit_id,
│   assignment_id, contact_id (all fk, nullable)     -- object links
│
├── created_at, updated_at, completed_at, completion_note (text)
└── created_by_id (fk → user)

task_project
├── id (uuid, pk)
├── name (text, required)
├── category (enum, same as task.category)
├── owner_id (fk → user)
├── status (enum: active | completed | archived)
├── target_date (date, nullable)
└── created_at, updated_at

task_recurrence_rule
├── id (uuid, pk)
├── task_id (fk → task)                              -- the template task
├── mode (enum: schedule_based | spawn_on_completion)
├── interval_days (int, nullable)                    -- "every N days" form
├── byweekday (int[], nullable)                      -- e.g., [1,3,5] for M/W/F
├── monthday (int, nullable)                         -- e.g., 15 for 15th of month
├── until_date (date, nullable)                      -- end of recurrence
└── created_at

task_block_template
├── id (uuid, pk)
├── owner_id (fk → user)
├── name (text, required)                            -- "Prospecting", "Email AM", "OVIS"
├── category (enum, same as task.category)
├── byweekday (int[], required)                      -- which days it repeats
├── start_time (time, required)                      -- e.g., 09:00
├── duration_minutes (int, required)                 -- e.g., 120
├── active (bool, default true)
└── created_at, updated_at

task_block_instance
├── id (uuid, pk)
├── template_id (fk → task_block_template, nullable) -- null = ad-hoc one-off block
├── owner_id (fk → user)
├── on_date (date, required)
├── start_time (time, required)                      -- may differ from template (per-day edit)
├── duration_minutes (int, required)
├── name (text)                                      -- copied from template, editable per-day
├── category (enum)
├── status (enum: scheduled | in_progress | completed | skipped)
└── created_at, updated_at

task_block_scheduled_task
├── id (uuid, pk)
├── block_instance_id (fk → task_block_instance)
├── task_id (fk → task)                              -- can be a subtask
├── manual_rank (int)                                -- drag-rank within block
└── created_at

task_outreach_draft                                  -- replaces hunter_outreach_draft
├── id (uuid, pk)
├── task_id (fk → task, required)                    -- replaces target_id
├── kind (enum: email | voicemail | linkedin)
├── subject (text, nullable)
├── body (text, required)
├── status (enum: draft | approved | sent | rejected | failed)
├── gmail_message_id, gmail_thread_id (text, nullable)
└── created_at, updated_at, sent_at
```

### 4.2 Modified tables

- `prospecting_activity`: change FK from `target_id` → `task_id`. Existing trigger that updates `last_contacted_at` ports to update `task.last_activity_at` (new column on task) instead.
- `prospecting_time_entry`: no schema change; semantics still "minutes per user per day spent on prospecting." Filter by joining to tasks where `category=prospecting`.
- `prospecting_vacation_day`: no change.

### 4.3 Tables retained as-is

- `activity`: keeps non-task purpose (calls, emails, meetings, notes, status changes). No longer doubles as a task store.
- `client`, `deal`, `property`, `site_submit`, `assignment`, `contact`: unchanged. Tasks FK into them; never the other way.

### 4.4 Tables eventually retired

- `target` (Hunter's company-level entity): retired once the Hunter agent emits tasks directly. **Phased**, not part of v1 cutover.
- `hunter_outreach_draft`: replaced by `task_outreach_draft` once migration completes.

---

## 5. Categories & Time Blocks

### 5.1 Categories

Categories live in the `task_category` table. Each row has:
- `id` (uuid)
- `name` (free text, any case the user types)
- `color` (palette key: `amber | blue | indigo | gray | green | slate | red | teal`)
- `scope` (`global` or `personal`)
- `sort_order` (int)
- `created_at`, `created_by_id`
- `archived_at` (nullable — soft delete)

`task.category_id` is a NOT NULL FK on this table.

#### Scope

- **`global`** — visible to every user. The original 6 seeded categories live here.
- **`personal`** — visible only to the `created_by_id` user. Defaults to this when a user creates a new category from the Inbox dropdown, so they don't accidentally pollute the shared list.

Seeded set:

| Category | Color | Scope | Use |
|---|---|---|---|
| `prospecting` | amber | global | Outbound calls, follow-ups, Hunter-driven outreach |
| `pipeline` | blue | global | Active deal/client work |
| `ovis` | indigo | global | System design, building, internal projects |
| `email` | gray | global | Inbox triage, replies |
| `personal` | green | global | Personal reminders and standalone tasks |
| `other` | slate | global | Catch-all (default for Brain Dump and Quick Capture) |

#### Uniqueness

Case-insensitive within scope:
- `global`: `lower(name)` is unique across all global categories.
- `personal`: `lower(name) + created_by_id` is unique. Two users can each have their own personal "Bookkeeping"; they do not collide.

A personal "Bookkeeping" can coexist with a global "bookkeeping" (different scopes). The dropdown groups them visually so the distinction is clear.

#### Edit + delete permissions

| Category scope | Who can edit (rename / change color) | Who can archive |
|---|---|---|
| `global` | Admin (`user.ovis_role = 'admin'`) only | Admin only |
| `personal` | Owner OR admin | Owner OR admin |

Archive = soft delete: sets `archived_at = now()`. Archived categories disappear from `CategoryDropdown` but tasks that already reference one continue to render the chip. Restore by clearing `archived_at`.

#### UI

- Dropdown groups: **Team** (globals, ordered by `sort_order` then name), divider, **Mine** (visible personals).
- Pencil icon next to each row the current user can edit (`canEditCategory` helper). Opens the `EditCategoryModal`.
- "+ New category…" pinned at the bottom — opens `CreateCategoryModal` with a Just me / Team-wide scope toggle (default Just me).

#### Legacy compatibility

The legacy `task.category` text column is retained during the migration window and kept in sync by `updateTask` so older UI (TaskDetailSlideout's native `<select>`) keeps working until it's migrated to the new dropdown. Will be dropped in a follow-up migration once the FK is load-bearing in prod.

### 5.2 Block templates

**Time blocks are opt-in per user.** Some users (e.g., Mike) will plan around blocks; others (e.g., Arty, Noree) may never set one up and just work the all-tasks view + Inbox + Top 3 lane. The system must work cleanly for both groups — see §11 for how the dashboard adapts.

For users who opt in, each defines their own recurring block templates. Templates specify:
- A category
- Days of week it repeats (`byweekday`)
- Start time and duration
- Display name

Mike's example templates (illustrative — not seeded for any user):

| Template | Days | Time | Duration |
|---|---|---|---|
| OVIS | Mon–Fri | 7:00 AM | 2 hr |
| Prospecting | Mon–Fri | 9:00 AM | 2 hr |
| Email (AM) | Mon–Fri | 11:00 AM | 30 min |
| Email (Long) | Mon–Fri | 1:00 PM | 60 min |
| Email (PM) | Mon–Fri | 4:30 PM | 30 min |
| Pipeline | Mon–Fri | 2:00 PM | 2 hr |

**First-run UX**: ship blank. Each user creates templates from scratch via a "Set up time blocks" entry point. No defaults pre-seeded — users with different rhythms shouldn't have to delete someone else's templates.

### 5.3 Block instances

Every day, the system instantiates today's blocks from active templates onto `task_block_instance` rows. Instances can be edited per-day without affecting the template (see 5.4).

### 5.4 Editing blocks: this day / all future / skip

When the user edits a block, the system **always prompts** with three choices (Apple/Google Calendar pattern):

1. **This day only** — modifies the `task_block_instance` row; template untouched.
2. **All future** — modifies the `task_block_template`; today's instance unchanged.
3. **Skip just this day** — sets the instance's status to `skipped` (e.g., conference day, kill the Prospecting block).

### 5.5 Ad-hoc one-off blocks

User can create a block on a specific day with no template (e.g., "Site visit prep, Wed 2–4pm"). Stored as a `task_block_instance` with `template_id = NULL`.

### 5.6 Tasks-in-blocks

Tasks are scheduled into blocks via `task_block_scheduled_task`. A task can only be in one block at a time (no double-booking). When scheduled, `duration_minutes` becomes required.

The system enforces stack capacity loosely: it warns if total scheduled duration exceeds the block's duration, but doesn't prevent it (user judgement wins).

---

## 6. Tasks: Fields & Lifecycle

### 6.1 Required vs optional fields

| Field | Required at creation? | Required to schedule into a block? |
|---|---|---|
| `subject` | Yes | — |
| `category` | No (defaults from object link or `personal`) | Yes |
| `owner_id` | Yes (defaults to creator) | — |
| `duration_minutes` | No | **Yes** |
| Object links | No | — |
| `due_at`, `remind_at`, `high_flag`, `top3_date` | No | — |

### 6.2 Prioritization (layered hybrid)

Established in Q7. The system uses four layered signals, **none** of which auto-sort by deadline:

1. **Top 3 today** — user pins 1–3 cross-block priorities each morning planning. Surfaced in a dedicated lane on the dashboard.
2. **Manual drag-rank within each block** — user controls order inside Prospecting / Pipeline / etc. via `task_block_scheduled_task.manual_rank`.
3. **High flag** — single boolean (`task.high_flag`). Flagged tasks float to the top of their block. Sparingly used.
4. **Due dates** — trigger overdue badges and alerts only. Never auto-sort.

### 6.3 Subtasks (one level)

A task can have child subtasks via `parent_task_id`. Subtasks share their parent's category. Estimates live at whichever level you actually schedule (usually the subtask). Parents show a "X of Y subtasks done" indicator.

In a block, the queue shows the **next-flagged subtask** of any parent in that category, plus any subtasks **explicitly scheduled** into today's block. Parents themselves are hidden from block view; you see actionable subtasks.

### 6.4 Projects (first-class umbrellas, optional)

For genuine multi-week efforts ("New broker onboarding," "Q3 OVIS roadmap," "Holdco refi"), `task_project` provides an umbrella. Projects have a single category — no cross-category projects. Tasks can optionally be associated with a project via `project_id`.

Skip projects for everyday tasks; they're an opt-in concept.

### 6.5 Recurring tasks

Each recurring task has a `task_recurrence_rule` with a `mode`:

- `schedule_based` — instances exist on the schedule whether or not previous ones were completed. Misses pile up as overdue. Use for "submit weekly status report."
- `spawn_on_completion` — next instance only appears after the current one is checked off, dated forward from completion. Use for "follow up with Acme every 2 weeks."

### 6.6 Personal reminders

Just lightweight tasks: a subject + `remind_at` time, no category, no duration, no link. They live in the "All tasks" view but aren't expected to be scheduled into a block. The reminder fires (in-app + email per Q12/Q13) at `remind_at`.

### 6.7 Standalone tasks

Tasks without any object link are fully supported. They live in `personal` or `other` categories and behave like any other task.

### 6.8 Overdue (added 2026-05-10)

A task is **overdue** when `due_at < today` (local Eastern time per CLAUDE.md) and `status` is still `open` or `in_progress`. Overdue is a derived signal — no separate column.

Surfacing:
- **Visual badge** on every row that renders the task (Inbox, Top 3, in-block, All Tasks): the due date is rendered with the brand terracotta color (`#A27B5C`) instead of the slate default.
- **Dedicated dashboard lane** — see §11. Lists every overdue task regardless of inbox/scheduled state. Same task can show in Overdue *and* in Inbox *and* in a block — that's intentional, overdue is the critical surface.

Overdue does NOT auto-sort or auto-reschedule (per §6.2 #4). The user decides what to do: re-pin Top 3, clear the due date if no longer relevant, complete it, or delete. Notification triggers (per §10.1) follow separately.

### 6.9 Awaiting / blocked (added 2026-05-10)

A task you can't act on yet because you're waiting on someone external (vendor reply, attorney sign-off, client signature) gets stamped with `blocked_at` and a free-text `blocked_reason`. Surfaced in a dedicated **Awaiting** lane below the timeline alongside Watching.

Inbox semantics: `blocked_at` is treated as a placement signal. Blocking a task removes it from the Inbox; unblocking restores it (unless another placement signal exists). This matches the §7.4.1 rule — "anything unscheduled stays in inbox" — extended so that *waiting* also counts as a deliberate placement decision.

Lane behavior:
- Sorted oldest-first by `blocked_at` (longest waits stay visible).
- Hidden when empty so it doesn't crowd the dashboard.
- Inline action: ▶ Unblock — clears `blocked_at` + `blocked_reason`, returns task to Inbox if no other placement.

A blocked task can still be pinned to Top 3, scheduled, or due-dated — all of those continue to work. The Awaiting lane is where the user goes to find "things I'm parked on," not the only place they appear.

Future (deferred): an optional `blocked_until date` for auto-resurface (e.g., "remind me in 3 days if no reply") and a manual nudge action that bumps the assignee.

### 6.10 Block capacity (added 2026-05-10)

Each block on the timeline shows a small capacity bar comparing the sum of scheduled task `duration_minutes` to the block's own `duration_minutes`. The bar fills as you schedule tasks into a block — slate while under capacity, brand blue (`accent`) when exactly at capacity, and brand terracotta (`warning`) when overbooked.

Below the bar:
- A line reads "X/Y min scheduled" so the absolute numbers are visible at a glance.
- If any tasks in the block lack a duration, append "(N tasks missing duration)" so the math isn't silently distorted.
- If overbooked, append "⚠ Over by N min" in terracotta with bold weight.

This is a visual-only safeguard — nothing prevents an overbook (the user might intentionally cluster a lot of small tasks knowing some will slip). It just makes the situation visible without doing math in your head.

The full calendar-style proportional layout (block heights pixel-proportional to duration; meeting events overlaid as fixed-height blocks) is a deferred follow-up; it's the natural next step once this signal proves itself in real use.

---

## 7. Object Linking & Capture

### 7.1 Linkable objects

A task can link to **any of**: `client`, `deal`, `property`, `site_submit`, `assignment`, `contact`. Multiple links allowed (e.g., a task can be on a deal AND a contact). Storage: separate FK columns on `task`, all nullable.

### 7.2 Quick-capture from object pages

Every object detail page has a `+ Task` button in the **top-right of the header** (consistent location for muscle memory). Clicking opens an **inline popover**:

1. Single text input is auto-focused. Type subject. Hit Enter to save.
2. The linked object shows as a chip (e.g., "→ Acme Coffee deal") so you can see the link is set.
3. Pill buttons under the input: **Category** (auto-suggested from object type — Pipeline for deal, Prospecting for contact), **Due**, **Assign**, **Duration**. Click to set inline.
4. "Expand" link opens the full form for tasks needing notes, attachments, subtasks.

Default category mapping by source object:

| Object | Default category |
|---|---|
| `contact` | `prospecting` |
| `deal`, `client` | `pipeline` |
| `property`, `site_submit`, `assignment` | `pipeline` |

### 7.3 Brain Dump

Triggered from a global keyboard shortcut and a button on the planning view. Opens a modal with a **full-screen text area**. Each newline becomes a new task. Tasks land in the **Inbox** with no category, no duration, no link — to be triaged later.

### 7.4 Inbox = universal triage queue

The Inbox holds:
- Newly-assigned tasks from teammates (Q4)
- Brain dump captures (Q18 side)
- Quick-captures where the user didn't set a category
- **Anything not yet placed.** A task that isn't pinned to Top 3, isn't in a block schedule, and wasn't explicitly marked triaged stays in the Inbox — even if it has a category, due date, or High flag.

#### 7.4.1 Inbox-exit rule (revised 2026-05-10)

`is_inbox` is a derived signal. A task is in the Inbox iff **none** of the following placement signals exist:

| Action | Stays in Inbox? |
|---|---|
| Set category alone | Yes — naming isn't a plan |
| Set due date alone | Yes — that's a constraint, not a plan |
| Set High flag alone | Yes — importance, not placement |
| Pin to Top 3 (today or any future date) | No — placed |
| Schedule into a time block (today or any future date) | No — placed |
| Click ✓ Mark Triaged | No — explicit "I've decided" |
| Click ⏸ Awaiting (set blocked_at) | No — placed in Awaiting lane (see §6.9) |
| Reassigned to another user | No (leaves your inbox; lands in theirs) |

Removing the last placement signal (e.g., unpinning Top 3 when the task isn't in any block and wasn't explicitly triaged) **restores `is_inbox = true`** so the task isn't lost.

The `task.triaged_at timestamptz NULL` column distinguishes intentional "I've decided" triage from the side-effect inbox-clearing of placement. Set when ✓ Mark Triaged is clicked; checked by inbox-recompute to avoid auto-restoring tasks the user explicitly removed from the inbox.

Triage flow during planning: scan inbox, for each — pin Top 3, schedule into a block, click ✓ to acknowledge, or delete. Untriaged items stay until next session.

---

## 8. Team & Collaboration

### 8.1 Team shape

OVIS brokers + admin only. Currently 3 users (Mike, Arty, Noree). NOT client portal users or coaches. Peer-to-peer collaboration — no hierarchy.

### 8.2 Assignment model: "Watch"

When user A assigns a task to user B:
- The task moves to B's dashboard as their own to schedule and execute.
- A keeps visibility via a **"Watching" lane** on their dashboard:
  - Collapsible / secondary placement (must NOT clutter today's blocks)
  - Shows only **uncompleted** delegated tasks
  - Sorted by oldest-uncompleted first
- A doesn't see B's load before assigning (assign-and-trust). No pre-assign visibility UI.

### 8.3 Reverse direction: incoming assignments

When task arrives in B's inbox:
- Lands in the **Inbox** lane with a count badge.
- During planning, if the assigner set a category, the system **pre-suggests** routing it into the matching block. B can accept, change, or defer.
- Pure auto-routing is rejected (risks tasks silently disappearing into B's day).

### 8.4 Reassignment

Anyone can reassign a task they own or that they originally created. No approval flow.

---

## 9. Calendar Sync (Google)

### 9.1 Direction: pull-only (v1)

Google Calendar → OVIS only. Nothing pushed back. Reasons:
- Two-way sync is genuinely hard (delete semantics, conflict resolution).
- "Free" pushed blocks defeat the purpose (others book over them anyway).
- Keeps OVIS the unambiguous source of truth for time blocks.
- Easy to add push later if the gap becomes painful.

### 9.2 Multi-calendar

User can configure multiple Google Calendars to read from (primary + personal + team, etc.). Stored as a list per user. Each pulled event tagged with source calendar.

### 9.3 Sync mechanism

- **Polling**: every 5 minutes (TBD — tune in implementation).
- **Webhook**: subscribe to Google's push notifications for near-real-time updates. Polling is fallback when webhook is unhealthy.
- **Manual "Sync now"** button in the dashboard for when the user wants an immediate refresh.

### 9.4 Conflict detection

When sync finds a new Google event overlapping an existing block:
- Generate a notification (per Q12/Q13).
- Show a visual flag on the dashboard's Conflicts panel.
- User decides resolution: shrink block, move block, accept overlap, or fix the meeting in Google. No auto-resolution.

### 9.5 Reverse capture (drag Google event → task)

Deferred. Not in v1.

---

## 10. Notifications & Reminders

### 10.1 Triggers (all default-on, per-user toggleable)

- **Time block starting** — 5 min before
- **Task due today** — single morning digest, not per-task
- **Task overdue** — once when crossed, then daily nudge until cleared
- **Calendar conflict detected** — new meeting overlapping a block
- **Personal reminder time reached** — `remind_at` ping
- **Task assigned to you** — someone delegated to you
- **Delegated task completed** — clears it from your Watching lane
- **Delegated task overdue** — on the assignee's side

### 10.2 Channels (v1)

- **In-app**: bell icon with count + notification panel. Always on.
- **Email**: batched only (morning summary + overdue digest). Never per-event spam.

### 10.3 Channels deferred to v2

- Browser push, Telegram opt-in (OVISbot already wired up for Claude Code), mobile push (waiting on mobile app/PWA).

---

## 11. Dashboard Layout

The morning dashboard is the home view. Same layout flips to "Tomorrow" mode for evening planning.

```
┌─────────────────────────────────────────────────────────────────┐
│  [Quick capture: type a task...]              [+ Task] [↻ Sync] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  OVERDUE (2)   TOP 3 TODAY      INBOX (3)      CONFLICTS (1)   │
│  ⚑ 4d overdue  ☐ Pinned task A  [open triage]  [resolve]       │
│  ⚑ 1d overdue  ☐ Pinned task B                                 │
│                ☐ Pinned task C                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  TODAY'S TIMELINE                                               │
│                                                                 │
│  ▍ 7:00 — 9:00   OVIS                          [3 of 5 tasks]   │
│  ▍ 9:00 — 11:00  Prospecting   ← CURRENT       [Hunter list]   │
│  ▌ 11:00 — 11:15 ⛔ Meeting w/ Bob (calendar)                    │
│  ▍ 11:15 — 11:45 Email                                          │
│  ▍ 1:00  — 2:00  Email (long)                                   │
│  ▍ 2:00  — 4:00  Pipeline      [view: ☑ flat | grouped by client]│
│  ▍ 4:30  — 5:00  Email                                          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ▾ AWAITING (3 blocked, oldest first)                           │
│      ⏸ Waiting on attorney to review LOI — blocked 6d           │
│      ⏸ Waiting on Sarah for survey signature — blocked 2d       │
│      ...                                                        │
├─────────────────────────────────────────────────────────────────┤
│  ▾ WATCHING (5 delegated, oldest first)                         │
│      ☐ Task you assigned to Arty — 4 days                      │
│      ☐ Task you assigned to Noree — 2 days                     │
│      ...                                                        │
└─────────────────────────────────────────────────────────────────┘
                                                  [Plan Tomorrow →]
```

Lanes:
1. **Quick capture** bar — always visible at top. Single-line input → Enter → task lands in Inbox.
2. **Overdue / Top 3 / Inbox / Conflicts** — four small panels in a row. Overdue is far-left so it's the first thing you see. Inbox and Top 3 share a `DragDropContext` so tasks can be dragged between them: Inbox → Top 3 pins for the viewed date (sets `top3_date = viewDate`); Top 3 → Inbox unpins (clears `top3_date`; the inbox-recompute helper restores `is_inbox = true` unless another placement holds it out). Each draggable row has a `⠿` handle on the left.
3. **Today's Timeline** — blocks chronologically, calendar meetings interleaved as fixed events. Current/next block highlighted. Each block expands to show its task queue.
4. **Pipeline block view-mode toggle** — Flat (manual rank) vs. Grouped by client. Per-user persisted preference.
5. **Awaiting lane** — collapsible, secondary. Only blocked tasks (`blocked_at IS NOT NULL`). Hidden when empty. See §6.9.
6. **Watching lane** — collapsible, secondary. Only uncompleted delegated tasks. Hidden when empty.
7. **Plan Tomorrow** button — flips the same view to tomorrow's date.

### 11.1 Adaptive layout for non-blocking users

Per §5.2, time blocks are opt-in. Users with no active block templates and no scheduled tasks for today see a simplified dashboard:

- The **Today's Timeline** lane is replaced with a **"Today's Tasks"** list (their open tasks, filterable by category, sorted by High flag → Top 3 → manual rank → due date).
- Calendar events from Google still appear as a small "Today's meetings" strip above the task list.
- Top 3, Inbox, Conflicts, Watching, Quick capture, and Plan Tomorrow all still work the same way.
- A "Set up time blocks" call-to-action appears once, dismissible — for users who never opt in, it doesn't return.

This means Arty and Noree can use the system as a clean prioritized task list without ever engaging with time blocks, while Mike gets the full block-based planning experience. Same data model, different UI surface.

---

## 12. Evening Planning

Same dashboard view; click **Plan Tomorrow** to flip the date forward by one day.

When in Tomorrow mode:
- Blocks are pre-instantiated from active templates.
- Today's incomplete tasks appear as suggestions for placement into tomorrow's blocks.
- Inbox shows newly-assigned tasks awaiting triage.
- Top 3 lane is empty; user fills it in.
- Calendar events are pulled for tomorrow's date.

User drags, edits, closes. No wizard, no separate planning page. Trust the user.

---

## 13. Completion → Object Timeline

When a task linked to an object is completed:

- **Auto-post by default.** Posts an entry to that object's activity/chat timeline.
- **Format:** `✅ {user} completed task: {subject}` + optional free-form completion note (`task.completion_note`) the user fills in at checkoff time.
- **Private opt-out:** task creation has a "Private — don't post on completion" checkbox (rare exception). Stored as `task.private_completion`.
- **Visibility:** anyone who can already see that object's timeline. No new permission concept.

### 13.1 Timeline routing during transition

OVIS currently has two timeline systems:
- **Chat-style** (already exists on `site_submit` and `property`): completion post inserts into the chat/notes table for that object.
- **Activity-style** (everything else: `deal`, `contact`, `client`, `assignment`): completion post inserts a row into `activity` with a `task_completed` activity_type.

Both work concurrently in v1. Once the deferred follow-up project migrates the activity-style objects to chat-style, the routing collapses to one path.

---

## 14. Hunter Integration

Established via Hunter audit (see memory `project_task_system_v2.md` and conversation log). The audit found Hunter is far more sophisticated than initially assumed: an autonomous Gemini agent, lead scoring, AI outreach drafting, prospecting time/streak tracking, stale-lead detection, daily briefing.

### 14.1 Approach: hybrid

Tasks are the unified data backbone. Hunter stays as a **specialized layer** operating on prospecting-category tasks, with all current automation preserved.

| Hunter feature | What changes | What stays |
|---|---|---|
| Hunter agent (Gemini scrape/score) | Outputs tasks (`category=prospecting`, `signal_strength` field) instead of `target` rows | Same prompt, same scoring, same pipeline |
| Outreach draft queue | New `task_outreach_draft` table keyed to `task_id` | Draft → approved → sent flow + Gmail integration unchanged |
| Activity logging | `prospecting_activity.target_id` → `task_id` | All UI buttons and hooks unchanged |
| Streak / time tracking | Filters by `category=prospecting` on linked task | Streak math + vacation days unchanged |
| Stale lead detection | `WHERE category=prospecting AND last_activity < now() - 45d` | Same threshold, same UI |
| Daily briefing | Filters tasks by category before summarizing | Same email format |
| `last_contacted_at` trigger | Ports to update `task.last_activity_at` | Same logic |

### 14.2 Migration sequencing

Hunter migration is **non-trivial** — three pieces require real refactoring, not just renames. Phased plan:
1. New schema in place; existing Hunter continues writing to `target` and `hunter_outreach_draft`.
2. Backfill: write a one-time migration creating `task` rows for all existing `target` rows with `category=prospecting`, copying signal_strength, contact link, and `last_contacted_at`.
3. Refactor Hunter agent to emit tasks directly. Old `target` writes stop.
4. Refactor outreach draft sender to read from `task_outreach_draft`. Old draft writes stop.
5. Refactor `prospecting_activity` to FK on `task_id`. Old `target_id` writes stop.
6. Once stable, deprecate `target` and `hunter_outreach_draft`.

Every step is independently reversible until step 6.

### 14.3 Hunter UI continuity

The existing prospecting workspace UI (Today's Plan, Scorecard, contact lists) keeps working — it just queries tasks-with-category=prospecting instead of targets. From the user's perspective, Hunter looks the same.

---

## 15. View Modes

### 15.1 Block view (default)

Today's timeline as shown in §11. Primary work surface.

### 15.2 Pipeline grouped-by-client toggle

Inside the Pipeline block (only), user can toggle:
- **Flat** — tasks in manual rank order
- **Grouped by client** — collapsible per-client sections, rolled up via object links (`task → deal → client_id` or `task → property → client_id`)

Per-user preference, persisted.

### 15.3 All-tasks flat view

A separate page for browsing/searching all tasks. Filter by:
- Status (open / in-progress / completed / cancelled)
- Category
- Owner
- Linked client / deal / property / site_submit / contact / assignment
- Date range (due / created / completed)
- High flag
- Has parent (subtask) / has children (parent task) / standalone
- Free-text search across subject + description

The Pipeline grouped-by-client toggle is also available here.

---

## 16. Field-level decisions (resolved)

These were defaulted in the draft and confirmed by Mike in review.

| # | Decision | Notes |
|---|---|---|
| 1 | Task description = free-form markdown, optional | Renders in detail view + completion timeline post |
| 2 | **Attachments stored in Supabase Storage**, not Dropbox | See rationale below |
| 3 | URL links captured inline in description (no separate field) | Revisit only if clunky |
| 4 | Task comments deferred to v2 | Completion notes cover the v1 use case |
| 5 | All-tasks view columns: Subject, Category, Owner, Due, High flag, Linked-to, Status, Updated | All sortable |
| 6 | Existing-task migration: see §17 below for full plan | |
| 7 | First-run UX: ship blank, no pre-seeded templates | Each user builds their own; non-blocking users may never opt in |
| 8 | Block-start notification = 5 min before, per-user adjustable | No block-end "wrap up" alert in v1 |

### 16.1 Why Supabase Storage for attachments (not Dropbox)

Dropbox is the right backend for objects with **document-heavy lifecycles** (deals, properties, site_submits) where files persist for years and team members collaborate on them across the deal flow. Tasks are different: most attachments are screenshots, quick references, and personal context tied to an item that gets checked off in days. Two reasons to keep tasks on Supabase Storage:

1. **Volume**: tasks will outnumber deals and properties by an order of magnitude. Creating a Dropbox folder per task would balloon the Dropbox tree and make navigation painful.
2. **Scope**: task attachments rarely need cross-team document collaboration. Supabase Storage gives in-app preview and direct linking without round-tripping through Dropbox.

If users start asking "where's the Dropbox folder for this task?" we add Dropbox later. Cheap to retrofit, hard to undo if we lock in early.

---

## 17. Migration from v1 task system

### 17.1 Scope: open tasks only

Only tasks that are **currently open** at cutover get migrated. Completed task rows in `activity` stay where they are as historical record — no need to move them since the v1 dashboard will be decommissioned and historical task state is preserved in the `activity` table for audit/reporting.

### 17.2 Category inference

Each migrated open task gets a category inferred from its strongest object link:

```
if contact_id present              → prospecting
elif deal_id, client_id, property_id, site_submit_id, or assignment_id present
                                   → pipeline
else                               → personal
```

(`other` reserved for the rare case where inference fails or for explicit user choice later.)

### 17.3 Cutover style: big-bang

One ship. The v1 `TaskDashboardPage` UI is removed at the same moment the new dashboard goes live. No side-by-side period. Reasons:
- Two task UIs running simultaneously creates "where do I add this?" confusion.
- The migration is small (only open tasks) so the cutover window is short.
- Reverting is achievable via git revert + a backwards migration if problems are caught early.

### 17.4 Decommission

The following are deleted at cutover:
- `src/pages/TaskDashboardPage.tsx`
- The `/tasks` route binding to it (replaced by the new dashboard)
- `docs/TASK_MANAGEMENT_SYSTEM.md` and `docs/TASK_SYSTEM_IMPLEMENTATION_SUMMARY.md` (superseded by this spec)
- Any v1-only code paths in `AddTaskModal.tsx` / `ActivityDetailView.tsx` that aren't reused by v2

Git history retains all of the above. Revert path: `git revert` the cutover commit + run a backwards migration that re-creates `activity` rows from the post-cutover `task` table for any tasks created or modified post-cutover.

### 17.5 Backwards-compatibility hooks during migration

The old TaskDashboardPage and the new task system can both query their respective tables in the same Supabase instance during development. A feature flag (`enableTaskSystemV2`) toggles which dashboard route mounts. Cutover = flip the flag default to `true` + delete the old code in the same PR.

---

## 18. Implementation Phases

A rough sketch — to be detailed in a separate implementation plan.

| Phase | Scope | Independently shippable? |
|---|---|---|
| **1. Schema + core CRUD** | New tables, task creation/edit/delete, object linking, quick-capture popover, all-tasks view | Yes — replaces v1 task UI (with cutover per §17) |
| **2. Time blocks + dashboard** | Block templates, instances, edit semantics, dashboard layout (block + adaptive non-block variants), evening planning toggle | Yes — without calendar sync |
| **3. Calendar sync (pull-only)** | Multi-calendar config, polling + webhook, conflict detection | Yes |
| **4. Notifications & reminders** | All triggers, in-app + batched email, per-user toggles | Yes |
| **5. Recurring tasks** | Recurrence rules, both modes, instance generation | Yes |
| **6. Hunter migration** | Backfill, agent refactor, outreach draft table, prospecting activity FK | Yes (six sub-steps per §14.2) |
| **7. Subtasks + projects** | Parent/child, project umbrella, in-block surfacing rules | Yes |
| **8. Polish** | Brain dump, top-3 lane, watching lane, completion timeline routing | Yes |

Phases are ordered for risk/value, not dependency — most can run in parallel after Phase 1.

---

## 19. Out of scope (for separate projects)

- **Migrating deal/contact/client/assignment off the activity-style timeline onto the chat-style timeline.** Mike explicitly flagged this as a separate follow-up project. v1 of Task System v2 will route completion posts to whichever timeline each object uses today.
- **AI auto-categorization** of brain-dumped or quick-captured tasks (Motion's "smart fill"). Deferred to v2.
- **Push notifications to Google Calendar.** v1 is pull-only.
- **Mobile push notifications.** Waiting on a mobile app or PWA project.
- **Reverse calendar capture** (drag a Google event into OVIS to create a task).
- **Task templates** (saved task configurations for quick-create).
- **Bulk actions** (select-multiple, bulk update).
- **Shared block templates** (templates that propagate across team members).
- **Dependencies between tasks** (predecessor / successor).

---

## Decision log (interview Q&A)

For traceability, the design decisions in this spec map to the interview Q-numbers captured in the project memory file (`project_task_system_v2.md`):

- Q1 — pain points → §3 design principles
- Q2 — daily rhythm → §11, §12
- Q3 — time-blocking model + categories → §5
- Q4 — team model → §8
- Q5 — projects/subtasks → §6.3, §6.4
- Q6 — calendar sync → §9
- Q7 — prioritization → §6.2
- Q8 — duration estimates → §6.1, §5.6
- Q9, Q10 — recurring tasks → §6.5
- Q11 — personal reminders → §6.6
- Q12, Q13 — notifications → §10
- Q14 — completion → timeline → §13
- Q15 — morning dashboard → §11
- Q16 — Hunter integration → §14
- Q17 — evening planning → §12
- Q18 — quick-capture + brain dump → §7
- Q19 — block template editing semantics → §5.4

Mid-flow side requirements:
- Pipeline grouped-by-client toggle → §15.2
- Brain dump + universal Inbox → §7.3, §7.4
- Contact as a linkable object type → §7.1
