-- Package Tracker: site-attached packages (migration 20261022110117).
--
-- As an impersonated internal user (Mike):
--   1. start_package(site) on a site-only Pre-Submittal card → package with
--      site_submit_id, no deal; 11 slides; Noree tasks only for input-ready slides
--      (Drive Time + Placer at minimum); every task carries the site
--   2. progress view: stage Pre-Submittal, gates not_reached, tour_ready false,
--      missing_inputs lists site_plan
--   3. creating a deal on that site attaches it: package.deal_id + tasks' deal_id
--   4. starting again by the new deal OR the site is refused
--   5. relinking a deal that has its own package onto a site with a different
--      package is refused
--   6. a non-Starbucks site is refused
--   7. start_deal_package (deployed UI path) still works, applies the hold rule,
--      and doesn't move the board clock
--   8. existing packages were backfilled with their deal's site_submit_id
--   9. anon can't execute start_package or package_subject_in_family
--
-- No BEGIN/ROLLBACK of its own — run wrapped (see package_task_clock_test.sql header).

SELECT set_config('request.jwt.claims',
                  json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_noree   uuid := 'cced4458-1ef9-4fac-982e-bb204463b1c5';
  v_site    uuid;
  v_site2   uuid;
  v_other   uuid;
  v_pkg     uuid;
  v_pkg2    uuid;
  v_deal    uuid;
  v_deal2   uuid;
  v_client  uuid;
  v_stage   uuid;
  v_n       int;
  v_t       int;
  v_exp     int;
  v_txt     text;
  v_g1      text;
  v_tr      boolean;
  v_miss    text[];
  v_clock0  timestamptz;
  v_clock1  timestamptz;
BEGIN
  -- Two site-only Pre-Submittal Starbucks cards with no package.
  SELECT s.id, s.client_id INTO v_site, v_client
    FROM site_submit s JOIN submit_stage st ON st.id = s.submit_stage_id AND st.name = 'Pre-Submittal'
   WHERE public.client_in_starbucks_family(s.client_id)
     AND NOT EXISTS (SELECT 1 FROM deal d WHERE d.site_submit_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM deal_package p WHERE p.site_submit_id = s.id)
   ORDER BY s.id LIMIT 1;
  SELECT s.id INTO v_site2
    FROM site_submit s JOIN submit_stage st ON st.id = s.submit_stage_id AND st.name = 'Pre-Submittal'
   WHERE public.client_in_starbucks_family(s.client_id)
     AND NOT EXISTS (SELECT 1 FROM deal d WHERE d.site_submit_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM deal_package p WHERE p.site_submit_id = s.id)
     AND s.id <> v_site
   ORDER BY s.id LIMIT 1;
  IF v_site IS NULL OR v_site2 IS NULL THEN RAISE EXCEPTION 'setup: need two site-only Pre-Submittal cards'; END IF;

  -- 1.
  v_pkg := public.start_package(v_site, NULL);
  SELECT count(*) INTO v_n FROM deal_package_slide WHERE package_id = v_pkg;
  SELECT count(*) INTO v_t FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id
   WHERE s.package_id = v_pkg AND t.owner_id = v_noree AND t.site_submit_id = v_site AND t.deal_id IS NULL;
  SELECT count(*) INTO v_exp FROM v_deal_package_slide s
   WHERE s.package_id = v_pkg AND s.owner_user_id = v_noree AND s.inputs_ready;
  IF (SELECT deal_id FROM deal_package WHERE id = v_pkg) IS NOT NULL
     OR (SELECT site_submit_id FROM deal_package WHERE id = v_pkg) <> v_site
     OR v_n <> 11 OR v_t <> v_exp OR v_t < 2 THEN
    RAISE EXCEPTION 'FAIL 1: site package wrong (slides %, tasks %, expected %)', v_n, v_t, v_exp;
  END IF;
  SELECT string_agg(s.template_key, ',' ORDER BY s.position) INTO v_txt
    FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id WHERE s.package_id = v_pkg;
  IF v_txt NOT LIKE '%drive_time%' OR v_txt NOT LIKE '%placer%' THEN
    RAISE EXCEPTION 'FAIL 1: Drive Time / Placer tasks missing (%)', v_txt;
  END IF;
  RAISE NOTICE 'PASS 1: site-only package — 11 slides, % Noree tasks (%)', v_t, v_txt;

  -- 2.
  SELECT stage, gate1_state, tour_ready, missing_inputs INTO v_txt, v_g1, v_tr, v_miss
    FROM v_deal_package_progress WHERE package_id = v_pkg;
  IF v_txt <> 'Pre-Submittal' OR v_g1 <> 'not_reached' OR v_tr OR NOT ('site_plan' = ANY (v_miss)) THEN
    RAISE EXCEPTION 'FAIL 2: progress stage %, gate1 %, tour_ready %, missing %', v_txt, v_g1, v_tr, v_miss;
  END IF;
  RAISE NOTICE 'PASS 2: progress view — stage %, gate1 %, tour_ready %, missing %', v_txt, v_g1, v_tr, v_miss;

  -- 3.
  SELECT id INTO v_stage FROM deal_stage WHERE label = 'Pre-Submittal';
  INSERT INTO deal (deal_name, client_id, site_submit_id, stage_id)
  VALUES ('TEST attach deal', v_client, v_site, v_stage) RETURNING id INTO v_deal;
  SELECT count(*) INTO v_t FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id
   WHERE s.package_id = v_pkg AND t.deal_id = v_deal;
  IF (SELECT deal_id FROM deal_package WHERE id = v_pkg) IS DISTINCT FROM v_deal
     OR v_t <> (SELECT count(*) FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id WHERE s.package_id = v_pkg) THEN
    RAISE EXCEPTION 'FAIL 3: deal not attached to package / tasks';
  END IF;
  RAISE NOTICE 'PASS 3: new deal attached to the site package and its % tasks', v_t;

  -- 4.
  BEGIN
    PERFORM public.start_package(NULL, v_deal);
    RAISE EXCEPTION 'FAIL 4: second start by deal allowed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.start_package(v_site, NULL);
    RAISE EXCEPTION 'FAIL 4: second start by site allowed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 4: second start refused by deal and by site';

  -- 5. A deal with its own package (deal-only, no site) relinked onto site2, which has a different package.
  INSERT INTO deal (deal_name, client_id, stage_id) VALUES ('TEST relink deal', v_client, v_stage) RETURNING id INTO v_deal2;
  PERFORM public.start_package(NULL, v_deal2);
  v_pkg2 := public.start_package(v_site2, NULL);
  BEGIN
    UPDATE deal SET site_submit_id = v_site2 WHERE id = v_deal2;
    RAISE EXCEPTION 'FAIL 5: relink with two packages allowed';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS 5: relinking a packaged deal onto a packaged site refused';
  END;

  -- 6.
  SELECT s.id INTO v_other FROM site_submit s
   WHERE s.client_id IS NOT NULL AND NOT public.client_in_starbucks_family(s.client_id) LIMIT 1;
  BEGIN
    PERFORM public.start_package(v_other, NULL);
    RAISE EXCEPTION 'FAIL 6: non-Starbucks site allowed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 6: non-Starbucks site refused';
  END;

  -- 7. Deployed UI path on an LOI deal without a package.
  SELECT d.id INTO v_deal
    FROM deal d JOIN deal_stage ds ON ds.id = d.stage_id AND ds.label = 'Negotiating LOI'
    JOIN deal_activity_state das ON das.deal_id = d.id
   WHERE public.client_in_starbucks_family(d.client_id) AND d.site_submit_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM deal_package p WHERE p.deal_id = d.id OR p.site_submit_id = d.site_submit_id)
   ORDER BY d.deal_name LIMIT 1;
  SELECT ball_in_court_since INTO v_clock0 FROM deal_activity_state WHERE deal_id = v_deal;
  v_pkg := public.start_deal_package(v_deal);
  SELECT ball_in_court_since INTO v_clock1 FROM deal_activity_state WHERE deal_id = v_deal;
  SELECT count(*) INTO v_t FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id WHERE s.package_id = v_pkg;
  SELECT count(*) INTO v_exp FROM v_deal_package_slide s WHERE s.package_id = v_pkg AND s.owner_user_id = v_noree AND s.inputs_ready;
  IF (SELECT site_submit_id FROM deal_package WHERE id = v_pkg) IS NULL OR v_t <> v_exp OR v_clock1 IS DISTINCT FROM v_clock0 THEN
    RAISE EXCEPTION 'FAIL 7: start_deal_package (site %, tasks % vs %, clock % → %)',
      (SELECT site_submit_id FROM deal_package WHERE id = v_pkg), v_t, v_exp, v_clock0, v_clock1;
  END IF;
  RAISE NOTICE 'PASS 7: start_deal_package — site filled, % tasks (inputs-ready), clock unchanged', v_t;

  -- 8.
  SELECT count(*) INTO v_n FROM deal_package p JOIN deal d ON d.id = p.deal_id
   WHERE d.site_submit_id IS NOT NULL AND p.site_submit_id IS DISTINCT FROM d.site_submit_id;
  IF v_n > 0 THEN RAISE EXCEPTION 'FAIL 8: % packages missing their deal''s site_submit_id', v_n; END IF;
  RAISE NOTICE 'PASS 8: every deal package carries its deal''s site_submit_id';
END
$test$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM public.start_package(gen_random_uuid(), NULL);
    RAISE EXCEPTION 'FAIL 9: anon executed start_package';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.package_subject_in_family(gen_random_uuid(), NULL);
    RAISE EXCEPTION 'FAIL 9: anon executed package_subject_in_family';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 9: anon cannot execute start_package / package_subject_in_family';
  RAISE NOTICE 'ALL PASSED';
END
$test$;
RESET ROLE;
