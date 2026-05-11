# Task System v2 — Session Status, 2026-05-10

End-of-session snapshot. Captures everything shipped today, everything live in prod, what needs your manual action, what's still in PR limbo, known issues, and where to pick up tomorrow.

---

## TL;DR

- **9 branches pushed**, none merged yet. They stack on top of each other.
- **5 database migrations applied directly to prod** (already live):
  - `task.triaged_at`
  - `task.blocked_at` + `task.blocked_reason`
  - `task_category` table + seeded with the original 6
  - `task_category.scope` + case-insensitive uniqueness
  - `task_category.archived_at`
  - cron rescheduled to `gcal-sync-tick (v2)` using `gcal_cron_secret` from vault
- **2 data updates applied to prod**:
  - 9 orphaned tasks (created in last 60 days, no top3/schedule/triaged) restored to your Inbox
  - 192 of your active tasks 30+ days overdue deleted at your request
- **1 edge function redeployed**: `gcal-sync` v3 with `verify_jwt: false` + custom dual-auth
- **1 critical bug found late in session**: block instances were never generating for any user since Phase 2 shipped (smallint[] vs int[] type mismatch). Fixed in `fix/tasks-v2-block-instance-generation`.
- **1 manual action you still owe** to complete the calendar setup — see [§ Manual actions](#manual-actions-needed).

---

## Branch stack (oldest → newest)

All branches pushed to origin. None merged. Each builds on the previous, so they should land in this order or be rebased onto main individually.

| # | Branch | Latest commit | What it does |
|---|---|---|---|
| 1 | `fix/tasks-dashboard-save-and-width` | `6133a8f4` | SW Supabase rule removed (fixes `ERR_INSUFFICIENT_RESOURCES`); infinite refetch loop fix in Top3/Watching lanes; full-width dashboard; pill-style Category dropdown replaces native `<select>` |
| 2 | `feat/tasks-v2-inbox-rule-and-overdue` | `9529c08f` | Revised inbox-exit rule (pinning is the only auto-clear; category alone keeps in inbox); `task.triaged_at`; Overdue lane (top-row, far left); inline due-date input with terracotta overdue border; Quick Capture single-line bar; shared `dashboardRefreshKey` so cross-lane mutations propagate; spec §6.8 + §7.4.1 |
| 3 | `feat/tasks-v2-awaiting-lane` | `b804856c` | Awaiting lane (collapsible, hidden when empty); `task.blocked_at` + `blocked_reason`; OVIS-styled BlockTaskModal replaces native `prompt()`; spec §6.9 |
| 4 | `feat/tasks-v2-user-defined-categories` | `eab3c5e9` | `task_category` table; per-user (`personal`) + team-wide (`global`) scope; case-insensitive uniqueness within scope; 8-color palette; CreateCategoryModal + EditCategoryModal (rename / change color / archive); pencil-on-hover edit; admin (`user.ovis_role='admin'`) override; TaskDetailSlideout migrated to the new dropdown; spec §5.1 rewritten |
| 5 | `feat/tasks-v2-cleanup-and-cron-fix` | `a0a97320` | TasksPage filter shows user-defined categories (loads from DB at mount); `gcal-sync` cron 401 fix — function deployed with `verify_jwt: false` + custom dual-auth (user JWT or `X-Cron-Secret`); `TaskListFilters.category` widened to `string \| string[]` |
| 6 | `feat/tasks-v2-drag-and-drop` | `91aa2bb6` | Drag-and-drop between Inbox ⇆ Top 3 via Hello Pangea (shared `DragDropContext` on the right column / top row); `⠿` handles on every draggable row; drop-zone highlighting; spec §11 + testing doc updated |
| 7 | `feat/tasks-v2-block-capacity-bar` | `4b326b0a` | Per-block capacity bar showing scheduled-vs-available minutes; slate fill → blue at capacity → terracotta when overbooked; "X/Y min scheduled" label; "⚠ Over by N min" indicator; spec §6.10 |
| 8 | `fix/tasks-v2-block-instance-generation` | `1a8f493f` | `ensureInstancesForDate` was sending `int[]` to a `smallint[]` column via `.contains()` — the operator doesn't exist so the query silently returned 0 templates and nothing was ever generated. Switched to client-side filter. **Has been broken for everyone since Phase 2 shipped.** |
| 9 | `feat/tasks-v2-timeline-as-primary-column` | `d0be27e2` | Two-column dashboard: Timeline left (~60%, always in view), lanes right (~40%, vertical stack). Inbox (60vh) and Overdue (40vh) cap their inner scroll heights so a long inbox can't push peer lanes off-screen. Cherry-picked the block-instance-generation fix so it's independently deployable. |

PR URL pattern: `https://github.com/oculusrep/react-kanban-board/pull/new/<branch-name>`

---

## Live in prod right now (no PR review needed)

These changes were applied directly via Supabase MCP and are already affecting prod:

### Schema additions
- `task.triaged_at timestamptz NULL` (migration `20260510000000`)
- `task.blocked_at timestamptz NULL` + `task.blocked_reason text NULL` (migration `20260510010000`)
- `task_category` table seeded with the 6 originals + scope/uniqueness indexes (migrations `20260510020000` + `20260510030000`)
- `task_category.archived_at timestamptz NULL` (migration `20260510040000`)
- `task.category_id` FK on `task_category` (NOT NULL, backfilled from text)
- Old CHECK constraint on `task.category` text dropped (text column kept temporarily for sync)

### Cron
- `gcal-sync-tick` rescheduled (v2 migration `20260510050000`) to send `X-Cron-Secret` header from vault-stored `gcal_cron_secret`
- Edge function `gcal-sync` v3 deployed with `verify_jwt: false` and custom dual-auth check inside the function

### Vault secrets
- `gcal_cron_secret` created — value is `ad4c2ac7986c3a753cb721b593ddc689ad0fc544476029089b348f34b26c4d88`

### Data changes
- **Orphan-tasks backfill**: 9 tasks (created since 2026-03-11, no top3/schedule/triaged_at) restored to `is_inbox = true`
- **Overdue cleanup at user request**: 192 of Mike's `open` / `in_progress` tasks 30+ days overdue deleted

---

## Manual actions needed

To complete the calendar setup, in the Supabase dashboard:

1. Go to https://supabase.com/dashboard/project/rqbvcvwbziilnycqtmnc/settings/functions
2. Add a new Edge Function Secret:
   - **Name**: `CRON_SECRET`
   - **Value**: `ad4c2ac7986c3a753cb721b593ddc689ad0fc544476029089b348f34b26c4d88`
3. Wait ≤ 5 min for the next cron tick. In Logs → Edge Functions, confirm `gcal-sync` returns 200 (not 401).

Until this is set, the cron will keep returning 401 every 5 min. The in-app "↻ Sync" button on the dashboard works regardless because it uses the user JWT path.

---

## Where we are on the 5-step roadmap from yesterday

1. ✅ **Bug fixes** (branch 1)
2. ✅ **Inbox rule + overdue + due dates + Quick Capture** (branch 2)
3. ✅ **Awaiting lane** (branch 3)
4. ✅ **User-defined categories** (branch 4 — added at user request, then expanded to scope/edit/archive)
5. ✅ **Cleanup follow-ups + cron fix** (branch 5)
6. ✅ **Drag-and-drop** (branch 6 — scoped to Inbox ⇆ Top 3 for v1)
7. ✅ **Proportional time blocks** — capacity bar (branch 7); full calendar-style layout deferred to a future branch
8. ✅ **Critical block-instance bug** found and fixed (branch 8)
9. ✅ **Layout shift to two-column** with Timeline as primary (branch 9)

---

## Known issues / deferred follow-ups

### Should ship soon
- **`task.category` legacy text column** — kept in sync by `updateTask` for now, drop in a follow-up migration once the FK has been load-bearing in prod for a release
- **Drag-and-drop scope** — currently Inbox ⇆ Top 3 only. Drag from Inbox into a time block still uses the Schedule dropdown. Hello Pangea doesn't support nested DragDropContexts and `TodaysTimeline` has its own context for in-block reorder, so a unified drag would require lifting that context too.

### Bigger pieces deferred
- **Full calendar-style proportional layout** — block heights pixel-proportional to duration, hour axis on the left, meeting events overlaid as fixed-height blocks. Spec §6.10 calls this out as the next step after the capacity bar proves the signal in real use.
- **Calendar conflict resolution UX** — §9.4 spec. Conflicts panel currently just shows the count; the "shrink / move / accept overlap" actions aren't wired.
- **"Smart time blocks"** — the user's stated future direction. Suggest unscheduled category-matching tasks for a block; "auto-schedule the small ones" for sub-15-min tasks; capacity-aware drop targets.
- **Reverse capture** (Google event → task) — explicitly deferred per spec §9.5.
- **Block templates UI niceties** — bulk reorder, copy-week-to-week, drag-rearrange the day's templates visually.

### Quality of life
- **TaskDetailSlideout slideout** — when its `onChanged` fires it only refetches its host lane. Mutations made from a slideout don't propagate cross-lane until next interaction. Acceptable tradeoff today (alternative would close the slideout mid-edit).
- **`TaskCategory` legacy union** — still imported in a few places (`useTasks.ts`, `QuickAddTaskPopover.tsx`, etc.). Will become unused once the text column drops; clean up then.

---

## Pick up tomorrow — suggested order

1. **Add `CRON_SECRET` in Supabase dashboard** (manual action above) so the cron starts working.
2. **Open + merge the 9 PRs in stack order.** Easiest path: review each, squash-merge to main, let the next branch auto-rebase. Or open one big "Task System v2 May 10 batch" PR by merging branches into a single integration branch first.
3. **After merge + Vercel deploy**, work through [docs/TASK_SYSTEM_V2_TESTING_2026_05_10.md](TASK_SYSTEM_V2_TESTING_2026_05_10.md) end-to-end. The doc covers PR 1 → PR 7b plus regressions and the cron verification (PR 7).
4. **Verify the layout shift feels right.** Two-column with Timeline left is a real change in the product's center of gravity. If it doesn't feel right after using it for a day, the alternatives are documented in the design discussion log (spec §11).
5. **Pick the next bigger piece**: full proportional calendar view, smart-block suggestions, or the deferred conflict-resolution UX. Recommend starting with smart-block suggestions since they directly address the "OVIS is manual, Motion is auto, what's the hybrid" question we discussed.

---

## Reference

- **Spec**: [TASK_SYSTEM_V2_SPEC.md](TASK_SYSTEM_V2_SPEC.md) — design source of truth, kept in sync with everything shipped this session
- **Testing script**: [TASK_SYSTEM_V2_TESTING_2026_05_10.md](TASK_SYSTEM_V2_TESTING_2026_05_10.md) — PR 1 through PR 7b + regressions
- **User manual**: [TASK_SYSTEM_V2_USER_MANUAL.md](TASK_SYSTEM_V2_USER_MANUAL.md) — covers Phases 1–3 (pre-session); will need a refresh covering Inbox rule changes / Awaiting / categories / capacity bar / two-column layout once these merge

---

## Where the design conversation went

Two product discussions worth remembering:

- **"Should the timeline be a lane?"** Yes — current bottom placement gets buried by a tall Inbox. New two-column layout addresses this. Documented in spec §11.
- **"Is this a better Motion?"** Not really — OVIS is closer to a CRM-native time-blocked GTD system. Cal Newport's deep-work blocks + GTD's inbox-triage + Things 3 aesthetic, anchored in business objects. Motion's auto-scheduling is an *optional layer* you might add later as "smart time blocks", not the foundation OVIS is built on. Captured in this session's chat log; expand into a positioning doc if it becomes useful for marketing/onboarding.
