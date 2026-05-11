-- Task System v2: per-user categories alongside team-wide ones.
-- Adds task_category.scope ('global' | 'personal'). The 6 seeded
-- categories are all 'global'. New categories default to 'personal'
-- (set client-side; the column itself defaults to 'personal' too as
-- a safety net). Anyone can create either scope.
--
-- Uniqueness rules become scope-aware (and case-insensitive):
--   - global:   lower(name) is unique across all global categories
--   - personal: lower(name) is unique within ONE user's personal categories
--
-- "Bookkeeping" personal-to-Mike does not collide with "Bookkeeping"
-- personal-to-Arty, and neither collides with a global "bookkeeping".

ALTER TABLE task_category
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'personal';

ALTER TABLE task_category
  DROP CONSTRAINT IF EXISTS task_category_scope_check;

ALTER TABLE task_category
  ADD CONSTRAINT task_category_scope_check
  CHECK (scope IN ('global', 'personal'));

-- Backfill: the 6 seeded categories are team-wide.
UPDATE task_category
SET scope = 'global'
WHERE name IN ('prospecting', 'pipeline', 'ovis', 'email', 'personal', 'other')
  AND scope = 'personal';

-- Personal scope must have an owner so the per-user uniqueness predicate
-- can use it. Backfill: any personal row missing created_by_id is an
-- error condition; safest is to coerce it to global (we have none today).
UPDATE task_category
SET scope = 'global'
WHERE scope = 'personal' AND created_by_id IS NULL;

-- Enforce: personal categories must have a creator.
ALTER TABLE task_category
  DROP CONSTRAINT IF EXISTS task_category_personal_creator_check;
ALTER TABLE task_category
  ADD CONSTRAINT task_category_personal_creator_check
  CHECK (scope = 'global' OR (scope = 'personal' AND created_by_id IS NOT NULL));

-- Drop the old simple UNIQUE on name (case-sensitive, ignored scope) and
-- replace with two partial, case-insensitive indexes.
ALTER TABLE task_category
  DROP CONSTRAINT IF EXISTS task_category_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS task_category_global_name_uniq
  ON task_category (lower(name))
  WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS task_category_personal_name_uniq
  ON task_category (lower(name), created_by_id)
  WHERE scope = 'personal';

CREATE INDEX IF NOT EXISTS idx_task_category_scope_creator
  ON task_category (scope, created_by_id);

COMMENT ON COLUMN task_category.scope IS
'global = visible to everyone (the original 6 seeded categories live here). personal = visible only to created_by_id. Default is personal so new ad-hoc categories don''t pollute the shared list.';
