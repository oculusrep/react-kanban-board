-- DEV-ONLY — v2 shape tests (proof-of-shape revisions). Run against loi-tool-dev ONLY,
-- after the bootstrap + all three LOI migrations. Each case prints PASS/FAIL.
-- Two transactions, both ROLLED BACK (no rows left behind).
--   Txn A exercises the DEFERRED partition constraint (build valid, flip to IMMEDIATE, mutate).
--   Txn B exercises IMMEDIATE constraints (shape CHECKs, unique, FK, immutability).

\set ON_ERROR_STOP on
\timing off

-- ===========================================================================
-- TRANSACTION A — conditional_alternative partition (deferred constraint)
-- ===========================================================================
BEGIN;

-- building_type is retired from the real schema (CAM axis is lease structure now), so this test
-- seeds a transient selector + domain of its own (rolled back with the transaction).
INSERT INTO loi_selector (selector_field, current_version) VALUES ('building_type', 1);
INSERT INTO loi_selector_domain (selector_field, version, value) VALUES
  ('building_type', 1, 'multi_tenant'),
  ('building_type', 1, 'single_tenant_building'),
  ('building_type', 1, 'single_tenant_parcel');

INSERT INTO loi_clause (clause_key, title, bucket) VALUES
  ('cam',   'Common Area Maintenance', 'coded-position'),
  ('trash', 'Trash / Refuse',          'coded-position');

-- Selectorful CAM variant, pinned to building_type v1.
INSERT INTO loi_variant (clause_id, variant_key, selector_field, selector_version)
  VALUES ((SELECT id FROM loi_clause WHERE clause_key='cam'), 'cam_bt', 'building_type', 1);
-- Plain (no-selector) variant for the "conds without selector" test.
INSERT INTO loi_variant (clause_id, variant_key)
  VALUES ((SELECT id FROM loi_clause WHERE clause_key='trash'), 'tr_plain');

-- Complete, exact partition of building_type v1 (multi / single-building / single-parcel).
INSERT INTO loi_position (variant_id, position_kind, brace_code, selector_value, authority) VALUES
  ((SELECT id FROM loi_variant WHERE variant_key='cam_bt'), 'conditional_alternative', 'CAM0', 'multi_tenant',           'national-handbook'),
  ((SELECT id FROM loi_variant WHERE variant_key='cam_bt'), 'conditional_alternative', 'CAM1', 'single_tenant_building', 'national-handbook'),
  ((SELECT id FROM loi_variant WHERE variant_key='cam_bt'), 'conditional_alternative', 'NNN',  'single_tenant_parcel',   'national-handbook');

-- Force deferred partition constraint to validate the complete partition NOW.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN RAISE NOTICE 'TEST P2 valid-partition: PASS (exact 3/3 partition accepted)'; END $$;

-- N5 — remove one rung => non-exhaustive => expect reject
DO $$
BEGIN
  DELETE FROM loi_position WHERE brace_code='NNN'
    AND variant_id=(SELECT id FROM loi_variant WHERE variant_key='cam_bt');
  RAISE WARNING 'TEST N5 non-exhaustive: FAIL (accepted a 2/3 partition)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N5 non-exhaustive: PASS (rejected: %)', SQLERRM;
END $$;

-- N6 — add an out-of-domain value => expect reject
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, selector_value, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='cam_bt'),
            'conditional_alternative', 'CAMX', 'ground_lease_pad', 'national-handbook');
  RAISE WARNING 'TEST N6 out-of-domain: FAIL (accepted a value outside the domain)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N6 out-of-domain: PASS (rejected: %)', SQLERRM;
END $$;

-- N4 — duplicate selector_value in a variant => expect reject (exclusivity unique index)
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, selector_value, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='cam_bt'),
            'conditional_alternative', 'CAMDUP', 'multi_tenant', 'national-handbook');
  RAISE WARNING 'TEST N4 duplicate-selector: FAIL (accepted a duplicate selector_value)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N4 duplicate-selector: PASS (rejected: %)', SQLERRM;
END $$;

-- N9 — conditional_alternative in a variant with NO selector_field => expect reject
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, selector_value, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='tr_plain'),
            'conditional_alternative', 'TRX', 'multi_tenant', 'national-handbook');
  RAISE WARNING 'TEST N9 conds-without-selector: FAIL (accepted conditional_alternative under a non-selector variant)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N9 conds-without-selector: PASS (rejected: %)', SQLERRM;
END $$;

ROLLBACK;

-- ===========================================================================
-- TRANSACTION B — immediate constraints (shape / unique / FK / immutability)
-- ===========================================================================
BEGIN;

INSERT INTO loi_clause (clause_key, title, bucket) VALUES
  ('exclusive_use', 'Exclusive Use', 'coded-position');
INSERT INTO loi_variant (clause_id, variant_key)
  VALUES ((SELECT id FROM loi_clause WHERE clause_key='exclusive_use'), 'eu');

-- EU0 base alternative + EU1 modifier (anchors position_selection + multi-body tests).
INSERT INTO loi_position (variant_id, position_kind, brace_code, rank, authority)
  VALUES ((SELECT id FROM loi_variant WHERE variant_key='eu'), 'alternative', 'EU0', 0, 'national-handbook');
INSERT INTO loi_position (variant_id, position_kind, brace_code, emit_order, modifies_clause_id, authority)
  VALUES ((SELECT id FROM loi_variant WHERE variant_key='eu'), 'modifier', 'EU1', 10,
          (SELECT id FROM loi_clause WHERE clause_key='exclusive_use'), 'national-handbook');
INSERT INTO loi_position (variant_id, position_kind, brace_code, emit_order, modifies_clause_id, authority)
  VALUES ((SELECT id FROM loi_variant WHERE variant_key='eu'), 'modifier', 'EU2', 20,
          (SELECT id FROM loi_clause WHERE clause_key='exclusive_use'), 'national-handbook');

-- P3 — valid position_selection applies_when (EU2 depends on EU1) => expect SUCCEED
DO $$
BEGIN
  INSERT INTO loi_applies_when_condition (position_id, ref_kind, ref_clause_key, ref_brace_code, operator)
    VALUES ((SELECT id FROM loi_position WHERE brace_code='EU2'),
            'position_selection', 'exclusive_use', 'EU1', 'is_selected');
  RAISE NOTICE 'TEST P3 position_selection valid: PASS (accepted EU2->EU1 dependency)';
EXCEPTION WHEN others THEN
  RAISE WARNING 'TEST P3 position_selection valid: FAIL (rejected a valid dependency: %)', SQLERRM;
END $$;

-- N7 — position_selection missing ref_brace_code => expect reject (ref_shape)
DO $$
BEGIN
  INSERT INTO loi_applies_when_condition (position_id, ref_kind, ref_clause_key, operator)
    VALUES ((SELECT id FROM loi_position WHERE brace_code='EU2'),
            'position_selection', 'exclusive_use', 'is_selected');
  RAISE WARNING 'TEST N7 position_selection-needs-brace: FAIL (accepted without ref_brace_code)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N7 position_selection-needs-brace: PASS (rejected: %)', SQLERRM;
END $$;

-- P1 — same code+source+version, DIFFERENT segment_key => expect SUCCEED (multi insertion point)
DO $$
BEGIN
  INSERT INTO loi_canonical_body (brace_code, source, version, segment_key, body_text) VALUES
    ('NNN', 'national-template-drop', 'v1', 'cam_block',      'DUMMY NNN body in CAM section'),
    ('NNN', 'national-template-drop', 'v1', 'premises_block', 'DUMMY NNN body as premises add-on');
  RAISE NOTICE 'TEST P1 multi-segment body: PASS (two NNN bodies at distinct segments accepted)';
EXCEPTION WHEN others THEN
  RAISE WARNING 'TEST P1 multi-segment body: FAIL (rejected distinct segments: %)', SQLERRM;
END $$;

-- N1 — same code+source+version+segment => expect reject (collision guard preserved)
DO $$
BEGIN
  INSERT INTO loi_canonical_body (brace_code, source, version, segment_key, body_text)
    VALUES ('NNN', 'national-template-drop', 'v1', 'cam_block', 'DUMMY divergent duplicate');
  RAISE WARNING 'TEST N1 collision-guard: FAIL (accepted a divergent duplicate at same segment)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N1 collision-guard: PASS (rejected: %)', SQLERRM;
END $$;

-- P4 — one position carrying TWO body segments => expect SUCCEED
DO $$
BEGIN
  INSERT INTO loi_position_body (position_id, canonical_body_id, emit_sequence) VALUES
    ((SELECT id FROM loi_position WHERE brace_code='EU1'),
     (SELECT id FROM loi_canonical_body WHERE brace_code='NNN' AND segment_key='cam_block'), 0),
    ((SELECT id FROM loi_position WHERE brace_code='EU1'),
     (SELECT id FROM loi_canonical_body WHERE brace_code='NNN' AND segment_key='premises_block'), 1);
  RAISE NOTICE 'TEST P4 position multi-body: PASS (one position, two body segments)';
EXCEPTION WHEN others THEN
  RAISE WARNING 'TEST P4 position multi-body: FAIL (%)', SQLERRM;
END $$;

-- N2 — conditional_alternative carrying a rank => expect reject (shape)
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, rank, selector_value, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='eu'),
            'conditional_alternative', 'EUX', 3, 'multi_tenant', 'national-handbook');
  RAISE WARNING 'TEST N2 conditional-has-rank: FAIL (accepted a ranked conditional_alternative)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N2 conditional-has-rank: PASS (rejected: %)', SQLERRM;
END $$;

-- N3 — conditional_alternative with null selector_value => expect reject (shape)
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, brace_code, selector_value, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='eu'),
            'conditional_alternative', 'EUY', NULL, 'national-handbook');
  RAISE WARNING 'TEST N3 conditional-null-selector: FAIL (accepted null selector_value)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N3 conditional-null-selector: PASS (rejected: %)', SQLERRM;
END $$;

-- N8 — variant with selector_field but null selector_version => expect reject (selector_shape)
DO $$
BEGIN
  INSERT INTO loi_variant (clause_id, variant_key, selector_field)
    VALUES ((SELECT id FROM loi_clause WHERE clause_key='exclusive_use'), 'eu_bad', 'building_type');
  RAISE WARNING 'TEST N8 selector-needs-version: FAIL (accepted selector_field without version)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'TEST N8 selector-needs-version: PASS (rejected: %)', SQLERRM;
END $$;

ROLLBACK;
