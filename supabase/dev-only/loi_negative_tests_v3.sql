-- DEV-ONLY — v3 shape tests (body parameters + multi-target modifier). loi-tool-dev ONLY.
-- Run after bootstrap + all four LOI migrations. Single transaction, ROLLED BACK.

\set ON_ERROR_STOP on
\timing off
BEGIN;

-- Fixtures
INSERT INTO loi_clause (clause_key, title, bucket) VALUES
  ('rent_commencement', 'Rent Commencement', 'coded-position'),
  ('signage',           'Signage',           'coded-position');
INSERT INTO loi_variant (clause_id, variant_key) VALUES
  ((SELECT id FROM loi_clause WHERE clause_key='rent_commencement'), 'rcd'),
  ((SELECT id FROM loi_clause WHERE clause_key='signage'),           'sign');

INSERT INTO loi_canonical_body (brace_code, source, version, segment_key, body_text)
  VALUES ('RCD0', 'national-template-drop', 'v1', 'main',
          'DUMMY: Rent Commencement shall occur {{param:rcd_days}} days after delivery.');

-- Signage positions: SIGN0/SIGN1 alternatives + a master-program modifier that can ride either.
INSERT INTO loi_position (variant_id, position_kind, brace_code, rank, authority) VALUES
  ((SELECT id FROM loi_variant WHERE variant_key='sign'), 'alternative', 'SIGN0', 0, 'national-handbook'),
  ((SELECT id FROM loi_variant WHERE variant_key='sign'), 'alternative', 'SIGN1', 1, 'national-handbook');
INSERT INTO loi_position (variant_id, position_kind, brace_code, emit_order, modifies_clause_id, authority)
  VALUES ((SELECT id FROM loi_variant WHERE variant_key='sign'), 'modifier', 'SIGNMASTER', 10,
          (SELECT id FROM loi_clause WHERE clause_key='signage'), 'national-handbook');

-- P1 — valid body parameter (preferred 120 / fallback 90) => expect SUCCEED
DO $$
BEGIN
  INSERT INTO loi_body_parameter (canonical_body_id, param_key, preferred_value, fallback_value, value_unit)
    VALUES ((SELECT id FROM loi_canonical_body WHERE brace_code='RCD0'),
            'rcd_days', 'one hundred twenty (120)', 'ninety (90)', 'days');
  RAISE NOTICE 'TEST P1 body-parameter valid: PASS (preferred+fallback accepted)';
EXCEPTION WHEN others THEN
  RAISE WARNING 'TEST P1 body-parameter valid: FAIL (%)', SQLERRM;
END $$;

-- N1 — duplicate param_key on the same body => expect reject (unique)
DO $$
BEGIN
  INSERT INTO loi_body_parameter (canonical_body_id, param_key, preferred_value)
    VALUES ((SELECT id FROM loi_canonical_body WHERE brace_code='RCD0'),
            'rcd_days', 'sixty (60)');
  RAISE WARNING 'TEST N1 dup-param-key: FAIL (accepted duplicate param_key on one body)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N1 dup-param-key: PASS (rejected: %)', SQLERRM;
END $$;

-- N2 — parameter with null preferred_value => expect reject (not null)
DO $$
BEGIN
  INSERT INTO loi_body_parameter (canonical_body_id, param_key, preferred_value)
    VALUES ((SELECT id FROM loi_canonical_body WHERE brace_code='RCD0'),
            'alt_period', NULL);
  RAISE WARNING 'TEST N2 preferred-required: FAIL (accepted null preferred_value)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N2 preferred-required: PASS (rejected: %)', SQLERRM;
END $$;

-- P2 — multi-target modifier: SIGNMASTER may ride SIGN0 OR SIGN1 (two OR-grouped position_selection rows) => SUCCEED
DO $$
BEGIN
  INSERT INTO loi_applies_when_condition (position_id, condition_group, ref_kind, ref_clause_key, ref_brace_code, operator) VALUES
    ((SELECT id FROM loi_position WHERE brace_code='SIGNMASTER'), 0, 'position_selection', 'signage', 'SIGN0', 'is_selected'),
    ((SELECT id FROM loi_position WHERE brace_code='SIGNMASTER'), 1, 'position_selection', 'signage', 'SIGN1', 'is_selected');
  RAISE NOTICE 'TEST P2 multi-target modifier: PASS (SIGN0 OR SIGN1 targets accepted)';
EXCEPTION WHEN others THEN
  RAISE WARNING 'TEST P2 multi-target modifier: FAIL (%)', SQLERRM;
END $$;

-- Informational: confirm the premature building_type domain is gone (now seed-managed).
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM loi_selector_domain WHERE selector_field='building_type';
  IF n = 0 THEN RAISE NOTICE 'CHECK building_type-domain-removed: PASS (0 rows; seed-managed)';
  ELSE RAISE WARNING 'CHECK building_type-domain-removed: FAIL (% rows still hardcoded)', n; END IF;
END $$;

ROLLBACK;
