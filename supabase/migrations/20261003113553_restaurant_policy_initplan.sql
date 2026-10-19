-- Performance only -- no change to who can read what.
--
-- 20261003113119 wrapped these two tables' policies in (select is_internal_user())
-- to make them an InitPlan, and claimed that fixed the restaurant_trend API
-- timeout. It did not, and EXPLAIN shows why: BOTH tables carry a SECOND, older
-- policy whose qual is a bare can_manage_operations(). Policies are OR-ed, so for a
-- caller the InitPlan evaluates false for (anon, or a portal user) Postgres still
-- has to run the per-row function for every row:
--
--   Seq Scan on restaurant_trend (actual rows=0)
--     Filter: ((InitPlan 1).col1 OR can_manage_operations())
--     Rows Removed by Filter: 50112      -- 4.6s, over the ~3s API timeout
--
-- An internal user was always fast (37ms) because the InitPlan short-circuits the
-- OR. Wrapping the second policy too makes both operands one-time.
--
-- can_manage_operations() is STABLE, so (select ...) is semantically identical --
-- it only changes when it is evaluated, not what it returns.

BEGIN;

ALTER POLICY "Allow operations to read restaurant_trend"
  ON public.restaurant_trend USING ((select can_manage_operations()));

ALTER POLICY "Allow operations to read restaurant_location"
  ON public.restaurant_location USING ((select can_manage_operations()));

COMMIT;

-- ~28 other policies on tables over 1,000 rows still call a function per row
-- (portal_email_send 51k, email_object_link 40k, contact, property, site_submit,
-- note). Same one-line fix each; tracked as separate work in
-- docs/SUPABASE_ANON_EXPOSURE_AUDIT.md rather than bundled here.
