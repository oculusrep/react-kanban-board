-- DEV-ONLY — v9: clause/position exclusion + library de-activation. loi-tool-dev ONLY.
-- After bootstrap + all LOI migrations + the full library load. Two parts:
--   A) read-only assertions against the REAL loaded library (no transaction needed)
--   B) constraint negatives on throwaway fixtures, ROLLED BACK.

\set ON_ERROR_STOP on
\timing off

-- ===========================================================================
-- PART A — the two shipped exclusions, against the real library
-- ===========================================================================

-- P1 — Transfer + Sale both selected => one 'drop-b' violation naming the SALE position.
DO $$
DECLARE r RECORD; n INT;
BEGIN
  SELECT count(*) INTO n FROM loi_exclusion_violations(ARRAY(
    SELECT p.id FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
     WHERE c.clause_key IN ('transfer_of_property','sale_of_property')));
  SELECT * INTO r FROM loi_exclusion_violations(ARRAY(
    SELECT p.id FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
     WHERE c.clause_key IN ('transfer_of_property','sale_of_property'))) LIMIT 1;
  IF n = 1 AND r.resolution = 'drop-b' AND r.drop_position_id = r.b_position_id
     AND r.b_label LIKE 'sale_of_property:%' AND r.a_label LIKE 'transfer_of_property:%' THEN
    RAISE NOTICE 'TEST P1 transfer-supersedes-sale: PASS (drop-b -> %)', r.b_label;
  ELSE
    RAISE WARNING 'TEST P1 transfer-supersedes-sale: FAIL (n=%, resolution=%, a=%, b=%)', n, r.resolution, r.a_label, r.b_label;
  END IF;
END $$;

-- P2 — both pylon panels selected => a 'halt' violation with NO drop target (a deal fact decides).
DO $$
DECLARE r RECORD; n INT; ids UUID[];
BEGIN
  SELECT array_agg(p.id) INTO ids
    FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
    JOIN loi_position_body pb ON pb.position_id=p.id JOIN loi_canonical_body cb ON cb.id=pb.canonical_body_id
   WHERE c.clause_key='signage' AND cb.segment_key IN ('panel_existing_pylon','panel_new_pylon');
  SELECT count(*) INTO n FROM loi_exclusion_violations(ids);
  SELECT * INTO r FROM loi_exclusion_violations(ids) LIMIT 1;
  IF n = 1 AND r.resolution = 'halt' AND r.drop_position_id IS NULL THEN
    RAISE NOTICE 'TEST P2 pylon-pair-halts: PASS (% vs %)', r.a_label, r.b_label;
  ELSE
    RAISE WARNING 'TEST P2 pylon-pair-halts: FAIL (n=%, resolution=%, drop=%)', n, r.resolution, r.drop_position_id;
  END IF;
END $$;

-- P3 — a legal selection (Transfer alone + ONE pylon panel) => zero violations.
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM loi_exclusion_violations(ARRAY[
    (SELECT p.id FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
      WHERE c.clause_key='transfer_of_property' LIMIT 1),
    (SELECT p.id FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
      JOIN loi_position_body pb ON pb.position_id=p.id JOIN loi_canonical_body cb ON cb.id=pb.canonical_body_id
      WHERE c.clause_key='signage' AND cb.segment_key='panel_new_pylon' LIMIT 1)]);
  IF n = 0 THEN RAISE NOTICE 'TEST P3 legal-selection-clean: PASS';
  ELSE RAISE WARNING 'TEST P3 legal-selection-clean: FAIL (% violations)', n; END IF;
END $$;

-- P4 — sale_of_property is retired: gone from loi_selectable_position, bodies RETAINED.
DO $$
DECLARE n_sel INT; n_body INT;
BEGIN
  SELECT count(*) INTO n_sel FROM loi_selectable_position WHERE clause_key='sale_of_property';
  SELECT count(*) INTO n_body
    FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
    JOIN loi_position_body pb ON pb.position_id=p.id
   WHERE c.clause_key='sale_of_property';
  IF n_sel = 0 AND n_body > 0 THEN
    RAISE NOTICE 'TEST P4 sale-retired-body-retained: PASS (0 selectable, % bodies kept)', n_body;
  ELSE
    RAISE WARNING 'TEST P4 sale-retired-body-retained: FAIL (selectable=%, bodies=%)', n_sel, n_body;
  END IF;
END $$;

-- P5 — ROFR/ROFO: deliberately NOT modeled as an exclusion. Exactly two exclusions exist.
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM loi_clause_exclusion;
  IF n = 2 THEN RAISE NOTICE 'TEST P5 exactly-two-exclusions: PASS (ROFR/ROFO correctly absent)';
  ELSE RAISE WARNING 'TEST P5 exactly-two-exclusions: FAIL (% rows)', n; END IF;
END $$;

-- ===========================================================================
-- PART B — constraint negatives on throwaway fixtures (ROLLED BACK)
-- ===========================================================================
BEGIN;
INSERT INTO loi_clause (clause_key, title, bucket) VALUES
  ('x_excl_a', 'X Excl A', 'coded-position'),
  ('x_excl_b', 'X Excl B', 'coded-position');
INSERT INTO loi_variant (clause_id, variant_key) VALUES
  ((SELECT id FROM loi_clause WHERE clause_key='x_excl_a'), 'x_excl_a_v'),
  ((SELECT id FROM loi_clause WHERE clause_key='x_excl_b'), 'x_excl_b_v');
INSERT INTO loi_position (id, variant_id, position_kind, brace_code, rank, authority) VALUES
  ('99999999-9999-9999-9999-999999999901', (SELECT id FROM loi_variant WHERE variant_key='x_excl_a_v'), 'alternative', 'XA0', 0, 'national-handbook'),
  ('99999999-9999-9999-9999-999999999902', (SELECT id FROM loi_variant WHERE variant_key='x_excl_b_v'), 'alternative', 'XB0', 0, 'national-handbook');

-- N1 — mixed-kind pair (clause on one side, position on the other) => reject
DO $$
BEGIN
  INSERT INTO loi_clause_exclusion (exclusion_key, member_kind, exclusion_kind, a_clause_id, b_position_id, reason)
    VALUES ('x_mixed', 'clause', 'supersedes',
            (SELECT id FROM loi_clause WHERE clause_key='x_excl_a'),
            '99999999-9999-9999-9999-999999999902', 'mixed');
  RAISE WARNING 'TEST N1 mixed-member-kind: FAIL (accepted a clause/position pair)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N1 mixed-member-kind: PASS (rejected: %)', SQLERRM; END $$;

-- N2 — one-sided pair (b missing) => reject
DO $$
BEGIN
  INSERT INTO loi_clause_exclusion (exclusion_key, member_kind, exclusion_kind, a_clause_id, reason)
    VALUES ('x_onesided', 'clause', 'supersedes', (SELECT id FROM loi_clause WHERE clause_key='x_excl_a'), 'one-sided');
  RAISE WARNING 'TEST N2 one-sided-pair: FAIL (accepted a pair with no B)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N2 one-sided-pair: PASS (rejected: %)', SQLERRM; END $$;

-- N3 — self-exclusion => reject
DO $$
BEGIN
  INSERT INTO loi_clause_exclusion (exclusion_key, member_kind, exclusion_kind, a_clause_id, b_clause_id, reason)
    VALUES ('x_self', 'clause', 'supersedes',
            (SELECT id FROM loi_clause WHERE clause_key='x_excl_a'),
            (SELECT id FROM loi_clause WHERE clause_key='x_excl_a'), 'self');
  RAISE WARNING 'TEST N3 self-exclusion: FAIL (a clause excluded itself)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N3 self-exclusion: PASS (rejected: %)', SQLERRM; END $$;

-- P6 — a well-formed pair => SUCCEED (baseline for N4)
INSERT INTO loi_clause_exclusion (exclusion_key, member_kind, exclusion_kind, a_clause_id, b_clause_id, reason)
  VALUES ('x_ab', 'clause', 'supersedes',
          (SELECT id FROM loi_clause WHERE clause_key='x_excl_a'),
          (SELECT id FROM loi_clause WHERE clause_key='x_excl_b'), 'A supersedes B');
DO $$ BEGIN RAISE NOTICE 'TEST P6 well-formed-pair: PASS'; END $$;

-- N4 — the REVERSED duplicate (B,A) => reject (it could disagree about the winner)
DO $$
BEGIN
  INSERT INTO loi_clause_exclusion (exclusion_key, member_kind, exclusion_kind, a_clause_id, b_clause_id, reason)
    VALUES ('x_ba', 'clause', 'supersedes',
            (SELECT id FROM loi_clause WHERE clause_key='x_excl_b'),
            (SELECT id FROM loi_clause WHERE clause_key='x_excl_a'), 'B supersedes A');
  RAISE WARNING 'TEST N4 reversed-duplicate: FAIL (both directions coexist)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N4 reversed-duplicate: PASS (rejected: %)', SQLERRM; END $$;

-- N5 — de-activating a clause with no reason => reject
DO $$
BEGIN
  UPDATE loi_clause SET is_active = false WHERE clause_key='x_excl_a';
  RAISE WARNING 'TEST N5 clause-inactive-no-reason: FAIL (retired with no audit reason)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N5 clause-inactive-no-reason: PASS (rejected: %)', SQLERRM; END $$;

-- N6 — de-activating a position with no reason => reject
DO $$
BEGIN
  UPDATE loi_position SET is_active = false WHERE id='99999999-9999-9999-9999-999999999901';
  RAISE WARNING 'TEST N6 position-inactive-no-reason: FAIL (retired with no audit reason)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N6 position-inactive-no-reason: PASS (rejected: %)', SQLERRM; END $$;

-- P7 — an inactive CLAUSE hides its still-active positions from loi_selectable_position
-- retired/deferred split (migration 20260906120000) requires a kind on every de-activation.
UPDATE loi_clause SET is_active = false, inactive_reason = 'test', unavailable_kind = 'retired' WHERE clause_key='x_excl_a';
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM loi_selectable_position WHERE clause_key='x_excl_a';
  IF n = 0 THEN RAISE NOTICE 'TEST P7 inactive-clause-hides-positions: PASS';
  ELSE RAISE WARNING 'TEST P7 inactive-clause-hides-positions: FAIL (% still selectable)', n; END IF;
END $$;

ROLLBACK;
