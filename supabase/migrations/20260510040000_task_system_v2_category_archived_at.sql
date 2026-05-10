-- Task System v2: soft delete for task_category. Owners can archive
-- their personal categories; admins can archive any category. Archived
-- categories disappear from CategoryDropdown but tasks keep their FK
-- intact (no data loss, no migration of existing rows). Reversible —
-- set archived_at back to NULL to restore.

ALTER TABLE task_category
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_task_category_active
  ON task_category (scope, created_by_id)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN task_category.archived_at IS
'Soft-delete timestamp. NULL = active, populated = hidden from dropdowns. Tasks that already reference an archived category continue to render the chip (faded). Set back to NULL to restore.';
