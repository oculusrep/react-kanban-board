-- Package Tracker Phase 2 schema test (migration 20261013124653).
--
-- Proves, as an impersonated internal user (Mike):
--   1. start_deal_package creates 1 package, 11 slides, and one task per slide
--      Mike doesn't own (Noree's 5), all carrying package_slide_id
--   2. starting it did not move the board clock
--   3. a second start on the same deal is refused
--   4. a non-Starbucks deal is refused (family trigger)
--   5. deal_gate_date: dates flow into v_deal_package_progress gates; a blank
--      first response after confirmation reads 'not_reached'
--   6. deal_gate_date on a non-Starbucks deal is refused
--   7. anon can't execute start_deal_package or read deal_gate_date
--
-- No BEGIN/ROLLBACK of its own — run wrapped (see package_task_clock_test.sql header).
-- Pre-apply: prepend supabase/migrations/20261013124653_*.sql inside the same wrapper.

SELECT set_config('request.jwt.claims',
                  json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_deal   uuid;
  v_other  uuid;
  v_pkg    uuid;
  v_clock0 timestamptz;
  v_clock1 timestamptz;
  v_n      int;
  v_t      int;
  v_g1     text;
  v_g2     text;
  v_g1at   date;
BEGIN
  -- An LOI deal on a Starbucks client, with a site and a board state row, and no package.
  SELECT d.id INTO v_deal
    FROM deal d
    JOIN deal_stage s ON s.id = d.stage_id AND s.label = 'Negotiating LOI'
    JOIN deal_activity_state das ON das.deal_id = d.id
   WHERE public.client_in_starbucks_family(d.client_id)
     AND d.site_submit_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM deal_package p WHERE p.deal_id = d.id)
   ORDER BY d.deal_name LIMIT 1;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'setup: no eligible deal'; END IF;
  SELECT ball_in_court_since INTO v_clock0 FROM deal_activity_state WHERE deal_id = v_deal;

  -- 1.
  v_pkg := public.start_deal_package(v_deal);
  SELECT count(*) INTO v_n FROM deal_package_slide WHERE package_id = v_pkg;
  SELECT count(*) INTO v_t FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id
   WHERE s.package_id = v_pkg AND t.owner_id = 'cced4458-1ef9-4fac-982e-bb204463b1c5';
  IF v_n <> 11 OR v_t <> 5 THEN
    RAISE EXCEPTION 'FAIL 1: expected 11 slides / 5 Noree tasks, got % / %', v_n, v_t;
  END IF;
  SELECT count(*) INTO v_t FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id
   WHERE s.package_id = v_pkg AND t.owner_id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
  IF v_t <> 0 THEN RAISE EXCEPTION 'FAIL 1: Mike got % package tasks', v_t; END IF;
  RAISE NOTICE 'PASS 1: started package — 11 slides, 5 Noree tasks, 0 Mike tasks';

  -- 2.
  SELECT ball_in_court_since INTO v_clock1 FROM deal_activity_state WHERE deal_id = v_deal;
  IF v_clock1 IS DISTINCT FROM v_clock0 THEN
    RAISE EXCEPTION 'FAIL 2: Start Package moved the clock (% → %)', v_clock0, v_clock1;
  END IF;
  RAISE NOTICE 'PASS 2: Start Package left the clock at %', v_clock1;

  -- 3.
  BEGIN
    PERFORM public.start_deal_package(v_deal);
    RAISE EXCEPTION 'FAIL 3: second start allowed';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS 3: second start refused';
  END;

  -- 4.
  SELECT d.id INTO v_other FROM deal d WHERE NOT public.client_in_starbucks_family(d.client_id) AND d.client_id IS NOT NULL LIMIT 1;
  BEGIN
    PERFORM public.start_deal_package(v_other);
    RAISE EXCEPTION 'FAIL 4: non-Starbucks start allowed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 4: non-Starbucks start refused';
  END;

  -- 5.
  INSERT INTO deal_gate_date (deal_id, first_draft_sent_on, first_response_on)
  VALUES (v_deal, '2026-09-01', NULL);
  SELECT gate1_state, gate1_at::date, gate2_state INTO v_g1, v_g1at, v_g2
    FROM v_deal_package_progress WHERE package_id = v_pkg;
  IF v_g1 <> 'reached' OR v_g1at <> '2026-09-01' OR v_g2 <> 'not_reached' THEN
    RAISE EXCEPTION 'FAIL 5: expected gate1 reached 2026-09-01 / gate2 not_reached, got % % / %', v_g1, v_g1at, v_g2;
  END IF;
  UPDATE deal_gate_date SET first_response_on = '2026-09-15' WHERE deal_id = v_deal;
  SELECT gate2_state INTO v_g2 FROM v_deal_package_progress WHERE package_id = v_pkg;
  IF v_g2 <> 'reached' THEN RAISE EXCEPTION 'FAIL 5: gate2 after entry = %', v_g2; END IF;
  RAISE NOTICE 'PASS 5: gate dates flow into the progress view';

  -- 6.
  BEGIN
    INSERT INTO deal_gate_date (deal_id, first_draft_sent_on) VALUES (v_other, '2026-09-01');
    RAISE EXCEPTION 'FAIL 6: gate date stored for non-Starbucks deal';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 6: non-Starbucks gate date refused';
  END;
END
$test$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM public.start_deal_package(gen_random_uuid());
    RAISE EXCEPTION 'FAIL 7: anon executed start_deal_package';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 7: anon cannot execute start_deal_package';
  END;
  BEGIN
    PERFORM 1 FROM deal_gate_date LIMIT 1;
    RAISE EXCEPTION 'FAIL 7: anon read deal_gate_date';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 7: anon denied on deal_gate_date';
  END;
  RAISE NOTICE 'ALL PASSED';
END
$test$;
RESET ROLE;
