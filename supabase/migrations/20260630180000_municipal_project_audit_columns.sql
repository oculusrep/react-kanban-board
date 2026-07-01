-- Add created_by_id / updated_by_id audit columns to municipal_project so the
-- slideout can show who created a project and who last edited it. Matches the
-- convention already used by deal / contact / assignment / site_submit /
-- critical_date (FK to user.auth_user_id, populated via shared triggers
-- set_creator_fields + update_audit_fields).
--
-- Existing rows (importer + agent-approved) get NULL created_by_id; the UI
-- renders "Imported" or "Created by agent" for those cases based on
-- source_import_id / source_research_run_id.

-- ---- 1: columns ----------------------------------------------------------
ALTER TABLE public.municipal_project
  ADD COLUMN IF NOT EXISTS created_by_id uuid,
  ADD COLUMN IF NOT EXISTS updated_by_id uuid;

-- FK to public.user(auth_user_id) — same target as deal.created_by_id.
-- ON DELETE SET NULL so removing a user doesn't cascade-delete their projects.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'municipal_project_created_by_id_fkey'
  ) THEN
    ALTER TABLE public.municipal_project
      ADD CONSTRAINT municipal_project_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES public."user"(auth_user_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'municipal_project_updated_by_id_fkey'
  ) THEN
    ALTER TABLE public.municipal_project
      ADD CONSTRAINT municipal_project_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES public."user"(auth_user_id) ON DELETE SET NULL;
  END IF;
END$$;

-- ---- 2: triggers ---------------------------------------------------------
-- set_creator_fields: BEFORE INSERT — auto-populates created_by_id from auth.uid()
-- if the auth user is a member of public."user" (skips portal users).
DROP TRIGGER IF EXISTS set_municipal_project_creator ON public.municipal_project;
CREATE TRIGGER set_municipal_project_creator
BEFORE INSERT ON public.municipal_project
FOR EACH ROW EXECUTE FUNCTION public.set_creator_fields();

-- update_audit_fields: BEFORE UPDATE — sets updated_at + updated_by_id.
-- This supersedes the existing municipal_project_set_updated_at trigger
-- (which only set updated_at), so we drop the old one to avoid two triggers
-- writing the same column.
DROP TRIGGER IF EXISTS municipal_project_set_updated_at ON public.municipal_project;
DROP TRIGGER IF EXISTS update_municipal_project_audit_fields ON public.municipal_project;
CREATE TRIGGER update_municipal_project_audit_fields
BEFORE UPDATE ON public.municipal_project
FOR EACH ROW EXECUTE FUNCTION public.update_audit_fields();

-- ---- 3: recreate the view so mp.* picks up the new columns ---------------
DROP VIEW IF EXISTS public.municipal_project_v;
CREATE VIEW public.municipal_project_v
WITH (security_invoker = true) AS
SELECT
  mp.*,
  ST_Y(mp.centroid) AS centroid_lat,
  ST_X(mp.centroid) AS centroid_lng,
  CASE WHEN mp.geometry IS NULL THEN NULL ELSE ST_AsGeoJSON(mp.geometry)::jsonb END AS geometry_geojson,
  m.name  AS municipality_name,
  m.state AS municipality_state,
  m.display_color AS municipality_display_color,
  ps.name AS computed_stage_name,
  COALESCE(mp.status_override_id, mp.status_stage_id) AS effective_stage_id,
  ps_eff.name  AS effective_stage_name,
  ps_eff.color AS effective_stage_color
FROM public.municipal_project mp
LEFT JOIN public.municipality  m      ON m.id      = mp.municipality_id
LEFT JOIN public.project_stage ps     ON ps.id     = mp.status_stage_id
LEFT JOIN public.project_stage ps_eff ON ps_eff.id = COALESCE(mp.status_override_id, mp.status_stage_id);
