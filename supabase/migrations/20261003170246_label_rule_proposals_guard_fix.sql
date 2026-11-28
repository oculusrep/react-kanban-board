-- Fix a privilege bypass in the proposals guard.
--
-- The guard was SECURITY DEFINER, so inside it current_user is the function
-- OWNER (postgres), not the caller. Its infrastructure check --
-- current_user IN ('service_role','postgres','supabase_admin') -- was therefore
-- ALWAYS TRUE, and every authenticated caller passed, including portal logins
-- that is_internal_user() would have refused. Verified before this fix: an
-- authenticated session with a non-internal JWT got guard = true,
-- is_internal_user() = false, and 21 rows.
--
-- SECURITY INVOKER is required here: the whole point is to read the CALLER's
-- effective role. The function it guards stays SECURITY DEFINER (that is what
-- removes the per-row RLS cost), so this check is the only thing standing
-- between a portal login and internal data -- it must not be clever.
CREATE OR REPLACE FUNCTION public.email_label_rule_proposals_guard()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $g$
BEGIN
  -- Infrastructure roles carry no JWT, so auth.uid() is NULL and
  -- is_internal_user() cannot answer for them. With INVOKER, current_user is
  -- the caller's effective role: 'service_role' for edge functions,
  -- 'postgres'/'supabase_admin' for psql ops, 'authenticated' for a browser.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN true;
  END IF;
  RETURN public.is_internal_user();
END;
$g$;

GRANT EXECUTE ON FUNCTION public.email_label_rule_proposals_guard() TO authenticated, service_role;
