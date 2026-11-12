-- Lock down contact_client_role / contact_client_role_type.
-- Before: temp_contact_client_role_all (ALL, authenticated, USING true / CHECK true) let any
-- signed-in user — including client portal users — read and rewrite every contact's client
-- roles; role types were readable by all authenticated users; anon held ALL table grants.
-- After: same model as contact_client_relation — internal ops roles read, ops writers write.
-- Portal users get REM names only via client_real_estate_managers() (SECURITY DEFINER).

BEGIN;

-- contact_client_role -------------------------------------------------------
DROP POLICY IF EXISTS temp_contact_client_role_all ON public.contact_client_role;

CREATE POLICY contact_client_role_ops_select ON public.contact_client_role
  FOR SELECT TO authenticated
  USING ((SELECT public.can_manage_operations()));
CREATE POLICY contact_client_role_ops_insert ON public.contact_client_role
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['admin','broker_full','va','testing']));
CREATE POLICY contact_client_role_ops_update ON public.contact_client_role
  FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['admin','broker_full','va','testing']))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['admin','broker_full','va','testing']));
CREATE POLICY contact_client_role_ops_delete ON public.contact_client_role
  FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['admin','broker_full','va','testing']));

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.contact_client_role FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_client_role TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_client_role TO service_role;

-- contact_client_role_type (lookup, read-only from the app) ------------------
DROP POLICY IF EXISTS temp_contact_client_role_type_read ON public.contact_client_role_type;
CREATE POLICY contact_client_role_type_ops_select ON public.contact_client_role_type
  FOR SELECT TO authenticated
  USING ((SELECT public.can_manage_operations()));

REVOKE ALL ON public.contact_client_role_type FROM anon, authenticated;
GRANT SELECT ON public.contact_client_role_type TO authenticated;
GRANT SELECT ON public.contact_client_role_type TO service_role;

-- v_contact_client_roles is security_invoker, so it inherits the above; tighten its grants.
REVOKE ALL ON public.v_contact_client_roles FROM anon, authenticated;
GRANT SELECT ON public.v_contact_client_roles TO authenticated;

-- client_real_estate_managers: add is_site_selector so the internal picker can list only
-- Site Selectors while read-only displays can still name a tagged former REM.
-- Return type changes → DROP + CREATE (body otherwise as live, 20261112085359).
DROP FUNCTION IF EXISTS public.client_real_estate_managers(uuid);
CREATE FUNCTION public.client_real_estate_managers(p_client_id uuid)
RETURNS TABLE (id uuid, name text, is_site_selector boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH sel AS (
    SELECT r.contact_id AS id
      FROM contact_client_role r
      JOIN contact_client_role_type t ON t.id = r.role_id
     WHERE r.client_id = p_client_id AND r.is_active AND t.role_name = 'Site Selector'
  ), ids AS (
    SELECT id FROM sel
    UNION
    SELECT s.real_estate_manager_id
      FROM site_submit s
     WHERE s.client_id = p_client_id AND s.real_estate_manager_id IS NOT NULL
  )
  SELECT c.id,
         NULLIF(btrim(concat_ws(' ', c.first_name, c.last_name)), '') AS name,
         c.id IN (SELECT id FROM sel) AS is_site_selector
    FROM ids JOIN contact c ON c.id = ids.id
   WHERE is_internal_user() OR p_client_id = ANY (portal_user_client_ids())
   ORDER BY 2;
$fn$;
REVOKE ALL ON FUNCTION public.client_real_estate_managers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_real_estate_managers(uuid) TO authenticated;

COMMIT;
