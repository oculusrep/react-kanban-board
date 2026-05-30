-- Municipal project tools: let non-admin holders of can_access_municipal_import do full CRUD.
--
-- Two bugs in the original write policies (municipal_*_admin_write):
--   1. They only allowed ovis_role='admin', ignoring the can_access_municipal_import
--      permission that the route guard (MunicipalRoute) already grants access by.
--   2. They matched "user".id = auth.uid(), but auth.uid() is the auth identity, which
--      maps to "user".auth_user_id, not "user".id. Only users where id == auth_user_id
--      (today: the admin) ever matched, so every other user's writes were rejected.
--
-- Fix: a dedicated SECURITY DEFINER helper that joins on auth_user_id (correct column)
-- and honors the same merged user-over-role permission resolution the app uses.
-- Modeled on public.user_has_starbucks_access().

CREATE OR REPLACE FUNCTION public.user_has_municipal_access()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM "user" u
    LEFT JOIN role r ON r.name = u.ovis_role
    WHERE u.auth_user_id = auth.uid()
      AND (
        u.ovis_role = 'admin'
        OR COALESCE(
             (u.permissions ->> 'can_access_municipal_import')::boolean,  -- user-level override
             (r.permissions ->> 'can_access_municipal_import')::boolean,   -- role default
             FALSE
           ) = TRUE
      )
  );
$function$;

-- Replace the admin-only write policies on all five municipal tables.
-- Reads stay open to all authenticated users via the existing *_read policies.

DROP POLICY IF EXISTS municipality_admin_write              ON public.municipality;
DROP POLICY IF EXISTS municipal_project_admin_write          ON public.municipal_project;
DROP POLICY IF EXISTS municipal_import_admin_write           ON public.municipal_import;
DROP POLICY IF EXISTS municipality_stage_mapping_admin_write ON public.municipality_stage_mapping;
DROP POLICY IF EXISTS project_stage_admin_write              ON public.project_stage;

CREATE POLICY municipality_write ON public.municipality
  FOR ALL TO authenticated
  USING (public.user_has_municipal_access())
  WITH CHECK (public.user_has_municipal_access());

CREATE POLICY municipal_project_write ON public.municipal_project
  FOR ALL TO authenticated
  USING (public.user_has_municipal_access())
  WITH CHECK (public.user_has_municipal_access());

CREATE POLICY municipal_import_write ON public.municipal_import
  FOR ALL TO authenticated
  USING (public.user_has_municipal_access())
  WITH CHECK (public.user_has_municipal_access());

CREATE POLICY municipality_stage_mapping_write ON public.municipality_stage_mapping
  FOR ALL TO authenticated
  USING (public.user_has_municipal_access())
  WITH CHECK (public.user_has_municipal_access());

CREATE POLICY project_stage_write ON public.project_stage
  FOR ALL TO authenticated
  USING (public.user_has_municipal_access())
  WITH CHECK (public.user_has_municipal_access());
