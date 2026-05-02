-- Migration: Task System v2 — backfill open v1 tasks into the task table
-- Date: 2026-05-02
-- Spec: docs/TASK_SYSTEM_V2_SPEC.md §17 (with one divergence — see below)
--
-- Migrates open task-flavored rows from `activity` (where activity_type='Task'
-- and status is not closed) into the new `task` table.
--
-- Category inference (DIVERGES FROM SPEC §17.2 — confirmed with user 2026-05-02):
--   contact_id present                              → 'prospecting'
--   deal/client/property/site_submit/assignment     → 'pipeline'
--   nothing linked                                  → 'other'  (spec said 'personal'
--                                                              but real data showed
--                                                              the unlinked bucket
--                                                              is mostly mis-linked
--                                                              work, not personal
--                                                              reminders. Using
--                                                              'other' keeps
--                                                              'personal' clean for
--                                                              actual personal
--                                                              reminders, and lets
--                                                              the user filter
--                                                              category=other to
--                                                              triage.)
--
-- Idempotency: a new column `task.migrated_from_activity_id` (uuid, unique
-- partial index) marks the source row. The INSERT skips any activity row
-- that already has a corresponding task. Safe to re-run.

-- 1. Traceability column
ALTER TABLE task ADD COLUMN IF NOT EXISTS migrated_from_activity_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS task_migrated_from_activity_unique
  ON task(migrated_from_activity_id)
  WHERE migrated_from_activity_id IS NOT NULL;

COMMENT ON COLUMN task.migrated_from_activity_id IS
  'Backfill marker — the activity.id this task was migrated from (one-time, 2026-05-02). NULL for tasks created natively in v2.';

-- 2. The backfill insert
WITH task_type AS (
  SELECT id FROM activity_type WHERE name = 'Task'
),
open_v1 AS (
  SELECT a.*
  FROM activity a
  JOIN task_type tt ON a.activity_type_id = tt.id
  LEFT JOIN activity_status s ON a.status_id = s.id
  WHERE COALESCE(s.is_closed, false) = false
)
INSERT INTO task (
  migrated_from_activity_id,
  subject,
  description,
  status,
  category,
  owner_id,
  created_by_id,
  due_at,
  high_flag,
  client_id,
  deal_id,
  property_id,
  site_submit_id,
  assignment_id,
  contact_id,
  created_at
)
SELECT
  v1.id,
  COALESCE(NULLIF(TRIM(v1.subject), ''), '(Untitled)'),
  v1.description,
  'open',
  CASE
    WHEN v1.contact_id IS NOT NULL                                                   THEN 'prospecting'
    WHEN v1.deal_id       IS NOT NULL
      OR v1.client_id     IS NOT NULL
      OR v1.property_id   IS NOT NULL
      OR v1.site_submit_id IS NOT NULL
      OR v1.assignment_id IS NOT NULL                                                THEN 'pipeline'
    ELSE                                                                                  'other'
  END,
  COALESCE(v1.user_id, v1.owner_id),
  -- created_by_id may reference a user that was later deleted (~31/253 in
  -- practice). Validate with a subquery before accepting it; otherwise fall
  -- back through user_id → owner_id, both of which we already know are valid
  -- since the WHERE clause requires one of them.
  COALESCE(
    (SELECT u.id FROM "user" u WHERE u.id = v1.created_by_id LIMIT 1),
    v1.user_id,
    v1.owner_id
  ),
  CASE
    WHEN v1.activity_date IS NOT NULL
    THEN (v1.activity_date::timestamp + interval '23 hours 59 minutes 59 seconds')
         AT TIME ZONE 'America/New_York'
    ELSE NULL
  END,
  COALESCE(p.is_high_priority, false),
  v1.client_id,
  v1.deal_id,
  v1.property_id,
  v1.site_submit_id,
  v1.assignment_id,
  v1.contact_id,
  COALESCE(v1.created_at, NOW())
FROM open_v1 v1
LEFT JOIN activity_priority p ON v1.activity_priority_id = p.id
WHERE COALESCE(v1.user_id, v1.owner_id) IS NOT NULL  -- task.owner_id is NOT NULL; skip orphans
  AND NOT EXISTS (
    SELECT 1 FROM task t WHERE t.migrated_from_activity_id = v1.id
  );
