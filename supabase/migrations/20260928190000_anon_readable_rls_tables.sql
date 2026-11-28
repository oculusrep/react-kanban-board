-- A blind spot in the 2026-09-28 audit: RLS-enabled tables whose policies apply
-- to the `public` role with USING (true).
--
-- The original sweep looked for tables with RLS DISABLED and views without
-- security_invoker. It missed that RLS being ON proves nothing if a policy is
-- written `TO public USING (true)` — `public` includes `anon`, so the publishable
-- key reads the table. Found while merging, verified by anonymous curl:
--
--   role                   7 rows leaked  (role names + the permissions JSON —
--                                          hands an attacker the authz model)
--   goal                   2 rows leaked  (company revenue / deal-count targets)
--   site_submit_deal_type  7 rows leaked  (lookup)
--   contact_contact_type   0 rows leaked  ONLY because the table is empty; the
--                                          policy is equally open
--
-- nces_private_school (22,510 rows) held anon grants too but its policy is
-- already TO authenticated, so RLS held. Its grants are revoked anyway — the
-- grant is what made the others reachable.

BEGIN;

-- Belt: take away the grant.
REVOKE ALL ON public.role                  FROM anon;
REVOKE ALL ON public.goal                  FROM anon;
REVOKE ALL ON public.site_submit_deal_type FROM anon;
REVOKE ALL ON public.contact_contact_type  FROM anon;
REVOKE ALL ON public.nces_private_school   FROM anon;

-- Braces: narrow the policies from `public` (which includes anon) to
-- `authenticated`. service_role has BYPASSRLS, so edge functions are unaffected.
ALTER POLICY "Allow all authenticated users to read role" ON public.role                  TO authenticated;
ALTER POLICY "Anyone can read goals"                      ON public.goal                  TO authenticated;
ALTER POLICY "Allow all to read site_submit_deal_type"    ON public.site_submit_deal_type TO authenticated;
ALTER POLICY "Allow all to read contact_contact_type"     ON public.contact_contact_type  TO authenticated;

COMMIT;

-- The write-side policies on these tables (is_admin() / ALL TO public) are left
-- alone: their predicates already evaluate false for an anonymous caller, and the
-- REVOKE above removes the privilege regardless.
--
-- Standing lesson for future audits: "RLS enabled" is not the test. The test is
-- an anonymous request. See docs/SUPABASE_ANON_EXPOSURE_AUDIT.md.
