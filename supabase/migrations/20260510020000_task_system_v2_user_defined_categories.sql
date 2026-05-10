-- Task System v2: convert categories from a fixed text enum
-- (CHECK constraint with 6 hardcoded values) to a team-wide
-- user-extensible task_category table. Users can create new categories
-- inline from the Inbox dropdown going forward.

-- 1. Create the task_category table.
CREATE TABLE IF NOT EXISTS task_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'slate',
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid NULL REFERENCES "user"(id) ON DELETE SET NULL,
  CONSTRAINT task_category_color_check CHECK (
    color IN ('amber', 'blue', 'indigo', 'gray', 'green', 'slate', 'red', 'teal')
  )
);

COMMENT ON TABLE task_category IS
'Team-wide list of task categories. Seeded with the original 6 fixed values; users can add more via the Inbox dropdown. color is a palette key resolved client-side to bg-/text- Tailwind classes.';

-- 2. Seed the existing 6 categories so nothing breaks.
INSERT INTO task_category (name, color, sort_order)
VALUES
  ('prospecting', 'amber',   10),
  ('pipeline',    'blue',    20),
  ('ovis',        'indigo',  30),
  ('email',       'gray',    40),
  ('personal',    'green',   50),
  ('other',       'slate',   60)
ON CONFLICT (name) DO NOTHING;

-- 3. Add task.category_id FK column (nullable for the backfill window).
ALTER TABLE task ADD COLUMN IF NOT EXISTS category_id uuid NULL
  REFERENCES task_category(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_task_category_id ON task(category_id);

-- 4. Backfill category_id from the existing text column.
UPDATE task SET category_id = c.id
FROM task_category c
WHERE task.category = c.name
  AND task.category_id IS NULL;

-- 5. Make category_id NOT NULL now that all rows are backfilled.
--    (Any task missed by the backfill would have an unknown legacy value;
--    coerce those to 'other' as a safety net before locking down.)
UPDATE task SET category_id = (SELECT id FROM task_category WHERE name = 'other')
WHERE category_id IS NULL;

ALTER TABLE task ALTER COLUMN category_id SET NOT NULL;

-- 6. Drop the CHECK constraint on task.category text column. The text
--    column itself stays for one release as a safety net; it'll be
--    dropped in a follow-up migration once the FK has been load-bearing
--    in prod for a while.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_category_check'
  ) THEN
    ALTER TABLE task DROP CONSTRAINT task_category_check;
  END IF;
END $$;

COMMENT ON COLUMN task.category_id IS
'FK to task_category. Source of truth for a task''s category since 2026-05-10. The legacy task.category text column is retained as a fallback for one release and will be dropped in a follow-up migration.';
