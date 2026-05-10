# Task System v2 — Testing Script: 3-PR stack (2026-05-10)

Tests for the three branches stacked this session:

1. `fix/tasks-dashboard-save-and-width` (PR 1) — bug fixes + custom category dropdown
2. `feat/tasks-v2-inbox-rule-and-overdue` (PR 2) — revised inbox rule, Overdue lane, Quick Capture, due dates
3. `feat/tasks-v2-awaiting-lane` (PR 3) — Awaiting / blocked lane

Run tests in order. Each one is independent enough that a failure on test N doesn't have to block test N+1, but order is suggested because some build context for the next.

---

## Setup — do these once before testing

- [ ] **S1.** All three PRs merged to main.
- [ ] **S2.** Vercel deploy completed (check the deployments tab).
- [ ] **S3.** Open ovis.oculusrep.com/tasks in Chrome. Open DevTools → Application → Service Workers → click **Unregister** on the OVIS SW. Then hard reload (Cmd+Shift+R).
- [ ] **S4.** DevTools → Console is open and visible for the rest of the session — you'll watch it for errors.

---

## PR 1 — Bug fixes + dropdown UX

- [ ] **1.1** Page loads. The Today's Timeline / Tasks dashboard appears with all lanes. **No `ERR_INSUFFICIENT_RESOURCES` errors in console.**
- [ ] **1.2** **Width**: dashboard spans the full viewport (no big empty margins on the sides).
- [ ] **1.3** **No infinite refetch loop**: open Network tab → filter for `/rest/v1/task`. After initial load, you should see ~one request per lane (Overdue, Top 3, Inbox, Awaiting if visible, Watching if visible). NOT a continuous stream of requests.
- [ ] **1.4** **Top 3 lane**: shows "0 / 3" or pinned tasks — does NOT stay stuck on "Loading…".
- [ ] **1.5** **Brain Dump save speed**: click 🧠 Brain Dump, type 5 lines, click Save. Should complete instantly. Modal closes, tasks appear in Inbox.
- [ ] **1.6** **Category dropdown style**: on any Inbox row, click the "Category…" pill. A custom dropdown menu appears with colored chips for each category (NOT the native browser select). Click outside or press Escape to close.
- [ ] **1.7** **Category dropdown apply**: click a category in the dropdown menu. The pill updates to show that category. (Under the new rule from PR 2, the task should STAY in Inbox — we test that explicitly in 2.1.)

---

## PR 2 — Inbox rule, Overdue, due dates, Quick Capture

### Inbox-exit rule (the big behavior change)

- [ ] **2.1** **Category alone keeps task in inbox**. From the Inbox, set a category on a task. The task stays in Inbox (it does NOT disappear). Pill now shows the chosen category.
- [ ] **2.2** **Pin to Top 3 removes from Inbox**. Click ★ on an Inbox row. Task disappears from Inbox AND appears in Top 3 lane immediately (no manual refresh).
- [ ] **2.3** **Unpin from Top 3 returns to Inbox**. From Top 3, click ✕ Unpin on the task you just pinned. Task disappears from Top 3 AND re-appears in Inbox. (This is the orphan-fix.)
- [ ] **2.4** **Mark Triaged is sticky**. From Inbox, click ✓ on a task. It leaves Inbox. Then pin it to Top 3, then unpin. It should NOT come back to Inbox (because triaged_at was set). It's now in `/tasks/all` only.

### Quick Capture

- [ ] **2.5** **Quick Capture bar**: at the top of the dashboard there's a single-line input that says "Quick capture: type a task and press Enter…". Type "Test from quick capture" + Enter. Task appears in Inbox. Input clears. No modal opened.
- [ ] **2.6** **Quick Capture won't double-fire**: rapidly hit Enter twice while saving. Only one task is created (button disabled while saving).

### Due dates + Overdue

- [ ] **2.7** **Inline due-date input**: each Inbox row has a small date picker next to the category pill. Click it, set a date in the past (e.g., yesterday). Border + text turn terracotta (warning brown).
- [ ] **2.8** **Overdue lane appears**: the task you just gave a past due date should appear in the Overdue lane (top row, far left). Counter shows correct number.
- [ ] **2.9** **Overdue lane shows nothing-overdue state**: clear the due date on that task (use the date picker → erase the date). Overdue lane shows "Nothing overdue. Nice."
- [ ] **2.10** **Overdue persists across lanes**: set a past due date on a task. It should appear in Overdue AND still be in Inbox (or wherever else it lives). Same task in multiple lanes is intentional.

### Cross-lane refresh

- [ ] **2.11** **Star → Top 3 live updates**. In Inbox, click ★. Top 3 lane updates within ~1 second without a page refresh.
- [ ] **2.12** **Complete from Overdue → disappears everywhere**. From Overdue, click ✓ Complete. Task disappears from Overdue AND from Inbox if it was also there.

---

## PR 3 — Awaiting lane

- [ ] **3.1** **⏸ button on Inbox rows**: each Inbox row now has a ⏸ button next to ✓. Hover shows tooltip "Awaiting (waiting on someone external)".
- [ ] **3.2** **Block flow**: click ⏸. A browser prompt asks "What are you waiting on?". Type "Waiting on Sarah for survey signature" + OK. Task disappears from Inbox.
- [ ] **3.3** **Awaiting lane appears**: a new "▾ AWAITING" lane appears below the timeline (alongside Watching). Shows count and your blocked task with the reason and "blocked today".
- [ ] **3.4** **Awaiting lane is hidden when empty**: ▶ Unblock the task you just blocked. Task returns to Inbox. Awaiting lane disappears entirely (no empty panel).
- [ ] **3.5** **Cancel block leaves task alone**: click ⏸ on a task, then click Cancel on the prompt. Task stays in Inbox unchanged.
- [ ] **3.6** **Empty reason leaves task alone**: click ⏸, type only spaces or nothing, hit OK. Task stays in Inbox unchanged (no blocked stamp).
- [ ] **3.7** **Awaiting collapse/expand**: click the ▾ toggle on the Awaiting header. Lane collapses to just the header. Click again to expand.
- [ ] **3.8** **Block + Top 3 coexist**: pin a task to Top 3, then block it. Task appears in BOTH Top 3 (still pinned) AND Awaiting (parked). Unblock returns it to Top 3 (it's still pinned), NOT to Inbox (because it has a Top 3 placement).
- [ ] **3.9** **Block clears category-only inbox state**: with a task in Inbox that has a category set, click ⏸. Task leaves Inbox to Awaiting. Unblock returns it to Inbox (category preserved).

---

## PR 5 — Drag-and-drop between Inbox and Top 3

- [ ] **5.1** Each Inbox row has a `⠿` handle on the left.
- [ ] **5.2** Each Top 3 row has a `⠿` handle on the left.
- [ ] **5.3** Drag an Inbox card onto the Top 3 panel → drop zone highlights amber. Release → task moves to Top 3 AND leaves Inbox.
- [ ] **5.4** Drag a Top 3 card onto the Inbox panel → drop zone highlights slate. Release → task returns to Inbox AND leaves Top 3.
- [ ] **5.5** Drag a Top 3 card that was previously ✓ Mark Triaged into the Inbox → it does NOT come back to inbox (`triaged_at` is sticky), but it does leave Top 3.
- [ ] **5.6** Click the `⠿` handle (without dragging) → does NOT open the slideout.
- [ ] **5.7** Click anywhere else on the row → opens the slideout.
- [ ] **5.8** Drag within the same lane (no destination change) → no-op, no DB write.
- [ ] **5.9** Existing in-block drag-reorder still works in Today's Timeline (separate DragDropContext).

## PR 6 — TasksPage filter parity

- [ ] **6.1** Open `/tasks/all` → category filter dropdown shows the 6 seeded categories AND any user-defined ones (global + your personals).
- [ ] **6.2** Pick a custom category from the filter → table shows only tasks with that category.

## PR 7 — gcal-sync cron 401 fix

- [ ] **7.1** **Required first**: in Supabase dashboard → Edge Function Secrets, add `CRON_SECRET` = the value generated this session (provided in chat).
- [ ] **7.2** Wait 5 minutes for the next cron tick. In Supabase Logs → Edge Functions, confirm `gcal-sync` returns 200 (not 401).
- [ ] **7.3** Click "↻ Sync" on the dashboard → succeeds (user JWT path still works).

---

## Ad-hoc / regression

- [ ] **4.1** **All Tasks page still works**: click "All tasks →" in the dashboard header. Page loads, table shows tasks, filters work.
- [ ] **4.2** **Slideout still works**: click a task subject in any lane. Slideout opens on the right. Make a change in the slideout. Slideout stays open. Lane it came from updates.
- [ ] **4.3** **No console errors during normal use**: spend a minute clicking around — opening slideouts, changing categories, setting dates. Console should be quiet (no red errors).

---

## How to give feedback

For each test, mark with one of:
- ✅ pass
- ❌ fail — describe what happened
- ⚠️ pass but weird — describe the weirdness

Format: `Test 2.3: ❌ unpinning didn't restore to inbox, task vanished completely`
