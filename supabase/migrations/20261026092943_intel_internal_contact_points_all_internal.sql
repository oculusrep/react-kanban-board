-- Open intel_internal_contact_points() to every internal user.
-- Docs: docs/CONTACT_PASTE_SIGNATURE_PLAN.md
--
-- It feeds the "never prefill Oculus details" filter. It was gated by the Intel
-- email-lookup allowlist (Mike only), so the new "Paste signature" box in
-- ContactFormModal — for all internal users — would have failed closed for
-- everyone else. Now: is_internal_user(). Portal and coach users stay refused
-- (42501); anon has no EXECUTE.
--
-- Body is the live definition (pg_get_functiondef, 2026-10-26) with only the
-- gate changed. The email-lookup functions keep their allowlist gate.

CREATE OR REPLACE FUNCTION public.intel_internal_contact_points()
 RETURNS TABLE(kind text, value text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'internal users only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 'email'::text, lower(btrim(u.email))
  FROM public."user" u
  WHERE u.ovis_role IN ('admin', 'broker_full', 'broker_lite', 'va') AND coalesce(btrim(u.email), '') <> ''
  UNION
  SELECT 'email'::text, lower(btrim(g.google_email)) FROM public.gmail_connection g
  UNION
  SELECT 'phone'::text, regexp_replace(u.mobile_phone, '\D', '', 'g')
  FROM public."user" u
  WHERE u.ovis_role IN ('admin', 'broker_full', 'broker_lite', 'va')
    AND length(regexp_replace(coalesce(u.mobile_phone, ''), '\D', '', 'g')) >= 7;
END;
$function$;

-- CREATE OR REPLACE keeps the existing ACL; restated so this file stands alone.
REVOKE ALL ON FUNCTION public.intel_internal_contact_points() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intel_internal_contact_points() TO authenticated, service_role;
