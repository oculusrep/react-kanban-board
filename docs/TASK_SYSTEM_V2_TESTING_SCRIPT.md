# Task System v2 — Production Testing Script

**Covers:** Phases 1, 2, 2.5, and 3 (everything shipped to main as of 2026-05-09)
**Audience:** Mike (and anyone testing the rollout)
**Status:** Active — strike sections through as you go

This script walks every user-visible feature in the order they were built. Time estimate: ~30–45 minutes if everything works; longer if you're triaging bugs.

---

## 0. Pre-flight (one-time setup)

These three steps are required before Calendar OAuth (Phase 3) works. Tasks/Blocks/Lanes work without these.

- [ ] **Google Cloud Console → OAuth consent screen** → add scope `https://www.googleapis.com/auth/calendar.readonly` to the existing Gmail OAuth client. Save and re-publish if needed.
- [ ] **Same OAuth client → Authorized redirect URIs** → add `https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/gcal-callback`. Save.
- [ ] **Supabase Dashboard → Edge Functions → Secrets** → add `GOOGLE_CALENDAR_REDIRECT_URI` set to the URL above.

After these are in place, re-deploy isn't necessary — the edge functions read the secret at request time.

---

## 1. Phase 1 — Task basics + object-page integrations

### 1.1 All-tasks list at `/tasks/all`

- [ ] Visit `/tasks/all`. Title says "All Tasks" with a `← Today's Timeline` link in the header.
- [ ] Filters bar (search, status, category, My tasks, High only) all change the list.
- [ ] Click a column header (Subject / Category / Owner / Due / Done / Status) → sort indicator appears (▲/▼). Click again → toggles direction.
- [ ] Dates display as `MM/DD/YYYY` and don't wrap.
- [ ] Click a row → TaskDetailSlideout opens. Edit a field, save, close → list reflects the change.

### 1.2 Quick-add from object pages

For each object type, navigate to a detail page and confirm the `+ Task` button works:
- [ ] Deal detail page (`/deal/:id`) → header has `+ Task`. Click → popover opens with the deal pre-linked. Type a subject, hit Enter. Task created.
- [ ] Client detail page → same.
- [ ] Contact detail page → same; default category is `prospecting`.
- [ ] Property detail page → same.
- [ ] Site_submit detail page → same.
- [ ] Assignment detail page → same.

### 1.3 OpenTasksPanel on every object surface

The composable panel showing the object's open tasks should appear on:
- [ ] Each of the six detail pages above (sidebar/section).
- [ ] **Property pin slideout on the map** (`/mapping`): click a property pin → click the **TASKS** tab (icon-only, last tab; should also have CONTACTS and FILES as icon-only — hover shows label tooltips).
- [ ] **Site submit pin slideout on the map**: click a site_submit pin → **TASKS** tab on the right.
- [ ] **Property full slideout** (`PropertyDetailsSlideoutContent`): the "Open Tasks" panel renders **above** the tabs row.

For each surface: completing a task from the panel removes it from the open list.

### 1.4 Completion → object timeline post

- [ ] Create a task linked to a **deal** → complete it → check the deal's Activity tab → entry "✅ {your name} completed task: {subject}" appears.
- [ ] Same for a **client** and a **contact** task.
- [ ] Create a task linked to a **property** → complete it → check the property's chat-style timeline (the chat tab on `/property/:id`) → entry appears (this is the bugfix from `ae75a42a` — uses auth_user_id).
- [ ] Create a task linked to a **site_submit** → complete it → check the site_submit's CHAT tab → entry appears (this is the bugfix that switched to writing into `site_submit_comment`).

---

## 2. Phase 2 — Time blocks

### 2.1 Block template management

- [ ] Visit `/settings/time-blocks`. First time: blank list, "+ New template" button visible.
- [ ] Click "+ New template" → fill in a template (e.g. "Prospecting", category Prospecting, Mon–Fri toggled, 9:00 AM, 120 min).
- [ ] Save → row appears in "Active" section with schedule summary `"prospecting · Mon–Fri · 9:00 AM – 11:00 AM (2 hr)"`.
- [ ] Click "Deactivate" on the row → it moves to "Inactive" section.
- [ ] Click "Activate" → it moves back.
- [ ] Click "Edit" → form pre-fills with current values; change name, save → row updates.
- [ ] Click "Delete" → confirm; row disappears.

Create at least 2–3 templates that match today's weekday so the dashboard has content.

### 2.2 Today's Timeline

- [ ] Visit `/tasks` → header "Today's Timeline · {date}". Blocks for today render chronologically.
- [ ] If you're inside a block's time window, that block is highlighted blue with a "CURRENT" badge.
- [ ] Past-time empty blocks render dimmed.
- [ ] Each block shows time range, name, category badge, "0 tasks" count.
- [ ] Click `+ Ad-hoc block` button at top → form opens. Create one (name "Site visit prep", category Pipeline, 2:00 PM, 60 min) → it appears in the timeline.
- [ ] Click `✎` on an ad-hoc block → modal has Skip/Delete options. For a templated block → modal has "Apply to: This day only / All future days" radio.
- [ ] Edit a block instance with "This day only" → today's block changes; the template's other days don't.
- [ ] Edit a templated block with "All future days" → template updates; today's instance unchanged.
- [ ] "Skip this day" on a block → block renders line-through, dimmed.

### 2.3 Plan Tomorrow

- [ ] Click `Plan Tomorrow →` → header changes to "Tomorrow's Plan · {tomorrow's date}". Tomorrow's blocks materialize automatically.
- [ ] Click `← Today` → returns to today.

### 2.4 Schedule tasks into blocks

- [ ] Click `+ Add` on a block → picker popover opens with your open tasks.
- [ ] Pick a task → it appears in the block's task list.
- [ ] Drag the task to a different block → it moves.
- [ ] Drag to reorder within a block → rank persists (refresh and verify order is preserved).
- [ ] Click the `×` on a task in a block → removed from the block (the task itself is not deleted; appears unscheduled in `/tasks/all`).
- [ ] Pick a task that's already scheduled in another block → it moves to the new block (the unique-on-task_id constraint enforces single-block placement).

### 2.5 Adaptive non-blocking layout

- [ ] On `/settings/time-blocks`, deactivate all your templates.
- [ ] Visit `/tasks` → with no instances and no active templates, the dashboard shows "Today's Tasks" simple list with a dismissible "Set up time blocks" CTA at top.
- [ ] Dismiss the CTA → it doesn't reappear on reload (per-browser localStorage).
- [ ] Re-activate a template → simple list disappears, timeline returns.

---

## 3. Phase 2.5 — Planning lanes

The dashboard now has a 3-column row above the timeline: **Top 3 / Inbox / Conflicts**, plus **Watching** below.

### 3.1 Top 3 today

- [ ] Open any task in TaskDetailSlideout → check `★ Pin to Top 3 today`.
- [ ] Save → the Top 3 lane on `/tasks` shows the pinned task.
- [ ] Top 3 shows `N / 3` count.
- [ ] Click the ★ on a row in the Top 3 lane → unpins it.
- [ ] When viewing tomorrow (Plan Tomorrow), Top 3 shows tomorrow's pins (if any), not today's.

### 3.2 Inbox lane

The Inbox auto-fills from three sources:
- [ ] **Brain Dump** — click 🧠 Brain Dump in dashboard header → modal opens. Type 3 lines → click "Save 3" → modal closes, Inbox lane shows 3 new rows with category `other` and "today" age.
- [ ] **Cross-user assignment** — open a task, change Owner to someone else, save → that task lands in **their** inbox (you can't see it; they should).
- [ ] Each Inbox row has inline triage actions: Category dropdown, Schedule dropdown (showing today's blocks), ★ Pin to Top 3, ✓ Mark triaged, × Delete.
- [ ] Pick a category → row leaves the Inbox.
- [ ] Pick a schedule (block) → row leaves the Inbox AND appears in the chosen block on the timeline.
- [ ] Click ★ → row leaves the Inbox AND appears in Top 3.
- [ ] Click ✓ → row leaves the Inbox without other changes (just clears the flag).

### 3.3 Watching lane

- [ ] Assign a task to another user (change Owner). The task should land in **their** Inbox AND in **your** Watching lane below the timeline.
- [ ] Watching lane is collapsible; auto-hides when 0 delegated tasks.
- [ ] Sorts oldest-first. Each row shows assignee initials + age in days.

### 3.4 Pipeline grouped-by-client toggle

- [ ] Schedule a few tasks linked to different clients into a block whose category is `pipeline`.
- [ ] In that block's header, click `⊟ Flat` → toggles to `⊞ Grouped`.
- [ ] Grouped view shows tasks grouped by client name, with collapsible per-client sections. Tasks without a client roll up under "Unlinked".
- [ ] Drag-and-drop is disabled in Grouped view (toggle back to Flat to reorder).
- [ ] Refresh → preference persists (per-browser localStorage).

---

## 4. Phase 3 — Calendar sync

**Requires the pre-flight steps in §0.**

### 4.1 Connect

- [ ] Visit `/settings/calendars`. Page shows "No Google Calendar connected".
- [ ] Click "Connect Google Calendar" → redirects to Google's consent screen.
- [ ] Approve → redirects back to `/settings/calendars?status=success&email=…` → success banner shows.
- [ ] Connection card shows your Google email + "Last sync: never".
- [ ] Calendar list loads showing all your Google calendars (primary + any others).

### 4.2 Subscribe to calendars

- [ ] Toggle Subscribe on at least your primary calendar.
- [ ] Click "↻ Sync now" → button shows "Syncing…" briefly → success banner.
- [ ] Connection card now shows a recent timestamp for "Last sync".
- [ ] Toggle Subscribe on a second calendar (if you have one) → click Sync now → events from both should pull.

### 4.3 Verify events on the dashboard

- [ ] Visit `/tasks`. The timeline now interleaves your blocks with calendar events.
- [ ] Each event renders as a greyer slot with `⛔` icon, time range, "calendar" tag, and event title.
- [ ] Click an event → opens the event in Google Calendar in a new tab.
- [ ] All-day events render as a small banner above the timeline (not interleaved).

### 4.4 Conflicts lane

- [ ] In Google Calendar, schedule a meeting that overlaps one of your blocks (e.g. 9:30 AM – 10:00 AM if you have a 9–11 AM Prospecting block).
- [ ] Click "↻ Sync" on the dashboard.
- [ ] Conflicts lane on the dashboard now shows "1" with the entry "{block name} ↔ {event title}" + "Open in Google →" link.
- [ ] Cancel the meeting in Google → click Sync → Conflicts lane returns to "0".

### 4.5 Cron-driven sync

- [ ] Schedule a meeting in Google. **Don't** click Sync.
- [ ] Wait 5 minutes.
- [ ] Reload `/tasks`. The new meeting appears on the timeline (the cron tick pulled it).

### 4.6 Disconnect

- [ ] On `/settings/calendars`, click "Disconnect" → confirm → connection card returns to the unconnected state.
- [ ] Pulled events stay in the DB but stop refreshing. Re-connecting picks back up.

---

## 5. Cross-cutting smoke checks

- [ ] No dev-server console errors during normal navigation.
- [ ] Dates everywhere render in local Eastern time, not UTC. (Test: schedule a task for late evening; the date should not jump to "tomorrow".)
- [ ] Task completion timeline posts work for each linkable object type.
- [ ] After completing a task that was in a block, the block's task count decreases.
- [ ] Drag-and-drop works on Chrome desktop. (Mobile: known limited; not in v1 scope.)

---

## 6. What to flag if you see it

| Symptom | Likely area |
|---|---|
| OAuth fails on Google's side | Pre-flight §0 step missing or scope misconfigured |
| Events don't appear after Sync now | gcal-sync error in Supabase Edge Functions logs; check `google_calendar_connection.sync_error` |
| Cron not running | `cron.job` table — confirm `gcal-sync-tick` row exists; check `cron.job_run_details` |
| Conflicts lane shows 0 despite a known overlap | Event might be all-day (excluded by design) or in a calendar you didn't subscribe to |
| Inbox doesn't drain when you triage | Check that the mutation completed — `task.is_inbox` should flip to false; mutation layer in `useTasks.ts` and `useTaskBlocks.ts` clears it |
| Drag-and-drop in a block does nothing | Inside the **Pipeline grouped** view, drag is disabled by design — toggle to Flat |
| Brain Dump tasks don't show in Inbox | Refresh the page; Inbox key-remounts on save but the list might lag a frame |

For anything weird, capture: what page, what action, what you saw vs. expected, browser console output. File an issue or DM me.

---

## 7. After-test checklist

- [ ] Connected calendar in production
- [ ] Verified at least one full Phase 3 cycle (connect → subscribe → sync → see event → resolve conflict → disconnect)
- [ ] Confirmed Phase 2.5 lanes populate from real activity (not just test data)
- [ ] Noted any bugs in the bug list

When this script passes end to end, we can resume with Phase 5 (recurring tasks), Phase 7 (subtasks/projects UI), or Phase 4 (notifications) — your call on order.
