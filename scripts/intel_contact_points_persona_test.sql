-- Rolled-back persona test for migration 20261026092943 (internal-details list
-- opened to all internal users, for "Paste signature" in ContactFormModal).
-- Run from the repo root:
--   set -a && . ./.env && set +a
--   psql "$DATABASE_URL" -f scripts/intel_contact_points_persona_test.sql
-- Each persona is probed BEFORE and AFTER the migration inside one transaction
-- that ends in ROLLBACK. Once the migration is live, BEFORE shows the new state.
\set ON_ERROR_STOP on
\set QUIET on
\pset footer off
BEGIN;
CREATE TEMP TABLE results (n serial, phase text, persona text, check_name text, expected text, actual text) ON COMMIT DROP;
GRANT ALL ON results TO authenticated, anon; GRANT USAGE ON SEQUENCE results_n_seq TO authenticated, anon;
CREATE FUNCTION pg_temp.probe(p_phase text, p_persona text, p_check text, p_expected text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  BEGIN EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN v := 'ERROR ' || SQLSTATE || ' (' || SQLERRM || ')';
  END;
  INSERT INTO results (phase, persona, check_name, expected, actual) VALUES (p_phase, p_persona, p_check, p_expected, coalesce(v, 'null'));
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.probe(text,text,text,text,text) TO authenticated, anon;

CREATE FUNCTION pg_temp.run_phase(p_phase text, p_after boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  personas text[][] := ARRAY[
    ['mike',   'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'internal'],
    ['arty',   '5d126739-bd85-4e90-8f43-9458b162c3cc', 'internal'],
    ['va',     '20e5f2d4-870e-4cd6-bf9b-6e7c269a2579', 'internal'],
    ['coach',  'f973bd0d-e84a-4acd-b832-eaea0a95fd0a', 'external'],
    ['portal', 'b5a6918e-0c23-46c1-987b-138d06e25ac0', 'external']];
  i int;
  exp text;
BEGIN
  FOR i IN 1..array_length(personas, 1) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', personas[i][2], 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    exp := CASE
      WHEN personas[i][3] = 'external' THEN 'ERROR 42501'
      WHEN p_after OR personas[i][1] = 'mike' THEN '>0'
      ELSE 'ERROR 42501' END;
    PERFORM pg_temp.probe(p_phase, personas[i][1], 'internal_contact_points()', exp,
      'select count(*)::text from intel_internal_contact_points()');
    -- Regression: the email lookup itself stays Mike-only.
    PERFORM pg_temp.probe(p_phase, personas[i][1], 'email lookup gate (unchanged)',
      CASE WHEN personas[i][1] = 'mike' THEN 'true' ELSE 'false' END,
      'select intel_email_lookup_allowed()::text');
    EXECUTE 'RESET ROLE';
  END LOOP;
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.probe(p_phase, 'anon', 'internal_contact_points()', 'ERROR 42501',
    'select count(*)::text from intel_internal_contact_points()');
  EXECUTE 'RESET ROLE';
END $$;

SELECT pg_temp.run_phase('before', false) \gset ig_
\i supabase/migrations/20261026092943_intel_internal_contact_points_all_internal.sql
SELECT pg_temp.run_phase('after', true) \gset ig_

\pset format aligned
select n, phase, persona, check_name, expected, actual,
  case when expected = actual or (expected = '>0' and actual ~ '^[1-9][0-9]*$')
            or (expected like 'ERROR%' and actual like expected || '%') then 'PASS' else 'FAIL' end as verdict
from results order by n;
ROLLBACK;
