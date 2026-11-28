-- Close unauthenticated RPC reads: revoke anon EXECUTE on six SECURITY DEFINER
-- functions with no caller check.
--
-- CONFIRMED over HTTP with the publishable key and NO Authorization header
-- (2026-10-03):
--   get_sweep_staging                    2,610 bytes of research staging --
--                                        project names, street addresses,
--                                        location descriptions, municipalities
--   get_portal_user_clients              client_id + client_name for a portal user
--   get_dropbox_folder_path              a real Dropbox folder path
--   resolve_actor_kind                   "broker" for any auth user id (oracle)
-- Exposed but disclosed nothing:
--   get_user_role                        returns null (reads auth.uid())
--   municipal_project_orientation_bounds returns [] today; its LATERAL join needs
--                                        boundary_municipality rows that do not
--                                        exist yet. Revoked BEFORE boundaries
--                                        load and make it live.
--
-- SECURITY DEFINER is what makes these reads possible: it removes RLS from the
-- question entirely, so the anon-exposure audit's finding that "RLS is doing its
-- job" for relations says nothing about them. That audit measured
-- has_table_privilege and /rest/v1/ relation reads; function EXECUTE grants were
-- never in scope.
--
-- REVOKE is the minimum fix because none of these has a pre-login caller: every
-- call site is an authenticated app page. authenticated is deliberately left
-- untouched, so nothing in the app changes.
--
-- NOT revoked: validate_portal_invite_token, which must stay anon-callable --
-- it is the pre-login invite page. Its own problems (an unauthenticated write
-- and a delete reached through cleanup_orphaned_auth_identity) are a separate
-- change, decided separately.
--
-- ROLLBACK: GRANT EXECUTE ON FUNCTION <signature> TO anon;  -- per line below.
-- Nothing is dropped or altered, only a grant removed, so a re-GRANT restores
-- the exact prior state.
REVOKE EXECUTE ON FUNCTION public.get_sweep_staging(p_sweep_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_portal_user_clients(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dropbox_folder_path(p_entity_type text, p_entity_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_actor_kind(p_auth_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM anon;
-- get_user_role is overloaded; both forms were anon-callable.
REVOKE EXECUTE ON FUNCTION public.get_user_role(user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.municipal_project_orientation_bounds(p_id uuid) FROM anon;
