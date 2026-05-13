-- PostgREST's .upsert({ onConflict: 'template_id,owner_id,on_date' }) needs
-- an actual UNIQUE constraint, not a partial unique index. The existing
-- partial index idx_task_block_instance_template_owner_date covers
-- WHERE template_id IS NOT NULL — fine for raw SQL UPSERTs but PostgREST
-- 400s on it. Adding a regular UNIQUE constraint. Ad-hoc instances
-- (template_id IS NULL) won't conflict with each other because Postgres
-- treats NULL ≠ NULL for uniqueness purposes, so behavior matches the
-- old partial index for our use case.

ALTER TABLE task_block_instance
  ADD CONSTRAINT task_block_instance_template_owner_date_key
  UNIQUE (template_id, owner_id, on_date);

-- The partial unique index is now redundant; drop it.
DROP INDEX IF EXISTS idx_task_block_instance_template_owner_date;
