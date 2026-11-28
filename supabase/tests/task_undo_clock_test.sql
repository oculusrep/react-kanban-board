-- /tasks/queue Undo test — check off, then Undo, never moves a board clock.
--
-- Runs the same writes the page makes, as Noree (impersonated authenticated):
--   check:  UPDATE task SET status = 'completed', completed_at = now()
--   undo:   UPDATE task SET status = 'open', completed_at = NULL   (sync_slide_from_task reverts the slide)
--           [UPDATE task SET status = 'in_progress' if it was started]
--           set_task_queue_order(<the order before the check>)
-- Proves:
--   1. completing a package slide task moves its slide off not_started / in_progress
--   2. Undo reopens the task and the slide is back to in_progress
--   3. the task is back at its original queue position
--   4. ball_in_court_since / court_since unchanged through all of it (package + ordinary task)
--   5. no activity / site_submit_comment / note_object_link rows were added
--
-- Has no BEGIN/ROLLBACK of its own — always run it wrapped, so nothing persists:
--   { echo 'BEGIN;'; cat supabase/tests/task_undo_clock_test.sql; echo 'ROLLBACK;'; } \
--     | psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1
--
-- Any failure RAISEs and aborts; success prints NOTICE lines ending "ALL PASSED".

DO $test$
DECLARE
  v_noree      uuid := 'cced4458-1ef9-4fac-982e-bb204463b1c5';
  v_noree_auth uuid;
  v_deal    uuid;
  v_site    uuid;
  v_state   uuid;
  v_pkg     uuid;
  v_slide   uuid;
  v_task    uuid;
  v_plain   uuid;
  v_order   uuid[];
  v_after   uuid[];
  v_seed    timestamptz := '2026-01-05 09:00:00-05';
  v_court   timestamptz;
  v_clock   timestamptz;
  v_court2  timestamptz;
  v_sstatus text;
  v_tstatus text;
  v_counts  bigint[];
  v_counts2 bigint[];
  v_cat     uuid;
BEGIN
  SELECT id INTO v_cat FROM task_category WHERE name = 'pipeline' AND scope = 'global';
  SELECT auth_user_id INTO v_noree_auth FROM "user" WHERE id = v_noree;

  -- A Starbucks deal with a site_submit and a board state row.
  SELECT d.id, d.site_submit_id, s.id INTO v_deal, v_site, v_state
    FROM deal d
    JOIN client c ON c.id = d.client_id AND c.starbucks_board_enabled
    JOIN deal_activity_state s ON s.deal_id = d.id
   WHERE d.site_submit_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM deal_package p WHERE p.deal_id = d.id)
   ORDER BY d.deal_name
   LIMIT 1;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'setup: no Starbucks deal with site_submit + state row'; END IF;
  UPDATE deal_activity_state SET ball_in_court_since = v_seed WHERE id = v_state;
  SELECT court_since INTO v_court FROM deal_activity_state WHERE id = v_state;

  -- Package + an approve-handoff slide and its task, plus an ordinary task on the same deal
  -- (inserted as the migration owner; the ordinary insert resets the clock, so re-seed after).
  INSERT INTO deal_package (deal_id, started_by) VALUES (v_deal, v_noree) RETURNING id INTO v_pkg;
  INSERT INTO deal_package_slide
    (package_id, template_key, label, position, owner_user_id, handoff, inputs, allows_na, done_by_gate)
  SELECT v_pkg, key, label, position, v_noree, handoff, inputs, allows_na, done_by_gate
    FROM package_slide_template WHERE key = 'drive_time'
  RETURNING id INTO v_slide;
  INSERT INTO task (subject, status, owner_id, assigned_by_id, created_by_id, deal_id, site_submit_id, package_slide_id, category_id)
  VALUES ('TEST undo: slide', 'open', v_noree, v_noree, v_noree, v_deal, v_site, v_slide, v_cat) RETURNING id INTO v_task;
  INSERT INTO task (subject, status, owner_id, assigned_by_id, created_by_id, deal_id, category_id)
  VALUES ('TEST undo: ordinary', 'in_progress', v_noree, v_noree, v_noree, v_deal, v_cat) RETURNING id INTO v_plain;
  UPDATE deal_activity_state SET ball_in_court_since = v_seed WHERE id = v_state;

  SELECT array_agg(id ORDER BY queue_rank NULLS LAST, created_at) INTO v_order
    FROM task WHERE owner_id = v_noree AND status IN ('open', 'in_progress');
  -- Put the test tasks mid-queue, then that's the "before" order.
  v_order := array_remove(array_remove(v_order, v_task), v_plain);
  v_order := v_order[1:1] || v_task || v_plain || v_order[2:];
  SELECT ARRAY[(SELECT count(*) FROM activity), (SELECT count(*) FROM site_submit_comment), (SELECT count(*) FROM note_object_link)]
    INTO v_counts;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_noree_auth, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM set_task_queue_order(v_order);

  -- Check off both.
  UPDATE task SET status = 'completed', completed_at = now() WHERE id IN (v_task, v_plain);
  SELECT status INTO v_sstatus FROM deal_package_slide WHERE id = v_slide;
  IF v_sstatus NOT IN ('waiting_on_mike', 'done') THEN
    RAISE EXCEPTION 'FAIL 1: completing the task left the slide at %', v_sstatus;
  END IF;
  RAISE NOTICE 'PASS 1: check-off moved the slide to %', v_sstatus;

  -- Simulate the queue being reordered by the reload (drop the done ones from the list).
  PERFORM set_task_queue_order(array_remove(array_remove(v_order, v_task), v_plain));

  -- Undo: reopen (slide reverts via sync), restore started state, restore the order.
  UPDATE task SET status = 'open', completed_at = NULL WHERE id IN (v_task, v_plain);
  UPDATE task SET status = 'in_progress' WHERE id = v_plain;
  PERFORM set_task_queue_order(v_order);

  SELECT status INTO v_sstatus FROM deal_package_slide WHERE id = v_slide;
  SELECT status INTO v_tstatus FROM task WHERE id = v_task;
  IF v_tstatus <> 'open' OR v_sstatus <> 'in_progress' THEN
    RAISE EXCEPTION 'FAIL 2: after Undo task=% slide=%', v_tstatus, v_sstatus;
  END IF;
  SELECT status INTO v_tstatus FROM task WHERE id = v_plain;
  IF v_tstatus <> 'in_progress' THEN RAISE EXCEPTION 'FAIL 2b: ordinary task after Undo is %', v_tstatus; END IF;
  RAISE NOTICE 'PASS 2: Undo reopened the task (open, ordinary back to in_progress), slide back to in_progress';

  SELECT array_agg(id ORDER BY queue_rank NULLS LAST, created_at) INTO v_after
    FROM task WHERE owner_id = v_noree AND status IN ('open', 'in_progress');
  IF v_after[2] <> v_task OR v_after[3] <> v_plain THEN
    RAISE EXCEPTION 'FAIL 3: tasks not back at positions 2 and 3';
  END IF;
  RAISE NOTICE 'PASS 3: both tasks back at their original queue positions (2, 3)';

  RESET ROLE;
  SELECT ball_in_court_since, court_since INTO v_clock, v_court2 FROM deal_activity_state WHERE id = v_state;
  IF v_clock IS DISTINCT FROM v_seed OR v_court2 IS DISTINCT FROM v_court THEN
    RAISE EXCEPTION 'FAIL 4: clock moved (ball_in_court_since % → %, court_since % → %)', v_seed, v_clock, v_court, v_court2;
  END IF;
  RAISE NOTICE 'PASS 4: ball_in_court_since and court_since unchanged through check-off + Undo';

  SELECT ARRAY[(SELECT count(*) FROM activity), (SELECT count(*) FROM site_submit_comment), (SELECT count(*) FROM note_object_link)]
    INTO v_counts2;
  IF v_counts2 <> v_counts THEN RAISE EXCEPTION 'FAIL 5: rows added % → %', v_counts, v_counts2; END IF;
  RAISE NOTICE 'PASS 5: no activity / site_submit_comment / note_object_link rows added';

  RAISE NOTICE 'ALL PASSED';
END;
$test$;
