-- Package Tracker Phase 1 test — package tasks never move the board clock.
--
-- Proves (decision 2026-10-12, item 4):
--   1. inserting a package task (deal_id + site_submit_id + package_slide_id)
--      does NOT move deal_activity_state.ball_in_court_since
--   2. changing its due_at does NOT move it
--   3. completing it does NOT move it
--   4. control: an ordinary task on the same deal DOES move it (trigger still live)
-- Also checks deal_court_event (flip → event; back-date → corrected), that the
-- views answer as an impersonated internal user, and that packages are limited
-- to the Starbucks family through client.parent_id (10–12).
--
-- Has no BEGIN/ROLLBACK of its own — always run it wrapped, so nothing persists:
--
--   Pre-apply round trip (migrations + test, all rolled back):
--     { echo 'BEGIN;'; cat supabase/migrations/2026101216183{7,8,9}_*.sql \
--         supabase/migrations/20261012161840_*.sql supabase/tests/package_task_clock_test.sql; \
--       echo 'ROLLBACK;'; } | psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1
--
--   Post-apply:
--     { echo 'BEGIN;'; cat supabase/tests/package_task_clock_test.sql; echo 'ROLLBACK;'; } \
--       | psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1
--
-- Any failure RAISEs and aborts; success prints NOTICE lines ending "ALL PASSED".

DO $test$
DECLARE
  v_noree   uuid := 'cced4458-1ef9-4fac-982e-bb204463b1c5';
  v_mike    uuid := 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
  v_deal    uuid;
  v_site    uuid;
  v_state   uuid;
  v_pkg     uuid;
  v_slide   uuid;
  v_task    uuid;
  v_ctl     uuid;
  v_seed    timestamptz := '2026-01-05 09:00:00-05';
  v_clock   timestamptz;
  v_n       int;
  v_eff     timestamptz;
  v_cat     uuid;
BEGIN
  SELECT id INTO v_cat FROM task_category WHERE name = 'pipeline' AND scope = 'global';
  -- A Starbucks deal with a site_submit and a board state row.
  SELECT d.id, d.site_submit_id, s.id INTO v_deal, v_site, v_state
    FROM deal d
    JOIN client c ON c.id = d.client_id AND c.starbucks_board_enabled
    JOIN deal_activity_state s ON s.deal_id = d.id
   WHERE d.site_submit_id IS NOT NULL
   ORDER BY d.deal_name
   LIMIT 1;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'setup: no Starbucks deal with site_submit + state row'; END IF;

  -- Known clock, court cleared so the court-event checks start clean.
  UPDATE deal_activity_state
     SET ball_in_court_since = v_seed, ball_in_court = NULL, ball_in_court_party = NULL
   WHERE id = v_state;

  -- Package + one Noree slide (as the migration owner: RLS not in play here).
  INSERT INTO deal_package (deal_id, started_by) VALUES (v_deal, v_mike) RETURNING id INTO v_pkg;
  INSERT INTO deal_package_slide
    (package_id, template_key, label, position, owner_user_id, handoff, inputs, allows_na, done_by_gate)
  SELECT v_pkg, key, label, position, owner_user_id, handoff, inputs, allows_na, done_by_gate
    FROM package_slide_template WHERE key = 'drive_time'
  RETURNING id INTO v_slide;

  -- 1. Insert package task.
  INSERT INTO task (subject, status, owner_id, assigned_by_id, created_by_id, deal_id, site_submit_id, package_slide_id, category_id)
  VALUES ('TEST package: Drive Time', 'open', v_noree, v_mike, v_mike, v_deal, v_site, v_slide, v_cat)
  RETURNING id INTO v_task;
  SELECT ball_in_court_since INTO v_clock FROM deal_activity_state WHERE id = v_state;
  IF v_clock IS DISTINCT FROM v_seed THEN
    RAISE EXCEPTION 'FAIL 1: package task insert moved the clock (% → %)', v_seed, v_clock;
  END IF;
  RAISE NOTICE 'PASS 1: package task insert left ball_in_court_since at %', v_clock;

  -- 2. Change its due_at.
  UPDATE task SET due_at = now() + interval '3 days' WHERE id = v_task;
  SELECT ball_in_court_since INTO v_clock FROM deal_activity_state WHERE id = v_state;
  IF v_clock IS DISTINCT FROM v_seed THEN
    RAISE EXCEPTION 'FAIL 2: package task due_at change moved the clock (% → %)', v_seed, v_clock;
  END IF;
  RAISE NOTICE 'PASS 2: package task due_at change left the clock alone';

  -- 3. Complete it (and requeue it).
  UPDATE task SET status = 'completed', completed_at = now(), queue_rank = 1.5 WHERE id = v_task;
  SELECT ball_in_court_since INTO v_clock FROM deal_activity_state WHERE id = v_state;
  IF v_clock IS DISTINCT FROM v_seed THEN
    RAISE EXCEPTION 'FAIL 3: package task completion moved the clock (% → %)', v_seed, v_clock;
  END IF;
  RAISE NOTICE 'PASS 3: package task completion left the clock alone';

  -- 4. Control: an ordinary task on the same deal still resets it.
  INSERT INTO task (subject, status, owner_id, created_by_id, deal_id, site_submit_id, category_id)
  VALUES ('TEST control task', 'open', v_mike, v_mike, v_deal, v_site, v_cat)
  RETURNING id INTO v_ctl;
  SELECT ball_in_court_since INTO v_clock FROM deal_activity_state WHERE id = v_state;
  IF v_clock IS NOT DISTINCT FROM v_seed THEN
    RAISE EXCEPTION 'FAIL 4: ordinary task insert did NOT reset the clock — reset trigger broken';
  END IF;
  RAISE NOTICE 'PASS 4: ordinary task insert reset the clock (% → %)', v_seed, v_clock;

  -- 5. Court flip logs an event dated by court_since.
  UPDATE deal_activity_state
     SET ball_in_court = 'them', ball_in_court_party = 'Landlord',
         court_since = '2026-09-01 10:00:00-04'
   WHERE id = v_state;
  SELECT count(*), max(effective_at) INTO v_n, v_eff
    FROM deal_court_event
   WHERE source = 'board' AND court = 'them'
     AND (deal_id = v_deal OR site_submit_id = v_site)
     AND recorded_at = now();
  IF v_n <> 1 OR v_eff <> '2026-09-01 10:00:00-04'::timestamptz THEN
    RAISE EXCEPTION 'FAIL 5: court flip → expected 1 event at 2026-09-01 10:00 ET, got % at %', v_n, v_eff;
  END IF;
  RAISE NOTICE 'PASS 5: court flip logged one event at %', v_eff;

  -- 6. Back-dating the same court corrects that event, doesn't add one.
  UPDATE deal_activity_state SET court_since = '2026-08-20 10:00:00-04' WHERE id = v_state;
  SELECT count(*), max(effective_at) INTO v_n, v_eff
    FROM deal_court_event
   WHERE source = 'board' AND court = 'them'
     AND (deal_id = v_deal OR site_submit_id = v_site)
     AND recorded_at = now();
  IF v_n <> 1 OR v_eff <> '2026-08-20 10:00:00-04'::timestamptz THEN
    RAISE EXCEPTION 'FAIL 6: back-date → expected 1 corrected event at 2026-08-20, got % at %', v_n, v_eff;
  END IF;
  RAISE NOTICE 'PASS 6: back-date corrected the event to %', v_eff;

  -- 7. A touch (clock reset) and a party edit log nothing.
  SELECT count(*) INTO v_n FROM deal_court_event;
  UPDATE deal_activity_state SET ball_in_court_since = now(), ball_in_court_party = 'Broker' WHERE id = v_state;
  IF (SELECT count(*) FROM deal_court_event) <> v_n THEN
    RAISE EXCEPTION 'FAIL 7: touch / party edit added court events (% → %)', v_n, (SELECT count(*) FROM deal_court_event);
  END IF;
  RAISE NOTICE 'PASS 7: touch and party edit logged nothing';
END
$test$;

-- 8. Views answer as an impersonated internal user (Mike), and a package row is
--    visible with 1 applicable slide.
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_n int; v_app int; v_g1 text;
BEGIN
  SELECT count(*) INTO v_n FROM v_deal_package_slide;
  SELECT applicable, gate1_state INTO v_app, v_g1 FROM v_deal_package_progress LIMIT 1;
  IF v_n < 1 OR v_app IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FAIL 8: views as authenticated — slides %, applicable %', v_n, v_app;
  END IF;
  PERFORM 1 FROM deal_court_event LIMIT 1;
  RAISE NOTICE 'PASS 8: views readable as Mike (slides %, applicable %, gate1 %)', v_n, v_app, v_g1;
END
$test$;

RESET ROLE;

-- 9. Anonymous gets nothing.
SET LOCAL ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM 1 FROM deal_package LIMIT 1;
    RAISE EXCEPTION 'FAIL 9: anon can read deal_package';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 9: anon denied on deal_package';
  END;
  BEGIN
    PERFORM 1 FROM v_deal_package_progress LIMIT 1;
    RAISE EXCEPTION 'FAIL 9: anon can read v_deal_package_progress';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 9: anon denied on v_deal_package_progress';
  END;
  BEGIN
    PERFORM 1 FROM deal_court_event LIMIT 1;
    RAISE EXCEPTION 'FAIL 9: anon can read deal_court_event';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 9: anon denied on deal_court_event';
  END;
END
$test$;
RESET ROLE;

-- 10–12. Starbucks-family restriction (decision 2026-10-13).
DO $test$
DECLARE
  v_sbux   uuid;
  v_child  uuid;
  v_deal   uuid;
  v_other  uuid;
  v_pkg    uuid;
  v_n      int;
BEGIN
  SELECT id INTO v_sbux FROM client WHERE client_name = 'Starbucks' AND parent_id IS NULL AND starbucks_board_enabled;
  IF v_sbux IS NULL THEN RAISE EXCEPTION 'setup: Starbucks parent client not found'; END IF;

  -- 10. A deal on a client outside the family is refused.
  SELECT d.id INTO v_other
    FROM deal d JOIN client c ON c.id = d.client_id
   WHERE NOT public.client_in_starbucks_family(c.id)
     AND NOT EXISTS (SELECT 1 FROM deal_package p WHERE p.deal_id = d.id)
   LIMIT 1;
  BEGIN
    INSERT INTO deal_package (deal_id) VALUES (v_other);
    RAISE EXCEPTION 'FAIL 10: package created for non-Starbucks deal %', v_other;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 10: non-Starbucks deal refused';
  END;
  -- A deal with no client at all is refused too.
  INSERT INTO deal (deal_name) VALUES ('TEST no-client deal') RETURNING id INTO v_deal;
  BEGIN
    INSERT INTO deal_package (deal_id) VALUES (v_deal);
    RAISE EXCEPTION 'FAIL 10: package created for a deal with no client';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 10: no-client deal refused';
  END;

  -- 11. A NEW child of Starbucks, not flagged, qualifies through parent_id.
  INSERT INTO client (client_name, parent_id, starbucks_board_enabled)
  VALUES ('TEST Starbucks - New Child', v_sbux, false) RETURNING id INTO v_child;
  INSERT INTO deal (deal_name, client_id) VALUES ('TEST child deal', v_child) RETURNING id INTO v_deal;
  INSERT INTO deal_package (deal_id) VALUES (v_deal) RETURNING id INTO v_pkg;
  SELECT count(*) INTO v_n FROM v_deal_package_progress WHERE package_id = v_pkg;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 11: child-account package not in progress view'; END IF;
  RAISE NOTICE 'PASS 11: unflagged child of Starbucks accepted and visible';

  -- 12a. Re-pointing the package at a non-Starbucks deal is refused.
  BEGIN
    UPDATE deal_package SET deal_id = v_other WHERE id = v_pkg;
    RAISE EXCEPTION 'FAIL 12: package re-pointed at non-Starbucks deal';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 12: re-pointing at non-Starbucks deal refused';
  END;
  -- 12b. Moving the child out of the family drops the package from the views.
  UPDATE client SET parent_id = NULL WHERE id = v_child;
  SELECT count(*) INTO v_n FROM v_deal_package_progress WHERE package_id = v_pkg;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 12: package still visible after client left the family'; END IF;
  RAISE NOTICE 'PASS 12: client leaving the family hides its package';

  RAISE NOTICE 'ALL PASSED';
END
$test$;
