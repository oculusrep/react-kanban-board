-- Task System v2: "Awaiting" support. A task you can't act on yet because
-- you're waiting on someone external (vendor reply, attorney sign-off,
-- client signature) gets stamped with blocked_at + a free-text reason.
-- Blocked tasks surface in the dedicated Awaiting lane on the dashboard
-- (alongside Watching, below the timeline). Treated as a placement signal
-- by the inbox-recompute helper — same shape as triaged_at — so blocking
-- removes the task from the Inbox until you unblock.

ALTER TABLE task ADD COLUMN IF NOT EXISTS blocked_at timestamptz NULL;
ALTER TABLE task ADD COLUMN IF NOT EXISTS blocked_reason text NULL;

COMMENT ON COLUMN task.blocked_at IS
'Timestamp when the user marked this task as Awaiting (waiting on someone external before they can act). Set via blockTask(); cleared via unblockTask(). Treated by inbox-recompute as a placement signal: blocked tasks leave the Inbox until unblocked.';

COMMENT ON COLUMN task.blocked_reason IS
'Free-text reason why the task is blocked (e.g., "Waiting on attorney to review LOI"). Surfaced in the Awaiting lane row.';
