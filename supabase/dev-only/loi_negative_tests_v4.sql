-- DEV-ONLY — v4 shape tests (param kinds choose_one/concession + brace-guard relaxation).
-- loi-tool-dev ONLY, after bootstrap + all five LOI migrations. Two transactions, ROLLED BACK.
--   Txn A: immediate constraints (brace guard, kind-shape CHECK).
--   Txn B: deferred option-count constraint (build valid, flip IMMEDIATE, mutate).

\set ON_ERROR_STOP on
\timing off

-- ===========================================================================
-- TRANSACTION A — brace relaxation + param kind-shape CHECK
-- ===========================================================================
BEGIN;
INSERT INTO loi_clause (clause_key, title, bucket)
  VALUES ('premises', 'Premises', 'coded-position');
INSERT INTO loi_variant (clause_id, variant_key)
  VALUES ((SELECT id FROM loi_clause WHERE clause_key='premises'), 'prem');
INSERT INTO loi_canonical_body (brace_code, source, version, segment_key, body_text)
  VALUES ('PREM0', 'national-template-drop', 'v1', 'main', 'DUMMY premises within the {{param:building_or_center}}.');

-- P1 — UNCODED modifier under a coded-position clause => now SUCCEED (relaxation)
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, emit_order, modifies_clause_id, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='prem'),
            'modifier', NULL, 10, (SELECT id FROM loi_clause WHERE clause_key='premises'), 'national-handbook');
  RAISE NOTICE 'TEST P1 uncoded-modifier-ok: PASS (uncoded modifier accepted)';
EXCEPTION WHEN others THEN
  RAISE WARNING 'TEST P1 uncoded-modifier-ok: FAIL (rejected uncoded modifier: %)', SQLERRM;
END $$;

-- N1 — UNCODED alternative under a coded-position clause => still FAIL (no coded gaps)
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, rank, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='prem'),
            'alternative', NULL, 0, 'national-handbook');
  RAISE WARNING 'TEST N1 coded-alt-needs-brace: FAIL (accepted an uncoded alternative)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N1 coded-alt-needs-brace: PASS (rejected: %)', SQLERRM;
END $$;

-- N2 — choose_one param carrying a preferred_value => FAIL (kind-shape CHECK)
DO $$
BEGIN
  INSERT INTO loi_body_parameter (canonical_body_id, param_kind, param_key, preferred_value)
    VALUES ((SELECT id FROM loi_canonical_body WHERE brace_code='PREM0'),
            'choose_one', 'building_or_center', 'Shopping Center');
  RAISE WARNING 'TEST N2 choose_one-no-preferred: FAIL (accepted preferred_value on choose_one)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N2 choose_one-no-preferred: PASS (rejected: %)', SQLERRM;
END $$;

-- P2 — valid concession param (preferred set, no options) => SUCCEED
DO $$
BEGIN
  INSERT INTO loi_body_parameter (canonical_body_id, param_kind, param_key, preferred_value, fallback_value, value_unit)
    VALUES ((SELECT id FROM loi_canonical_body WHERE brace_code='PREM0'),
            'concession', 'cure_days', 'thirty (30)', 'forty-five (45)', 'days');
  RAISE NOTICE 'TEST P2 concession-valid: PASS';
EXCEPTION WHEN others THEN
  RAISE WARNING 'TEST P2 concession-valid: FAIL (%)', SQLERRM;
END $$;

ROLLBACK;

-- ===========================================================================
-- TRANSACTION B — deferred option-count (choose_one >= 2, concession = 0)
-- ===========================================================================
BEGIN;
INSERT INTO loi_clause (clause_key, title, bucket)
  VALUES ('premises2', 'Premises 2', 'coded-position');
INSERT INTO loi_canonical_body (brace_code, source, version, segment_key, body_text)
  VALUES ('PREM1', 'national-template-drop', 'v1', 'main', 'DUMMY within the {{param:bldg_or_center}}.');

-- A valid choose_one param with 2 options + a valid concession param (no options).
INSERT INTO loi_body_parameter (id, canonical_body_id, param_kind, param_key)
  VALUES ('11111111-1111-1111-1111-111111111111',
          (SELECT id FROM loi_canonical_body WHERE brace_code='PREM1'), 'choose_one', 'bldg_or_center');
INSERT INTO loi_body_parameter_option (body_parameter_id, option_value, sort_order) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Building', 0),
  ('11111111-1111-1111-1111-111111111111', 'Shopping Center', 1);
INSERT INTO loi_body_parameter (id, canonical_body_id, param_kind, param_key, preferred_value)
  VALUES ('22222222-2222-2222-2222-222222222222',
          (SELECT id FROM loi_canonical_body WHERE brace_code='PREM1'), 'concession', 'cure', 'thirty (30)');

-- Force deferred option-count to validate the complete valid state now.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN RAISE NOTICE 'TEST P3 choose_one-2-options: PASS (valid choose_one + concession accepted)'; END $$;

-- N3 — drop an option so choose_one has 1 => expect reject
DO $$
BEGIN
  DELETE FROM loi_body_parameter_option
    WHERE body_parameter_id='11111111-1111-1111-1111-111111111111' AND option_value='Shopping Center';
  RAISE WARNING 'TEST N3 choose_one-min-2: FAIL (accepted a 1-option choose_one)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N3 choose_one-min-2: PASS (rejected: %)', SQLERRM;
END $$;

-- N4 — add an option to a concession param => expect reject
DO $$
BEGIN
  INSERT INTO loi_body_parameter_option (body_parameter_id, option_value)
    VALUES ('22222222-2222-2222-2222-222222222222', 'bogus');
  RAISE WARNING 'TEST N4 concession-no-options: FAIL (accepted an option on a concession param)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N4 concession-no-options: PASS (rejected: %)', SQLERRM;
END $$;

ROLLBACK;
