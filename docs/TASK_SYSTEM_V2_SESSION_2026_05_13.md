# Task System v2 — Session Status, 2026-05-13 → 2026-05-14

Continues from [TASK_SYSTEM_V2_SESSION_2026_05_10.md](TASK_SYSTEM_V2_SESSION_2026_05_10.md). At the May 10 end-of-session, 9 branches were pushed but not merged. This session merged them all to main (and then some) and shipped several follow-ups.

---

## TL;DR

- **Everything on main**: the 9-branch May 10 batch + 6 more branches shipped this session.
- **Two production bugs caught and fixed** mid-session:
  - React error #310 (hooks called after early returns in the new proportional timeline)
  - 400 on `task_block_instance` upsert (PostgREST `onConflict` needs a real UNIQUE constraint, not a partial unique index)
- **One critical pre-existing bug** discovered: `ensureInstancesForDate` was silently returning 0 templates for everyone since Phase 2 shipped, due to `smallint[]` vs `int[]` mismatch. Fixed in May 10 batch but only confirmed working today.
- **Open thread**: user feedback "I just need it displayed visibly for the time and duration on the calendar now" — awaiting screenshot to know whether this is a visual / labeling tweak or a sub-feature.

---

## What shipped this session

In chronological order on `main`:

| Commit | What |
|---|---|
| `e860d388` | Merged the May 10 batch (9 branches: SW fix, inbox rule, awaiting lane, user-defined categories, cleanup + cron, drag inbox⇆top3, capacity bar, block-instance generation fix, two-column layout) |
| `ce96235c` | Cross-context drag-and-drop — Inbox / Top 3 / time blocks all share one `DragDropContext`; draggable ids prefix-encoded (`inbox:`, `top3:`, `block:`) to keep multi-placement legal |
| `5db36bcd` | Small back-link on `/settings/time-blocks` so the user can return to the dashboard |
| `a50e2725` | Proportional Google-Calendar-style timeline — hour axis, blocks position-absolute by start time + duration, calendar event sidecar, red "now" line updating each minute, auto-scroll |
| `0e3e352b` | Fix React #310 (hoisted new hooks above early-return guards) + add UNIQUE constraint on `task_block_instance` so PostgREST upsert in `ensureInstancesForDate` works |
| `65037ad8` | Compact BlockRow in the proportional timeline + new BlockDetailModal — click any block to open the full-size view with tasks, edit, +Add picker, drag-rank |

Branches merged this session, all squashed via `--no-ff` merges so each lives as a single merge commit on main.

## What's live in prod (no PR review needed)

### Schema migrations applied via MCP
- `20260510000000_task_system_v2_triaged_at.sql` — `task.triaged_at`
- `20260510010000_task_system_v2_blocked.sql` — `task.blocked_at` + `task.blocked_reason`
- `20260510020000_task_system_v2_user_defined_categories.sql` — `task_category` table + seed + FK on `task`
- `20260510030000_task_system_v2_category_scope.sql` — global vs personal scope + case-insensitive uniqueness
- `20260510040000_task_system_v2_category_archived_at.sql` — soft-delete column
- `20260510050000_task_system_v2_calendar_sync_cron_v2.sql` — cron rescheduled to use `X-Cron-Secret`
- `20260513000000_task_system_v2_block_instance_unique_constraint.sql` — UNIQUE constraint for PostgREST upsert

### Edge Function deploy
- `gcal-sync` v3 with `verify_jwt: false` + custom dual-auth (user JWT or `X-Cron-Secret`)

### Vault secrets
- `gcal_cron_secret` — value `ad4c2ac7986c3a753cb721b593ddc689ad0fc544476029089b348f34b26c4d88`. Matched by Edge Function Secret `CRON_SECRET` which the user added manually. Cron has been firing 200 every 5 min since.

### Data changes
- May 10: 9 orphan tasks restored to Inbox; 192 stale Mike-owned overdue tasks deleted at request
- May 13: 3 task_block_instance rows manually inserted for today (Wed) because Vercel hadn't deployed the May 10 instance-generation fix yet at view time

---

## Where we left off (open thread)

User saw the proportional timeline after the compact + modal merge and said:
> "modal is fine, I just need it displayed visibly for the time and duration on the calendar now"

I asked for a screenshot to clarify whether they want:
- a visual tweak (more prominent time / duration labels inside compact blocks), or
- the deferred task sub-positioning feature (within a block, position each task row proportionally to its `duration_minutes` so the user can see *when* each task should happen)

No screenshot yet. **First action next session: get the screenshot, decide which path, ship it.**

---

## What's still deferred / open

1. **Task sub-positioning inside blocks** — within a block, render each task row at a vertical position proportional to its estimated duration. Tall blocks would visually break down into mini-slots ("8:30–9:00: Cash Flow Tool", "9:00–9:30: …"). Block detail modal would still be the surface for editing.
2. **Drop legacy `task.category` text column** — the FK has been load-bearing in prod for 3 days now without issue. Safe to drop in a follow-up migration.
3. **Calendar conflict resolution UX** (spec §9.4) — the Conflicts panel shows the count; the "shrink / move / accept overlap" actions still aren't wired.
4. **Smart time blocks** — the user's stated future direction (Motion-style AI assistance built on top of human-set block structure). Capacity-aware suggestions, "auto-schedule small tasks" button, etc.
5. **TasksPage filter dropdown** still uses a native select; consider migrating to `CategoryDropdown` for consistency with the inbox / slideout.
6. **TaskDetailSlideout slideout** still uses local refetch, doesn't propagate cross-lane until next interaction. Acceptable trade-off today.

---

## Pick-up checklist for next session

1. Open https://ovis.oculusrep.com/tasks and screenshot the current proportional timeline.
2. From the screenshot, decide whether the "displayed visibly for time + duration" request is a label tweak or task sub-positioning. Direction the user lands on determines the work.
3. Reference [docs/TASK_SYSTEM_V2_SPEC.md](TASK_SYSTEM_V2_SPEC.md) §6.11 (proportional view) and §6.10 (capacity) for design context.
4. Run the test plan at [docs/TASK_SYSTEM_V2_TESTING_2026_05_10.md](TASK_SYSTEM_V2_TESTING_2026_05_10.md) — it covers everything through PR 8 and the original PRs but doesn't yet cover the proportional timeline (PR 9) or the compact + modal (PR 10). New test items should be added when that work lands or is rejected.
5. Verify the cron is still healthy via Edge Function logs (was 200 last we checked).

---

## Reference

- **Spec**: [TASK_SYSTEM_V2_SPEC.md](TASK_SYSTEM_V2_SPEC.md) — kept in sync with everything in main. Sections that moved this session: §5.1 (categories), §6.8 (overdue), §6.9 (awaiting), §6.10 (capacity bar), §6.11 (proportional view), §7.4.1 (inbox rule), §11 (dashboard layout, drag table).
- **Testing**: [TASK_SYSTEM_V2_TESTING_2026_05_10.md](TASK_SYSTEM_V2_TESTING_2026_05_10.md) — covers PR 1–PR 8. PR 9 (proportional view) and PR 10 (compact + modal) not yet added.
- **Prior session doc**: [TASK_SYSTEM_V2_SESSION_2026_05_10.md](TASK_SYSTEM_V2_SESSION_2026_05_10.md) — where this picks up from.

---

## Notes for the AI assistant

- The proportional timeline (§6.11) is a real shift in how the dashboard feels. The user's first impression was "messy" and the compact + modal pattern was the response. Don't revert that pattern without explicit instruction — the modal is the primary surface for working with tasks in a block now.
- The block-instance generation fix has a non-obvious history: smallint[] vs int[] was the symptom that hid the missing UNIQUE constraint, which only surfaced when the filter started actually finding templates. If you see another "ensureInstancesForDate failed: 400" in the future, double-check that both fixes are still in place.
- React error #310 in this codebase is almost always early-return guards mid-component while new hooks were added below them. The fix is to hoist hooks above the guards.
