# Task System v2 — Phase 1 Implementation Plan

**Branch:** `feat/task-system-v2`
**Spec:** [TASK_SYSTEM_V2_SPEC.md](./TASK_SYSTEM_V2_SPEC.md)
**Overlay UX principle:** [OVIS_OVERLAY_UX.md](./OVIS_OVERLAY_UX.md)
**Status:** ✅ Complete (2026-05-02)

Phase 1 covered: **schema + core CRUD + object linking + quick-capture popover + all-tasks view + v1 cutover**. This doc tracks the eight PRs and the bonus work that emerged during the build.

## Scope of Phase 1

**In scope:**
- `task` and `task_project` tables only
- Indexes, RLS, updated_at triggers
- TypeScript types regenerated from new schema
- Task CRUD service/hook (create, read, update, complete, delete)
- Object linking (FKs working in queries)
- `+ Task` quick-capture popover, mounted on every relevant object detail header
- New `/tasks` page (replaces v1 TaskDashboardPage) — flat all-tasks view per spec §15.3
- One-time backfill of open `activity`-table tasks → `task` rows (per spec §17)
- Feature flag `enableTaskSystemV2` for revertible cutover
- Cutover: route flip + delete v1 code

**Deferred to later phases (own migrations):**
- `task_block_template`, `task_block_instance`, `task_block_scheduled_task` → Phase 2
- `task_recurrence_rule` + `task.recurrence_rule_id` column → Phase 5
- `task_outreach_draft` → Phase 6 (Hunter migration)
- The dashboard with timeline/Top-3/Inbox/Watching lanes → Phase 2
- Notifications → Phase 4

This avoids dead tables sitting empty until later phases use them.

## Work order (proposed PRs)

Each row is one logical commit/PR. Most can be reviewed independently. The cutover (PR 7) is the only one that's irreversible-in-effect (v1 code deleted from working tree, recoverable from git history).

| # | Title | Files | Risk |
|---|---|---|---|
| 1 | Schema migration: `task` + `task_project` + RLS | `supabase/migrations/20260501000000_task_system_v2_schema_phase1.sql` | Medium — DB change, needs review before applying |
| 2 | Regenerate `database-schema.ts` types | `database-schema.ts` (auto-generated) | Low — generated file |
| 3 | Domain types + CRUD hook | `src/types/task.ts`, `src/hooks/useTasks.ts` | Low |
| 4 | Quick-capture popover component | `src/components/tasks/QuickAddTaskPopover.tsx` | Low (new file) |
| 5 | `+ Task` button mounted on all object detail headers | Six edits to existing detail page headers | Low (additive) |
| 6 | New all-tasks page (flat list per spec §15.3) | `src/pages/TasksPage.tsx`, route binding | Medium |
| 7 | Migration script: backfill open v1 tasks → `task` table | `supabase/migrations/20260501010000_task_system_v2_backfill_v1.sql` | Medium — touches data |
| 8 | Feature flag + cutover | `src/lib/featureFlags.ts` (or similar), `src/App.tsx` route, delete `TaskDashboardPage.tsx` and v1 docs | Medium — code deletion |

## Status — all done

### The eight planned PRs

| # | Title | Status | Commit |
|---|---|---|---|
| 1 | Schema migration: `task` + `task_project` + RLS | ✅ Applied | `ee175c3b` |
| 2 | Regenerate `database-schema.ts` | ✅ | `8b71f7e7` |
| 3 | Domain types + CRUD hook | ✅ `src/types/task.ts`, `src/hooks/useTasks.ts` | `8b71f7e7` |
| 4 | Quick-capture popover | ✅ `QuickAddTaskPopover.tsx` + `QuickAddTaskButton.tsx` | `689507ae` |
| 5 | `+ Task` buttons on six object headers | ✅ DealHeaderBar, ClientDetailsPage, ContactDetailsPage, PropertyHeader, SiteSubmitDetailsPage, AssignmentHeaderBar | `c14fe5d9` + `24bdd685` |
| 6 | New all-tasks page | ✅ `src/pages/TasksPage.tsx` | `4374f212` |
| 7 | Backfill | ✅ 253 v1 tasks migrated — 99 prospecting / 54 pipeline / 100 other | `abbd743e` |
| 8 | Cutover | ✅ `/tasks` serves TasksPage; v1 page + 2 docs deleted; preview route retired | `509f4eb9` |

### Bonus composables built during Phase 1 (per [OVIS_OVERLAY_UX.md](./OVIS_OVERLAY_UX.md))

| Component | Path | What it does |
|---|---|---|
| `OpenTasksPanel` | `src/components/tasks/OpenTasksPanel.tsx` | Drop-in panel showing open tasks for any object (takes `objectType` + `objectId`). Mounted on all six object surfaces. |
| `TaskDetailSlideout` | `src/components/tasks/TaskDetailSlideout.tsx` | Click any task row → slideout opens, full edit (subject, description, category, owner, due, duration, links, completion). Backdrop close + Esc. |
| `TaskLinksEditor` | `src/components/tasks/TaskLinksEditor.tsx` | Add / change / clear any of the six linkable types from inside the slideout. Per-type debounced ilike search. |
| `QuickAddTaskButton` | `src/components/tasks/QuickAddTaskButton.tsx` | Wrapper that combines trigger button + popover. One-line mount on object pages. |

### Other behaviors delivered beyond the original spec text

- **Editable `completed_at`** with backdating support (datetime-local; works pre- and post-completion).
- **Completion timeline post (spec §13)** — writes to `activity` for deal/client/contact/assignment, `property_activity` and `site_submit_activity` for the chat-style timelines. Migration `20260502000000` widened the activity_type CHECK constraints to include `task_completed`.
- **Assignee filter on dropdown** — only `broker_full` / `va` / `admin` roles appear (excludes coach).
- **Two-tier overlay UX principle** documented in `docs/OVIS_OVERLAY_UX.md` and `CLAUDE.md`. Future task-system work inherits this rule.

## Decisions / open questions

- **Migration application authorization**: Mike must approve before any migration is applied to the live Supabase project. Drafted SQL files land in `supabase/migrations/` but are inert until `supabase db push` (or equivalent) runs.
- **Feature flag implementation**: simplest is a constant in code, flipped at cutover commit. No need for runtime config in v1 — three users, single deploy target.
- **Pagination on all-tasks view**: per project guidelines (CLAUDE.md), tables expected to grow past 1000 rows must paginate. Tasks will likely cross 1000 within months. PR 6 must implement `.range()` pagination from day one.

## Schema notes (PR 1)

The migration creates two tables and follows OVIS conventions:

- `task`:
  - PK: `id` (uuid, gen_random_uuid())
  - Required: `subject`, `owner_id` (FK `"user"`), `category` (text + CHECK), `status` (text + CHECK)
  - Object link FKs (all nullable): `client_id`, `deal_id`, `property_id`, `site_submit_id`, `assignment_id`, `contact_id`
  - Other: `parent_task_id` (self-FK), `project_id`, `assigned_by_id`, `duration_minutes`, `high_flag`, `top3_date`, `due_at`, `remind_at`, `private_completion`, `signal_strength`, `last_activity_at`, `created_at`, `updated_at`, `completed_at`, `completion_note`, `created_by_id`
  - Deferred columns (added in later phases): `recurrence_rule_id` (Phase 5), block-related columns (none — handled via `task_block_scheduled_task` join table in Phase 2)
- `task_project`:
  - PK, owner_id, name, category, status, target_date, timestamps
- RLS: all authenticated users have full read + insert. Update/delete restricted to owner, creator, or current assignee. Matches OVIS peer-to-peer model for 3 trusted users.
- Indexes: each object link FK, `owner_id`, `status`, `due_at`, `top3_date`, `parent_task_id`, `project_id`.
- Triggers: `updated_at` auto-update via reusable `update_updated_at_column()` function (already exists in DB).

## Backfill notes (PR 7) — as actually run

Migration: `supabase/migrations/20260502010000_task_system_v2_backfill_v1.sql`

- **Source**: `activity` rows where `activity_type.name = 'Task'` AND status is open (or null).
- **Category inference** (DIVERGES from spec §17.2 — confirmed with user 2026-05-02 after sample review):
  ```
  if contact_id present                              → 'prospecting'
  elif deal_id, client_id, property_id, site_submit_id, or assignment_id present
                                                     → 'pipeline'
  else                                               → 'other'   (not 'personal')
  ```
  Reason: real data showed unlinked tasks are mostly mis-linked work. `'other'` keeps `'personal'` clean for actual personal reminders, and gives users a category=other filter for batch triage.
- **Field mapping**:
  - `activity.subject` → `task.subject` (NULL/empty → `'(Untitled)'`)
  - `activity.description` → `task.description`
  - `activity.activity_date` → `task.due_at` (cast to end-of-day Eastern timestamptz)
  - `COALESCE(user_id, owner_id)` → `task.owner_id` (per CLAUDE.md timezone & user-tracking guidance)
  - `created_by_id` validated against `"user"` table; orphaned references fall back to `user_id` → `owner_id` (~31 of 253 had orphaned creators)
  - `activity.created_at` → `task.created_at`
  - `is_high_priority` from joined `activity_priority` → `task.high_flag`
  - All object link FKs copied verbatim
- **Status**: all migrated rows are `'open'`.
- **Idempotency**: new column `task.migrated_from_activity_id` (uuid, unique partial index) marks the source row. The INSERT skips rows already present. Safe to re-run.
- **Result**: 253 rows migrated — 99 prospecting / 54 pipeline / 100 other.

## Cutover notes (PR 8) — as actually shipped

The feature flag concept was dropped during execution: with three trusted users and a single deploy target, the cleaner play was a direct route swap + delete in one commit (`509f4eb9`).

```
1. App.tsx: /tasks now renders <TasksPage /> (was <TaskDashboardPage />)
2. /tasks-v2-preview route removed (no longer needed; preview is the real /tasks)
3. Deleted:
   - src/pages/TaskDashboardPage.tsx
   - docs/TASK_MANAGEMENT_SYSTEM.md
   - docs/TASK_SYSTEM_IMPLEMENTATION_SUMMARY.md
4. AddTaskModal.tsx + ActivityDetailView.tsx KEPT — still used by GenericActivityTab on object detail pages
```

**Revert path if a regression is found:**
1. `git revert 509f4eb9` — restores route + deleted files in the working tree
2. If post-cutover traffic created v2-only data that needs to round-trip back to `activity`, run a backwards migration. (Not needed unless real users have created/modified tasks since cutover.)
3. The backfill is idempotent and `task.migrated_from_activity_id` lets you find every migrated row, so a partial revert is also feasible.

## What's deferred to Phase 2+

This Phase 1 was deliberately scoped to "make tasks work as standalone CRUD with the team." The big planning workspace is Phase 2.

- **Phase 2** — Time blocks (`task_block_template` + `task_block_instance` + `task_block_scheduled_task`), block-edit semantics, dashboard with timeline / Top 3 / Inbox / Watching / Conflicts lanes, "Plan Tomorrow" toggle, evening planning flow.
- **Phase 3** — Google Calendar pull-only sync (multi-calendar, polling + webhook, conflict detection).
- **Phase 4** — Notifications (in-app + batched email; triggers per spec §10).
- **Phase 5** — Recurring tasks (`task_recurrence_rule`, both modes per spec §6.5).
- **Phase 6** — Hunter integration: refactor agent to emit tasks, retire `target` and `hunter_outreach_draft`, port `last_contacted_at` trigger. Six sub-steps per spec §14.2.
- **Phase 7** — Subtasks (parent/child rendering rules) + projects (`task_project` is in schema; UI not yet built).
- **Phase 8** — Polish: Brain Dump modal, Top-3 lane (already in schema as `top3_date`), Watching lane, completion timeline routing refinements once the activity-style → chat-style timeline migration project happens.
