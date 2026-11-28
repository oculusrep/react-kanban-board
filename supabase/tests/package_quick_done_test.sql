-- Package Tracker quick-complete override (migration 20261026120345).
--
-- As Mike (impersonated) unless noted:
--   1. Done on a Noree-owned 'approve' slide that is missing an input and has an
--      open task → slide done (owner / handoff / inputs ignored), done_by = Mike,
--      done_at set, task completed
--   2. Done on a Mike-owned slide with no task → done, done_by = Mike
--   3. Uncheck → slide not_started, done_by / done_at / owner_done_at cleared,
--      task reopened
--   4. Approve through the normal sidebar path also stamps done_by
--   5. No board clock moved; no timeline rows (activity / site_submit_comment)
--   6. A client-portal user is refused; anon is denied
--
-- No BEGIN/ROLLBACK of its own — run wrapped (see package_task_clock_test.sql header).

CREATE TEMP TABLE qd (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON qd TO authenticated;
CREATE TEMP TABLE qd_clock ON COMMIT DROP AS SELECT id, ball_in_court_since FROM deal_activity_state;
INSERT INTO qd VALUES
  ('activity_n', (SELECT count(*)::text FROM activity)),
  ('comment_n',  (SELECT count(*)::text FROM site_submit_comment));

SELECT set_config('request.jwt.claims',
                  json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_mike  uuid := 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
  v_noree uuid := 'cced4458-1ef9-4fac-982e-bb204463b1c5';
  v_slide uuid;
  v_mslide uuid;
  v_task  uuid;
  r       record;
BEGIN
  -- 1. A Noree 'finish' or 'approve' slide with an OPEN task and a missing input
  --    (released tasks on Big Chicken / Warner Robins are like this), else any open one.
  SELECT s.id, t.id INTO v_slide, v_task
    FROM v_deal_package_slide s JOIN task t ON t.package_slide_id = s.id
   WHERE s.owner_user_id = v_noree AND s.handoff <> 'none' AND t.status IN ('open', 'in_progress')
     AND s.status NOT IN ('done', 'na')
   ORDER BY (cardinality(s.missing_inputs) > 0) DESC, s.id LIMIT 1;
  IF v_slide IS NULL THEN RAISE EXCEPTION 'setup 1: no Noree slide with an open task'; END IF;
  PERFORM public.set_package_slide_done(v_slide, true);
  SELECT s.status, s.done_by, s.done_at, t.status AS task_status INTO r
    FROM deal_package_slide s JOIN task t ON t.package_slide_id = s.id WHERE s.id = v_slide;
  IF r.status <> 'done' OR r.done_by IS DISTINCT FROM v_mike OR r.done_at IS NULL OR r.task_status <> 'completed' THEN
    RAISE EXCEPTION 'FAIL 1: slide %, done_by %, done_at %, task %', r.status, r.done_by, r.done_at, r.task_status;
  END IF;
  RAISE NOTICE 'PASS 1: Noree''s slide marked done by Mike (handoff + inputs ignored); task completed';
  INSERT INTO qd VALUES ('slide', v_slide), ('task', v_task);

  -- 2. A Mike-owned slide (no task).
  SELECT s.id INTO v_mslide FROM deal_package_slide s
   WHERE s.owner_user_id = v_mike AND s.status = 'not_started'
     AND NOT EXISTS (SELECT 1 FROM task t WHERE t.package_slide_id = s.id)
   ORDER BY s.id LIMIT 1;
  PERFORM public.set_package_slide_done(v_mslide, true);
  SELECT status, done_by INTO r FROM deal_package_slide WHERE id = v_mslide;
  IF r.status <> 'done' OR r.done_by IS DISTINCT FROM v_mike THEN RAISE EXCEPTION 'FAIL 2: %, %', r.status, r.done_by; END IF;
  RAISE NOTICE 'PASS 2: Mike''s own slide (no task) marked done';
  INSERT INTO qd VALUES ('mslide', v_mslide);

  -- 3. Uncheck the first one.
  PERFORM public.set_package_slide_done(v_slide, false);
  SELECT s.status, s.done_by, s.done_at, s.owner_done_at, t.status AS task_status INTO r
    FROM deal_package_slide s JOIN task t ON t.package_slide_id = s.id WHERE s.id = v_slide;
  IF r.status <> 'not_started' OR r.done_by IS NOT NULL OR r.done_at IS NOT NULL OR r.owner_done_at IS NOT NULL OR r.task_status <> 'open' THEN
    RAISE EXCEPTION 'FAIL 3: slide %, done_by %, done_at %, owner_done %, task %', r.status, r.done_by, r.done_at, r.owner_done_at, r.task_status;
  END IF;
  RAISE NOTICE 'PASS 3: uncheck → not started, done fields cleared, task reopened';

  -- 4. Normal sidebar approve path (direct status update) stamps done_by too.
  UPDATE deal_package_slide SET status = 'waiting_on_mike', owner_done_at = now() WHERE id = v_slide;
  UPDATE deal_package_slide SET status = 'done', done_at = now() WHERE id = v_slide;
  SELECT done_by INTO r FROM deal_package_slide WHERE id = v_slide;
  IF r.done_by IS DISTINCT FROM v_mike THEN RAISE EXCEPTION 'FAIL 4: approve path done_by = %', r.done_by; END IF;
  RAISE NOTICE 'PASS 4: approve through the normal path records done_by';
END
$test$;
RESET ROLE;

-- 5.
DO $test$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM qd_clock c JOIN deal_activity_state d ON d.id = c.id
   WHERE d.ball_in_court_since IS DISTINCT FROM c.ball_in_court_since;
  IF n > 0 THEN RAISE EXCEPTION 'FAIL 5: % board clocks moved', n; END IF;
  IF (SELECT count(*) FROM activity) <> (SELECT v::int FROM qd WHERE k = 'activity_n')
     OR (SELECT count(*) FROM site_submit_comment) <> (SELECT v::int FROM qd WHERE k = 'comment_n') THEN
    RAISE EXCEPTION 'FAIL 5: timeline rows were written';
  END IF;
  RAISE NOTICE 'PASS 5: all % board clocks unchanged; no activity / chat rows written', (SELECT count(*) FROM qd_clock);
END
$test$;

-- 6. Portal user (non-internal, chosen by query) and anon.
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', au.id, 'role', 'authenticated')::text, true)
  FROM auth.users au
  JOIN contact c ON lower(c.email) = lower(au.email)
  JOIN portal_user_client_access puca ON puca.contact_id = c.id
 WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.auth_user_id = au.id
                    AND u.ovis_role IN ('admin', 'broker_full', 'broker_lite', 'va'))
 ORDER BY au.created_at LIMIT 1;
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF public.is_internal_user() THEN RAISE EXCEPTION 'setup 6: impersonated user is internal'; END IF;
  BEGIN
    PERFORM public.set_package_slide_done((SELECT v::uuid FROM qd WHERE k = 'mslide'), false);
    RAISE EXCEPTION 'FAIL 6: portal user ran set_package_slide_done';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 6a: portal user refused';
END
$test$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM public.set_package_slide_done(gen_random_uuid(), true);
    RAISE EXCEPTION 'FAIL 6: anon ran set_package_slide_done';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 6b: anon denied';
  RAISE NOTICE 'ALL PASSED';
END
$test$;
RESET ROLE;
