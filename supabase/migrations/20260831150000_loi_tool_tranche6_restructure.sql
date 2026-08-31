-- Starbucks LOI Tool — tranche-6 structural re-key (Pass One, completeness re-extraction)
-- Created: August 31, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260825210000_loi_tool_param_kinds_and_brace_relax.sql
--
-- Two structural changes to ALREADY-LOADED rows that the tranche-6 seed can't express as appends.
-- Replayable (guarded on the old state); run BEFORE loading tranche 6.
--
-- 1. Trash re-key: the template presents TR0/TR1/TR2 as ADD-ONE-OF add-ons to a base clause (para 148),
--    not as a ranked replacement ladder. Re-key TR0/TR1/TR2 from ranked alternatives to MODIFIERS
--    riding the trash clause. Their applies_when gates (mutually-exclusive trash arrangements) stay, so
--    exactly one applies per deal; emit_order 10/20/30 preserves preference order. Tranche 6 then loads
--    the base as the primary alternative (rank 0) with no rank-0 conflict.
-- 2. Audit Right re-source: it was misattributed to national-template-ecdt; it's in the 2026 national
--    drop (para 212). canonical_body is immutable (source can't be UPDATEd), so delete the old
--    positions + the orphaned ecdt body; tranche 6 reloads it (national-template-drop + the gate).

-- ---- 1. Trash re-key (alternatives -> modifiers) --------------------------------------------------
-- With TR0/1/2 as gated add-ons riding an always-emitting uncoded base, trash_recycling is a
-- standing-default clause (base = standing content; coded modifiers ride it, codes optional), not a
-- coded ladder. Re-bucket so the uncoded base primary is valid (coded-position would force a code on it).
UPDATE loi_clause SET bucket = 'standing-default'
  WHERE clause_key = 'trash_recycling' AND bucket = 'coded-position';

UPDATE loi_position p
SET position_kind = 'modifier',
    rank = NULL,
    emit_order = (CASE p.brace_code WHEN 'TR0' THEN 10 WHEN 'TR1' THEN 20 WHEN 'TR2' THEN 30 END),
    modifies_clause_id = (SELECT id FROM loi_clause WHERE clause_key = 'trash_recycling')
FROM loi_variant v, loi_clause c
WHERE p.variant_id = v.id AND v.clause_id = c.id AND c.clause_key = 'trash_recycling'
  AND p.brace_code IN ('TR0','TR1','TR2') AND p.position_kind = 'alternative';

-- TR modifiers must not be the default primary (that's the base); clear the leftover is_default so the
-- base can hold the single per-variant default.
UPDATE loi_position p SET is_default = false
FROM loi_variant v, loi_clause c
WHERE p.variant_id = v.id AND v.clause_id = c.id AND c.clause_key = 'trash_recycling'
  AND p.brace_code IN ('TR0','TR1','TR2') AND p.is_default = true;

-- ---- 2. Audit Right re-source (delete old ecdt content; tranche 6 reloads it) ---------------------
DO $$
DECLARE v_body UUID;
BEGIN
  SELECT pb.canonical_body_id INTO v_body
  FROM loi_position_body pb
  JOIN loi_position p ON p.id = pb.position_id
  JOIN loi_variant v ON v.id = p.variant_id
  JOIN loi_clause  c ON c.id = v.clause_id
  WHERE c.clause_key = 'audit_right'
  LIMIT 1;

  DELETE FROM loi_position p USING loi_variant v, loi_clause c
   WHERE p.variant_id = v.id AND v.clause_id = c.id AND c.clause_key = 'audit_right';

  IF v_body IS NOT NULL THEN
    DELETE FROM loi_canonical_body WHERE id = v_body;
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
