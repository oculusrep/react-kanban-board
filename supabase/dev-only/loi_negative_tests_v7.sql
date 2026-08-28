-- DEV-ONLY — v7: explicit omit option + attachment requirements. loi-tool-dev ONLY.
-- After bootstrap + all LOI migrations. Single transaction, ROLLED BACK.

\set ON_ERROR_STOP on
\timing off
BEGIN;
INSERT INTO loi_clause (clause_key, title, bucket) VALUES ('os_test', 'OS test', 'coded-position');
INSERT INTO loi_variant (clause_id, variant_key) VALUES ((SELECT id FROM loi_clause WHERE clause_key='os_test'), 'ost');
INSERT INTO loi_canonical_body (id, brace_code, source, version, segment_key, body_text)
  VALUES ('33333333-3333-3333-3333-333333333333', 'OST0', 'national-template-drop', 'v1', 'main', 'DUMMY {{param:opt}}.');
INSERT INTO loi_body_parameter (id, canonical_body_id, param_kind, param_key)
  VALUES ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'choose_one', 'opt');
INSERT INTO loi_position (id, variant_id, position_kind, brace_code, rank, authority)
  VALUES ('55555555-5555-5555-5555-555555555555', (SELECT id FROM loi_variant WHERE variant_key='ost'), 'alternative', 'OST0', 0, 'national-handbook');

-- N1 — omit option carrying a value => FAIL (option shape)
DO $$
BEGIN
  INSERT INTO loi_body_parameter_option (body_parameter_id, option_value, is_omit)
    VALUES ('44444444-4444-4444-4444-444444444444', 'something', true);
  RAISE WARNING 'TEST N1 omit-no-value: FAIL (accepted omit with value)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N1 omit-no-value: PASS (rejected: %)', SQLERRM; END $$;

-- P1 — one real option + one omit option => SUCCEED
DO $$
BEGIN
  INSERT INTO loi_body_parameter_option (body_parameter_id, option_value, sort_order) VALUES ('44444444-4444-4444-4444-444444444444', 'for exclusive use', 0);
  INSERT INTO loi_body_parameter_option (body_parameter_id, is_omit, sort_order) VALUES ('44444444-4444-4444-4444-444444444444', true, 1);
  RAISE NOTICE 'TEST P1 omit-valid: PASS';
EXCEPTION WHEN others THEN RAISE WARNING 'TEST P1 omit-valid: FAIL (%)', SQLERRM; END $$;

-- N2 — a second omit option => FAIL (single-omit unique)
DO $$
BEGIN
  INSERT INTO loi_body_parameter_option (body_parameter_id, is_omit, sort_order) VALUES ('44444444-4444-4444-4444-444444444444', true, 2);
  RAISE WARNING 'TEST N2 single-omit: FAIL (accepted 2nd omit)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N2 single-omit: PASS (rejected: %)', SQLERRM; END $$;

-- N3 — attachment_requirement with null requirement => FAIL (not null)
DO $$
BEGIN
  INSERT INTO loi_attachment_requirement (position_id, requirement) VALUES ('55555555-5555-5555-5555-555555555555', NULL);
  RAISE WARNING 'TEST N3 attachment-requires-text: FAIL (accepted null requirement)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N3 attachment-requires-text: PASS (rejected: %)', SQLERRM; END $$;

-- P2 — valid attachment_requirement surfaces in loi_attachment_task => SUCCEED
DO $$ DECLARE n INT;
BEGIN
  INSERT INTO loi_attachment_requirement (position_id, requirement, exhibit_ref)
    VALUES ('55555555-5555-5555-5555-555555555555', 'attach exclusives list', 'Exhibit A');
  SELECT count(*) INTO n FROM loi_attachment_task WHERE position_id='55555555-5555-5555-5555-555555555555';
  IF n = 1 THEN RAISE NOTICE 'TEST P2 attachment-task: PASS'; ELSE RAISE WARNING 'TEST P2 attachment-task: FAIL (n=%)', n; END IF;
END $$;

ROLLBACK;
