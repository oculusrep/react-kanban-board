-- DEV-ONLY — v8: deal-type-restricted subdomain + unified negotiable item. loi-tool-dev ONLY.
-- After bootstrap + all LOI migrations. Two transactions, ROLLED BACK.

\set ON_ERROR_STOP on
\timing off

-- ===========================================================================
-- TRANSACTION A — cam_basis subdomain (deferred partition constraint)
-- ===========================================================================
BEGIN;
INSERT INTO loi_selector (selector_field, current_version) VALUES ('cam_basis', 1);
INSERT INTO loi_selector_domain (selector_field, version, value) VALUES
  ('cam_basis', 1, 'nn_multi_tenant'),
  ('cam_basis', 1, 'nn_single_tenant_building'),
  ('cam_basis', 1, 'nnn');
INSERT INTO loi_clause (clause_key, title, bucket) VALUES ('cam', 'CAM', 'coded-position');
-- ECDT CAM variant: subdomain {nn_multi_tenant}; ONE conditional_alternative (CAM0) covers it.
INSERT INTO loi_variant (clause_id, variant_key, selector_field, selector_version)
  VALUES ((SELECT id FROM loi_clause WHERE clause_key='cam'), 'cam_ecdt', 'cam_basis', 1);
INSERT INTO loi_variant_selector_value (variant_id, value)
  VALUES ((SELECT id FROM loi_variant WHERE variant_key='cam_ecdt'), 'nn_multi_tenant');
INSERT INTO loi_position (variant_id, position_kind, brace_code, selector_value, authority)
  VALUES ((SELECT id FROM loi_variant WHERE variant_key='cam_ecdt'),
          'conditional_alternative', 'CAM0', 'nn_multi_tenant', 'national-handbook');

SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN RAISE NOTICE 'TEST P1 ecdt-subdomain: PASS (1 position covers subdomain {nn_multi_tenant}; CAM1/NNN not forced in)'; END $$;

-- N1 — a conditional_alternative outside the declared subdomain => reject
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, selector_value, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='cam_ecdt'),
            'conditional_alternative', 'NNN', 'nnn', 'national-handbook');
  RAISE WARNING 'TEST N1 cond-outside-subdomain: FAIL (accepted nnn outside subdomain)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N1 cond-outside-subdomain: PASS (rejected: %)', SQLERRM; END $$;

-- N2 — a subdomain value outside the full domain => reject
DO $$
BEGIN
  INSERT INTO loi_variant_selector_value (variant_id, value)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='cam_ecdt'), 'bogus');
  RAISE WARNING 'TEST N2 subdomain-outside-domain: FAIL (accepted a value outside the domain)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N2 subdomain-outside-domain: PASS (rejected: %)', SQLERRM; END $$;

ROLLBACK;

-- ===========================================================================
-- TRANSACTION B — unified negotiable item (immediate CHECKs)
-- ===========================================================================
BEGIN;
INSERT INTO loi_clause (clause_key, title, bucket) VALUES ('as', 'Assignment', 'coded-position');
INSERT INTO loi_variant (clause_id, variant_key) VALUES ((SELECT id FROM loi_clause WHERE clause_key='as'), 'as_v');
INSERT INTO loi_position (id, variant_id, position_kind, brace_code, rank, authority)
  VALUES ('66666666-6666-6666-6666-666666666666', (SELECT id FROM loi_variant WHERE variant_key='as_v'),
          'alternative', 'AS0', 0, 'national-handbook');

-- P1 — economic-term negotiable item with an opening value => SUCCEED
DO $$
BEGIN
  INSERT INTO loi_negotiable_item (deal_id, item_kind, economic_term_key, opening_value, current_value)
    VALUES (gen_random_uuid(), 'economic_term', 'escalation_rate', '0.10', '0.08');
  RAISE NOTICE 'TEST P1 econ-item: PASS (opened 0.10 -> current 0.08)';
EXCEPTION WHEN others THEN RAISE WARNING 'TEST P1 econ-item: FAIL (%)', SQLERRM; END $$;

-- P2 — clause-position negotiable item => SUCCEED
DO $$
BEGIN
  INSERT INTO loi_negotiable_item (deal_id, item_kind, position_id, opening_value)
    VALUES (gen_random_uuid(), 'clause_position', '66666666-6666-6666-6666-666666666666', 'AS0 word-for-word');
  RAISE NOTICE 'TEST P2 clause-item: PASS';
EXCEPTION WHEN others THEN RAISE WARNING 'TEST P2 clause-item: FAIL (%)', SQLERRM; END $$;

-- N1 — item referencing BOTH a position and an economic term => reject (target CHECK)
DO $$
BEGIN
  INSERT INTO loi_negotiable_item (deal_id, item_kind, position_id, economic_term_key, opening_value)
    VALUES (gen_random_uuid(), 'clause_position', '66666666-6666-6666-6666-666666666666', 'escalation_rate', 'x');
  RAISE WARNING 'TEST N1 one-target: FAIL (accepted both targets)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N1 one-target: PASS (rejected: %)', SQLERRM; END $$;

-- N2 — missing opening_value => reject (captured at Phase-1 for every item)
DO $$
BEGIN
  INSERT INTO loi_negotiable_item (deal_id, item_kind, economic_term_key, opening_value)
    VALUES (gen_random_uuid(), 'economic_term', 'base_rent', NULL);
  RAISE WARNING 'TEST N2 opening-required: FAIL (accepted null opening_value)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N2 opening-required: PASS (rejected: %)', SQLERRM; END $$;

ROLLBACK;
