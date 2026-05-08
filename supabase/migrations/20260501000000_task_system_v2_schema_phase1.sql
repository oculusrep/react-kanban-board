-- Migration: Task System v2 — Phase 1 schema
-- Date: 2026-05-01
-- Spec: docs/TASK_SYSTEM_V2_SPEC.md
-- Plan: docs/TASK_SYSTEM_V2_PHASE_1_PLAN.md
--
-- Creates the core tables for the Task System v2 redesign:
--   task          - replaces task-flavored rows in the activity table
--   task_project  - optional umbrella for multi-week efforts
--
-- Block-related tables (task_block_template, task_block_instance,
-- task_block_scheduled_task) are deferred to Phase 2.
-- task_recurrence_rule + task.recurrence_rule_id deferred to Phase 5.
-- task_outreach_draft deferred to Phase 6 (Hunter migration).
--
-- RLS model:
--   All authenticated users can SELECT and INSERT (peer-to-peer).
--   UPDATE / DELETE limited to the task's owner, creator, or current assignee.
--   Matches OVIS's 3-user trusted-team model — no per-user data isolation.


-- ============================================================================
-- 0. Helper function (idempotent)
-- ============================================================================
-- The standard updated_at trigger function already exists in the schema for
-- other tables, but CREATE OR REPLACE makes this migration safe to run on
-- environments where it doesn't (e.g., a fresh dev DB).

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ============================================================================
-- 1. task_project — optional umbrella for multi-week efforts (spec §6.4)
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_project (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'prospecting', 'pipeline', 'ovis', 'email', 'personal', 'other'
  )),
  owner_id UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'completed', 'archived'
  )),
  target_date DATE,

  description TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_project_owner ON task_project(owner_id);
CREATE INDEX IF NOT EXISTS idx_task_project_status ON task_project(status);
CREATE INDEX IF NOT EXISTS idx_task_project_category ON task_project(category);

DROP TRIGGER IF EXISTS trg_task_project_updated_at ON task_project;
CREATE TRIGGER trg_task_project_updated_at
  BEFORE UPDATE ON task_project
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 2. task — core task entity (spec §4.1, §6)
-- ============================================================================

CREATE TABLE IF NOT EXISTS task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  subject TEXT NOT NULL,
  description TEXT,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'in_progress', 'completed', 'cancelled'
  )),
  category TEXT NOT NULL DEFAULT 'personal' CHECK (category IN (
    'prospecting', 'pipeline', 'ovis', 'email', 'personal', 'other'
  )),

  -- Ownership / assignment (spec §8)
  owner_id UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  assigned_by_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
  created_by_id UUID REFERENCES "user"(id) ON DELETE SET NULL,

  -- Hierarchy / grouping (spec §6.3, §6.4)
  parent_task_id UUID REFERENCES task(id) ON DELETE CASCADE,
  project_id UUID REFERENCES task_project(id) ON DELETE SET NULL,

  -- Scheduling fields (spec §6.1, §6.2)
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  high_flag BOOLEAN NOT NULL DEFAULT FALSE,
  top3_date DATE,
  due_at TIMESTAMPTZ,
  remind_at TIMESTAMPTZ,

  -- Hunter integration (spec §14) — present from Phase 1 so Hunter can populate it
  -- without an additional migration when its phase comes around
  signal_strength TEXT CHECK (signal_strength IS NULL OR signal_strength IN (
    'HOT', 'WARM_PLUS', 'WARM', 'COOL'
  )),

  -- Used by stale-task / stale-lead detection; updated whenever a related
  -- prospecting_activity is logged (port of Hunter's last_contacted_at trigger,
  -- to be wired up in Phase 6)
  last_activity_at TIMESTAMPTZ,

  -- Object links (spec §7.1) — all nullable, multiple may be set
  client_id UUID REFERENCES client(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deal(id) ON DELETE SET NULL,
  property_id UUID REFERENCES property(id) ON DELETE SET NULL,
  site_submit_id UUID REFERENCES site_submit(id) ON DELETE SET NULL,
  assignment_id UUID REFERENCES assignment(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contact(id) ON DELETE SET NULL,

  -- Completion (spec §13)
  completed_at TIMESTAMPTZ,
  completion_note TEXT,
  private_completion BOOLEAN NOT NULL DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Invariants
  CONSTRAINT task_completed_consistency CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR
    (status <> 'completed' AND completed_at IS NULL)
  )
);

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_task_owner ON task(owner_id);
CREATE INDEX IF NOT EXISTS idx_task_assigned_by ON task(assigned_by_id);
CREATE INDEX IF NOT EXISTS idx_task_status ON task(status);
CREATE INDEX IF NOT EXISTS idx_task_category ON task(category);
CREATE INDEX IF NOT EXISTS idx_task_due_at ON task(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_top3_date ON task(top3_date) WHERE top3_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_remind_at ON task(remind_at) WHERE remind_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_parent ON task(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_project ON task(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_client ON task(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_deal ON task(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_property ON task(property_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_site_submit ON task(site_submit_id) WHERE site_submit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_assignment ON task(assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_contact ON task(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_high_flag ON task(high_flag) WHERE high_flag = TRUE;
CREATE INDEX IF NOT EXISTS idx_task_last_activity ON task(last_activity_at) WHERE last_activity_at IS NOT NULL;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_task_updated_at ON task;
CREATE TRIGGER trg_task_updated_at
  BEFORE UPDATE ON task
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 3. RLS — peer-to-peer trust model for OVIS team (spec §8)
-- ============================================================================

-- Helper: returns the OVIS user.id for the current auth user. STABLE so
-- Postgres can cache within a query. SECURITY DEFINER avoids triggering RLS
-- on the "user" table during policy evaluation.
CREATE OR REPLACE FUNCTION public.task_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result uuid;
BEGIN
  SELECT id INTO result FROM "user" WHERE auth_user_id = auth.uid() LIMIT 1;
  RETURN result;
END;
$$;

-- ----- task RLS -----

ALTER TABLE task ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all tasks (supports Watching lane, team coord)
DROP POLICY IF EXISTS task_select_all_authenticated ON task;
CREATE POLICY task_select_all_authenticated ON task
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Any authenticated user can create tasks
DROP POLICY IF EXISTS task_insert_authenticated ON task;
CREATE POLICY task_insert_authenticated ON task
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Update: must be the owner, creator, or assigner of the task
DROP POLICY IF EXISTS task_update_owner_or_assigner ON task;
CREATE POLICY task_update_owner_or_assigner ON task
  FOR UPDATE
  USING (
    public.task_current_user_id() = owner_id
    OR public.task_current_user_id() = created_by_id
    OR public.task_current_user_id() = assigned_by_id
  )
  WITH CHECK (
    public.task_current_user_id() = owner_id
    OR public.task_current_user_id() = created_by_id
    OR public.task_current_user_id() = assigned_by_id
  );

-- Delete: same rule as update
DROP POLICY IF EXISTS task_delete_owner_or_assigner ON task;
CREATE POLICY task_delete_owner_or_assigner ON task
  FOR DELETE
  USING (
    public.task_current_user_id() = owner_id
    OR public.task_current_user_id() = created_by_id
    OR public.task_current_user_id() = assigned_by_id
  );

-- ----- task_project RLS -----

ALTER TABLE task_project ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_project_select_all_authenticated ON task_project;
CREATE POLICY task_project_select_all_authenticated ON task_project
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS task_project_insert_authenticated ON task_project;
CREATE POLICY task_project_insert_authenticated ON task_project
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS task_project_update_owner ON task_project;
CREATE POLICY task_project_update_owner ON task_project
  FOR UPDATE
  USING (public.task_current_user_id() = owner_id)
  WITH CHECK (public.task_current_user_id() = owner_id);

DROP POLICY IF EXISTS task_project_delete_owner ON task_project;
CREATE POLICY task_project_delete_owner ON task_project
  FOR DELETE
  USING (public.task_current_user_id() = owner_id);


-- ============================================================================
-- 4. Comments (Postgres COMMENT ON for documentation)
-- ============================================================================

COMMENT ON TABLE task IS
  'Task System v2 core entity. Replaces task-flavored rows in the activity table. See docs/TASK_SYSTEM_V2_SPEC.md.';
COMMENT ON COLUMN task.high_flag IS
  'Single sparingly-used priority flag. Floats task to top of its block. Avoids P1-P4 inflation.';
COMMENT ON COLUMN task.top3_date IS
  'When set, this task is pinned to the user''s "Top 3 today" lane for that date.';
COMMENT ON COLUMN task.due_at IS
  'Triggers overdue badges + alerts. Does NOT auto-sort the queue; manual rank wins (spec §6.2).';
COMMENT ON COLUMN task.private_completion IS
  'When TRUE, completing this task does NOT post to the linked object''s timeline (spec §13).';
COMMENT ON COLUMN task.signal_strength IS
  'Hunter-driven lead quality. NULL for non-prospecting tasks.';
COMMENT ON COLUMN task.last_activity_at IS
  'Updated by Hunter prospecting_activity trigger in Phase 6. Used for stale-lead detection.';

COMMENT ON TABLE task_project IS
  'Optional multi-week umbrella for related tasks (spec §6.4). Single category — no cross-category projects.';
