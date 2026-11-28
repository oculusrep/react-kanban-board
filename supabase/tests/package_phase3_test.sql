-- Package Tracker Phase 3 (migration 20261023135247): release, task ↔ slide sync, queue order.
--
-- As Mike (impersonated) unless noted:
--   1. a package on a site with no Market Research / Site Story starts with only
--      Drive Time + Placer tasks
--   2. Market Research approved on that site → Demo Map + Market Aerial released;
--      Generators still held
--   3. Site Story deep pass completes → Generators released
--   4. a manual input (site plan) releases a Noree slide that needs it
--   5. Noree completes an 'approve' task → slide waiting_on_mike; a 'none'-handoff
--      task → slide done
--   6. Mike approves in the sidebar (slide → done) → task stays completed;
--      Mike reopens the slide → task reopened; Noree reopens a task → slide in_progress
--   7. Mike marks a slide waiting_on_mike from the sidebar → its open task completes
--   8. set_task_queue_order: Mike (admin) orders Noree's tasks; Noree can order her
--      own; a non-admin can't order someone else's; mixed owners refused
--   9. the board clock never moved
--  10. anon can't execute set_task_queue_order
--
-- No BEGIN/ROLLBACK of its own — run wrapped (see package_task_clock_test.sql header).

CREATE TEMP TABLE p3 (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON p3 TO authenticated;
-- Every board clock, before anything runs (check 9).
CREATE TEMP TABLE p3_clock ON COMMIT DROP AS SELECT id, ball_in_court_since FROM deal_activity_state;

SELECT set_config('request.jwt.claims',
                  json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_noree uuid := 'cced4458-1ef9-4fac-982e-bb204463b1c5';
  v_site  uuid;
  v_pkg   uuid;
  v_keys  text;
  v_n     int;
BEGIN
  -- A site-only Pre-Submittal Starbucks card with no package and NO research inputs.
  SELECT s.id INTO v_site
    FROM site_submit s JOIN submit_stage st ON st.id = s.submit_stage_id AND st.name = 'Pre-Submittal'
   WHERE public.client_in_starbucks_family(s.client_id)
     AND NOT EXISTS (SELECT 1 FROM deal d WHERE d.site_submit_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM deal_package p WHERE p.site_submit_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM research_run r WHERE r.site_submit_id = s.id AND r.state = 'approved')
     AND NOT EXISTS (SELECT 1 FROM research_thread t WHERE t.site_submit_id = s.id)
   ORDER BY s.id LIMIT 1;
  IF v_site IS NULL THEN RAISE EXCEPTION 'setup: no research-free site-only Pre-Submittal card'; END IF;

  -- 1.
  v_pkg := public.start_package(v_site, NULL);
  SELECT string_agg(s.template_key, ',' ORDER BY s.position) INTO v_keys
    FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id WHERE s.package_id = v_pkg;
  IF v_keys IS DISTINCT FROM 'drive_time,placer' THEN RAISE EXCEPTION 'FAIL 1: start tasks = %', v_keys; END IF;
  RAISE NOTICE 'PASS 1: start — tasks %', v_keys;
  INSERT INTO p3 VALUES ('site', v_site), ('pkg', v_pkg);
END
$test$;

-- 2–4 need inserts into research tables and a site-plan write: do them as the
-- migration owner (research rows are written by edge functions / approvals).
RESET ROLE;
DO $test$
DECLARE
  v_site uuid := (SELECT v FROM p3 WHERE k = 'site')::uuid;
  v_pkg  uuid := (SELECT v FROM p3 WHERE k = 'pkg')::uuid;
  v_thread uuid;
  v_keys text;
  v_client uuid;
BEGIN
  -- 2. Market Research approved (insert pending, then approve — the real path).
  INSERT INTO research_run (site_submit_id, state) VALUES (v_site, 'awaiting_review');
  UPDATE research_run SET state = 'approved' WHERE site_submit_id = v_site AND state = 'awaiting_review';
  SELECT string_agg(s.template_key, ',' ORDER BY s.position) INTO v_keys
    FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id WHERE s.package_id = v_pkg;
  IF v_keys IS DISTINCT FROM 'drive_time,demo_map,market_aerial,placer' THEN RAISE EXCEPTION 'FAIL 2: after MR tasks = %', v_keys; END IF;
  RAISE NOTICE 'PASS 2: Market Research approved — tasks %', v_keys;

  -- 3. Site Story deep pass completes.
  SELECT client_id INTO v_client FROM site_submit WHERE id = v_site;
  INSERT INTO research_thread (site_submit_id, client_id, pinned_context) VALUES (v_site, v_client, '{}'::jsonb) RETURNING id INTO v_thread;
  INSERT INTO research_thread_run (thread_id, kind, target_seq, convo, search_budget, pass_phase, state)
  VALUES (v_thread, 'deep_pass', 0, '[]'::jsonb, 0, 'deep_pass', 'running');
  UPDATE research_thread_run SET state = 'complete' WHERE thread_id = v_thread;
  SELECT string_agg(s.template_key, ',' ORDER BY s.position) INTO v_keys
    FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id WHERE s.package_id = v_pkg;
  IF v_keys IS DISTINCT FROM 'drive_time,demo_map,market_aerial,generators,placer' THEN RAISE EXCEPTION 'FAIL 3: after Site Story tasks = %', v_keys; END IF;
  RAISE NOTICE 'PASS 3: Site Story complete — tasks %', v_keys;

  -- 4. Hand the Site Plan slide to Noree (as a settings change would for a new
  --    package), then mark the site plan received.
  UPDATE deal_package_slide SET owner_user_id = 'cced4458-1ef9-4fac-982e-bb204463b1c5', handoff = 'none'
   WHERE package_id = v_pkg AND template_key = 'site_plan';
  IF EXISTS (SELECT 1 FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id
              WHERE s.package_id = v_pkg AND s.template_key = 'site_plan') THEN
    RAISE EXCEPTION 'FAIL 4: site plan task created before the input';
  END IF;
  UPDATE deal_package SET site_plan_received_at = now() WHERE id = v_pkg;
  IF NOT EXISTS (SELECT 1 FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id
                  WHERE s.package_id = v_pkg AND s.template_key = 'site_plan') THEN
    RAISE EXCEPTION 'FAIL 4: site plan received but task not released';
  END IF;
  RAISE NOTICE 'PASS 4: site plan received — Site Plan task released';
END
$test$;

-- 5. Noree checks off her tasks (as Noree).
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'cced4458-1ef9-4fac-982e-bb204463b1c5';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_pkg uuid := (SELECT v FROM p3 WHERE k = 'pkg')::uuid;
  v_st  text;
BEGIN
  UPDATE task t SET status = 'completed', completed_at = now()
    FROM deal_package_slide s WHERE s.id = t.package_slide_id AND s.package_id = v_pkg AND s.template_key = 'drive_time';
  SELECT status INTO v_st FROM deal_package_slide WHERE package_id = v_pkg AND template_key = 'drive_time';
  IF v_st <> 'waiting_on_mike' THEN RAISE EXCEPTION 'FAIL 5: approve-handoff slide = % after task completed', v_st; END IF;
  UPDATE task t SET status = 'completed', completed_at = now()
    FROM deal_package_slide s WHERE s.id = t.package_slide_id AND s.package_id = v_pkg AND s.template_key = 'site_plan';
  SELECT status INTO v_st FROM deal_package_slide WHERE package_id = v_pkg AND template_key = 'site_plan';
  IF v_st <> 'done' THEN RAISE EXCEPTION 'FAIL 5: none-handoff slide = % after task completed', v_st; END IF;
  -- Noree starts Demo Map (task in_progress → slide in_progress).
  UPDATE task t SET status = 'in_progress'
    FROM deal_package_slide s WHERE s.id = t.package_slide_id AND s.package_id = v_pkg AND s.template_key = 'demo_map';
  SELECT status INTO v_st FROM deal_package_slide WHERE package_id = v_pkg AND template_key = 'demo_map';
  IF v_st <> 'in_progress' THEN RAISE EXCEPTION 'FAIL 5: demo map slide = % after task in_progress', v_st; END IF;
  RAISE NOTICE 'PASS 5: Noree check-off — approve slide waiting on Mike, none slide done, started task → slide in progress';
END
$test$;
RESET ROLE;

-- 6–7. Mike in the sidebar.
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_pkg uuid := (SELECT v FROM p3 WHERE k = 'pkg')::uuid;
  v_t   text;
  v_s   text;
BEGIN
  -- 6a. Approve Drive Time → done; task stays completed.
  UPDATE deal_package_slide SET status = 'done', done_at = now() WHERE package_id = v_pkg AND template_key = 'drive_time';
  SELECT t.status INTO v_t FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id WHERE s.package_id = v_pkg AND s.template_key = 'drive_time';
  IF v_t <> 'completed' THEN RAISE EXCEPTION 'FAIL 6: task = % after approve', v_t; END IF;
  -- 6b. Reopen Drive Time → task reopened.
  UPDATE deal_package_slide SET status = 'in_progress', done_at = NULL, owner_done_at = NULL WHERE package_id = v_pkg AND template_key = 'drive_time';
  SELECT t.status INTO v_t FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id WHERE s.package_id = v_pkg AND s.template_key = 'drive_time';
  IF v_t <> 'open' THEN RAISE EXCEPTION 'FAIL 6: task = % after slide reopened', v_t; END IF;
  -- 6c. Task reopen → slide back to in_progress (Site Plan was done via its task).
  UPDATE task t SET status = 'open', completed_at = NULL
    FROM deal_package_slide s WHERE s.id = t.package_slide_id AND s.package_id = v_pkg AND s.template_key = 'site_plan';
  SELECT status INTO v_s FROM deal_package_slide WHERE package_id = v_pkg AND template_key = 'site_plan';
  IF v_s <> 'in_progress' THEN RAISE EXCEPTION 'FAIL 6: slide = % after task reopened', v_s; END IF;
  RAISE NOTICE 'PASS 6: approve keeps task completed; slide reopen reopens task; task reopen reopens slide';

  -- 7. Mike marks Placer waiting_on_mike from the sidebar → open task completes.
  UPDATE deal_package_slide SET status = 'waiting_on_mike', owner_done_at = now() WHERE package_id = v_pkg AND template_key = 'placer';
  SELECT t.status INTO v_t FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id WHERE s.package_id = v_pkg AND s.template_key = 'placer';
  IF v_t <> 'completed' THEN RAISE EXCEPTION 'FAIL 7: task = % after slide waiting_on_mike', v_t; END IF;
  RAISE NOTICE 'PASS 7: slide handed to Mike from the sidebar completes the task';

  -- 8a. Mike (admin) orders Noree's open tasks, reversed by subject.
  PERFORM public.set_task_queue_order(ARRAY(
    SELECT t.id FROM task t WHERE t.owner_id = 'cced4458-1ef9-4fac-982e-bb204463b1c5' AND t.status IN ('open', 'in_progress')
     ORDER BY t.subject DESC));
  IF EXISTS (SELECT 1 FROM task t WHERE t.owner_id = 'cced4458-1ef9-4fac-982e-bb204463b1c5' AND t.status IN ('open', 'in_progress') AND t.queue_rank IS NULL) THEN
    RAISE EXCEPTION 'FAIL 8: some of Noree''s open tasks have no rank after ordering';
  END IF;
  -- 8b. Mixed owners refused.
  BEGIN
    PERFORM public.set_task_queue_order(ARRAY[
      (SELECT id FROM task WHERE owner_id = 'cced4458-1ef9-4fac-982e-bb204463b1c5' LIMIT 1),
      (SELECT id FROM task WHERE owner_id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df' LIMIT 1)]);
    RAISE EXCEPTION 'FAIL 8: mixed-owner order allowed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END
$test$;
RESET ROLE;

-- 8c. Noree can order her own queue but not Mike's.
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'cced4458-1ef9-4fac-982e-bb204463b1c5';
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  PERFORM public.set_task_queue_order(ARRAY(
    SELECT t.id FROM task t WHERE t.owner_id = 'cced4458-1ef9-4fac-982e-bb204463b1c5' AND t.status IN ('open', 'in_progress') ORDER BY t.subject));
  BEGIN
    PERFORM public.set_task_queue_order(ARRAY(SELECT id FROM task WHERE owner_id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df' LIMIT 2));
    RAISE EXCEPTION 'FAIL 8: Noree reordered Mike''s tasks';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 8: queue order — admin orders Noree''s queue, owner orders own, non-admin refused on others, mixed owners refused';
END
$test$;
RESET ROLE;

-- 9. No board clock moved anywhere during release / sync / ordering.
DO $test$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM p3_clock c JOIN deal_activity_state d ON d.id = c.id
   WHERE d.ball_in_court_since IS DISTINCT FROM c.ball_in_court_since;
  IF n > 0 THEN RAISE EXCEPTION 'FAIL 9: % board clocks moved', n; END IF;
  RAISE NOTICE 'PASS 9: all % board clocks unchanged', (SELECT count(*) FROM p3_clock);
END
$test$;

SET LOCAL ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM public.set_task_queue_order(ARRAY[gen_random_uuid()]);
    RAISE EXCEPTION 'FAIL 10: anon executed set_task_queue_order';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 10: anon cannot execute set_task_queue_order';
  RAISE NOTICE 'ALL PASSED';
END
$test$;
RESET ROLE;
