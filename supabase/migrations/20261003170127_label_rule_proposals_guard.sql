-- Widen the proposals guard to the backend roles.
--
-- The first version checked is_internal_user() alone, which reads auth.uid().
-- A service-role call or a direct psql session has no JWT, so auth.uid() is
-- NULL and both were refused -- including the ops queries used to verify the
-- count. The intent was to exclude portal logins, not infrastructure.
--
-- Still an exception rather than an empty set for anyone else: a permission
-- failure must not be indistinguishable from "no proposals".
CREATE OR REPLACE FUNCTION public.email_label_rule_proposals_guard()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $g$
BEGIN
  -- Infrastructure: service_role (edge functions) and the owner role (psql ops).
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN true;
  END IF;
  RETURN public.is_internal_user();
END;
$g$;

GRANT EXECUTE ON FUNCTION public.email_label_rule_proposals_guard() TO authenticated, service_role;
