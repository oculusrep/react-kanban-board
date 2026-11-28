-- set_portal_file_visibility was SECURITY DEFINER with no caller check and EXECUTE
-- granted to authenticated, so any logged-in account — including a client portal
-- login — could share or hide any file on any record, and stamp any user id as
-- changed_by_id.
--
-- Now internal users only, and changed_by_id falls back to the real caller.
-- Portal uploads (contact.portal_can_upload_deal_files) are shared by the
-- dropbox-proxy edge function with the service role, not through this RPC.
--
-- Body otherwise unchanged from the live definition (pg_get_functiondef, 2026-10-16).

CREATE OR REPLACE FUNCTION public.set_portal_file_visibility(p_dropbox_path text, p_entity_type character varying, p_entity_id uuid, p_is_visible boolean, p_site_submit_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO portal_file_visibility (
    dropbox_path,
    entity_type,
    entity_id,
    site_submit_id,
    is_visible,
    changed_by_id
  )
  VALUES (
    p_dropbox_path,
    p_entity_type,
    p_entity_id,
    p_site_submit_id,
    p_is_visible,
    COALESCE(p_user_id, auth.uid())
  )
  ON CONFLICT (entity_type, entity_id, dropbox_path)
  DO UPDATE SET
    is_visible = p_is_visible,
    site_submit_id = COALESCE(p_site_submit_id, portal_file_visibility.site_submit_id),
    changed_by_id = COALESCE(p_user_id, auth.uid()),
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- Grants: EXECUTE for authenticated only (internal check is inside).
REVOKE ALL ON FUNCTION public.set_portal_file_visibility(text, character varying, uuid, boolean, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_portal_file_visibility(text, character varying, uuid, boolean, uuid, uuid) TO authenticated, service_role;
