-- Second attempt at the guard, after the first two were both wrong.
--
-- Attempt 1: is_internal_user() alone -- refused service_role and psql ops,
--            which carry no JWT and so have no auth.uid().
-- Attempt 2: current_user IN ('service_role','postgres',...) -- ALWAYS TRUE,
--            because the guard is called from a SECURITY DEFINER function and
--            that context makes current_user the function OWNER regardless of
--            who called. Changing the guard to SECURITY INVOKER did not help:
--            the DEFINER context of the CALLER still applies. Verified both
--            times by testing the negative case, which returned 21 rows to a
--            non-internal JWT.
--
-- The caller's identity therefore cannot be read from the role inside a DEFINER
-- function. It has to come from the request itself:
--   * a JWT present  -> trust its role claim; 'service_role' is infrastructure,
--                       anything else must satisfy is_internal_user()
--   * no JWT at all  -> a direct database connection (psql ops, or an edge
--                       function using the service key), judged on session_user,
--                       which DEFINER does not rewrite
CREATE OR REPLACE FUNCTION public.email_label_rule_proposals_guard()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $g$
DECLARE
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role   text;
BEGIN
  IF v_claims IS NULL THEN
    -- No request context: a direct connection. session_user survives DEFINER.
    RETURN session_user IN ('postgres', 'supabase_admin', 'service_role');
  END IF;

  v_role := (v_claims::json ->> 'role');
  IF v_role = 'service_role' THEN
    RETURN true;
  END IF;

  -- A browser session: the database's own definition of internal decides.
  RETURN public.is_internal_user();
END;
$g$;

GRANT EXECUTE ON FUNCTION public.email_label_rule_proposals_guard() TO authenticated, service_role;
