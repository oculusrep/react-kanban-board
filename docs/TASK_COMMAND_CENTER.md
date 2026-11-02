# Tasks command center (/tasks/queue)

Shipped 2026-11-02. Redesign of the Package Tracker Phase 3 queue (spec §7 in
[PACKAGE_TRACKER_SPEC.md](PACKAGE_TRACKER_SPEC.md)) into Noree's working page.

## Layout

- **Header strip:** Open tasks, Done this week (since Monday 00:00 Eastern), Waiting on Mike, Held.
  Always counts the whole queue; the filter doesn't change them.
- **Now:** the top 3 queued tasks as large cards. **Up next:** the rest as compact cards with large drag handles.
  The two lanes are one list split after 3, so a drag within or between them is a reorder saved through
  `set_task_queue_order` (always sent as the full queue).
- **Filter:** All tasks / Package tasks only, remembered per browser. With the package filter on, a drag moves
  the package tasks among the slots they already hold, so hidden tasks keep their positions.
- **Rail:** Waiting on Mike (her slides with `status = 'waiting_on_mike'`, set by `sync_slide_from_task` when she
  checks off an approve / finish slide) and Held (collapsed, grouped by missing input).
- **Card:** site / deal name, slide (or task subject), city, owner, a tag, an unread dot on Chat, Done and Start.
  - Package tasks: `Gate N` from the slide's `done_by_gate`, with the package's pace from `paceOf`:
    late = solid terracotta, behind = terracotta outline, unknown = dashed.
  - Other tasks: due / due today / overdue.
- Names and cities come from one batched `site_submit` / `deal` read after the lanes render. `site_submit` RLS
  scans the whole table on every query, so never read it per card.

## Task chat

One thread per task, opened in a side panel (`TaskChatPanel`, takes a task id, so it works in any slideout).
Mike and Noree post. Each message shows who and when (Eastern). Chat shows a dot when there's a message from
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
