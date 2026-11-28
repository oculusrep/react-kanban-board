-- Package Tracker: portal users and anon see nothing (migration 20261022115504 and earlier).
--
-- 1. As a real client-portal user (authenticated, NOT internal) who has access
--    to a Starbucks-family client — so site_submit RLS lets them see Starbucks
--    sites — package_site_stage() returns NULL for a packaged site AND for a
--    site they can see, and
--    deal_package, v_deal_package_slide and v_deal_package_progress return 0 rows.
-- 2. As anon: package_site_stage(), both views and deal_package are permission denied.
--
-- The portal user is chosen by query (no id or email in this file). Read-only.
-- No BEGIN/ROLLBACK of its own — run wrapped (see package_task_clock_test.sql header).

-- Pick the site first (as the migration owner), then become the portal user.
SELECT set_config('pkgtest.site', (SELECT site_submit_id::text FROM deal_package WHERE site_submit_id IS NOT NULL ORDER BY created_at LIMIT 1), true);
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', au.id, 'role', 'authenticated')::text, true)
  FROM auth.users au
  JOIN contact c ON lower(c.email) = lower(au.email)
  JOIN portal_user_client_access puca ON puca.contact_id = c.id
 WHERE public.client_in_starbucks_family(puca.client_id)
   AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.auth_user_id = au.id
                    AND u.ovis_role IN ('admin', 'broker_full', 'broker_lite', 'va'))
 ORDER BY au.created_at
 LIMIT 1;
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_site uuid := current_setting('pkgtest.site')::uuid;
  v_visible uuid;
  v_n int;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NULL OR v_site IS NULL THEN
    RAISE EXCEPTION 'setup: no Starbucks portal user or no packaged site';
  END IF;
  IF public.is_internal_user() OR NOT public.is_portal_user() THEN
    RAISE EXCEPTION 'setup: impersonated user is not a non-internal portal user';
  END IF;
  SELECT count(*) INTO v_n FROM site_submit WHERE id = v_site;
  RAISE NOTICE 'info: portal user can see the packaged site_submit row itself: %', (v_n = 1);
  -- A Starbucks site this portal user CAN see through site_submit RLS: the
  -- definer lookup must still say nothing.
  SELECT s.id INTO v_visible FROM site_submit s
   WHERE s.submit_stage_id IS NOT NULL ORDER BY s.id LIMIT 1;
  IF v_visible IS NULL THEN RAISE EXCEPTION 'setup: portal user sees no site_submit at all'; END IF;

  IF public.package_site_stage(v_site) IS NOT NULL OR public.package_site_stage(v_visible) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1: package_site_stage answered a portal user (packaged site %, visible site %)',
      public.package_site_stage(v_site), public.package_site_stage(v_visible);
  END IF;
  SELECT count(*) INTO v_n FROM deal_package;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 1: portal user sees % deal_package rows', v_n; END IF;
  SELECT count(*) INTO v_n FROM v_deal_package_slide;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 1: portal user sees % v_deal_package_slide rows', v_n; END IF;
  SELECT count(*) INTO v_n FROM v_deal_package_progress;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 1: portal user sees % v_deal_package_progress rows', v_n; END IF;
  RAISE NOTICE 'PASS 1: portal user — package_site_stage NULL (packaged site, and a site they can see), deal_package / both views 0 rows';
END
$test$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
DECLARE
  v_site uuid := current_setting('pkgtest.site')::uuid;
BEGIN
  BEGIN
    PERFORM public.package_site_stage(v_site);
    RAISE EXCEPTION 'FAIL 2: anon executed package_site_stage';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM v_deal_package_slide LIMIT 1;
    RAISE EXCEPTION 'FAIL 2: anon read v_deal_package_slide';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM v_deal_package_progress LIMIT 1;
    RAISE EXCEPTION 'FAIL 2: anon read v_deal_package_progress';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM deal_package LIMIT 1;
    RAISE EXCEPTION 'FAIL 2: anon read deal_package';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 2: anon — permission denied on package_site_stage, both views, deal_package';
  RAISE NOTICE 'ALL PASSED';
END
$test$;
RESET ROLE;
