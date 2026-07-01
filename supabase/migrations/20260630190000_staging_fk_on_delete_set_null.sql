-- Fix: deleting a municipal_project row raises a FK violation when a
-- municipal_project_staging row still references it via approved_municipal_project_id
-- or matched_existing_id. Result: the slideout's Delete button silently fails
-- (throws → catch block sets an error message the user often can't see).
--
-- The staging row keeps its own copy of all source fields, so nulling out the
-- FK on project deletion is safe: we preserve staging history but let the
-- project row be removed.
--
-- Change both FKs to ON DELETE SET NULL. Same ergonomic already used for
-- municipal_project.created_by_id / updated_by_id.

ALTER TABLE public.municipal_project_staging
  DROP CONSTRAINT IF EXISTS municipal_project_staging_approved_municipal_project_id_fkey,
  ADD CONSTRAINT municipal_project_staging_approved_municipal_project_id_fkey
    FOREIGN KEY (approved_municipal_project_id)
    REFERENCES public.municipal_project(id)
    ON DELETE SET NULL;

ALTER TABLE public.municipal_project_staging
  DROP CONSTRAINT IF EXISTS municipal_project_staging_matched_existing_id_fkey,
  ADD CONSTRAINT municipal_project_staging_matched_existing_id_fkey
    FOREIGN KEY (matched_existing_id)
    REFERENCES public.municipal_project(id)
    ON DELETE SET NULL;
