-- DEV-ONLY — v5: uncoded-modifier audit-visibility view. loi-tool-dev ONLY.
-- After bootstrap + all six LOI migrations. Single transaction, ROLLED BACK.

\set ON_ERROR_STOP on
\timing off
BEGIN;

-- A coded-position clause carrying an UNCODED drive-through add-on (descriptive segment_key).
INSERT INTO loi_clause (clause_key, title, bucket)
  VALUES ('premises', 'Premises', 'coded-position');
INSERT INTO loi_variant (clause_id, variant_key)
  VALUES ((SELECT id FROM loi_clause WHERE clause_key='premises'), 'prem');
INSERT INTO loi_canonical_body (brace_code, source, version, segment_key, body_text)
  VALUES (NULL, 'national-template-drop', 'v1', 'drive_through_add_on', 'DUMMY drive-through lane per Exhibit E.');
INSERT INTO loi_position (id, variant_id, position_kind, brace_code, emit_order, modifies_clause_id, authority)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
          (SELECT id FROM loi_variant WHERE variant_key='prem'), 'modifier', NULL, 10,
          (SELECT id FROM loi_clause WHERE clause_key='premises'), 'national-handbook');
INSERT INTO loi_position_body (position_id, canonical_body_id, emit_sequence)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
          (SELECT id FROM loi_canonical_body WHERE segment_key='drive_through_add_on'), 0);

-- A custom-owned clause with an uncoded modifier — must NOT appear in the view.
INSERT INTO loi_clause (clause_key, title, bucket)
  VALUES ('broker', 'Broker Commission', 'custom-owned');
INSERT INTO loi_variant (clause_id, variant_key)
  VALUES ((SELECT id FROM loi_clause WHERE clause_key='broker'), 'brk');
INSERT INTO loi_position (variant_id, position_kind, brace_code, emit_order, modifies_clause_id, authority)
  VALUES ((SELECT id FROM loi_variant WHERE variant_key='brk'), 'modifier', NULL, 10,
          (SELECT id FROM loi_clause WHERE clause_key='broker'), 'self-authored');

-- V1 — view surfaces exactly the uncoded template add-on, identified by clause + segment.
DO $$
DECLARE n INT; r RECORD;
BEGIN
  SELECT count(*) INTO n FROM loi_uncoded_modifier;
  IF n <> 1 THEN
    RAISE WARNING 'TEST V1 uncoded-modifier-view: FAIL (expected 1, got % — custom-owned should be excluded)', n;
  ELSE
    SELECT * INTO r FROM loi_uncoded_modifier;
    IF r.clause_key = 'premises' AND r.segments = 'drive_through_add_on' THEN
      RAISE NOTICE 'TEST V1 uncoded-modifier-view: PASS (audit id = "% / %")', r.clause_key, r.segments;
    ELSE
      RAISE WARNING 'TEST V1 uncoded-modifier-view: FAIL (bad identity: % / %)', r.clause_key, r.segments;
    END IF;
  END IF;
END $$;

ROLLBACK;
