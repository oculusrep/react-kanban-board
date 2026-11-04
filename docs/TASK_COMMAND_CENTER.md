# Tasks command center (/tasks/queue)

Shipped 2026-11-02. Redesign of the Package Tracker Phase 3 queue (spec §7 in
[PACKAGE_TRACKER_SPEC.md](PACKAGE_TRACKER_SPEC.md)) into Noree's working page.

## Layout

- **Header strip:** Open tasks, Done this week (since Monday 00:00 Eastern), Waiting on Mike, Held.
  Always counts the whole queue; the filter doesn't change them.
- **Cards, not slides (2026-11-02, second pass).** Package tasks are grouped into one card per package
  (site / deal). The card shows name, city, progress bar (done of applicable, pace-coloured), gate tag (LOI
  stages, coloured by pace) and tour tag. Inside is a checklist of the owner's open slide tasks in template order
  (`deal_package_slide.position`), with the first actionable one highlighted, and that package's held slides greyed
  with the input they need. Ordinary tasks stay individual cards in the same ranked list.
- **Now:** the top 3 cards, always expanded. **Up next:** one compact row per card (rank, name, city, progress bar,
  done count, next actionable slide, tags, unread dot) that expands inline on click. A drag (grip only) ranks cards.
- **Controls (2026-11-02 polish):** an empty checkbox on each slide / task completes it (shows checked only while
  saving). Start and Chat are icon buttons with tooltips; Chat carries the unread dot. Nothing is filled dark unless
  it is actually done (a checked box, the Tour-ready tag). The tour tag reads "Tour-ready N/3" until reached.
- **Undo (2026-11-02):** a check-off shows a toast "Marked done: <slide> · <site>" with Undo for 6 seconds.
  Undo sets the task back to `open` (`sync_slide_from_task` moves a `waiting_on_mike` / `done` slide back to
  `in_progress`, not to `not_started`), re-starts it if it had been started, and saves the queue order from before
  the check-off through `set_task_queue_order` (tasks released since go after). Status and `queue_rank` writes
  have no clock triggers. Test: `supabase/tests/task_undo_clock_test.sql` (clock and court_since unchanged, no
  activity / comment / note rows, original position restored).
- **Launcher clearance:** the page has bottom and right padding so the floating Quick Note / Intel button
  and the Intel button stacked above it (together 132px up, 72px in from the corner) don't cover cards.
- **Card ranking: no migration.** A card ranks at its best-ranked task (the queue is read sorted by `queue_rank`).
  On drop, the cards are flattened back to tasks (a package's tasks together, in template order) and the full
  queue is saved through `set_task_queue_order`. A slide task released later (`queue_rank` null) joins its card
  without moving it. A brand-new package has no ranked tasks, so it starts at the end. There is no per-slide
  ranking: template order is fixed inside a card.
- **Filter:** All tasks / Package tasks only, remembered per browser. With the package filter on, a drag moves
  package cards among the slots they already hold, so hidden cards keep their positions.
- **Rail:** Waiting on Mike (her slides with `status = 'waiting_on_mike'`, set by `sync_slide_from_task` when she
  checks off an approve / finish slide) and Held (collapsed, grouped by missing input).
- **Ordinary task card:** site / deal name, slide (or task subject), city, owner, a tag, checkbox, Start and Chat icons.
  Tag: due / due today / overdue.
- Names and cities come from one batched `site_submit` / `deal` read after the lanes render. `site_submit` RLS
  scans the whole table on every query, so never read it per card.

## Tour filter, Pause package, fully-held cards (2026-11-03)

Migration `20261103144723_package_pause_and_held_rank.sql`; test `supabase/tests/package_pause_test.sql`
(run wrapped in BEGIN/ROLLBACK — see its header). Neither feature touches the board clock.

**Tour filter.** A dropdown beside All / Package-only, same tours and order as
/reports/starbucks-packages (`fetchTourOptions`), stored in the URL as `?tour=`. Shows only
package cards whose site (else deal) is a stop on that tour, in queue order, each labelled
with its stop ("D1·3"). Dragging in a filtered view only swaps the slots the shown cards
already hold, so hidden cards don't move.

**Pause.** "Pause" on a package card, in the deal sidebar package section, and Resume on
/reports/starbucks-packages (Pace column badge "Paused" / "Paused · <stage>").
- `pause_package(id)`: the package's open / in-progress tasks go to task status **`paused`**
  (`task.paused_prior_status` keeps which; `queue_rank` untouched). Every queue reads
  `status IN ('open','in_progress')`, so they vanish everywhere without per-page filters.
- `release_package_tasks` returns 0 while paused — nothing is released.
- `v_deal_package_progress.behind_since` is NULL while paused; `paceOf` / `isStale` also
  return no flag when `paused_at` is set.
- `resume_package(id)`: tasks back to their prior status at their old rank (a slide
  finished meanwhile → its task completes), then releases anything now due.
- Guard trigger `task_hold_while_package_paused`: any write that would make a paused
  package's task open / in progress (e.g. a slide reopened done → in progress, /tasks
  "Reopen") parks it as `paused` instead. Completing / cancelling a paused task by hand is allowed.
- Auto-pause: site_submit → Pass / Lost / Killed / Use Declined / Not Available, or deal
  → Lost (reason `stage: <name>`). Never auto-resumes.
- `task.status` readers audited 2026-11-03: all queues, lanes and counts read
  open / in_progress (or open) only; no view, cron job or edge function reads it. /tasks
  shows "Paused (package)" as a status filter and label and never counts it as overdue.

**Fully-held cards.** A package whose slides for this owner are all held still gets a
card in the queue: dashed and greyed, rankable, chat works, "Waiting on: Market Research /
Site Story". Its rank lives in `package_queue_rank (owner_id, package_id)`. The queue
order saves through `set_queue_order(owner, items)` with `t:<task>` / `p:<package>` items
(position n → rank n×1000); a package's next released task starts at its card's rank.
Held slides of paused packages are left out of the queue and the Held rail.
Known gap: a package that has never been dragged has no card rank, so when its last open
task is done and only held slides remain, its card sorts to the bottom until moved.

## Package chat (2026-11-03)

Package slide tasks no longer have per-task chat. Each package has **one thread** (`package_comment`,
migration `20261102125716`), each message tagged to one of the package's slides or "General" (`slide_id` null).

- **Card chat icon** opens the whole thread; every message shows its slide label or "General". The composer's
  "About" picker defaults to General and lists all the package's slides (every owner, so Mike's too).
- **Slide row chat icon** (task rows and held rows, no task needed) opens the same thread filtered to that slide,
  with the composer pre-tagged. The panel's "Show" picker switches between the whole thread and any slide.
- **Unread:** `package_comment_read` per user per package. `slide_id` null = read the whole thread; a slide row =
  read that slide's filtered view (so opening one slide doesn't clear another's dot). A message from someone else is
  unread when it is newer than the whole-thread marker and, if tagged, newer than its slide's marker. The card's chat
  icon carries a dot if anything in the package is unread; each slide row's icon carries one for that slide.
- **Same rules as task chat:** no triggers, no deal / site columns, internal users only, portal and anon denied
  (verified over HTTP with the publishable key: 42501). A composite FK keeps a tag inside its own package.
- **Migration of old rows:** task_comment rows on package tasks (4 at apply time) and their read markers (5) were
  copied with their slide tag, same id. The originals remain in `task_comment`; the page no longer reads them.
- Test: `supabase/tests/package_comment_test.sql` (copied rows intact, clock / court_since unchanged, control
  comment moves the clock, no deal / property chat rows, spoofing and cross-package tags denied, portal / anon denied).

## Task chat (ordinary tasks)

One thread per task, opened in a side panel (`TaskChatPanel`, takes a task id, so it works in any slideout).
Chat stays per slide task, opened from the checklist row; the package card shows a dot if any slide has an unread message. Mike and Noree post. Each message shows who and when (Eastern). Chat shows a dot when there's a message from
someone else newer than your last read.

Storage: `task_comment` and `task_comment_read` (migration `20261102084217`).

- **Separate tables on purpose.** An insert into `site_submit_comment`, `activity` or `note_object_link` calls
  `reset_board_clock()`, and `site_submit_comment` is read by the client portal. The task-chat tables have no
  triggers and no deal / site columns. Never route task chat through those three tables.
- RLS: any internal user reads every thread; you post only as yourself; read markers are your own.
  Portal users and anon get nothing (grants revoke anon; policies require `is_internal_user()`).
- Realtime: `task_comment` is in `supabase_realtime`. The panel listens per task and the page listens for unread dots.
- Version 1 has no edit or delete of messages.

Test: `supabase/tests/task_comment_clock_test.sql`. It posts as Mike and Noree, then checks that
`ball_in_court_since` and `court_since` are unchanged and that no deal / property chat or activity rows were added.
A control `site_submit_comment` does move the clock. Portal and anon are denied. Run it wrapped in
`BEGIN; … ROLLBACK;` (instructions are in the file header).
