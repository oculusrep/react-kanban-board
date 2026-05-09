# Task System v2 — Phase 2 Implementation Plan

**Branch:** `feat/tasks-v2-phase-2`
**Spec:** [TASK_SYSTEM_V2_SPEC.md](./TASK_SYSTEM_V2_SPEC.md) — primarily §4.1, §5, §6.2, §11, §11.1, §12
**Phase 1:** [TASK_SYSTEM_V2_PHASE_1_PLAN.md](./TASK_SYSTEM_V2_PHASE_1_PLAN.md) (shipped 2026-05-02)
**Status:** ✅ Complete (2026-05-09)

Phase 2 lands the **time-block schema** (3 new tables) and a **minimal Today's Timeline lane** on the dashboard so blocks are usable end-to-end. The full multi-lane dashboard (Top 3 / Inbox / Watching / Conflicts) is deferred to Phase 2.5 — see "Deferred from this scope" below.

## Status — all done

| # | Title | Commit |
|---|---|---|
| 1 | Schema migration (3 block tables + RLS + indexes) | `8948f434` (applied to live DB via Supabase MCP) |
| 2 | Types regen + domain types + CRUD hooks | `08cb0ac0` |
| 3 | Block template management page at `/settings/time-blocks` | `c38f7165` |
| 4 | Daily instance generation (`ensureInstancesForDate`) | `6ab0df70` |
| 5 | Today's Timeline lane (read-only) | `29b03754` |
| 6 | Schedule tasks into blocks + drag-rank (`@hello-pangea/dnd`) | `e7d03ca3` |
| 7a | Plan Tomorrow + ad-hoc blocks | `c609497d` |
| 7b | Block edit semantics + adaptive non-blocking layout | `6dc01b7b` |
| 8 | Cutover — `/tasks` → dashboard, flat list to `/tasks/all` | `7539349b` |

PR 7 was split into 7a + 7b for commit hygiene (same logical scope per plan).

## Scope of Phase 2

**In scope:**
- Schema: `task_block_template`, `task_block_instance`, `task_block_scheduled_task` + RLS, indexes, triggers
- Types regen + domain types + CRUD hooks
- Block template management UI (create / edit / activate / deactivate templates per spec §5.2)
- Block edit semantics — the three-option prompt: this day only / all future / skip (spec §5.4)
- Ad-hoc one-off blocks — `task_block_instance` rows with `template_id = NULL` (spec §5.5)
- Daily instance generation from active templates (client-side, idempotent)
- Schedule tasks into blocks with `manual_rank` drag-ordering (spec §5.6)
- Today's Timeline lane component — blocks chronologically with their task queues; current/next block highlighted
- Adaptive non-blocking layout — when user has no active templates, render a simple "Today's Tasks" list instead (spec §11.1)
- Plan Tomorrow toggle — flips the same view forward by one day (spec §12)
- Replace the home of `/tasks` with the new dashboard; move the existing flat list to `/tasks/all`

**Deferred from this scope (Phase 2.5):**
- Top 3 lane, Inbox lane, Watching lane — relevant data already exists (`top3_date`, assignment FKs) but the lane UIs are out of scope here
- Conflicts lane — depends on Phase 3 (calendar sync)
- Brain Dump modal — out of scope; deferred to Phase 8
- Pipeline grouped-by-client toggle — out of scope; deferred to Phase 8
- Block-end "wrap up" notification — explicitly excluded by spec §16, point 8
- Block-start notifications — depend on Phase 4 (notifications system)

**Already deferred to later phases (not Phase 2):**
- `task_recurrence_rule` + `task.recurrence_rule_id` → Phase 5
- `task_outreach_draft` → Phase 6 (Hunter migration)
- Google Calendar pull → Phase 3

## Work order (proposed PRs)

Most are independently mergeable. PRs 1–4 build foundations; PRs 5–7 are the user-visible surface; PR 8 is the cutover.

| # | Title | Files (representative) | Risk |
|---|---|---|---|
| 1 | Schema migration: 3 block tables + RLS + indexes | `supabase/migrations/2026XXXX000000_task_system_v2_block_schema_phase2.sql` | Medium — DB change; unique constraint on `(template_id, owner_id, on_date)` to prevent dupe instances |
| 2 | Regenerate types + domain types + CRUD hooks | `database-schema.ts`, `src/types/taskBlock.ts`, `src/hooks/useTaskBlocks.ts` | Low |
| 3 | Block template management UI (settings page or modal) | `src/components/tasks/BlockTemplateManager.tsx`, route at `/settings/time-blocks` | Low |
| 4 | Daily instance generation — client-side, idempotent | small fn in `useTaskBlocks` invoked when dashboard mounts | Medium — race conditions if multiple devices open simultaneously |
| 5 | Today's Timeline lane component (block view) | `src/components/tasks/dashboard/TodaysTimeline.tsx`, `BlockRow.tsx` | Medium — visual surface |
| 6 | Schedule tasks into blocks + manual rank | `BlockTaskPicker.tsx`, drag-rank in `BlockRow` | Medium |
| 7 | Block edit semantics + ad-hoc blocks + adaptive layout + Plan Tomorrow | `BlockEditPrompt.tsx`, `AdHocBlockCreator.tsx`, simplified-mode in `TodaysTimeline` | Medium — three behaviors but each small |
| 8 | Cutover: `/tasks` → dashboard; flat list → `/tasks/all` | `src/App.tsx`, `src/pages/TasksDashboardPage.tsx`, `TasksPage.tsx` rebrand | Medium — route flip + nav update |

## Schema notes (PR 1)

Three tables. RLS mirrors Phase 1: full read for all authenticated users, write restricted to owner. `updated_at` triggers via the existing `update_updated_at_column()` function.

### `task_block_template`
- PK `id` (uuid)
- `owner_id` (FK `"user"`, NOT NULL)
- `name` (text, NOT NULL) — display label
- `category` (text + CHECK matching `task.category` enum)
- `byweekday` (int[] NOT NULL) — `[1,2,3,4,5]` for Mon–Fri (ISO weekday)
- `start_time` (time NOT NULL) — local Eastern, see §"Time zone handling"
- `duration_minutes` (int NOT NULL, > 0)
- `active` (bool DEFAULT true)
- `created_at`, `updated_at`
- Indexes: `owner_id`, `(owner_id, active)` partial

### `task_block_instance`
- PK `id` (uuid)
- `template_id` (FK `task_block_template`, **nullable** — null = ad-hoc)
- `owner_id` (FK `"user"`, NOT NULL) — denormalized so RLS works on instances of deactivated templates
- `on_date` (date NOT NULL)
- `start_time` (time NOT NULL) — copied from template at instance creation, editable per-day
- `duration_minutes` (int NOT NULL)
- `name` (text NOT NULL)
- `category` (text + CHECK)
- `status` (text + CHECK: `scheduled | in_progress | completed | skipped`)
- `created_at`, `updated_at`
- **Unique constraint:** `(template_id, owner_id, on_date)` WHERE `template_id IS NOT NULL` — prevents duplicate instance generation. Ad-hoc blocks (`template_id IS NULL`) can repeat per day.
- Indexes: `(owner_id, on_date)`, `template_id`

### `task_block_scheduled_task`
- PK `id` (uuid)
- `block_instance_id` (FK `task_block_instance`, NOT NULL)
- `task_id` (FK `task`, NOT NULL)
- `manual_rank` (int NOT NULL) — drag-rank within the block; not unique (handle ties at write time)
- `created_at`
- **Unique constraint:** `(task_id)` — a task can only be in one block at a time per spec §5.6
- Indexes: `block_instance_id`, `task_id`

## Behavior notes

### Daily instance generation (PR 4)
On dashboard mount:
1. Compute today's local Eastern date (per CLAUDE.md timezone guidance).
2. For each active template owned by the current user where `byweekday` includes today's weekday:
3. Try `INSERT … ON CONFLICT DO NOTHING` against `task_block_instance` with the unique constraint. The unique constraint absorbs races between devices.
4. Read instances back for the date being viewed and render.

This is preferable to a Postgres cron job for v1: simpler, no edge function infra needed, and the user pays the cost only when they actually open the dashboard. If multi-device races become a problem in practice, we can move to a server-side daily job in a follow-up.

### Block edit semantics (PR 7, spec §5.4)
When the user edits a block on a specific day, prompt with three radio options:
- **This day only** → update the `task_block_instance` row.
- **All future** → update the `task_block_template` row; today's instance unchanged.
- **Skip just this day** → set `task_block_instance.status = 'skipped'`. Skipped blocks render greyed out and don't accept tasks.

Match the Apple/Google Calendar UX rather than inventing new copy.

### Ad-hoc blocks (PR 7, spec §5.5)
"Add ad-hoc block" button on the timeline. Opens a small form: name, category, start, duration. Inserts a `task_block_instance` with `template_id = NULL` and the chosen date. Only this date is affected.

### Adaptive layout for non-blocking users (PR 7, spec §11.1)
When the user has zero active templates AND no instances for the viewed date:
- Render "Today's Tasks" list instead of "Today's Timeline."
- Source: open tasks, sorted by High flag → manual rank (where set) → due date.
- Show a dismissible "Set up time blocks" CTA once. Once dismissed, the CTA never returns. Persistence: a user-prefs row or `localStorage`.

This means Arty/Noree get a clean priority list with no time-block UI in the way; Mike gets the full dashboard.

### Plan Tomorrow (PR 7, spec §12)
A button in the dashboard header flips an internal `viewDate` state from today → today+1. The same component re-renders with tomorrow's instances (auto-generated if missing per the rules above). No separate route, no separate page.

### Time zone handling
- `on_date`, `start_time` are **local Eastern** per CLAUDE.md. Treat the user's local clock as canonical.
- Today calculation: `new Date()` → year/month/day from local getters, NOT `toISOString()`. Reuse the helper pattern from [taskTimelinePost.ts](../src/lib/taskTimelinePost.ts).
- Instance generation must compare `byweekday` against the local weekday, not UTC.

## Resolved decisions (2026-05-09)

The five open questions from draft were resolved before implementation kicked off:

1. **Block template management lives on a dedicated page** — `/settings/time-blocks`. Discoverability and room to grow win over modal speed-to-ship.
2. **Cutover URL plan: option (a)** — `/tasks` becomes the dashboard; the existing flat list moves to `/tasks/all`. Matches the Phase 1 cutover rhythm.
3. **Drag-rank uses `@hello-pangea/dnd`** — already in the bundle (used by the kanban board). No new dependency, consistent UX pattern.
4. **Empty timeline shows the day's shape** — render every block instance the user has scheduled for the day, even if no tasks are queued in it ("0 tasks"). Visual rhythm > visual emptiness.
5. **First template creation auto-instantiates today's blocks immediately** — including blocks whose `start_time` has already passed. Past-time empty blocks render collapsed/dimmed with explicit "Skip today" or "Move to now" affordances. The alternative (wait until tomorrow) makes templates feel broken on first use.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Race condition: two devices both create today's instance | Unique constraint on `(template_id, owner_id, on_date)` + `ON CONFLICT DO NOTHING` |
| User edits template, today's instance has different times — confusion | The three-option prompt makes this an explicit user choice; document the behavior in the in-app help |
| Empty timeline UX is depressing for first-time users | Adaptive non-blocking layout + "Set up time blocks" CTA keeps the dashboard useful |
| Pipeline grouped-by-client toggle (deferred) leaves a gap for Mike's workflow | Acceptable for Phase 2; he gets it back in Phase 8 polish |
| Drag-rank ties when multiple tasks share the same `manual_rank` | Compute next rank as `max(rank) + 1024` on insert; tolerate ties on update with deterministic secondary sort by `created_at` |

## What's next (post-Phase 2)

- **Phase 2.5** — Top 3 / Inbox / Watching lanes; Brain Dump modal; Pipeline grouped-by-client toggle. Builds on the dashboard surface.
- **Phase 3** — Google Calendar pull-only sync + Conflicts lane (spec §9).
- **Phase 4** — Notifications & reminders (spec §10), including block-start alerts.
- **Phase 5** — Recurring tasks (`task_recurrence_rule`, both modes; spec §6.5).
- **Phase 6** — Hunter migration (spec §14.2, six sub-steps).
- **Phase 7** — Subtasks UI + projects UI (`task_project` already in schema from Phase 1).
- **Phase 8** — Polish.
