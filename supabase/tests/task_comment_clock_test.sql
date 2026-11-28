-- Task chat test — a task chat message never moves the board clock, never lands
-- in deal / property chat, and is internal-only (migration 20261102084217).
--
-- Proves:
--   1. Mike and Noree (impersonated, authenticated) can post on a package task and on
--      an ordinary task of the same deal, and mark them read
--   2. ball_in_court_since and court_since are unchanged afterwards
--   3. no site_submit_comment / activity / note_object_link row appeared for the deal or site
--   4. control: an internal site_submit_comment on the same site DOES move the clock
--   5. Noree cannot post as Mike, or write Mike's read marker
--   6. a client-portal user reads 0 rows and cannot insert
--   7. anon is denied outright
--
-- Has no BEGIN/ROLLBACK of its own — always run it wrapped, so nothing persists:
--
--   Pre-apply round trip (migration + test, all rolled back):
--     { echo 'BEGIN;'; cat supabase/migrations/20261102084217_task_comment.sql \
--         supabase/tests/task_comment_clock_test.sql; echo 'ROLLBACK;'; } \
--       | psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1
--
--   Post-apply:
--     { echo 'BEGIN;'; cat supabase/tests/task_comment_clock_test.sql; echo 'ROLLBACK;'; } \
--       | psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1
--
-- Any failure RAISEs and aborts; success prints NOTICE lines ending "ALL PASSED".

-- Setup (as the migration owner: RLS not in play).
DO $test$
DECLARE
  v_noree uuid := 'cced4458-1ef9-4fac-982e-bb204463b1c5';
  v_mike  uuid := 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
  v_seed  timestamptz := '2026-01-05 09:00:00-05';
  v_deal uuid; v_site uuid; v_state uuid; v_pkg uuid; v_slide uuid; v_ptask uuid; v_otask uuid; v_cat uuid;
BEGIN
  SELECT id INTO v_cat FROM task_category WHERE name = 'pipeline' AND scope = 'global';
  SELECT d.id, d.site_submit_id, s.id INTO v_deal, v_site, v_state
    FROM deal d
    JOIN client c ON c.id = d.client_id AND c.starbucks_board_enabled
    JOIN deal_activity_state s ON s.deal_id = d.id
   WHERE d.site_submit_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM deal_package p WHERE p.deal_id = d.id)
   ORDER BY d.deal_name
   LIMIT 1;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'setup: no Starbucks deal with site_submit + state row'; END IF;

  INSERT INTO deal_package (deal_id, started_by) VALUES (v_deal, v_mike) RETURNING id INTO v_pkg;
  INSERT INTO deal_package_slide
    (package_id, template_key, label, position, owner_user_id, handoff, inputs, allows_na, done_by_gate)
  SELECT v_pkg, key, label, position, owner_user_id, handoff, inputs, allows_na, done_by_gate
    FROM package_slide_template WHERE key = 'drive_time'
  RETURNING id INTO v_slide;

  INSERT INTO task (subject, status, owner_id, assigned_by_id, created_by_id, deal_id, site_submit_id, package_slide_id, category_id)
  VALUES ('TEST chat: package task', 'open', v_noree, v_mike, v_mike, v_deal, v_site, v_slide, v_cat)
  RETURNING id INTO v_ptask;
  -- An ordinary task resets the clock on insert, so seed AFTER creating it.
  INSERT INTO task (subject, status, owner_id, assigned_by_id, created_by_id, deal_id, site_submit_id, category_id)
  VALUES ('TEST chat: ordinary task', 'open', v_noree, v_mike, v_mike, v_deal, v_site, v_cat)
  RETURNING id INTO v_otask;

  UPDATE deal_activity_state
     SET ball_in_court_since = v_seed, court_since = CASE WHEN ball_in_court IS NULL THEN NULL ELSE v_seed END
   WHERE id = v_state;

  PERFORM set_config('tctest.deal',  v_deal::text,  true);
  PERFORM set_config('tctest.site',  v_site::text,  true);
  PERFORM set_config('tctest.state', v_state::text, true);
  PERFORM set_config('tctest.ptask', v_ptask::text, true);
  PERFORM set_config('tctest.otask', v_otask::text, true);
  PERFORM set_config('tctest.clock', (SELECT ball_in_court_since::text FROM deal_activity_state WHERE id = v_state), true);
  PERFORM set_config('tctest.court', coalesce((SELECT court_since::text FROM deal_activity_state WHERE id = v_state), ''), true);
  PERFORM set_config('tctest.side_rows', (
      (SELECT count(*) FROM site_submit_comment WHERE site_submit_id = v_site OR deal_id = v_deal)
    + (SELECT count(*) FROM activity            WHERE site_submit_id = v_site OR deal_id = v_deal)
    + (SELECT count(*) FROM note_object_link    WHERE site_submit_id = v_site OR deal_id = v_deal))::text, true);
  RAISE NOTICE 'setup: deal %, clock seeded at %, court_since %', v_deal, v_seed,
    nullif(current_setting('tctest.court'), '');
END
$test$;

-- 1a. As Mike: post on both tasks, mark the package task read.
SELECT set_config('request.jwt.claims', json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  INSERT INTO task_comment (task_id, content) VALUES (current_setting('tctest.ptask')::uuid, 'TEST Mike on package task');
  INSERT INTO task_comment (task_id, content) VALUES (current_setting('tctest.otask')::uuid, 'TEST Mike on ordinary task');
  INSERT INTO task_comment_read (task_id) VALUES (current_setting('tctest.ptask')::uuid);
  IF (SELECT author_id FROM task_comment WHERE content = 'TEST Mike on package task')
     <> 'fe6e516f-11e1-4a3b-b914-910d59d9e8df' THEN
    RAISE EXCEPTION 'FAIL 1: author_id did not default to Mike';
  END IF;
  RAISE NOTICE 'PASS 1a: Mike posted on both tasks (author defaulted) and marked read';
END
$test$;
RESET ROLE;

-- 1b / 5. As Noree: post, mark read; cannot post as Mike or write his marker.
SELECT set_config('request.jwt.claims', json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'cced4458-1ef9-4fac-982e-bb204463b1c5';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_n int;
BEGIN
  INSERT INTO task_comment (task_id, content) VALUES (current_setting('tctest.ptask')::uuid, 'TEST Noree reply');
  INSERT INTO task_comment_read (task_id) VALUES (current_setting('tctest.ptask')::uuid)
    ON CONFLICT (task_id, user_id) DO UPDATE SET last_read_at = now();
  SELECT count(*) INTO v_n FROM task_comment WHERE task_id = current_setting('tctest.ptask')::uuid;
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL 1: Noree sees % messages on the package task, expected 2', v_n; END IF;
  SELECT count(*) INTO v_n FROM task_comment_read WHERE task_id = current_setting('tctest.ptask')::uuid;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 5: Noree sees % read markers, expected only her own', v_n; END IF;
  RAISE NOTICE 'PASS 1b: Noree replied, sees both messages and only her own read marker';

  BEGIN
    INSERT INTO task_comment (task_id, author_id, content)
    VALUES (current_setting('tctest.ptask')::uuid, 'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'TEST spoof');
    RAISE EXCEPTION 'FAIL 5: Noree posted as Mike';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 5a: Noree cannot post as Mike';
  END;
  BEGIN
    INSERT INTO task_comment_read (task_id, user_id)
    VALUES (current_setting('tctest.otask')::uuid, 'fe6e516f-11e1-4a3b-b914-910d59d9e8df');
    RAISE EXCEPTION 'FAIL 5: Noree wrote Mike''s read marker';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 5b: Noree cannot write Mike''s read marker';
  END;
END
$test$;
RESET ROLE;

-- 2–4. Clock and side tables (as owner).
DO $test$
DECLARE
  v_state uuid := current_setting('tctest.state')::uuid;
  v_site  uuid := current_setting('tctest.site')::uuid;
  v_deal  uuid := current_setting('tctest.deal')::uuid;
  v_clock timestamptz; v_court timestamptz; v_n bigint;
BEGIN
  SELECT ball_in_court_since, court_since INTO v_clock, v_court FROM deal_activity_state WHERE id = v_state;
  IF v_clock IS DISTINCT FROM current_setting('tctest.clock')::timestamptz THEN
    RAISE EXCEPTION 'FAIL 2: task chat moved ball_in_court_since (% → %)', current_setting('tctest.clock'), v_clock;
  END IF;
  IF v_court IS DISTINCT FROM nullif(current_setting('tctest.court'), '')::timestamptz THEN
    RAISE EXCEPTION 'FAIL 2: task chat moved court_since (% → %)', current_setting('tctest.court'), v_court;
  END IF;
  RAISE NOTICE 'PASS 2: after 3 task chat messages ball_in_court_since is still % and court_since %', v_clock, v_court;

  v_n := (SELECT count(*) FROM site_submit_comment WHERE site_submit_id = v_site OR deal_id = v_deal)
       + (SELECT count(*) FROM activity            WHERE site_submit_id = v_site OR deal_id = v_deal)
       + (SELECT count(*) FROM note_object_link    WHERE site_submit_id = v_site OR deal_id = v_deal);
  IF v_n <> current_setting('tctest.side_rows')::bigint THEN
    RAISE EXCEPTION 'FAIL 3: deal/property chat or activity rows changed (% → %)', current_setting('tctest.side_rows'), v_n;
  END IF;
  RAISE NOTICE 'PASS 3: no site_submit_comment / activity / note_object_link rows added (still %)', v_n;

  -- reset_clock_on_internal_comment only fires for an internal user writing as
  -- themselves (auth.uid() = author_id), so the control posts with Mike's claims.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
     FROM "user" WHERE id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
  INSERT INTO site_submit_comment (site_submit_id, author_id, content, visibility)
  VALUES (v_site, auth.uid(), 'TEST control comment', 'internal');
  SELECT ball_in_court_since INTO v_clock FROM deal_activity_state WHERE id = v_state;
  IF v_clock IS NOT DISTINCT FROM current_setting('tctest.clock')::timestamptz THEN
    RAISE EXCEPTION 'FAIL 4: control site_submit_comment did NOT move the clock — the test proves nothing';
  END IF;
  RAISE NOTICE 'PASS 4: control — a site_submit_comment on the same site moved the clock to %', v_clock;
END
$test$;

-- 6. Client-portal user (authenticated, not internal).
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
DECLARE v_n int;
BEGIN
  IF public.is_internal_user() OR NOT public.is_portal_user() THEN
    RAISE EXCEPTION 'setup: impersonated user is not a non-internal portal user';
  END IF;
  SELECT count(*) INTO v_n FROM task_comment;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 6: portal user sees % task_comment rows', v_n; END IF;
  SELECT count(*) INTO v_n FROM task_comment_read;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 6: portal user sees % task_comment_read rows', v_n; END IF;
  BEGIN
    INSERT INTO task_comment (task_id, content) VALUES (current_setting('tctest.ptask')::uuid, 'TEST portal');
    RAISE EXCEPTION 'FAIL 6: portal user inserted a task_comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 6: portal user reads 0 rows and cannot insert';
END
$test$;
RESET ROLE;

-- 7. Anon.
SET LOCAL ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM 1 FROM task_comment LIMIT 1;
    RAISE EXCEPTION 'FAIL 7: anon can read task_comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM task_comment_read LIMIT 1;
    RAISE EXCEPTION 'FAIL 7: anon can read task_comment_read';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO task_comment (task_id, author_id, content)
    VALUES (current_setting('tctest.ptask')::uuid, 'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'TEST anon');
    RAISE EXCEPTION 'FAIL 7: anon inserted a task_comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 7: anon denied (select both tables, insert)';
  RAISE NOTICE 'ALL PASSED';
END
$test$;
RESET ROLE;
