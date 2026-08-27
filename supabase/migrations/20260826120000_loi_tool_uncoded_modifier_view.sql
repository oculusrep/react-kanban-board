-- Starbucks LOI Tool — uncoded-modifier visibility (Pass One)
-- Created: August 26, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260825210000_loi_tool_param_kinds_and_brace_relax.sql
--
-- The brace-guard relaxation lets modifiers be UNCODED (Starbucks template add-ons gated by
-- applies_when, e.g. the drive-through paragraph). Two guards so that set never becomes a dumping
-- ground and always survives the audit:
--   Guard 1 (audit identity): uncoded add-ons are identified in the LRM by CLAUSE + SEGMENT_KEY
--     (no brace code), rendered e.g. "Premises drive-through add-on, word-for-word". Extraction
--     convention: give uncoded add-on bodies a DESCRIPTIVE segment_key (not 'main'). Projection rule
--     lives in OVIS (LRM is a projection); the schema already carries clause (via variant) + segment.
--   Guard 2 (visibility): this view — every uncoded template add-on, countable and reviewable.
--
-- Excludes custom-owned (Bucket 1) — those are intentionally uncoded Oculus language, audited
-- separately as "Oculus standard [clause] language", not part of the uncoded-Starbucks-add-on set.

CREATE OR REPLACE VIEW loi_uncoded_modifier AS
SELECT
  p.id                AS position_id,
  c.clause_key,
  c.bucket,
  v.variant_key,
  p.emit_order,
  -- Audit identity: clause + the add-on's segment(s), since there is no brace code.
  string_agg(cb.segment_key, ', ' ORDER BY pb.emit_sequence) AS segments,
  p.code_status,
  p.rule_status,
  p.internal_note
FROM loi_position p
JOIN loi_variant v ON v.id = p.variant_id
JOIN loi_clause  c ON c.id = v.clause_id
LEFT JOIN loi_position_body  pb ON pb.position_id = p.id
LEFT JOIN loi_canonical_body cb ON cb.id = pb.canonical_body_id
WHERE p.brace_code IS NULL
  AND p.position_kind = 'modifier'
  AND c.bucket <> 'custom-owned'
GROUP BY p.id, c.clause_key, c.bucket, v.variant_key, p.emit_order, p.code_status, p.rule_status, p.internal_note;

GRANT SELECT ON loi_uncoded_modifier TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
