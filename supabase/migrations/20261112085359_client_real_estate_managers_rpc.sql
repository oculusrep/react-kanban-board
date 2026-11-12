-- REM choices for a client, readable by that client's portal users.
-- Portal users can only SELECT their own contact row, so they can't resolve other
-- REMs' names directly. This returns just id + display name of:
--   * active "Site Selector" contacts on the client, and
--   * any contact currently tagged as REM on one of the client's site submits.
-- Caller must be internal or have portal access to p_client_id.

CREATE OR REPLACE FUNCTION public.client_real_estate_managers(p_client_id uuid)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH ids AS (
    SELECT r.contact_id AS id
      FROM contact_client_role r
      JOIN contact_client_role_type t ON t.id = r.role_id
     WHERE r.client_id = p_client_id AND r.is_active AND t.role_name = 'Site Selector'
    UNION
    SELECT s.real_estate_manager_id
      FROM site_submit s
     WHERE s.client_id = p_client_id AND s.real_estate_manager_id IS NOT NULL
  )
  SELECT c.id, NULLIF(btrim(concat_ws(' ', c.first_name, c.last_name)), '') AS name
    FROM ids JOIN contact c ON c.id = ids.id
   WHERE is_internal_user() OR p_client_id = ANY (portal_user_client_ids())
   ORDER BY 2;
$fn$;

-- Grants: RPC callable by signed-in users only.
REVOKE ALL ON FUNCTION public.client_real_estate_managers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_real_estate_managers(uuid) TO authenticated;
