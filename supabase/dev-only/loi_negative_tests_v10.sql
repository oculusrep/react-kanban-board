-- DEV-ONLY — v10: template_paragraph grouping + the tranche-8 closing frame. loi-tool-dev ONLY.
-- After all LOI migrations + tranches 1-8.

\set ON_ERROR_STOP on
\timing off

-- P1 — para 218 is ONE paragraph built from THREE positions, in emit_order, exactly one of them gated.
DO $$
DECLARE n INT; n_gated INT; ord INT[];
BEGIN
  SELECT count(*), array_agg(p.emit_order ORDER BY p.emit_order) INTO n, ord
    FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
   WHERE c.clause_key='letter_shell' AND p.template_paragraph=218;
  SELECT count(*) INTO n_gated
    FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
   WHERE c.clause_key='letter_shell' AND p.template_paragraph=218
     AND EXISTS (SELECT 1 FROM loi_applies_when_condition a WHERE a.position_id=p.id);
  IF n=3 AND ord=ARRAY[100,101,102] AND n_gated=1 THEN
    RAISE NOTICE 'TEST P1 para218-three-fragments: PASS (emit_order %, 1 gated)', ord;
  ELSE RAISE WARNING 'TEST P1 para218-three-fragments: FAIL (n=%, order=%, gated=%)', n, ord, n_gated; END IF;
END $$;

-- P2 — the gated fragment is gated on lease/L0 is_selected (drops when L1 is chosen).
DO $$
DECLARE r RECORD;
BEGIN
  SELECT a.ref_kind, a.ref_clause_key, a.ref_brace_code, a.operator INTO r
    FROM loi_applies_when_condition a
    JOIN loi_position p ON p.id=a.position_id
    JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
   WHERE c.clause_key='letter_shell' AND p.template_paragraph=218;
  IF r.ref_kind='position_selection' AND r.ref_clause_key='lease' AND r.ref_brace_code='L0' AND r.operator='is_selected' THEN
    RAISE NOTICE 'TEST P2 closing-gate-on-L0: PASS';
  ELSE RAISE WARNING 'TEST P2 closing-gate-on-L0: FAIL (%/%/%/%)', r.ref_kind, r.ref_clause_key, r.ref_brace_code, r.operator; END IF;
END $$;

-- P3 — the tranche-7 closing frame is GONE and its two superseded bodies are DELETED, not orphaned.
DO $$
DECLARE n_pos INT; n_body INT;
BEGIN
  SELECT count(*) INTO n_pos
    FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
   WHERE c.clause_key='letter_shell' AND p.emit_order=100 AND p.template_paragraph IS NULL;
  SELECT count(*) INTO n_body FROM loi_canonical_body
   WHERE segment_key IN ('closing_statement','tenant_signature_block') AND source='national-template-drop' AND version='v1';
  IF n_pos=0 AND n_body=0 THEN RAISE NOTICE 'TEST P3 tranche7-frame-superseded: PASS';
  ELSE RAISE WARNING 'TEST P3 tranche7-frame-superseded: FAIL (positions=%, bodies=%)', n_pos, n_body; END IF;
END $$;

-- P4 — the landlord body SURVIVED the supersession and is re-referenced (not duplicated).
DO $$
DECLARE n_body INT; n_ref INT;
BEGIN
  SELECT count(*) INTO n_body FROM loi_canonical_body WHERE segment_key='landlord_signature_block';
  SELECT count(*) INTO n_ref FROM loi_position_body pb JOIN loi_canonical_body cb ON cb.id=pb.canonical_body_id
   WHERE cb.segment_key='landlord_signature_block';
  IF n_body=1 AND n_ref=1 THEN RAISE NOTICE 'TEST P4 landlord-body-reused: PASS (1 body, 1 reference)';
  ELSE RAISE WARNING 'TEST P4 landlord-body-reused: FAIL (bodies=%, refs=%)', n_body, n_ref; END IF;
END $$;

-- P5 — tenant signature block is a THREE-WAY ranked ladder with SIG0 default, one body each,
--      three DISTINCT sources (template / Powder Springs / Douglasville).
DO $$
DECLARE n INT; n_src INT; dflt TEXT;
BEGIN
  SELECT count(*) INTO n FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
   WHERE c.clause_key='tenant_signature_block' AND p.position_kind='alternative';
  SELECT count(DISTINCT cb.source) INTO n_src
    FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
    JOIN loi_position_body pb ON pb.position_id=p.id JOIN loi_canonical_body cb ON cb.id=pb.canonical_body_id
   WHERE c.clause_key='tenant_signature_block';
  SELECT p.brace_code INTO dflt FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
   WHERE c.clause_key='tenant_signature_block' AND p.is_default;
  IF n=3 AND n_src=3 AND dflt='SIG0' THEN RAISE NOTICE 'TEST P5 sig-three-way-ladder: PASS (default SIG0, 3 sources)';
  ELSE RAISE WARNING 'TEST P5 sig-three-way-ladder: FAIL (n=%, sources=%, default=%)', n, n_src, dflt; END IF;
END $$;

-- P6 — POWDER SPRINGS ACCEPTANCE TEST RESOLVES TO SIG1 (Mike, tranche-8 README): the Powder Springs
--      body must be reachable as a ranked alternative, and must be the one sourced from that LOI.
DO $$
DECLARE bc TEXT; rk INT;
BEGIN
  SELECT p.brace_code, p.rank INTO bc, rk
    FROM loi_position p JOIN loi_variant v ON v.id=p.variant_id JOIN loi_clause c ON c.id=v.clause_id
    JOIN loi_position_body pb ON pb.position_id=p.id JOIN loi_canonical_body cb ON cb.id=pb.canonical_body_id
   WHERE c.clause_key='tenant_signature_block' AND cb.source='completed-loi-powder-springs';
  IF bc='SIG1' AND rk=1 THEN RAISE NOTICE 'TEST P6 powder-springs-resolves-SIG1: PASS';
  ELSE RAISE WARNING 'TEST P6 powder-springs-resolves-SIG1: FAIL (code=%, rank=%)', bc, rk; END IF;
END $$;

-- ===========================================================================
-- Negatives (ROLLED BACK)
-- ===========================================================================
BEGIN;
INSERT INTO loi_clause (clause_key, title, bucket) VALUES ('x_tp', 'X TP', 'standing-default');
INSERT INTO loi_variant (clause_id, variant_key) VALUES ((SELECT id FROM loi_clause WHERE clause_key='x_tp'), 'x_tp_v');

-- N1 — negative template_paragraph => reject
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, rank, template_paragraph, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='x_tp_v'), 'alternative', 0, -1, 'national-handbook');
  RAISE WARNING 'TEST N1 negative-template-paragraph: FAIL (accepted -1)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N1 negative-template-paragraph: PASS (rejected: %)', SQLERRM; END $$;

-- N2 — an 'alternative' carrying emit_order => reject (the shape tranche 8 originally used for SIG)
DO $$
BEGIN
  INSERT INTO loi_position (variant_id, position_kind, rank, emit_order, authority)
    VALUES ((SELECT id FROM loi_variant WHERE variant_key='x_tp_v'), 'alternative', 5, 110, 'national-handbook');
  RAISE WARNING 'TEST N2 alternative-with-emit-order: FAIL (accepted)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N2 alternative-with-emit-order: PASS (rejected: %)', SQLERRM; END $$;

ROLLBACK;
