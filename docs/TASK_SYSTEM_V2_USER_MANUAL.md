# Task System v2 — User Manual

**Covers:** Everything live on `main` as of 2026-06-09 — Phases 1, 2, 2.5, 3, plus the 2026-06-09 All-Tasks preset views + bulk actions.
**Audience:** Anyone using OVIS to plan, execute, and triage their work.
**Companion docs:** [Spec](TASK_SYSTEM_V2_SPEC.md) (design rationale) · [Testing script](TASK_SYSTEM_V2_TESTING_SCRIPT.md) (QA checklist)

---

## What is this?

OVIS's task system is built around two ideas:

1. **Tasks are first-class.** They're not just calendar events or activity-log entries. They have categories, owners, due dates, optional links to deals/contacts/properties, and a full lifecycle.
2. **Themed time blocks turn a todo list into a plan.** Instead of staring at a list of 50 things and asking "what now?", you carve your day into blocks (Prospecting, Pipeline, OVIS, Email) and decide which tasks live in which block. The dashboard tells you what to do next.

The system is opt-in for time blocks. If you don't want to plan around blocks, the dashboard adapts — you'll see a simple priority-sorted task list with a "Set up time blocks" link you can ignore.

---

## Getting started

### First-time setup (5 minutes)

1. **Open the dashboard.** Visit `/tasks`. If you have no time blocks, you'll see a simple "Today's Tasks" list with a CTA at the top.
2. **(Optional) Set up time blocks.** Visit `/settings/time-blocks` and create 2–4 templates that match how your week actually runs. Keep it simple at first — you can always edit later.
   - Example for a broker: *Prospecting* (Mon–Fri, 9–11 AM, 120 min) · *Pipeline* (Mon–Fri, 2–4 PM, 120 min) · *Email* (Mon–Fri, 11–11:30 AM, 30 min).
3. **(Optional) Connect Google Calendar.** Visit `/settings/calendars` → "Connect Google Calendar". Pick which calendars to subscribe to (primary, work, personal — whichever should feed the dashboard). After connecting, your meetings appear on the timeline and the Conflicts lane warns when meetings collide with blocks.

That's it. Start capturing tasks; they'll start landing where they belong.

---

## The dashboard at a glance

URL: `/tasks`. Three rows from top to bottom:

```
┌─────────────────────────────────────────────────────────────┐
│  Today's Timeline · Wed, May 9          [🧠 Brain Dump]     │
│                                       [↻ Sync]              │
│                                       [Plan Tomorrow →]     │
│                                       [All tasks →]         │
│                                       [Manage templates →]  │
├─────────────────────────────────────────────────────────────┤
│  ★ TOP 3 TODAY    ·    INBOX (3)    ·   ⚠ CONFLICTS (1)    │
├─────────────────────────────────────────────────────────────┤
│                                          [+ Ad-hoc block]   │
│  ▍ All-day: Conference Day                                  │
│  ▍ 7:00 AM – 9:00 AM   OVIS                  3 of 5 tasks   │
│  ▍ 9:00 AM – 11:00 AM  Prospecting  CURRENT  2 of 4 tasks   │
│  ▍ ⛔ 11:00 AM – 11:15 AM  Standup w/ Bob (calendar)        │
│  ▍ 11:15 AM – 11:45 AM  Email                0 tasks        │
│  ▍ 2:00 PM – 4:00 PM   Pipeline              4 of 6 tasks   │
├─────────────────────────────────────────────────────────────┤
│  ▾ WATCHING (2 delegated, oldest first)                     │
└─────────────────────────────────────────────────────────────┘
```

If you have **no active templates**, the timeline section is replaced with a simple "Today's Tasks" list (sorted High flag → Top 3 → due date).

---

## Daily routines

### Morning planning (3–5 minutes)

1. **Open `/tasks`.** Glance at three things:
   - **Top 3** — empty? Pick today's three priorities (set them by opening any task and checking ★).
   - **Inbox** — anything new? Triage each row inline (set a category, schedule into a block, pin to Top 3, mark triaged, or delete).
   - **Conflicts** — any meetings clobbering a block? Decide: shrink the block, accept the overlap, or move the meeting.
2. **Skim the timeline.** Are today's blocks in the right shape? If not, click `✎` on a block to edit just today, or use "Add ad-hoc block" for a one-off.
3. **Get to work.** The current block is highlighted blue. Its task list is your queue.

### During the day

- **The current block** is your focus. Open tasks → complete (☐ → ✅) as you go.
- **Quick capture from anywhere.** On any object page (deal, client, contact, etc.), the `+ Task` button in the header opens a popover that pre-links the task to that object. Type subject, hit Enter, you're back to work in 3 seconds.
- **Brain dumping.** When you need to flush a backlog of half-thoughts, click 🧠 Brain Dump — type one task per line — they land in your Inbox to triage later.
- **Drag-rank within and across blocks.** Reorder tasks by dragging. Move a task to a different block by dragging it across.

### Evening planning (3–5 minutes)

1. Click `Plan Tomorrow →` in the dashboard header. The view flips to tomorrow's date; tomorrow's blocks materialize automatically.
2. Drag uncompleted tasks from today into tomorrow's blocks (or just leave them — they stay in the Inbox if not scheduled).
3. Set tomorrow's Top 3.
4. Click `← Today` to come back.

---

## Capturing tasks (four ways)

| When | How | Result |
|---|---|---|
| You're on an object page (deal, contact, etc.) and want to remember to do something about it | Click the `+ Task` button in the page header | Popover opens with the object pre-linked. Type, Enter. |
| You're on an object's pin slideout on the map | Click the **TASKS** tab → `+ Task` | Same popover, same auto-link |
| You're on the dashboard and need to schedule a task into a specific block | Click `+ Add` in the block's header | Picker opens listing your open tasks. Pick one. |
| You have a list of things in your head you need to dump quickly | Click 🧠 **Brain Dump** in the dashboard header | Modal opens. Type one task per line. Save. They go to Inbox. |

**Use cases:**
- *Property pin on the map looks interesting → "Call seller next week"* → click pin → TASKS tab → + Task → "Call seller about pricing", pick Due = next Monday.
- *Driving in your car and remember 6 things you need to do* → at next stop, open OVIS → 🧠 Brain Dump → dump them all in 30 seconds.
- *Mid-meeting realization that you owe Brewster a follow-up* → from Brewster's contact page → + Task.

---

## Organizing & prioritizing

OVIS uses **four signals** to keep priority meaningful instead of inflated. None of them auto-sort by deadline.

### 1. Categories

Every task has one of: `prospecting`, `pipeline`, `ovis`, `email`, `personal`, `other`. Set on creation; change anytime from the task slideout. Categories drive which time block a task fits into and gives the all-tasks view useful filters.

**Default category by source:**
| Source object | Default category |
|---|---|
| Contact | prospecting |
| Deal, Client, Property, Site Submit, Assignment | pipeline |
| Brain Dump | other |

### 2. Time blocks

Themed chunks of your day. Tasks scheduled into a block become its queue when that block is current. See the [Time blocks deep dive](#time-blocks-deep-dive).

### 3. Top 3 today

Pin 1–3 cross-block priorities. They surface in the **Top 3** lane on the dashboard and float above category-specific work. Soft cap — you can pin a 4th, but the system warns you.

**Use case:** *Three things absolutely must happen today no matter what:* pin them. They stay visible regardless of which block you're in.

**How to pin:** Open the task in TaskDetailSlideout → check `★ Pin to Top 3 today`. Or from the Inbox lane, click ★ on the row.

### 4. High flag

A single boolean on the task. Flagged tasks float to the top of their block. Sparingly used — if everything's high, nothing is.

### 5. Due dates

Trigger overdue badges in the all-tasks view. **Don't auto-sort the queue** — manual rank wins inside a block. Use due dates for hard deadlines (LOI deadline, callback before EOD, etc.), not as a planning hammer.

---

## Time blocks deep dive

### Templates vs. instances

- **Template** — recurring definition. "Prospecting, Mon–Fri, 9–11 AM, 120 min."
- **Instance** — one materialized day's block. The dashboard auto-creates today's instances from active templates that match today's weekday.
- **Ad-hoc block** — a one-off instance with no template. Use for "Site visit prep, Wed 2–4 PM" — only affects that day.

Edit a template via `/settings/time-blocks`. Edit a single day's instance from the dashboard (`✎` button on the block).

### The three-option edit prompt

When you edit a templated block from the dashboard, the modal asks: **This day only** or **All future days**.

- **This day only** — modifies just today's instance. Template untouched.
  *Use case: A one-day conference is making your usual 9 AM Prospecting block start at 1 PM today.*
- **All future days** — modifies the template; today's instance is untouched.
  *Use case: You've decided to permanently shift Prospecting from 9–11 to 8–10. Edit "All future days"; today stays at 9 because you're already partway through.*
- **Skip this day** (separate button in the same modal) — sets today's instance to skipped. Greyed out, doesn't accept tasks.
  *Use case: You're at a conference; kill today's Prospecting block.*

### Adaptive non-blocking layout

If you have no active templates, the dashboard auto-switches to a simplified "Today's Tasks" list — your open tasks sorted by High flag → Top 3 → due date. There's a dismissible "Set up time blocks" CTA at the top.

This means the system works for two very different rhythms:
- **Block-planners** (Mike): full timeline, drag-rank scheduling, Plan Tomorrow flow.
- **List-workers** (anyone who never wants blocks): clean priority list. The CTA goes away after one dismiss; you'll never see it again.

### Scheduling tasks into blocks

Three ways:
1. **Block's `+ Add` button** — picker shows your open tasks, click to schedule.
2. **Drag from one block to another** — moves to the new block.
3. **Inbox lane's "Schedule…" dropdown** — picks today's blocks to drop into.

A task can only be in **one block at a time**. Re-scheduling moves it.

### Manual rank within a block

Drag tasks up/down to reorder. The order persists across reloads.

### Pipeline grouped-by-client toggle

Inside the Pipeline block, click `⊟ Flat` to switch to `⊞ Grouped`. Grouped view shows tasks grouped by client name (rolled up via `task → deal → client_id` and similar FK chains). Tasks without a client link land in "Unlinked".

**Use case:** *You have 12 pipeline tasks across 4 clients and want to do all the Brewster work in a row.* Flip to Grouped, expand Brewster, work through that section, then move to the next client.

Drag-and-drop is disabled in Grouped view — toggle back to Flat to reorder.

### Setting up your first templates

Some patterns to copy/paste:

| Role | Suggested templates |
|---|---|
| Sales broker | Prospecting (Mon–Fri 9–11 AM 120m) · Pipeline (Mon–Fri 2–4 PM 120m) · Email AM (Mon–Fri 11–11:30 30m) · Email PM (Mon–Fri 4:30–5 30m) |
| Builder/admin | OVIS (Mon–Fri 7–9 AM 120m) · Pipeline (Mon–Fri 2–4 PM 120m) · Email Long (Mon–Fri 1–2 PM 60m) |
| List-worker | Skip templates entirely; use the simple list view |

You can change any of this anytime. Active templates that don't match today's weekday simply don't materialize today.

---

## The Inbox lane (triage queue)

The Inbox is where untriaged stuff piles up. Three things land here automatically:

1. **Brain Dump captures** — every line becomes an Inbox task with category=`other`.
2. **Tasks delegated to you** — when someone changes a task's owner to you (and they were the creator), it lands in your Inbox.
3. **Quick-captures without an explicit category** — depends on creation path.

### Triage actions

Each Inbox row has inline buttons so you can clear it without opening the slideout:

- **Category dropdown** — pick a category. Removes from Inbox.
- **Schedule dropdown** — pick one of today's blocks. Schedules it AND removes from Inbox.
- **★** — pin to Top 3 today. Removes from Inbox.
- **✓** — mark triaged (keep as-is). Just clears the inbox flag.
- **×** — delete the task entirely.

**Use case:** *Tuesday morning, 8 things in your Inbox.* Two are "call X next week" (set Schedule = next Monday's Prospecting block), one is "submit timesheet" (set Category = personal, ✓ triaged), one is "remind me to think about Q3" (✓ triaged), four are nonsense from yesterday's brain dump (× delete). Inbox zero in 90 seconds.

---

## The Watching lane

When you assign a task to a teammate (change Owner from yourself to someone else), the task moves to **their** dashboard. You keep visibility via your **Watching** lane below the timeline.

- Shows uncompleted tasks you've delegated, **oldest-first** (so stale delegations bubble up).
- Collapsible. Auto-hides when zero.
- Click a row to open the task and see status, comments (if any), or follow up.

**Use case:** *You assigned Arty a "verify zoning on Brewster" task 4 days ago.* Glance at Watching → see it's still open → DM Arty.

The Watching lane is on the **assigner's** dashboard, not the assignee's. If you assign someone else a task, it lands in their Inbox; they see it there.

---

## Calendar integration

OVIS pulls your Google Calendar (read-only) so the dashboard knows your meetings.

### Connecting

1. Visit `/settings/calendars`.
2. Click "Connect Google Calendar" → consent on Google → redirected back.
3. Toggle Subscribe on each calendar you want fed to the dashboard (primary, work, personal — whichever applies).
4. Click "↻ Sync now" for an immediate pull. After that, the cron pulls every 5 minutes.

### Events on the timeline

Pulled events render as fixed slots interleaved chronologically with your blocks:

```
▍ 9:00 AM – 11:00 AM  Prospecting  CURRENT     2 of 4 tasks
▍ ⛔ 10:30 AM – 11:00 AM  Quick call w/ Lee (calendar)
▍ 11:00 AM – 11:30 AM  Email                    0 tasks
```

Click an event → opens it in Google Calendar. All-day events render as a small banner above the timeline so they don't intrude on the hour-based lane.

### Conflicts lane

When a meeting overlaps a block, the **Conflicts** lane on the dashboard surfaces it: "Prospecting ↔ Quick call w/ Lee · 10:30–11:00 AM · Open in Google →". You decide how to resolve:

- **Shrink the block** — edit the block (`✎`) to change the duration or start time.
- **Accept the overlap** — leave both. The block still has 1.5 hours of focus time.
- **Move/cancel the meeting** in Google. Click "↻ Sync" to refresh.

All-day events don't generate conflicts (informational only).

### What if I have multiple Google accounts?

V1 supports one Google account per user with multi-calendar selection within that account. If you have a personal Google account that also needs to feed the dashboard, ping me — we can lift the constraint when there's a real need.

### Re-running sync

The cron runs every 5 minutes. Click "↻ Sync" on the dashboard or in `/settings/calendars` for an immediate pull (e.g., right after you create a new meeting in Google).

### Disconnecting

`/settings/calendars` → "Disconnect". Connection becomes inactive; tokens are cleared. Pulled events stay in the DB but stop refreshing. Re-connecting picks back up cleanly.

---

## The all-tasks list (`/tasks/all`)

A flat, filterable, sortable view of every task in the system. Useful for:

- **Searching** — free text across subject + description.
- **Filtering** by status, category, owner, high-only, mine-only.
- **Sorting** — click any column header (Subject, Category, Owner, Due / Done, Status). Click again to reverse.
- **Bulk-eyeing** — see what's piled up, find that thing you swore you created last week.

Click any row → TaskDetailSlideout opens (same one used everywhere else).

Get back to the dashboard via `← Today's Timeline` in the page header.

### Preset views

A row of buttons above the filter bar narrows by due-date "shape". They stack with the existing status / category / search / My / High filters.

| Preset | Shows |
|---|---|
| **Focus** *(default)* | Overdue + due today + tasks with no due date. Hides recurring future-dated tasks so the page opens to what actually needs attention. |
| **Overdue** | Past due, not yet completed or cancelled. |
| **Due today** | Due today (local Eastern). |
| **No due date** | Only tasks with no due date set. |
| **Next 7 days** | Due today through 7 days out. |
| **All** | No date filter — everything matching the other filters. |

The header count shows `N of M tasks` so you can see how the preset narrowed the list.

### Multi-select & bulk actions

Each row has a checkbox on the far left. Check 1+ rows (or use the header checkbox to select all visible) and a sticky bar slides up at the bottom with:

- **Due date** — date picker; "clear" sets due_at to NULL on every selected task.
- **Owner** — dropdown of assignable users.
- **Category** — dropdown of active task categories.
- **Status** — Open (reopen) / Completed / Cancelled.
- **Clear selection** — drops the selection without applying anything.

Each control fires immediately on change. Bulk runs in parallel per task; a partial failure (e.g., one task you can't edit) surfaces in an alert showing how many succeeded vs. failed, and the rest still apply.

Per-row complete/reopen moved to a small **✓** (or **↺** when completed) button in the right-side action area next to **Delete** — the row checkbox is reserved for bulk selection.

Selecting rows then switching presets or filtering further: the selection persists across views. You can build up a cross-cutting selection (e.g., "all my overdue + all my no-date tasks") by selecting in one preset, switching to another, and selecting more before applying a bulk action.

---

## Cross-object task surfaces

Tasks aren't trapped on the dashboard. Wherever you're looking at an object, you can see (and create) tasks for it without leaving the page.

### On every object detail page

`+ Task` button in the header. Click → quick-add popover pre-linked. Plus the page sidebar/section shows that object's open tasks in the **OpenTasksPanel** composable.

Mounted on:
- Deal detail (`/deal/:id`)
- Client detail (`/client/:id`)
- Contact detail (`/contact/:id`)
- Property detail (`/property/:id`)
- Site Submit detail (`/site-submit/:id`)
- Assignment detail (`/assignment/:id`)

### On the map

- **Property pin slideout** — TASKS tab (icon-only, last in the row; hover for label).
- **Site submit pin slideout** — TASKS tab (last in the row, only when context is `map`).
- **Property full slideout** — "Open Tasks" panel renders above the tabs row.

### Why it matters

Cross-object capture is the difference between "I'll remember to do that later" (you won't) and "task created in 3 seconds, on the right object, in the right place" (you will). Every object surface in OVIS earns its keep by letting you capture work on it without breaking flow.

---

## The TaskDetailSlideout (everywhere)

Click any task row anywhere in the app and a slideout opens with the full edit form:

- Subject, description (markdown supported).
- Category, owner (assignment), due date, duration (minutes), high-flag, ★ Pin to Top 3 today.
- **Linked to** — add/change/clear any of the six linkable types (client, deal, property, site_submit, assignment, contact).
- Completion (status + completed_at + completion note) — completed_at is editable so you can backdate.
- Delete.

Esc or click outside to close.

---

## Completion → object timeline

When you complete a task linked to an object, an entry posts to that object's timeline so the rest of the team has visibility:

- **Activity-style** (deal, client, contact, assignment) — shows as a row in the Activity tab: `✅ {your name} completed task: {subject}`.
- **Chat-style** (property, site_submit) — shows as a comment in the chat tab.

Optionally fill in a **completion note** in the slideout before completing — it appears in the timeline post.

**Private completion** — check `Private — don't post on completion` to skip the post entirely. Use sparingly.

---

## Tips & gotchas

### Capture is fast; planning is intentional

Capture aggressively (Brain Dump, quick-add from anywhere). Sort it during morning planning when your judgment is fresh.

### Don't over-pin Top 3

The whole point of Top 3 is that it stays meaningful. Three things, max. If everything's a top priority, nothing is.

### Manual rank wins inside a block

Tasks in a block render in your manual order, **not** by due date. If something's urgent, drag it to the top.

### Dates are local Eastern

Per OVIS convention, all dates are in Eastern time. A task created at 11 PM today shows as today, not tomorrow.

### Drag-and-drop browser support

Works on Chrome desktop. Mobile drag is limited; if you're on mobile, use the picker (`+ Add`) and the slideout edit form for moves.

### Calendar sync is pull-only (and that's intentional)

OVIS doesn't push back to Google. Reasons: two-way sync is hard to get right, "free" pushed blocks defeat the purpose (others book over them), and we want OVIS to be the unambiguous source of truth for blocks. If the gap becomes painful, we can add push later.

### A task can only be in one block at a time

Scheduling a task into a new block moves it from wherever it was. The picker shows "Already scheduled" if the task is in another block.

### Skipped blocks don't accept tasks

If a block is skipped (status='skipped'), it renders dimmed and you can't drop tasks into it. Unskip from the edit modal to re-enable.

### Inbox lives forever until you triage

Untriaged Inbox items stay until you do something with them. The system never auto-clears. That's by design — your Inbox is your conscience.

---

## When something goes wrong

### "I created a task but it's not showing up"

- Check `/tasks/all` with no filters → it should be there.
- If it's missing, look at owner: tasks are scoped per user. Are you logged in as the right person?
- For dashboard lanes (Top 3 / Inbox / Watching): the lanes filter by you specifically.

### "The dashboard says no time blocks for today"

- Visit `/settings/time-blocks`. Are any active templates set to run on today's weekday?
- If yes but instances aren't showing: check whether the dashboard auto-generated them on mount (refresh the page).
- If no templates exist at all, you're seeing the adaptive non-blocking layout — that's the simple "Today's Tasks" list.

### "Calendar events aren't appearing"

- `/settings/calendars` → is the connection still active? Check "Last sync" timestamp.
- Are the calendars you care about actually subscribed (toggled on)?
- Click "↻ Sync" for an immediate pull. If it errors, the connection card shows the error.
- Pre-flight: did the Google Cloud Console scope + redirect URI + Supabase secret all get set up? If not, OAuth won't have worked.

### "I can't drag tasks in this block"

- Are you in the Pipeline grouped-by-client view? Drag is disabled there. Toggle to Flat.
- Is the block skipped? Skipped blocks don't accept tasks.
- On mobile? Drag is desktop-only in v1.

### "Conflicts lane shows 0 but I have an obvious overlap"

- Is the event all-day? All-day events are excluded from conflict detection by design.
- Is the event in a calendar you didn't subscribe to? Subscribe it on `/settings/calendars`.
- Click "↻ Sync" to refresh.

---

## What's not built yet

The features above are everything live as of 2026-05-09. Coming in future phases:

- **Notifications & reminders** (Phase 4) — block-start alerts, due-today digest, calendar conflict alerts via in-app bell + batched morning email.
- **Recurring tasks** (Phase 5) — schedule-based and spawn-on-completion modes.
- **Hunter integration** (Phase 6, deferred pending architecture decision) — unify Hunter's prospecting outputs into the same task model.
- **Subtasks + projects UI** (Phase 7) — render parent/child trees and `task_project` umbrellas.
- **Polish** (Phase 8) — top-of-page quick-capture bar, refined completion routing, Brain Dump shortcuts.

If a missing feature is biting you, mention it — phase order is flexible after Phase 1.
