# Task System v2 — Session 2026-06-09

Short session targeting a recurring annoyance on the All Tasks page and a stuck-UI bug in the task slideout.

---

## TL;DR

Two commits to `main`:

| Commit | What |
|---|---|
| `f5a9d66b` | Fix: `TaskDetailSlideout` no longer gets stuck on "Saving…" after a successful save |
| `0a9173da` | Feat: All Tasks page gets preset views (default = Focus) + multi-select bulk actions |

Both require `vercel --prod` from a clean `main` checkout to land in production (per CLAUDE.md, `git push` does not deploy on its own).

---

## 1. Slideout "Saving…" lock-up — `f5a9d66b`

### Symptom

Opening an overdue task, changing its due date, clicking Save → the button stuck on "Saving…" indefinitely. Refresh required to recover. Frequent in real use.

### Diagnosis

A HAR capture proved the network round-trip succeeded — `PATCH /rest/v1/task` returned 200 in 169 ms with the new `due_at` correctly set. The `recomputeIsInbox` follow-ups (HEAD + SELECT) also succeeded. So `updateTask` resolved fine and the data made it through. The bug was purely client state.

`TaskDetailSlideout`'s `handleSave` only reset `saving` in the catch block:

```ts
setSaving(true);
try {
  await updateTask(task.id, buildPatch(task));
  setDirty(false);
  onChanged?.();
  onClose();          // ← relied on this to unmount
} catch (err) {
  setError(...);
  setSaving(false);   // ← only here
}
```

The implicit contract was "on success, `onClose()` unmounts the slideout, so `saving` doesn't matter." But the slideout doesn't unmount: the parent always renders `<TaskDetailSlideout taskId={openTaskId} ... />` and the slideout's own `if (!taskId) return null` keeps the component instance alive, just rendering nothing. State (including `saving=true`) persisted across opens. When the slideout next opened — same task or different one — the form re-rendered with the Save button stuck on "Saving…", disabled, with no save actually in flight.

The HAR confirmed this: after the successful save, the slideout fetched the same task again at +449 ms and again at +3573 ms, showing the component had survived the "close" and re-rendered.

### Fix

Moved `setSaving(false)` into a `finally` block on all four mutation handlers (`handleSave`, `handleComplete`, `handleReopen`, `handleDelete`). The save still closes the slideout via `onClose()`, but `saving` resets either way.

10 lines added to [src/components/tasks/TaskDetailSlideout.tsx](../src/components/tasks/TaskDetailSlideout.tsx).

### Open question (low priority)

Why the slideout was reopening at +449 ms in the HAR is still not pinned down — there's no URL-param deep-linking and no auto-reopen logic in the code. The fix is correct regardless: leaving `saving=true` after a successful mutation is a latent bug, and any future cause of "slideout reopens with stale state" is now caught.

---

## 2. All Tasks page — preset views + bulk actions — `0a9173da`

### Motivation

`/tasks/all` defaulted to "open" status with no date filter, which dumped every recurring future-dated task into the view alongside actual work. Hard to scan; hard to act on. Plus there was no way to mass-update due dates, owners, categories, or status — you had to open each task individually.

### What shipped

**Preset buttons** above the existing filter bar, default = **Focus**:

| Preset | Predicate |
|---|---|
| Focus *(default)* | `due_at IS NULL OR due_at <= today` |
| Overdue | `due_at < today AND status NOT IN (completed, cancelled)` |
| Due today | `due_at = today` |
| No due date | `due_at IS NULL` |
| Next 7 days | `today <= due_at <= today+7` |
| All | (no date filter) |

Presets are applied client-side as a post-fetch predicate. Server-side filters (status, category, search, owner, high_flag) stack with the preset.

Header now reads `N of M tasks` so the narrowing is visible.

**Multi-select**:
- Row checkbox repurposed from complete-toggle → select-for-bulk.
- Per-row complete moved to a small **✓** / **↺** icon button next to **Delete**.
- Header checkbox = select-all-visible (preserves out-of-view selections so the user can build a cross-preset selection).

**Bulk action bar** — sticky at the bottom of the viewport whenever `selectedIds.size > 0`:

- **Due date** picker (with "clear" → sets `due_at = NULL`)
- **Owner** dropdown (filtered to `broker_full` / `va` / `admin` roles)
- **Category** dropdown (visible categories per `isCategoryVisibleTo`)
- **Status** dropdown (Open / Completed / Cancelled)
- **Clear selection** button

Each control fires immediately on change — no per-action confirm. Bulk runs in parallel via `Promise.allSettled`; partial failures (e.g., one task the current user can't edit) surface as an alert with `N succeeded, M failed`, and the successful ones still apply.

Status changes use the right helper per outcome:
- Completed → `completeTask` (writes the timeline row)
- Open → `reopenTask` (clears `completed_at`)
- Cancelled → `updateTask({ status: 'cancelled' })`

All in [src/pages/TasksPage.tsx](../src/pages/TasksPage.tsx); no schema or hook changes.

### Defaulted without asking

- **Selection persists across presets/filters.** Switching from Focus → Overdue keeps the already-selected rows in the action bar even though they may no longer be visible. The "Clear selection" button is always available. This was a judgment call; alternative was to drop out-of-view selections on filter change.
- **No idempotency or per-action confirmation.** Picking a status from the bulk dropdown applies immediately. For accidental clicks, undo means setting it back. Bulk delete is not in v1 — only via per-row Delete — because mass deletion warranted a separate consideration.
- **Date input uses `T23:59:59` local-time convention.** Same pattern as the slideout — picking 6/30 stores 6/30 23:59:59 in local time → 7/01 03:59:59Z in the DB (Eastern). Round-trips correctly to the date picker.

---

## Follow-ups not done

- Rebase the active feature branch (`feature/demographic-cache-audit-log`) onto the new `main` so it gets the slideout fix while continuing demographic-cache work.
- Run `vercel --prod` from a clean `main` checkout. The demographic-cache work is committed on the feature branch but a stale checkout could drag it into the deploy.
- (Optional polish) The mystery of why the slideout reopens at +449 ms in the HAR was not chased. The `finally` fix makes it harmless, but the underlying re-mount may be a different latent bug worth a deeper look later.
