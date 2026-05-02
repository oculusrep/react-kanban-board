-- Migration: Task System v2 — widen timeline activity_type CHECK constraints
-- Date: 2026-05-02
-- Spec: docs/TASK_SYSTEM_V2_SPEC.md §13
--
-- When a v2 task is completed, we post a row to the linked object's timeline.
-- The chat-style timelines for property and site_submit are restricted by
-- CHECK constraints that don't include the new 'task_completed' event type.
-- Widening both so the post can land.
--
-- The activity-style timeline (used by deal, client, contact, assignment) uses
-- the activity table with activity_type_id FK to the activity_type lookup table
-- — no enum widening needed there. We reuse the existing 'Task' type with
-- status 'Completed'.

ALTER TABLE property_activity DROP CONSTRAINT IF EXISTS property_activity_activity_type_check;
ALTER TABLE property_activity ADD CONSTRAINT property_activity_activity_type_check
  CHECK (activity_type = ANY (ARRAY[
    'phone_call'::text,
    'email'::text,
    'sms'::text,
    'voicemail'::text,
    'linkedin'::text,
    'task_completed'::text
  ]));

ALTER TABLE site_submit_activity DROP CONSTRAINT IF EXISTS site_submit_activity_activity_type_check;
ALTER TABLE site_submit_activity ADD CONSTRAINT site_submit_activity_activity_type_check
  CHECK ((activity_type)::text = ANY ((ARRAY[
    'comment'::character varying,
    'file_shared'::character varying,
    'status_change'::character varying,
    'task_completed'::character varying
  ])::text[]));
