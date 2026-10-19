-- The real fix: revoke EXECUTE from PUBLIC, not from anon.
--
-- WHY THE FIRST ATTEMPT DID NOTHING. 20261003174916 ran
-- "REVOKE EXECUTE ... FROM anon" and printed REVOKE seven times. Five of the
-- six functions still returned data to an anonymous HTTP request afterwards,
-- because anon never held an explicit grant: the ACL reads
--
--     =X/postgres | postgres=X/postgres | authenticated=X/postgres | ...
--      ^^^^^^^^^^ this empty grantee is PUBLIC
--
-- Postgres grants EXECUTE to PUBLIC on every new function by default, and anon
-- is a member of PUBLIC. Revoking a grant the role does not hold succeeds and
-- changes nothing. municipal_project_orientation_bounds was the one that closed
-- precisely because it had no PUBLIC entry -- it was created with an explicit
-- grants block.
--
-- This is the same shape as the rest of this project's §15 list: the operation
-- reported success, and only the live anonymous request showed it had done
-- nothing. Grants are not evidence; the HTTP response is.
--
-- authenticated and service_role hold their OWN explicit grants (visible above),
-- so revoking PUBLIC does not touch the app.
--
-- ROLLBACK: GRANT EXECUTE ON FUNCTION <signature> TO PUBLIC;  -- per line.
REVOKE EXECUTE ON FUNCTION public.get_sweep_staging(p_sweep_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_portal_user_clients(p_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dropbox_folder_path(p_entity_type text, p_entity_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_actor_kind(p_auth_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.municipal_project_orientation_bounds(p_id uuid) FROM PUBLIC;

-- Belt and braces: make the intended access explicit rather than inherited, so
-- a future reader sees who may call these without decoding an ACL.
GRANT EXECUTE ON FUNCTION public.get_sweep_staging(p_sweep_id uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_portal_user_clients(p_user_id uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dropbox_folder_path(p_entity_type text, p_entity_id uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_actor_kind(p_auth_user_id uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role(user_id uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.municipal_project_orientation_bounds(p_id uuid) TO authenticated, service_role;
