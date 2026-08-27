-- DEV-ONLY — v6: param_kind 'fill' (plain per-deal free-fill). loi-tool-dev ONLY.
-- After bootstrap + all LOI migrations. Single transaction, ROLLED BACK.

\set ON_ERROR_STOP on
\timing off
BEGIN;
INSERT INTO loi_clause (clause_key, title, bucket) VALUES ('premises3', 'Premises 3', 'coded-position');
INSERT INTO loi_canonical_body (brace_code, source, version, segment_key, body_text)
  VALUES ('PREM3', 'national-template-drop', 'v1', 'main', 'DUMMY measuring {{param:dimensions}}.');

-- P1 — valid fill (no preferred/fallback, no options) => SUCCEED
DO $$
BEGIN
  INSERT INTO loi_body_parameter (canonical_body_id, param_kind, param_key)
    VALUES ((SELECT id FROM loi_canonical_body WHERE brace_code='PREM3'), 'fill', 'dimensions');
  RAISE NOTICE 'TEST P1 fill-valid: PASS';
EXCEPTION WHEN others THEN RAISE WARNING 'TEST P1 fill-valid: FAIL (%)', SQLERRM; END $$;

-- N1 — fill with a preferred_value => FAIL (kind-shape)
DO $$
BEGIN
  INSERT INTO loi_body_parameter (canonical_body_id, param_kind, param_key, preferred_value)
    VALUES ((SELECT id FROM loi_canonical_body WHERE brace_code='PREM3'), 'fill', 'dim2', 'x');
  RAISE WARNING 'TEST N1 fill-no-preferred: FAIL (accepted preferred on fill)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N1 fill-no-preferred: PASS (rejected: %)', SQLERRM; END $$;

-- N2 — fill carrying an option => FAIL (deferred count trigger; force immediate)
DO $$ DECLARE pid uuid;
BEGIN
  INSERT INTO loi_body_parameter (canonical_body_id, param_kind, param_key)
    VALUES ((SELECT id FROM loi_canonical_body WHERE brace_code='PREM3'), 'fill', 'dim3') RETURNING id INTO pid;
  INSERT INTO loi_body_parameter_option (body_parameter_id, option_value) VALUES (pid, 'nope');
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE WARNING 'TEST N2 fill-no-options: FAIL (accepted option on fill)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N2 fill-no-options: PASS (rejected: %)', SQLERRM; END $$;

ROLLBACK;
