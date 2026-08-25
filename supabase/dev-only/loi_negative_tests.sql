-- DEV-ONLY — seven decision-encoding negative tests for the LOI clause-library schema.
-- Each case expects the DB to REJECT the operation. Harness prints:
--   PASS  = correctly rejected (constraint/trigger/FK fired)
--   FAIL  = wrongly accepted (the decision is NOT enforced)
-- Runs inside a single transaction that is ROLLED BACK — leaves no rows behind.
-- Run AFTER loi_dev_bootstrap.sql and the LOI migration, against loi-tool-dev ONLY.

\set ON_ERROR_STOP on
\timing off
BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures (must succeed). Also proves the valid/happy path inserts cleanly.
-- ---------------------------------------------------------------------------
INSERT INTO loi_clause (clause_key, title, bucket) VALUES
  ('cam',                  'Common Area Maintenance', 'coded-position'),
  ('custom_broker',        'Broker Commission',       'custom-owned'),
  ('continuous_operation', 'Continuous Operation',    'coded-position');

INSERT INTO loi_variant (clause_id, variant_key) VALUES
  ((SELECT id FROM loi_clause WHERE clause_key='cam'),                  'cam_endcap_dt'),
  ((SELECT id FROM loi_clause WHERE clause_key='custom_broker'),        'cust_endcap_dt'),
  ((SELECT id FROM loi_clause WHERE clause_key='continuous_operation'), 'co_endcap_dt');

-- Existing CO1 canonical body (source+version) — targets tests 1 and 2.
INSERT INTO loi_canonical_body (brace_code, source, version, body_text)
  VALUES ('CO1', 'southeast-doc', 'v1', 'DUMMY CO1 body AAA');

-- A valid coded alternative at rank 0 (proves happy path; anchors tests 6 and 7).
INSERT INTO loi_position (variant_id, position_kind, brace_code, rank, authority)
  VALUES ((SELECT id FROM loi_variant WHERE variant_key='cam_endcap_dt'),
          'alternative', 'CAM0', 0, 'national-handbook');

-- ---------------------------------------------------------------------------
-- TEST 1 — two distinct CO1 bodies under same source+version  → expect FAIL(reject)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO loi_canonical_body (brace_code, source, version, body_text)
    VALUES ('CO1', 'southeast-doc', 'v1', 'DUMMY CO1 body BBB (divergent)');
  RAISE WARNING 'TEST 1 collision-guard: FAIL (accepted a divergent duplicate)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST 1 collision-guard: PASS (rejected: %)', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 2 — mutate an existing canonical body row  → expect reject
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  UPDATE loi_canonical_body SET body_text='MUTATED'
    WHERE brace_code='CO1' AND source='southeast-doc' AND version='v1';
  RAISE WARNING 'TEST 2 immutability: FAIL (accepted a body mutation)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST 2 immutability: PASS (rejected: %)', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 3 — modifier with null modifies_clause_id  → expect reject
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, rank, emit_order, modifies_clause_id, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='cam_endcap_dt'),
            'modifier', 'NNN', NULL, 10, NULL, 'national-handbook');
  RAISE WARNING 'TEST 3 modifier-needs-parent: FAIL (accepted null modifies_clause_id)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST 3 modifier-needs-parent: PASS (rejected: %)', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 4a — modifier carrying a rank  → expect reject
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, rank, emit_order, modifies_clause_id, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='cam_endcap_dt'),
            'modifier', 'NNN', 5, 10,
            (SELECT id FROM loi_clause WHERE clause_key='cam'), 'national-handbook');
  RAISE WARNING 'TEST 4a modifier-has-rank: FAIL (accepted a ranked modifier)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST 4a modifier-has-rank: PASS (rejected: %)', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 4b — alternative with null rank  → expect reject
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, rank, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='cam_endcap_dt'),
            'alternative', 'CAM9', NULL, 'national-handbook');
  RAISE WARNING 'TEST 4b alternative-null-rank: FAIL (accepted a rankless alternative)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST 4b alternative-null-rank: PASS (rejected: %)', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 5a — coded position with no brace code  → expect reject
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, rank, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='cam_endcap_dt'),
            'alternative', NULL, 7, 'national-handbook');
  RAISE WARNING 'TEST 5a coded-needs-brace: FAIL (accepted a coded position with no brace code)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST 5a coded-needs-brace: PASS (rejected: %)', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 5b — custom-owned position carrying a brace code  → expect reject
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, rank, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='cust_endcap_dt'),
            'alternative', 'CUST1', 0, 'self-authored');
  RAISE WARNING 'TEST 5b custom-no-brace: FAIL (accepted a custom-owned position with a brace code)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST 5b custom-no-brace: PASS (rejected: %)', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 6 — two alternatives at the same rank in one variant  → expect reject
--   (a valid rank-0 CAM0 already exists as a fixture in this variant)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, rank, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='cam_endcap_dt'),
            'alternative', 'CAM0DUP', 0, 'national-handbook');
  RAISE WARNING 'TEST 6 duplicate-rank: FAIL (accepted two alternatives at rank 0)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST 6 duplicate-rank: PASS (rejected: %)', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 7 — applies_when referencing a non-existent clause  → expect reject
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO loi_applies_when_condition (position_id, ref_kind, ref_clause_key, operator, compare_value)
    VALUES ((SELECT id FROM loi_position WHERE brace_code='CAM0' AND rank=0),
            'clause_selection', 'does_not_exist', 'is_selected', 'X');
  RAISE WARNING 'TEST 7 applies-when-fk: FAIL (accepted a reference to a non-existent clause)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST 7 applies-when-fk: PASS (rejected: %)', SQLERRM;
END $$;

ROLLBACK;
