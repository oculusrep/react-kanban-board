-- Migration: Task System v2 — Phase 2.5 inbox flag
-- Date: 2026-05-09
-- Spec: docs/TASK_SYSTEM_V2_SPEC.md (§7.4)
-- Plan: docs/TASK_SYSTEM_V2_PHASE_2_5_PLAN.md
--
-- Adds task.is_inbox so the Inbox lane has a single, query-friendly source.
-- Set TRUE on creation in three paths (Brain Dump, uncategorized quick-add,
-- assignment-to-someone-else); cleared on any triage mutation. Clearing
-- logic lives in src/hooks/useTasks.ts, not DB triggers, so the rules are
-- visible to JS readers.
--
-- Backfills existing open tasks where someone else assigned them so the
-- Inbox lane has content on first load — otherwise users with pending
-- delegations from before this PR would never see them.

ALTER TABLE task ADD COLUMN IF NOT EXISTS is_inbox BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index — Inbox queries are always filtered to is_inbox = TRUE,
-- and the FALSE rows vastly outnumber TRUE rows.
CREATE INDEX IF NOT EXISTS idx_task_inbox_owner
  ON task(owner_id) WHERE is_inbox = TRUE;

-- Backfill: any existing open task delegated to someone other than the
-- creator counts as untriaged for the assignee.
UPDATE task SET is_inbox = TRUE
WHERE status = 'open'
  AND owner_id IS NOT NULL
  AND assigned_by_id IS NOT NULL
  AND assigned_by_id <> owner_id
  AND is_inbox = FALSE;

COMMENT ON COLUMN task.is_inbox IS
  'TRUE = task is in the owner''s Inbox lane awaiting triage. Set on creation in Brain Dump, uncategorized quick-add, and cross-user assignment paths. Cleared on schedule-into-block, top3-pin, category change, or explicit "Mark triaged" — see src/hooks/useTasks.ts for the clearing rules.';
