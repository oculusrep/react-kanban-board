-- Rolled-back persona test for migration 20261030083654 (Intel attachments + Ask).
-- Run from the repo root:
--   set -a && . ./.env && set +a
--   psql "$DATABASE_URL" -f scripts/intel_attachments_persona_test.sql
-- Applies the migration (if not yet live), seeds one file + chunk on an existing
-- entry, probes every persona, deletes the file as the edge function would and
-- checks Ask's search can no longer find it, then ROLLBACK — nothing persists.
\set ON_ERROR_STOP on
\set QUIET on
\pset footer off
BEGIN;
\i supabase/migrations/20261030083654_intel_attachments_and_ask.sql

CREATE TEMP TABLE results (n serial, persona text, check_name text, expected text, actual text) ON COMMIT DROP;
GRANT ALL ON results TO authenticated, anon; GRANT USAGE ON SEQUENCE results_n_seq TO authenticated, anon;
CREATE FUNCTION pg_temp.probe(p_persona text, p_check text, p_expected text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  BEGIN EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN v := 'ERROR ' || SQLSTATE;
  END;
  INSERT INTO results (persona, check_name, expected, actual) VALUES (p_persona, p_check, p_expected, coalesce(v, 'null'));
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.probe(text,text,text,text) TO authenticated, anon;

-- Fixture: one file + one embedded chunk with a word nothing else contains.
CREATE TEMP TABLE fx ON COMMIT DROP AS
  SELECT e.id AS entry_id, gen_random_uuid() AS file_id,
         '[' || array_to_string(array_fill(0.01::float8, ARRAY[1536]), ',') || ']' AS vec
    FROM public.knowledge_entry e ORDER BY e.created_at LIMIT 1;
GRANT SELECT ON fx TO authenticated, anon, service_role;

INSERT INTO public.knowledge_entry_file (id, entry_id, created_by, dropbox_path, dropbox_folder, filename, file_ext, size_bytes, status)
SELECT file_id, entry_id, gen_random_uuid(), '/Salesforce Documents/Intel/General/2026-10-30 Persona test/zebrafinch.pdf',
       '/Salesforce Documents/Intel/General/2026-10-30 Persona test', 'zebrafinch.pdf', 'pdf', 1000, 'pending' FROM fx;

-- Service steps: claim, save a chunk (embedded), claim again is refused while locked.
SET LOCAL ROLE service_role;
SELECT count(*) AS claimed FROM fx, public.knowledge_file_claim(fx.file_id) \gset
SELECT count(*) AS reclaimed FROM fx, public.knowledge_file_claim(fx.file_id) \gset
SELECT public.knowledge_file_save_step(fx.file_id,
  jsonb_build_array(jsonb_build_object('ord', 0, 'locator', 'p. 1', 'content',
    'Zebrafinch clause: the tenant improvement allowance is forty-five dollars per square foot.',
    'embedding', fx.vec, 'embedding_model', 'test', 'embedding_dims', 1536)),
  jsonb_build_object('status', 'done', 'read_cursor', 2, 'next_ord', 1, 'page_count', 1, 'char_count', 90))
  FROM fx \gset
SELECT status AS st_after_save, scanned_pages::text AS sp_after_save, lock_until IS NULL AS unlocked
  FROM public.knowledge_entry_file, fx WHERE id = fx.file_id \gset
RESET ROLE;
INSERT INTO results (persona, check_name, expected, actual) VALUES
  ('service', 'claim once', '1', :'claimed'),
  ('service', 'second claim while locked', '0', :'reclaimed'),
  ('service', 'save_step → status', 'done', :'st_after_save'),
  ('service', 'save_step keeps scanned_pages', '{}', :'sp_after_save'),
  ('service', 'save_step releases lock', 't', :'unlocked');

CREATE FUNCTION pg_temp.run_personas() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  personas text[][] := ARRAY[
    ['mike',   'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'internal'],
    ['arty',   '5d126739-bd85-4e90-8f43-9458b162c3cc', 'internal'],
    ['va',     '20e5f2d4-870e-4cd6-bf9b-6e7c269a2579', 'internal'],
    ['coach',  'f973bd0d-e84a-4acd-b832-eaea0a95fd0a', 'external'],
    ['portal', 'b5a6918e-0c23-46c1-987b-138d06e25ac0', 'external']];
  i int;
  internal boolean;
BEGIN
  FOR i IN 1..array_length(personas, 1) LOOP
    internal := personas[i][3] = 'internal';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', personas[i][2], 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM pg_temp.probe(personas[i][1], 'select knowledge_entry_file', CASE WHEN internal THEN '1' ELSE '0' END,
      'select count(*)::text from knowledge_entry_file f join fx on f.id = fx.file_id');
    PERFORM pg_temp.probe(personas[i][1], 'select knowledge_file_chunk', CASE WHEN internal THEN '1' ELSE '0' END,
      'select count(*)::text from knowledge_file_chunk k join fx on k.file_id = fx.file_id');
    PERFORM pg_temp.probe(personas[i][1], 'intel_search keyword hit', CASE WHEN internal THEN '1' ELSE '0' END,
      'select count(*)::text from intel_search(''what is the zebrafinch allowance?'') s join fx on s.file_id = fx.file_id');
    PERFORM pg_temp.probe(personas[i][1], 'intel_search meaning hit', CASE WHEN internal THEN '1' ELSE '0' END,
      'select count(*)::text from fx, intel_search(''unrelated words'', fx.vec) s where s.file_id = fx.file_id');
    PERFORM pg_temp.probe(personas[i][1], 'insert file row', 'ERROR 42501',
      'insert into knowledge_entry_file (entry_id, created_by, dropbox_path, dropbox_folder, filename, file_ext, size_bytes) select entry_id, auth.uid(), ''/Salesforce Documents/Intel/x/y.pdf'', ''/Salesforce Documents/Intel/x'', ''y.pdf'', ''pdf'', 1 from fx returning ''inserted''');
    PERFORM pg_temp.probe(personas[i][1], 'update file row', CASE WHEN internal THEN 'ERROR 42501' ELSE 'ERROR 42501' END,
      'update knowledge_entry_file set status = ''done'' where id = (select file_id from fx) returning ''updated''');
    -- Deleting goes through the edge function (uploader or admin), never the browser.
    PERFORM pg_temp.probe(personas[i][1], 'delete file row', 'ERROR 42501',
      'delete from knowledge_entry_file where id = (select file_id from fx) returning ''deleted''');
    PERFORM pg_temp.probe(personas[i][1], 'call knowledge_file_claim', 'ERROR 42501',
      'select count(*)::text from fx, knowledge_file_claim(fx.file_id)');
    PERFORM pg_temp.probe(personas[i][1], 'call knowledge_file_save_step', 'ERROR 42501',
      'select knowledge_file_save_step((select file_id from fx), ''[]''::jsonb, ''{}''::jsonb)::text');
    EXECUTE 'RESET ROLE';
  END LOOP;

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.probe('anon', 'select knowledge_entry_file', 'ERROR 42501', 'select count(*)::text from knowledge_entry_file');
  PERFORM pg_temp.probe('anon', 'select knowledge_file_chunk', 'ERROR 42501', 'select count(*)::text from knowledge_file_chunk');
  PERFORM pg_temp.probe('anon', 'intel_search', 'ERROR 42501', 'select count(*)::text from intel_search(''zebrafinch'')');
  EXECUTE 'RESET ROLE';
END $$;

SELECT pg_temp.run_personas() \gset ig_

-- delete_file: the edge function deletes the row as service_role; the chunks
-- cascade, so neither search path can find the file's text afterwards.
SET LOCAL ROLE service_role;
DELETE FROM public.knowledge_entry_file WHERE id = (SELECT file_id FROM fx);
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'role', 'authenticated')::text, true) \gset ig_
SET LOCAL ROLE authenticated;
SELECT pg_temp.probe('mike', 'after delete: chunks left', '0',
  'select count(*)::text from knowledge_file_chunk k join fx on k.file_id = fx.file_id') \gset ig_
SELECT pg_temp.probe('mike', 'after delete: intel_search keyword hit', '0',
  'select count(*)::text from intel_search(''what is the zebrafinch allowance?'') s join fx on s.file_id = fx.file_id') \gset ig_
SELECT pg_temp.probe('mike', 'after delete: intel_search meaning hit', '0',
  'select count(*)::text from fx, intel_search(''unrelated words'', fx.vec) s where s.file_id = fx.file_id') \gset ig_
RESET ROLE;

SELECT persona, check_name, expected, actual,
       CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END AS result
  FROM results ORDER BY n;
SELECT count(*) FILTER (WHERE actual = expected) || '/' || count(*) || ' pass' AS summary FROM results;
ROLLBACK;
