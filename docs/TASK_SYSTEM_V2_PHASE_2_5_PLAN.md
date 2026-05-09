# Task System v2 — Phase 2.5 Implementation Plan

**Branch:** `feat/tasks-v2-phase-2-5`
**Spec:** [TASK_SYSTEM_V2_SPEC.md](./TASK_SYSTEM_V2_SPEC.md) — §6.2, §7.3, §7.4, §8.2, §11, §15.2
**Phase 2:** [TASK_SYSTEM_V2_PHASE_2_PLAN.md](./TASK_SYSTEM_V2_PHASE_2_PLAN.md) (shipped 2026-05-09)
**Status:** 📝 Drafted 2026-05-09, not started

Phase 2.5 fills in the **planning lanes** that were deferred during Phase 2 scoping so the dashboard becomes the morning planning surface from spec §11. No new heavy infrastructure — mostly UI on top of the data we already have, plus one small schema add for the Inbox flag.

## Scope of Phase 2.5

**In scope:**
- **Top 3 today lane** (spec §6.2 #1, §11) — pin 1–3 tasks per day; surface them above the timeline. Pin / unpin from the task detail slideout.
- **Inbox lane** (spec §7.4) — newly-assigned tasks from teammates, brain-dumped tasks, and uncategorized quick-captures. Triage by setting category / scheduling into a block / pinning to Top 3 / deleting.
- **Watching lane** (spec §8.2) — uncompleted tasks the current user assigned to someone else, oldest-first. Collapsible / secondary placement.
- **Brain Dump modal** (spec §7.3) — global keyboard shortcut + button on dashboard. Full-screen textarea; each non-blank line becomes a new task in the Inbox.
- **Pipeline grouped-by-client toggle** (spec §15.2) — inside the Pipeline block on the timeline, user can flip between flat (manual rank) and grouped-by-client. Per-user persisted preference (localStorage).

**Deferred:**
- **Conflicts lane** — depends on calendar sync (Phase 3). Renders next to the other lane cards once Phase 3 ships.
- **Quick-capture bar at the top of the dashboard** (spec §11) — the existing `QuickAddTaskButton` covers per-object capture; the dashboard-level always-visible bar is a Phase 8 polish item.
- **Block-start notifications** — Phase 4.

## Work order (proposed PRs)

| # | Title | Files (representative) | Risk |
|---|---|---|---|
| 1 | Schema: `task.is_inbox` BOOLEAN + index | `supabase/migrations/2026XXXX000000_task_system_v2_inbox_flag.sql`, regen `database-schema.ts` | Low — one column, idempotent migration |
| 2 | Top 3 / Inbox / Watching lane cards above the timeline | `src/components/tasks/dashboard/{Top3Lane,InboxLane,WatchingLane}.tsx`, `TasksDashboardPage` integration, pin/unpin in `TaskDetailSlideout` | Medium — three new components, dashboard layout shift |
| 3 | Brain Dump modal + global shortcut | `src/components/tasks/BrainDumpModal.tsx`, dashboard mount + global key listener | Low |
| 4 | Pipeline grouped-by-client toggle | `BlockRow` flat ↔ grouped render, localStorage preference helper | Low — local UI change in one component |

## Schema notes (PR 1)

One column on `task`:

```sql
ALTER TABLE task ADD COLUMN IF NOT EXISTS is_inbox BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_task_inbox_owner ON task(owner_id) WHERE is_inbox = TRUE;
```

`is_inbox` is set TRUE on creation in three paths:
1. Brain Dump modal (every line becomes an inbox task).
2. Quick-add popover where the user does not pick a category (defaults are still applied to `category`, but `is_inbox=TRUE` flags it for triage).
3. Task creation where `owner_id != created_by_id` (someone is assigning to someone else — the assignee's inbox).

`is_inbox` is cleared by any of:
- Explicit "Mark triaged" action.
- Scheduling the task into a block (via `scheduleTaskInBlock`).
- Pinning to Top 3 (setting `top3_date`).
- Manually changing `category` from the slideout.

Implementation note: clearing happens at the mutation layer in `useTasks.ts` / `useTaskBlocks.ts` (a one-line update alongside the primary mutation), not via DB triggers — keeps the logic visible to JS readers.

## Behavior notes

### Top 3 lane (spec §6.2)
- Renders above the timeline as a small card with up to 3 task chips.
- Source: tasks where `top3_date = viewDate AND owner_id = me AND status IN ('open', 'in_progress')`.
- Pin from the task detail slideout: a star button toggles `top3_date` between `null` and `viewDate`.
- Soft cap at 3: if user tries to pin a 4th, show inline warning ("You already have 3 pinned for today — unpin one first?"). No hard DB constraint.
- Empty state: italic "No Top 3 set for this day yet." A pin from anywhere fills it.

### Inbox lane (spec §7.4)
- Renders above the timeline next to Top 3, with a count badge.
- Source: tasks where `is_inbox = TRUE AND owner_id = me AND status = 'open'`.
- Each row supports inline triage actions: set category, schedule into a block (mini block-picker), pin to Top 3, delete.
- Untriaged items persist across sessions (per spec — no auto-clear on time).

### Watching lane (spec §8.2)
- Collapsible card below the timeline (default: collapsed when 0 tasks, expanded when > 0).
- Source: tasks where `assigned_by_id = me AND owner_id != me AND status IN ('open', 'in_progress')`.
- Sort: oldest `created_at` first (visibility into stale delegations).
- Click into a task → opens the existing `TaskDetailSlideout`.

### Brain Dump modal (spec §7.3)
- Triggered by either:
  - Global keyboard shortcut (decision below).
  - "Brain Dump" button in the dashboard header.
- Modal layout: full-screen textarea, "Save N tasks" button.
- On save: split textarea on `\n`, trim each line, drop blanks, batch-`createTask` for each. Every created task gets `is_inbox = TRUE`, `category = 'other'` (since the schema requires non-null), `owner_id = current user`.
- After save, navigate to / scroll to the Inbox lane.

### Pipeline grouped-by-client toggle (spec §15.2)
- Toggle button visible only inside the Pipeline `BlockRow`'s task list.
- States: Flat (current behavior; sorted by manual_rank) vs Grouped (collapsible per-client sections).
- Grouping rule: roll task → `client_id` (direct), then `task → deal → client_id`, then `task → property → client_id`, then `task → site_submit → client_id`. Tasks without a client roll-up land in an "Unlinked" group at the bottom.
- Persist per user via `localStorage`. Key: `tasks-v2.pipeline-grouped-by-client`.

## Resolved decisions (placeholders — fill in before implementation)

1. **Top 3 hard cap?** Soft warning at 3, no DB constraint. Allows occasional 4th-pin when the user really means it.
2. **Brain Dump default category.** `'other'` (the schema column is NOT NULL with no nullable default for "uncategorized"). User can re-categorize during triage.
3. **Brain Dump global shortcut.** TBD — see "Open questions."
4. **Pipeline toggle persistence.** `localStorage` key `tasks-v2.pipeline-grouped-by-client`. Per browser, not synced across devices — Phase 2.5 doesn't need user-prefs infrastructure.
5. **Inbox triage actions.** Inline mini-actions on each row (set category dropdown, schedule-into-block dropdown, pin, delete). No bulk operations in v1.

## Open questions

1. **Brain Dump global keyboard shortcut.** Suggestions: `Cmd/Ctrl+Shift+B` (B for Brain), `Cmd/Ctrl+Shift+I` (I for Inbox), or skip the global shortcut and rely on the dashboard button only? My instinct: skip global shortcut in v1. Web-app global shortcuts conflict with browser/OS shortcuts and most users won't discover them. Add the button; revisit if anyone asks.
2. **Watching lane on whose dashboard?** Spec is clear: on the assigner's dashboard, not the assignee's. Calling out for confirmation since this is a reverse-of-intuition design choice.
3. **Top 3 across days?** When viewing tomorrow (Plan Tomorrow), Top 3 lane should show tomorrow's pinned tasks (`top3_date = tomorrow`). Confirms with `viewDate` already plumbed in.
4. **Inbox visibility across users.** Each user sees only their own inbox (the `owner_id = me` filter handles this). Assigned tasks land in the assignee's inbox, not the assigner's.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Dashboard becomes cluttered with 3+ lane cards above timeline | Keep cards compact; collapse Inbox / Watching when empty |
| `is_inbox` flag drifts out of sync (set TRUE but never cleared) | Clear at every mutation that implies triage (schedule, top3-pin, category change). Periodic check during testing. |
| Brain Dump bulk insert hits Supabase rate limits or partial failures | Use a single `.insert([...rows])` call (bulk insert is one round-trip, atomic). Worst case, surface the error and let user retry. |
| Pipeline grouped view has tasks that map to multiple clients (e.g. linked to both deal AND property of different clients) | Use first-non-null in the precedence chain (direct client_id → deal → property → site_submit). Document. |

## What's next (post-Phase 2.5)

Phases 3, 4, 5, 7, 8 remain. Phase 6 (Hunter migration) is intentionally deferred until after the Hunter extraction discussion.
