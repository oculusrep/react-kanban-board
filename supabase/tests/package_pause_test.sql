-- Package pause test (migration 20261103144723).
--
-- Proves:
--   1. pause_package (as Noree, impersonated): open / in-progress package tasks → 'paused'
--      with their prior status kept and queue_rank unchanged; they leave the queue read
--      (status in open / in_progress); slides, done state and inputs untouched
--   2. while paused, an arriving input releases nothing; progress view: behind_since NULL, paused_at set
--   3. resume_package: tasks back to their prior status at the same queue_rank, a slide finished
--      meanwhile completes its task, and the input that arrived while paused is released now
--   4. a held card's rank (set_queue_order 'p:') is where its newly released task starts
--   5. ball_in_court_since / court_since unchanged; no activity / site_submit_comment /
--      note_object_link rows (pause, input-while-paused, resume, reorder)
--   6. auto-pause: site_submit → Pass pauses the package (reason "stage: Pass"); moving it back
--      does NOT resume it; after a manual resume, deal → Lost pauses it again
--   7. a client-portal user can't call pause / resume / set_queue_order or read package_queue_rank
--   8. anon is denied outright
--   9. pace: a package that is LATE (gate 1 passed with gate-1 slides undone) shows
--      behind_since; paused → NULL; resumed → the same behind_since again
--  10. guard: a completed task whose slide is reopened while paused comes back 'paused'
--      (prior 'open'), not into the queue, and resume reopens it; completing a paused
--      task by hand is allowed
--
-- Has no BEGIN/ROLLBACK of its own — always run it wrapped, so nothing persists:
--   Pre-apply:  { echo 'BEGIN;'; cat supabase/migrations/20261103144723_package_pause_and_held_rank.sql \
--                   supabase/tests/package_pause_test.sql; echo 'ROLLBACK;'; } | psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1
--   Post-apply: { echo 'BEGIN;'; cat supabase/tests/package_pause_test.sql; echo 'ROLLBACK;'; } \
--                 | psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1
--
-- Any failure RAISEs and aborts; success prints NOTICE lines ending "ALL PASSED".

-- Setup (as owner). Package with: Drive Time (task open, rank 2000), Placer (task in progress,
-- rank 4000), Generators done, Deal Terms held on Final LOI (given to Noree for the test),
-- Analogous Store done with its task completed. Gate 1 (first draft) dated 2026-10-01, so
-- with Drive Time / Placer undone the package is LATE.
DO $test$
DECLARE
  v_noree uuid := 'cced4458-1ef9-4fac-982e-bb204463b1c5';
  v_mike  uuid := 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
  v_seed  timestamptz := '2026-01-05 09:00:00-05';
  v_deal uuid; v_site uuid; v_state uuid; v_pkg uuid; v_cat uuid;
  v_t1 uuid; v_t2 uuid;
BEGIN
  SELECT id INTO v_cat FROM task_category WHERE name = 'pipeline' AND scope = 'global';
  SELECT d.id, d.site_submit_id, s.id INTO v_deal, v_site, v_state
    FROM deal d
    JOIN client c ON c.id = d.client_id AND c.starbucks_board_enabled
    JOIN deal_activity_state s ON s.deal_id = d.id
    JOIN site_submit ss ON ss.id = d.site_submit_id
    JOIN submit_stage st ON st.id = ss.submit_stage_id AND st.name NOT IN ('Pass', 'Lost / Killed', 'Use Declined', 'Not Available')
   WHERE NOT EXISTS (SELECT 1 FROM deal_package p WHERE p.deal_id = d.id OR p.site_submit_id = d.site_submit_id)
   ORDER BY d.deal_name
   LIMIT 1;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'setup: no Starbucks deal with an open site + state row'; END IF;

  INSERT INTO deal_package (deal_id, started_by) VALUES (v_deal, v_mike) RETURNING id INTO v_pkg;
  INSERT INTO deal_package_slide
    (package_id, template_key, label, position, owner_user_id, handoff, inputs, allows_na, done_by_gate)
  SELECT v_pkg, key, label, position, owner_user_id, handoff, inputs, allows_na, done_by_gate
    FROM package_slide_template WHERE key IN ('drive_time', 'placer', 'generators', 'deal_terms', 'analogous_store');
  -- deal_terms (final_loi) belongs to Mike, so give it to Noree here: a held Noree slide.
  UPDATE deal_package_slide SET owner_user_id = v_noree WHERE package_id = v_pkg AND template_key IN ('deal_terms', 'analogous_store');
  UPDATE deal_package_slide SET status = 'done' WHERE package_id = v_pkg AND template_key IN ('generators', 'analogous_store');
  INSERT INTO task (subject, status, completed_at, owner_id, assigned_by_id, created_by_id, deal_id, site_submit_id, package_slide_id, category_id)
  SELECT 'TEST pause: ' || s.label, 'completed', now(), v_noree, v_mike, v_mike, v_deal, v_site, s.id, v_cat
    FROM deal_package_slide s WHERE s.package_id = v_pkg AND s.template_key = 'analogous_store';
  INSERT INTO deal_gate_date (deal_id, first_draft_sent_on) VALUES (v_deal, '2026-10-01')
  ON CONFLICT (deal_id) DO UPDATE SET first_draft_sent_on = '2026-10-01', first_response_on = NULL;

  INSERT INTO task (subject, status, owner_id, assigned_by_id, created_by_id, deal_id, site_submit_id, package_slide_id, category_id, queue_rank)
  SELECT 'TEST pause: ' || s.label, 'open', v_noree, v_mike, v_mike, v_deal, v_site, s.id, v_cat,
         CASE s.template_key WHEN 'drive_time' THEN 2000 ELSE 4000 END
    FROM deal_package_slide s WHERE s.package_id = v_pkg AND s.template_key IN ('drive_time', 'placer');
  SELECT t.id INTO v_t1 FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id WHERE s.package_id = v_pkg AND s.template_key = 'drive_time';
  SELECT t.id INTO v_t2 FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id WHERE s.package_id = v_pkg AND s.template_key = 'placer';
  UPDATE task SET status = 'in_progress' WHERE id = v_t2;

  UPDATE deal_activity_state
     SET ball_in_court_since = v_seed, court_since = CASE WHEN ball_in_court IS NULL THEN NULL ELSE v_seed END
   WHERE id = v_state;

  PERFORM set_config('pt.deal', v_deal::text, true);
  PERFORM set_config('pt.site', v_site::text, true);
  PERFORM set_config('pt.state', v_state::text, true);
  PERFORM set_config('pt.pkg', v_pkg::text, true);
  PERFORM set_config('pt.t1', v_t1::text, true);
  PERFORM set_config('pt.t2', v_t2::text, true);
  PERFORM set_config('pt.t3', (SELECT t.id::text FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id
                                WHERE s.package_id = v_pkg AND s.template_key = 'analogous_store'), true);
  PERFORM set_config('pt.clock', (SELECT ball_in_court_since::text FROM deal_activity_state WHERE id = v_state), true);
  PERFORM set_config('pt.court', coalesce((SELECT court_since::text FROM deal_activity_state WHERE id = v_state), ''), true);
  PERFORM set_config('pt.slides', (SELECT string_agg(template_key || '=' || status, ',' ORDER BY position) FROM deal_package_slide WHERE package_id = v_pkg), true);
  PERFORM set_config('pt.side_rows', (
      (SELECT count(*) FROM site_submit_comment WHERE site_submit_id = v_site OR deal_id = v_deal)
    + (SELECT count(*) FROM activity            WHERE site_submit_id = v_site OR deal_id = v_deal)
    + (SELECT count(*) FROM note_object_link    WHERE site_submit_id = v_site OR deal_id = v_deal))::text, true);
  RAISE NOTICE 'setup: package % on deal %; slides %', v_pkg, v_deal, current_setting('pt.slides');
END
$test$;

-- 1–4 as Noree.
SELECT set_config('request.jwt.claims', json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'cced4458-1ef9-4fac-982e-bb204463b1c5';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_pkg uuid := current_setting('pt.pkg')::uuid;
  v_t1 uuid := current_setting('pt.t1')::uuid;
  v_t2 uuid := current_setting('pt.t2')::uuid;
  v_n int; r record; v_slides text; v_new uuid;
BEGIN
  -- 9. The package is late before the pause.
  SELECT behind_since INTO r FROM v_deal_package_progress WHERE package_id = v_pkg;
  IF r.behind_since IS NULL THEN RAISE EXCEPTION 'setup 9: package is not late (behind_since NULL)'; END IF;
  PERFORM set_config('pt.behind', r.behind_since::text, true);
  RAISE NOTICE 'PASS 9a: before pause the package is late (behind_since %)', r.behind_since;

  -- Held card ranked at position 1 before anything is released.
  PERFORM set_queue_order('cced4458-1ef9-4fac-982e-bb204463b1c5', ARRAY['p:' || v_pkg, 't:' || v_t1, 't:' || v_t2]);
  IF (SELECT queue_rank FROM package_queue_rank WHERE package_id = v_pkg) <> 1000
     OR (SELECT queue_rank FROM task WHERE id = v_t1) <> 2000 OR (SELECT queue_rank FROM task WHERE id = v_t2) <> 3000 THEN
    RAISE EXCEPTION 'FAIL 4a: set_queue_order ranks wrong';
  END IF;
  RAISE NOTICE 'PASS 4a: set_queue_order ranked the held card 1000 and the tasks 2000 / 3000';

  -- 1. Pause.
  v_n := pause_package(v_pkg);
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL 1: pause_package paused % tasks, expected 2', v_n; END IF;
  SELECT status, paused_prior_status, queue_rank INTO r FROM task WHERE id = v_t1;
  IF r.status <> 'paused' OR r.paused_prior_status <> 'open' OR r.queue_rank <> 2000 THEN RAISE EXCEPTION 'FAIL 1: t1 %', r; END IF;
  SELECT status, paused_prior_status, queue_rank INTO r FROM task WHERE id = v_t2;
  IF r.status <> 'paused' OR r.paused_prior_status <> 'in_progress' OR r.queue_rank <> 3000 THEN RAISE EXCEPTION 'FAIL 1: t2 %', r; END IF;
  SELECT count(*) INTO v_n FROM task WHERE id IN (v_t1, v_t2) AND status IN ('open', 'in_progress');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 1: % paused tasks still read as queued', v_n; END IF;
  SELECT string_agg(template_key || '=' || status, ',' ORDER BY position) INTO v_slides FROM deal_package_slide WHERE package_id = v_pkg;
  IF v_slides <> current_setting('pt.slides') THEN RAISE EXCEPTION 'FAIL 1: slides changed % → %', current_setting('pt.slides'), v_slides; END IF;
  IF pause_package(v_pkg) <> 0 THEN RAISE EXCEPTION 'FAIL 1: second pause was not a no-op'; END IF;
  RAISE NOTICE 'PASS 1: paused 2 tasks (prior open / in_progress, ranks 2000 / 3000 kept), out of the queue; slides unchanged (%)', v_slides;

  -- 2. Input arrives while paused: nothing released. Progress view shows paused, no pace.
  UPDATE deal_package SET final_loi_at = now() WHERE id = v_pkg;
  SELECT count(*) INTO v_n FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id
   WHERE s.package_id = v_pkg AND s.template_key = 'deal_terms';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 2: Final LOI released deal_terms while paused'; END IF;
  SELECT paused_at, behind_since, pause_reason INTO r FROM v_deal_package_progress WHERE package_id = v_pkg;
  IF r.paused_at IS NULL OR r.behind_since IS NOT NULL OR r.pause_reason <> 'manual' THEN RAISE EXCEPTION 'FAIL 2: progress view %', r; END IF;
  RAISE NOTICE 'PASS 2 / 9b: Final LOI arrived while paused — nothing released; progress view paused, late flag gone (behind_since NULL)';
END
$test$;
RESET ROLE;

-- Mike finishes Placer while the package is paused (as owner: slide write).
UPDATE deal_package_slide SET status = 'done'
 WHERE package_id = current_setting('pt.pkg')::uuid AND template_key = 'placer';
-- …and reopens Analogous Store (done → in progress): sync_task_from_slide reopens its task.
UPDATE deal_package_slide SET status = 'in_progress', done_at = NULL, owner_done_at = NULL
 WHERE package_id = current_setting('pt.pkg')::uuid AND template_key = 'analogous_store';

SELECT set_config('request.jwt.claims', json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'cced4458-1ef9-4fac-982e-bb204463b1c5';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_pkg uuid := current_setting('pt.pkg')::uuid;
  v_t1 uuid := current_setting('pt.t1')::uuid;
  v_t2 uuid := current_setting('pt.t2')::uuid;
  v_n int; r record;
BEGIN
  IF (SELECT status FROM task WHERE id = v_t2) <> 'paused' THEN RAISE EXCEPTION 'FAIL 3: slide done un-paused its task'; END IF;
  SELECT status, paused_prior_status INTO r FROM task WHERE id = current_setting('pt.t3')::uuid;
  IF r.status <> 'paused' OR r.paused_prior_status <> 'open' THEN RAISE EXCEPTION 'FAIL 10a: reopened slide leaked its task into the queue (%)', r; END IF;
  RAISE NOTICE 'PASS 10a: slide reopened while paused → its completed task came back paused (prior open), not queued';
  -- 3. Resume.
  v_n := resume_package(v_pkg);
  SELECT status, paused_prior_status, queue_rank INTO r FROM task WHERE id = v_t1;
  IF r.status <> 'open' OR r.paused_prior_status IS NOT NULL OR r.queue_rank <> 2000 THEN RAISE EXCEPTION 'FAIL 3: t1 after resume %', r; END IF;
  SELECT status, completed_at IS NOT NULL AS done, queue_rank INTO r FROM task WHERE id = v_t2;
  IF r.status <> 'completed' OR NOT r.done THEN RAISE EXCEPTION 'FAIL 3: t2 (slide finished while paused) after resume %', r; END IF;
  RAISE NOTICE 'PASS 3a: resume → Drive Time open at rank 2000; Placer (finished while paused) completed';
  SELECT t.status, t.queue_rank INTO r FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id
   WHERE s.package_id = v_pkg AND s.template_key = 'deal_terms';
  IF r.status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'FAIL 3: Deal Terms not released on resume'; END IF;
  RAISE NOTICE 'PASS 3b: resume released Deal Terms (Final LOI had arrived while paused)';
  -- 4. It starts at the held card's rank.
  IF r.queue_rank IS DISTINCT FROM 1000 THEN RAISE EXCEPTION 'FAIL 4b: released task rank %, expected the card''s 1000', r.queue_rank; END IF;
  RAISE NOTICE 'PASS 4b: released task starts at its held card''s rank (1000)';
  IF (SELECT paused_at FROM deal_package WHERE id = v_pkg) IS NOT NULL THEN RAISE EXCEPTION 'FAIL 3: still paused'; END IF;
  IF (SELECT status FROM task WHERE id = current_setting('pt.t3')::uuid) <> 'open' THEN RAISE EXCEPTION 'FAIL 10b: reopened task not open after resume'; END IF;
  RAISE NOTICE 'PASS 10b: resume → the reopened Analogous Store task is open';
  -- 9. Late flag back.
  SELECT behind_since INTO r FROM v_deal_package_progress WHERE package_id = v_pkg;
  IF r.behind_since IS DISTINCT FROM current_setting('pt.behind')::timestamptz THEN
    RAISE EXCEPTION 'FAIL 9c: after resume behind_since % (expected %)', r.behind_since, current_setting('pt.behind');
  END IF;
  RAISE NOTICE 'PASS 9c: after resume the late flag is back (behind_since %)', r.behind_since;
END
$test$;
RESET ROLE;

-- 5. Clock and side tables (as owner).
DO $test$
DECLARE
  v_state uuid := current_setting('pt.state')::uuid;
  v_site uuid := current_setting('pt.site')::uuid;
  v_deal uuid := current_setting('pt.deal')::uuid;
  v_clock timestamptz; v_court timestamptz; v_n bigint;
BEGIN
  SELECT ball_in_court_since, court_since INTO v_clock, v_court FROM deal_activity_state WHERE id = v_state;
  IF v_clock IS DISTINCT FROM current_setting('pt.clock')::timestamptz
     OR v_court IS DISTINCT FROM nullif(current_setting('pt.court'), '')::timestamptz THEN
    RAISE EXCEPTION 'FAIL 5: clock moved (% → %, court % → %)', current_setting('pt.clock'), v_clock, current_setting('pt.court'), v_court;
  END IF;
  v_n := (SELECT count(*) FROM site_submit_comment WHERE site_submit_id = v_site OR deal_id = v_deal)
       + (SELECT count(*) FROM activity            WHERE site_submit_id = v_site OR deal_id = v_deal)
       + (SELECT count(*) FROM note_object_link    WHERE site_submit_id = v_site OR deal_id = v_deal);
  IF v_n <> current_setting('pt.side_rows')::bigint THEN
    RAISE EXCEPTION 'FAIL 5: deal/property chat or activity rows changed (% → %)', current_setting('pt.side_rows'), v_n;
  END IF;
  RAISE NOTICE 'PASS 5: through reorder, pause, input-while-paused, resume + release: clock % and court_since % unchanged, no side rows', v_clock, v_court;
END
$test$;

-- 6. Auto-pause on Pass; never auto-resume (as Mike, so the stage triggers see an internal user).
SELECT set_config('request.jwt.claims', json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
DO $test$
DECLARE
  v_pkg uuid := current_setting('pt.pkg')::uuid;
  v_site uuid := current_setting('pt.site')::uuid;
  v_old uuid; r record;
BEGIN
  SELECT submit_stage_id INTO v_old FROM site_submit WHERE id = v_site;
  UPDATE site_submit SET submit_stage_id = (SELECT id FROM submit_stage WHERE name = 'Pass') WHERE id = v_site;
  SELECT paused_at, pause_reason INTO r FROM deal_package WHERE id = v_pkg;
  IF r.paused_at IS NULL OR r.pause_reason <> 'stage: Pass' THEN RAISE EXCEPTION 'FAIL 6: Pass did not auto-pause (%)', r; END IF;
  IF EXISTS (SELECT 1 FROM task t JOIN deal_package_slide s ON s.id = t.package_slide_id
              WHERE s.package_id = v_pkg AND t.status IN ('open', 'in_progress')) THEN
    RAISE EXCEPTION 'FAIL 6: auto-pause left open tasks';
  END IF;
  UPDATE site_submit SET submit_stage_id = v_old WHERE id = v_site;
  IF (SELECT paused_at FROM deal_package WHERE id = v_pkg) IS NULL THEN RAISE EXCEPTION 'FAIL 6: moving off Pass auto-resumed'; END IF;
  RAISE NOTICE 'PASS 6a: site → Pass auto-paused (reason "stage: Pass"); moving it back did not resume';

  PERFORM resume_package(v_pkg);
  UPDATE deal SET stage_id = (SELECT id FROM deal_stage WHERE label = 'Lost') WHERE id = current_setting('pt.deal')::uuid;
  SELECT paused_at, pause_reason INTO r FROM deal_package WHERE id = v_pkg;
  -- The deal → site stage sync may pause it first (as "stage: Lost / Killed"); either is right.
  IF r.paused_at IS NULL OR r.pause_reason NOT IN ('stage: Lost', 'stage: Lost / Killed') THEN
    RAISE EXCEPTION 'FAIL 6: deal → Lost did not auto-pause (%)', r;
  END IF;
  RAISE NOTICE 'PASS 6b: deal → Lost auto-paused (reason "%")', r.pause_reason;

  -- 10c. Completing a paused task by hand is allowed.
  UPDATE task SET status = 'completed', completed_at = now() WHERE id = current_setting('pt.t1')::uuid;
  SELECT status, paused_prior_status INTO r FROM task WHERE id = current_setting('pt.t1')::uuid;
  IF r.status <> 'completed' OR r.paused_prior_status IS NOT NULL THEN RAISE EXCEPTION 'FAIL 10c: %', r; END IF;
  RAISE NOTICE 'PASS 10c: a paused task can be completed by hand';
END
$test$;

-- 7. Client-portal user.
SELECT set_config('request.jwt.claims', json_build_object('sub', au.id, 'role', 'authenticated')::text, true)
  FROM auth.users au
  JOIN contact c ON lower(c.email) = lower(au.email)
  JOIN portal_user_client_access puca ON puca.contact_id = c.id
 WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.auth_user_id = au.id
                    AND u.ovis_role IN ('admin', 'broker_full', 'broker_lite', 'va'))
 ORDER BY au.created_at
 LIMIT 1;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_pkg uuid := current_setting('pt.pkg')::uuid; v_n int;
BEGIN
  IF public.is_internal_user() OR NOT public.is_portal_user() THEN
    RAISE EXCEPTION 'setup: impersonated user is not a non-internal portal user';
  END IF;
  BEGIN PERFORM resume_package(v_pkg); RAISE EXCEPTION 'FAIL 7: portal resumed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM pause_package(v_pkg); RAISE EXCEPTION 'FAIL 7: portal paused';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM set_queue_order('cced4458-1ef9-4fac-982e-bb204463b1c5', ARRAY['p:' || v_pkg]); RAISE EXCEPTION 'FAIL 7: portal reordered';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT count(*) INTO v_n FROM package_queue_rank;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 7: portal reads % package_queue_rank rows', v_n; END IF;
  RAISE NOTICE 'PASS 7: portal user cannot pause / resume / reorder and reads 0 package_queue_rank rows';
END
$test$;
RESET ROLE;

-- 8. Anon.
SET LOCAL ROLE anon;
DO $test$
DECLARE v_pkg uuid := current_setting('pt.pkg')::uuid;
BEGIN
  BEGIN PERFORM pause_package(v_pkg); RAISE EXCEPTION 'FAIL 8: anon paused';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM resume_package(v_pkg); RAISE EXCEPTION 'FAIL 8: anon resumed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM set_queue_order('cced4458-1ef9-4fac-982e-bb204463b1c5', ARRAY['p:' || v_pkg]); RAISE EXCEPTION 'FAIL 8: anon reordered';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM package_queue_rank LIMIT 1; RAISE EXCEPTION 'FAIL 8: anon read package_queue_rank';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM v_deal_package_progress LIMIT 1; RAISE EXCEPTION 'FAIL 8: anon read v_deal_package_progress';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS 8: anon denied (pause, resume, reorder, package_queue_rank, progress view)';
  RAISE NOTICE 'ALL PASSED';
END
$test$;
RESET ROLE;
