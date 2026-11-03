-- Package chat test — a package chat message never moves the board clock, never lands
-- in deal / property chat, and is internal-only (migration 20261102125716).
--
-- Proves:
--   0. the existing task_comment rows on package tasks were copied intact (same id, author,
--      content, created_at, tagged to the task's slide) and their read markers came across
--   1. Mike and Noree (impersonated, authenticated) post General and slide-tagged messages,
--      including on a Mike-owned slide with no task, and mark whole-thread / slide reads
--   2. ball_in_court_since and court_since are unchanged afterwards
--   3. no site_submit_comment / activity / note_object_link row appeared for the deal or site
--   4. control: an internal site_submit_comment on the same site DOES move the clock
--   5. Noree cannot post as Mike, write Mike's read marker, or tag a slide of another package
--   6. a client-portal user reads 0 rows and cannot insert
--   7. anon is denied outright
--
-- Has no BEGIN/ROLLBACK of its own — always run it wrapped, so nothing persists:
--
--   Pre-apply round trip (migration + test, all rolled back):
--     { echo 'BEGIN;'; cat supabase/migrations/20261102125716_package_comment.sql \
--         supabase/tests/package_comment_test.sql; echo 'ROLLBACK;'; } \
--       | psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1
--
--   Post-apply:
--     { echo 'BEGIN;'; cat supabase/tests/package_comment_test.sql; echo 'ROLLBACK;'; } \
--       | psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1
--
-- Any failure RAISEs and aborts; success prints NOTICE lines ending "ALL PASSED".

-- 0. Migrated rows (as owner).
DO $test$
DECLARE v_src int; v_hit int; v_rsrc int; v_rhit int;
BEGIN
  SELECT count(*) INTO v_src
    FROM task_comment tc JOIN task t ON t.id = tc.task_id WHERE t.package_slide_id IS NOT NULL;
  SELECT count(*) INTO v_hit
    FROM task_comment tc
    JOIN task t ON t.id = tc.task_id
    JOIN deal_package_slide s ON s.id = t.package_slide_id
    JOIN package_comment pc ON pc.id = tc.id
   WHERE pc.package_id = s.package_id AND pc.slide_id = s.id AND pc.author_id = tc.author_id
     AND pc.content = tc.content AND pc.created_at = tc.created_at;
  IF v_hit <> v_src THEN RAISE EXCEPTION 'FAIL 0: % of % package-task messages copied intact', v_hit, v_src; END IF;
  SELECT count(DISTINCT (r.user_id, t.package_slide_id)) INTO v_rsrc
    FROM task_comment_read r JOIN task t ON t.id = r.task_id WHERE t.package_slide_id IS NOT NULL;
  SELECT count(*) INTO v_rhit FROM package_comment_read WHERE slide_id IS NOT NULL;
  IF v_rhit <> v_rsrc THEN RAISE EXCEPTION 'FAIL 0: % of % read markers copied', v_rhit, v_rsrc; END IF;
  RAISE NOTICE 'PASS 0: % messages and % read markers copied intact with their slide tag', v_hit, v_rhit;
END
$test$;

-- Setup (as the migration owner: RLS not in play).
DO $test$
DECLARE
  v_noree uuid := 'cced4458-1ef9-4fac-982e-bb204463b1c5';
  v_mike  uuid := 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
  v_seed  timestamptz := '2026-01-05 09:00:00-05';
  v_deal uuid; v_site uuid; v_state uuid; v_pkg uuid; v_slide uuid; v_mslide uuid; v_other uuid; v_ptask uuid; v_cat uuid;
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
    FROM package_slide_template WHERE key IN ('drive_time', 'rent_comps');
  SELECT id INTO v_slide  FROM deal_package_slide WHERE package_id = v_pkg AND template_key = 'drive_time';
  SELECT id INTO v_mslide FROM deal_package_slide WHERE package_id = v_pkg AND template_key = 'rent_comps';  -- Mike's, no task
  SELECT id INTO v_other  FROM deal_package_slide WHERE package_id <> v_pkg LIMIT 1;

  INSERT INTO task (subject, status, owner_id, assigned_by_id, created_by_id, deal_id, site_submit_id, package_slide_id, category_id)
  VALUES ('TEST chat: package task', 'open', v_noree, v_mike, v_mike, v_deal, v_site, v_slide, v_cat)
  RETURNING id INTO v_ptask;

  UPDATE deal_activity_state
     SET ball_in_court_since = v_seed, court_since = CASE WHEN ball_in_court IS NULL THEN NULL ELSE v_seed END
   WHERE id = v_state;

  PERFORM set_config('tctest.deal',   v_deal::text,   true);
  PERFORM set_config('tctest.site',   v_site::text,   true);
  PERFORM set_config('tctest.state',  v_state::text,  true);
  PERFORM set_config('tctest.pkg',    v_pkg::text,    true);
  PERFORM set_config('tctest.slide',  v_slide::text,  true);
  PERFORM set_config('tctest.mslide', v_mslide::text, true);
  PERFORM set_config('tctest.other',  v_other::text,  true);
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

-- 1a. As Mike: General message, a message on his own slide (no task), whole-thread read.
SELECT set_config('request.jwt.claims', json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  INSERT INTO package_comment (package_id, content) VALUES (current_setting('tctest.pkg')::uuid, 'TEST Mike general');
  INSERT INTO package_comment (package_id, slide_id, content)
  VALUES (current_setting('tctest.pkg')::uuid, current_setting('tctest.mslide')::uuid, 'TEST Mike on Rent Comps');
  INSERT INTO package_comment_read (package_id) VALUES (current_setting('tctest.pkg')::uuid);
  IF (SELECT author_id FROM package_comment WHERE content = 'TEST Mike general')
     <> 'fe6e516f-11e1-4a3b-b914-910d59d9e8df' THEN
    RAISE EXCEPTION 'FAIL 1: author_id did not default to Mike';
  END IF;
  RAISE NOTICE 'PASS 1a: Mike posted General + on a task-less slide (author defaulted), marked the thread read';
END
$test$;
RESET ROLE;

-- 1b / 5. As Noree: slide-tagged reply, slide read marker; denied spoofing / cross-package tags.
SELECT set_config('request.jwt.claims', json_build_object('sub', auth_user_id, 'role', 'authenticated')::text, true)
  FROM "user" WHERE id = 'cced4458-1ef9-4fac-982e-bb204463b1c5';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_n int;
BEGIN
  INSERT INTO package_comment (package_id, slide_id, content)
  VALUES (current_setting('tctest.pkg')::uuid, current_setting('tctest.slide')::uuid, 'TEST Noree on Drive Time');
  INSERT INTO package_comment_read (package_id, slide_id)
  VALUES (current_setting('tctest.pkg')::uuid, current_setting('tctest.slide')::uuid)
  ON CONFLICT (package_id, user_id, slide_id) DO UPDATE SET last_read_at = now();
  INSERT INTO package_comment_read (package_id) VALUES (current_setting('tctest.pkg')::uuid)
  ON CONFLICT (package_id, user_id, slide_id) DO UPDATE SET last_read_at = now();
  INSERT INTO package_comment_read (package_id) VALUES (current_setting('tctest.pkg')::uuid)
  ON CONFLICT (package_id, user_id, slide_id) DO UPDATE SET last_read_at = now();  -- NULL slide upserts, no dup
  SELECT count(*) INTO v_n FROM package_comment WHERE package_id = current_setting('tctest.pkg')::uuid;
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL 1: Noree sees % messages in the package, expected 3', v_n; END IF;
  SELECT count(*) INTO v_n FROM package_comment_read WHERE package_id = current_setting('tctest.pkg')::uuid;
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL 5: Noree sees % read markers, expected her own 2', v_n; END IF;
  RAISE NOTICE 'PASS 1b: Noree replied on a slide, sees all 3 messages and only her own 2 read markers';

  BEGIN
    INSERT INTO package_comment (package_id, author_id, content)
    VALUES (current_setting('tctest.pkg')::uuid, 'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'TEST spoof');
    RAISE EXCEPTION 'FAIL 5: Noree posted as Mike';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 5a: Noree cannot post as Mike';
  END;
  BEGIN
    INSERT INTO package_comment_read (package_id, user_id)
    VALUES (current_setting('tctest.pkg')::uuid, 'fe6e516f-11e1-4a3b-b914-910d59d9e8df');
    RAISE EXCEPTION 'FAIL 5: Noree wrote Mike''s read marker';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 5b: Noree cannot write Mike''s read marker';
  END;
  BEGIN
    INSERT INTO package_comment (package_id, slide_id, content)
    VALUES (current_setting('tctest.pkg')::uuid, current_setting('tctest.other')::uuid, 'TEST wrong package');
    RAISE EXCEPTION 'FAIL 5: tagged a slide from another package';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS 5c: a slide from another package cannot be tagged';
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
    RAISE EXCEPTION 'FAIL 2: package chat moved ball_in_court_since (% → %)', current_setting('tctest.clock'), v_clock;
  END IF;
  IF v_court IS DISTINCT FROM nullif(current_setting('tctest.court'), '')::timestamptz THEN
    RAISE EXCEPTION 'FAIL 2: package chat moved court_since (% → %)', current_setting('tctest.court'), v_court;
  END IF;
  RAISE NOTICE 'PASS 2: after 3 package chat messages ball_in_court_since is still % and court_since %', v_clock, v_court;

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
  SELECT count(*) INTO v_n FROM package_comment;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 6: portal user sees % package_comment rows', v_n; END IF;
  SELECT count(*) INTO v_n FROM package_comment_read;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 6: portal user sees % package_comment_read rows', v_n; END IF;
  BEGIN
    INSERT INTO package_comment (package_id, content) VALUES (current_setting('tctest.pkg')::uuid, 'TEST portal');
    RAISE EXCEPTION 'FAIL 6: portal user inserted a package_comment';
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
    PERFORM 1 FROM package_comment LIMIT 1;
    RAISE EXCEPTION 'FAIL 7: anon can read package_comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM package_comment_read LIMIT 1;
    RAISE EXCEPTION 'FAIL 7: anon can read package_comment_read';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO package_comment (package_id, author_id, content)
    VALUES (current_setting('tctest.pkg')::uuid, 'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'TEST anon');
    RAISE EXCEPTION 'FAIL 7: anon inserted a package_comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 7: anon denied (select both tables, insert)';
  RAISE NOTICE 'ALL PASSED';
END
$test$;
RESET ROLE;
