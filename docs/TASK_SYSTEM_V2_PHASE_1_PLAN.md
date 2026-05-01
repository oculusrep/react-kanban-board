# Task System v2 — Phase 1 Implementation Plan

**Branch:** `feat/task-system-v2`
**Spec:** [TASK_SYSTEM_V2_SPEC.md](./TASK_SYSTEM_V2_SPEC.md)
**Status:** In progress

Phase 1 from the spec covers: **schema + core CRUD + object linking + quick-capture popover + all-tasks view + v1 cutover**. This doc breaks it into PR-sized chunks and tracks status.

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

## Status

| # | Title | Status |
|---|---|---|
| 1 | Schema migration | ✅ Applied to Supabase |
| 2 | Type regeneration | ✅ `database-schema.ts` regenerated |
| 3 | Domain types + hook | ✅ `src/types/task.ts`, `src/hooks/useTasks.ts` |
| 4 | Quick-capture popover | ✅ `src/components/tasks/QuickAddTaskPopover.tsx` + `QuickAddTaskButton.tsx` |
| 5 | `+ Task` buttons on object pages | Not started — needs browser testing |
| 6 | All-tasks page | Not started — needs browser testing |
| 7 | Backfill script | Not started |
| 8 | Feature flag + cutover | Not started |

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

## Backfill notes (PR 7)

Per spec §17:
- Source: `activity` rows where `activity_type.name = 'Task'` AND status is open (not in a closed status).
- Category inference (case logic):
  ```
  if contact_id present                              → 'prospecting'
  elif deal_id, client_id, property_id, site_submit_id, or assignment_id present
                                                     → 'pipeline'
  else                                               → 'personal'
  ```
- Field mapping:
  - `activity.subject` → `task.subject`
  - `activity.description` → `task.description`
  - `activity.activity_date` → `task.due_at`
  - `activity.owner_id` → `task.owner_id`
  - `activity.created_at` → `task.created_at`
  - `activity.activity_priority_id` → `task.high_flag = (priority.is_high_priority IS TRUE)`
  - All object link FKs copied verbatim
- Status: `'open'` (the migration filter excludes closed activity rows).
- Backfilled tasks get `created_by_id` = original `activity.owner_id` (best available record of who created it).

## Cutover notes (PR 8)

```
1. Flag flip: enableTaskSystemV2 = true (constant)
2. App.tsx route: /tasks → <TasksPage /> (new) instead of <TaskDashboardPage /> (old)
3. Delete:
   - src/pages/TaskDashboardPage.tsx
   - docs/TASK_MANAGEMENT_SYSTEM.md
   - docs/TASK_SYSTEM_IMPLEMENTATION_SUMMARY.md
4. Verify: no stray imports of deleted files (search & remove)
```

Revert path if problems are found post-cutover:
1. `git revert <cutover-commit>` — restores route + deleted files in working tree
2. `supabase db reset` or run a backwards migration that re-creates `activity` rows from `task` rows created/modified after cutover (only needed if production traffic happened in the window)
