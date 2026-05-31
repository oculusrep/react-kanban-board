-- Task System v2: add triaged_at so we can distinguish intentional
-- "I've decided" triage from the side-effect inbox-clear of placement
-- (Top 3 pin, block schedule). Without this column, unpinning a Top-3
-- task left it orphaned: not in inbox, not in any block — invisible on
-- the dashboard. With it, inbox-recompute on placement removal can
-- restore is_inbox = true unless the user explicitly clicked Mark
-- Triaged.

ALTER TABLE task ADD COLUMN IF NOT EXISTS triaged_at timestamptz NULL;

COMMENT ON COLUMN task.triaged_at IS
'Set when the user explicitly clicked Mark Triaged. Distinguishes intentional triage decisions from the inbox-clearing side effect of placement (Top 3 pin or block schedule). Inbox-recompute uses this to avoid auto-restoring tasks the user explicitly removed from the inbox.';
