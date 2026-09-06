-- DEV-ONLY — v12: position-level deferral (the rent split). loi-tool-dev ONLY.

\set ON_ERROR_STOP on
\timing off

-- P1 — R0 is declared deferred at POSITION level while R1 is not declared at all.
DO $$
DECLARE n_r0 INT; n_r1 INT;
BEGIN
  SELECT count(*) INTO n_r0 FROM loi_deferred_item WHERE clause_key='rent' AND brace_code='R0';
  SELECT count(*) INTO n_r1 FROM loi_deferred_item WHERE clause_key='rent' AND brace_code='R1';
  IF n_r0 = 1 AND n_r1 = 0 THEN
    RAISE NOTICE 'TEST P1 r0-deferred-r1-not: PASS (the split is expressible)';
  ELSE RAISE WARNING 'TEST P1 r0-deferred-r1-not: FAIL (R0=%, R1=%)', n_r0, n_r1; END IF;
END $$;

-- P2 — one query answers "may I proceed?" at BOTH granularities. A caller that must remember to
--      check two places will eventually check one.
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM loi_deferred_item;
  IF n = 3 AND EXISTS (SELECT 1 FROM loi_deferred_item WHERE scope='clause' AND clause_key='landlord_work')
           AND EXISTS (SELECT 1 FROM loi_deferred_item WHERE scope='clause' AND clause_key='rent')
           AND EXISTS (SELECT 1 FROM loi_deferred_item WHERE scope='position' AND brace_code='R0') THEN
    RAISE NOTICE 'TEST P2 unified-deferred-view: PASS (2 clause + 1 position)';
  ELSE RAISE WARNING 'TEST P2 unified-deferred-view: FAIL (% rows)', n; END IF;
END $$;

-- ===========================================================================
-- Negatives (ROLLED BACK)
-- ===========================================================================
BEGIN;

-- N1 — registering a LOADED position as deferred => reject. A stale registry would halt a deal on
--      something that actually works: the mirror image of the stale-allowlist failure rule 4 catches.
DO $$
BEGIN
  INSERT INTO loi_deferred_position (clause_key, brace_code, reason)
    VALUES ('continuous_operation', 'CO0', 'bogus - CO0 is loaded');
  RAISE WARNING 'TEST N1 loaded-cannot-be-deferred: FAIL (accepted a loaded position)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N1 loaded-cannot-be-deferred: PASS (rejected: %)', SQLERRM; END $$;

-- N2 — duplicate registration => reject
DO $$
BEGIN
  INSERT INTO loi_deferred_position (clause_key, brace_code, reason)
    VALUES ('rent', 'R0', 'duplicate');
  RAISE WARNING 'TEST N2 duplicate-deferral: FAIL (accepted)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N2 duplicate-deferral: PASS (rejected: %)', SQLERRM; END $$;

-- N3 — a reason is mandatory: a gap with no stated cause is indistinguishable from an oversight
DO $$
BEGIN
  INSERT INTO loi_deferred_position (clause_key, brace_code) VALUES ('rent', 'R9');
  RAISE WARNING 'TEST N3 reason-required: FAIL (accepted a reasonless deferral)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N3 reason-required: PASS (rejected: %)', SQLERRM; END $$;

-- P3 — THE POINT OF THE SPLIT: once `rent` goes active (R1 loaded), R0 must STILL be declared.
--      This is the state the later tranche will create, simulated here.
UPDATE loi_clause SET is_active = true, inactive_reason = NULL, unavailable_kind = NULL
 WHERE clause_key = 'rent';
DO $$
DECLARE n_clause INT; n_pos INT;
BEGIN
  SELECT count(*) INTO n_clause FROM loi_deferred_item WHERE scope='clause' AND clause_key='rent';
  SELECT count(*) INTO n_pos    FROM loi_deferred_item WHERE scope='position' AND clause_key='rent' AND brace_code='R0';
  IF n_clause = 0 AND n_pos = 1 THEN
    RAISE NOTICE 'TEST P3 r0-survives-clause-activation: PASS (R0 still declared after rent goes active)';
  ELSE RAISE WARNING 'TEST P3 r0-survives-clause-activation: FAIL (clause=%, position=%)', n_clause, n_pos; END IF;
END $$;

ROLLBACK;
