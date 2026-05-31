-- Migration: Task System v2 — Phase 2 schema (time blocks)
-- Date: 2026-05-09
-- Spec: docs/TASK_SYSTEM_V2_SPEC.md (§4.1, §5)
-- Plan: docs/TASK_SYSTEM_V2_PHASE_2_PLAN.md
--
-- Creates the three time-block tables that back Phase 2's planning surface:
--   task_block_template        - recurring block definitions per user
--   task_block_instance        - per-day materialization (scheduled / in_progress / completed / skipped)
--   task_block_scheduled_task  - tasks queued into a block instance with manual rank
--
-- Depends on: 20260501000000_task_system_v2_schema_phase1.sql
--   - task table + task.category enum
--   - public.task_current_user_id() helper
--   - public.update_updated_at_column() trigger function
--
-- RLS model: peer-to-peer trust, matching Phase 1.
--   SELECT and INSERT for any authenticated user.
--   UPDATE / DELETE limited to the row owner. For task_block_scheduled_task
--   (no owner column), ownership is checked via the linked block_instance.

-- ============================================================================
-- 1. task_block_template — recurring block definitions (spec §5.2, §5.4)
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_block_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_id UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'prospecting', 'pipeline', 'ovis', 'email', 'personal', 'other'
  )),

  -- ISO weekday: 1=Monday .. 7=Sunday. Array form to support arbitrary
  -- day combos (e.g. {1,2,3,4,5} for Mon-Fri, {1,3,5} for M/W/F).
  byweekday SMALLINT[] NOT NULL,
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),

  active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT task_block_template_byweekday_valid CHECK (
    array_length(byweekday, 1) > 0
    AND byweekday <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  )
);

CREATE INDEX IF NOT EXISTS idx_task_block_template_owner
  ON task_block_template(owner_id);
CREATE INDEX IF NOT EXISTS idx_task_block_template_owner_active
  ON task_block_template(owner_id) WHERE active = TRUE;

DROP TRIGGER IF EXISTS trg_task_block_template_updated_at ON task_block_template;
CREATE TRIGGER trg_task_block_template_updated_at
  BEFORE UPDATE ON task_block_template
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 2. task_block_instance — per-day block materialization (spec §5.3, §5.5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_block_instance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL = ad-hoc one-off block (spec §5.5). When the template is deleted
  -- the link is severed but the historical instance is preserved.
  template_id UUID REFERENCES task_block_template(id) ON DELETE SET NULL,

  -- Denormalized so RLS continues to work on instances of deleted templates
  -- and on ad-hoc instances (where template_id IS NULL).
  owner_id UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,

  on_date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'prospecting', 'pipeline', 'ovis', 'email', 'personal', 'other'
  )),

  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'in_progress', 'completed', 'skipped'
  )),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevents the daily-instance generator (PR 4) from creating duplicates
-- when multiple devices open the dashboard simultaneously. Ad-hoc blocks
-- (template_id IS NULL) are excluded so users can create multiple ad-hoc
-- blocks on the same date.
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_block_instance_template_owner_date
  ON task_block_instance(template_id, owner_id, on_date)
  WHERE template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_block_instance_owner_date
  ON task_block_instance(owner_id, on_date);
CREATE INDEX IF NOT EXISTS idx_task_block_instance_template
  ON task_block_instance(template_id) WHERE template_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_task_block_instance_updated_at ON task_block_instance;
CREATE TRIGGER trg_task_block_instance_updated_at
  BEFORE UPDATE ON task_block_instance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 3. task_block_scheduled_task — tasks queued into a block (spec §5.6, §6.2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_block_scheduled_task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  block_instance_id UUID NOT NULL REFERENCES task_block_instance(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES task(id) ON DELETE CASCADE,

  manual_rank INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A task can only be scheduled into one block at a time (spec §5.6). The
-- unique constraint enforces this; the scheduler updates manual_rank
-- in-place rather than inserting duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_block_scheduled_task_unique_task
  ON task_block_scheduled_task(task_id);

CREATE INDEX IF NOT EXISTS idx_task_block_scheduled_task_instance_rank
  ON task_block_scheduled_task(block_instance_id, manual_rank);


-- ============================================================================
-- 4. RLS — peer-to-peer trust (spec §8), matching Phase 1
-- ============================================================================

-- The public.task_current_user_id() helper was created in Phase 1 and is
-- reused here. It maps auth.uid() → public.user.id.

-- ----- task_block_template -----

ALTER TABLE task_block_template ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_block_template_select_all_authenticated ON task_block_template;
CREATE POLICY task_block_template_select_all_authenticated ON task_block_template
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS task_block_template_insert_authenticated ON task_block_template;
CREATE POLICY task_block_template_insert_authenticated ON task_block_template
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS task_block_template_update_owner ON task_block_template;
CREATE POLICY task_block_template_update_owner ON task_block_template
  FOR UPDATE
  USING (public.task_current_user_id() = owner_id)
  WITH CHECK (public.task_current_user_id() = owner_id);

DROP POLICY IF EXISTS task_block_template_delete_owner ON task_block_template;
CREATE POLICY task_block_template_delete_owner ON task_block_template
  FOR DELETE USING (public.task_current_user_id() = owner_id);


-- ----- task_block_instance -----

ALTER TABLE task_block_instance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_block_instance_select_all_authenticated ON task_block_instance;
CREATE POLICY task_block_instance_select_all_authenticated ON task_block_instance
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS task_block_instance_insert_authenticated ON task_block_instance;
CREATE POLICY task_block_instance_insert_authenticated ON task_block_instance
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS task_block_instance_update_owner ON task_block_instance;
CREATE POLICY task_block_instance_update_owner ON task_block_instance
  FOR UPDATE
  USING (public.task_current_user_id() = owner_id)
  WITH CHECK (public.task_current_user_id() = owner_id);

DROP POLICY IF EXISTS task_block_instance_delete_owner ON task_block_instance;
CREATE POLICY task_block_instance_delete_owner ON task_block_instance
  FOR DELETE USING (public.task_current_user_id() = owner_id);


-- ----- task_block_scheduled_task -----
-- No owner column on this table; ownership is derived from the parent
-- task_block_instance. Policies subquery to check the instance's owner.

ALTER TABLE task_block_scheduled_task ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_block_scheduled_task_select_all_authenticated ON task_block_scheduled_task;
CREATE POLICY task_block_scheduled_task_select_all_authenticated ON task_block_scheduled_task
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS task_block_scheduled_task_insert_authenticated ON task_block_scheduled_task;
CREATE POLICY task_block_scheduled_task_insert_authenticated ON task_block_scheduled_task
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS task_block_scheduled_task_update_block_owner ON task_block_scheduled_task;
CREATE POLICY task_block_scheduled_task_update_block_owner ON task_block_scheduled_task
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM task_block_instance bi
      WHERE bi.id = task_block_scheduled_task.block_instance_id
        AND bi.owner_id = public.task_current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM task_block_instance bi
      WHERE bi.id = task_block_scheduled_task.block_instance_id
        AND bi.owner_id = public.task_current_user_id()
    )
  );

DROP POLICY IF EXISTS task_block_scheduled_task_delete_block_owner ON task_block_scheduled_task;
CREATE POLICY task_block_scheduled_task_delete_block_owner ON task_block_scheduled_task
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM task_block_instance bi
      WHERE bi.id = task_block_scheduled_task.block_instance_id
        AND bi.owner_id = public.task_current_user_id()
    )
  );


-- ============================================================================
-- 5. Documentation comments
-- ============================================================================

COMMENT ON TABLE task_block_template IS
  'Task System v2 Phase 2: recurring block definitions per user (spec §5.2). byweekday uses ISO 1=Mon..7=Sun.';
COMMENT ON COLUMN task_block_template.byweekday IS
  'ISO weekdays: 1=Mon, 7=Sun. Multi-value array, e.g. {1,2,3,4,5} for weekdays.';
COMMENT ON COLUMN task_block_template.active IS
  'Soft-deactivate without losing history. Inactive templates do not generate new instances.';

COMMENT ON TABLE task_block_instance IS
  'Per-day materialization of a block (spec §5.3). template_id NULL = ad-hoc one-off block (spec §5.5). status=skipped represents the user opting out for that day.';
COMMENT ON COLUMN task_block_instance.owner_id IS
  'Denormalized from the template so RLS works on ad-hoc blocks (template_id IS NULL) and on instances whose template was deleted.';

COMMENT ON TABLE task_block_scheduled_task IS
  'Tasks queued into a specific block instance with drag-rank ordering (spec §5.6). Unique on task_id — a task can only be scheduled into one block at a time.';
COMMENT ON COLUMN task_block_scheduled_task.manual_rank IS
  'Drag-rank within the block. Compute next rank as max(rank)+1024 to leave room for inserts. Ties broken deterministically by created_at.';
