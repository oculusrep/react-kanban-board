-- Starbucks LOI Tool — template_paragraph + completed-LOI sources + tranche-8 supersession
-- Created: September 5, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260901120000_loi_tool_clause_exclusion.sql
-- Run BEFORE loading supabase/seeds/loi/loi_seed_tranche8.json.
--
-- Three changes, all forced by tranche 8 (the closing-frame restructure):
--   1. loi_position.template_paragraph — the missing "these positions share ONE template paragraph"
--      field. Mike's proposal, accepted (see the decisions doc for the grouping rule).
--   2. Two new canonical-body sources: a COMPLETED, EXECUTED LOI is a genuine document-of-origin,
--      distinct from the national drop. SIG1 comes from Powder Springs 8/11/2026 and SIG2 from
--      Douglasville 8/31/2026 — neither is in the template.
--   3. The tranche-8 supersession: drop the tranche-7 closing-frame position and the two bodies it
--      replaces. Deleted, NOT merely unreferenced — tranche 7 left an orphan tenants_in_common body
--      exactly that way and it nearly produced a duplicate.

-- ============================================================================
-- 1. template_paragraph — paragraph identity for multi-fragment paragraphs
-- ============================================================================
-- Template para 218 is ONE paragraph built from THREE positions (an always-on opener, an L0-gated
-- middle sentence, and an always-on non-binding tail). applies_when is position-level, so the gated
-- sentence HAS to be its own position — which leaves the assembler no way to know the three belong to
-- one paragraph. emit_order adjacency is not that signal: it breaks the first time a fourth fragment
-- or a following block is inserted between them.
--
-- GROUPING RULE (assembler contract): positions sharing a non-null (clause_id, template_paragraph)
-- are concatenated, in emit_order, into ONE emitted paragraph. A group of one emits normally. NULL
-- means "not paragraph-anchored" and never groups — not even with other NULLs.
--
-- The value is the paragraph index in the template version pinned by loi_config, and comes straight
-- from the sweep manifest. A template transition renumbers it; completeness_test.py already detects
-- transitions, which is what makes that safe to depend on.
--
-- NOTE the field carries two related jobs: for para 218 it groups fragments; for the signature blocks
-- it is the ANCHOR index of a block whose single body spans several paragraphs (its own body_text
-- carries the breaks). Both reduce to the same rule above, so one field is enough.

ALTER TABLE loi_position ADD COLUMN IF NOT EXISTS template_paragraph INTEGER;

ALTER TABLE loi_position DROP CONSTRAINT IF EXISTS loi_position_template_paragraph_range;
ALTER TABLE loi_position ADD CONSTRAINT loi_position_template_paragraph_range
  CHECK (template_paragraph IS NULL OR template_paragraph >= 0);

CREATE INDEX IF NOT EXISTS idx_loi_position_template_paragraph
  ON loi_position(template_paragraph) WHERE template_paragraph IS NOT NULL;

COMMENT ON COLUMN loi_position.template_paragraph IS
  'Paragraph index in the pinned template. Positions sharing (clause_id, template_paragraph) concatenate in emit_order into ONE emitted paragraph. NULL never groups.';

-- ============================================================================
-- 2. Completed-LOI sources
-- ============================================================================
-- source is the document-of-origin and stays distinct from authority (governance). An executed LOI is
-- a real, citable origin: it is how we know what Oculus actually sent, as opposed to what the national
-- template drafts. Keeping them separate is what lets "SIG1 came from Powder Springs" be a fact rather
-- than a note.
ALTER TABLE loi_canonical_body DROP CONSTRAINT IF EXISTS loi_canonical_body_source_check;
ALTER TABLE loi_canonical_body ADD CONSTRAINT loi_canonical_body_source_check
  CHECK (source IN ('national-template-drop','national-handbook','southeast-doc','oculus-authored',
                    'national-template-ecdt','completed-loi-powder-springs','completed-loi-douglasville'));

-- ============================================================================
-- 3. Tranche-8 supersession (replayable; guarded on the old state)
-- ============================================================================
-- The tranche-7 closing frame is ONE position (letter_shell, emit_order 100) carrying THREE segments:
-- closing_statement, tenant_signature_block, landlord_signature_block. Tranche 8 replaces it with
-- separate positions, so the whole position goes. loi_position_body cascades.
--
-- The landlord body (SHELL_LANDLORD_BLOCK, national-template-drop v1, landlord_signature_block) is
-- UNCHANGED and is re-referenced by tranche 8's new landlord position: it must survive this delete as
-- a temporarily-unreferenced body. Only the two genuinely superseded bodies are removed.
DO $$
DECLARE v_pos UUID; v_deleted INT;
BEGIN
  SELECT p.id INTO v_pos
    FROM loi_position p
    JOIN loi_variant v ON v.id = p.variant_id
    JOIN loi_clause  c ON c.id = v.clause_id
   WHERE c.clause_key = 'letter_shell' AND p.position_kind = 'modifier' AND p.emit_order = 100;

  IF v_pos IS NULL THEN
    RAISE NOTICE 'tranche-8 supersession: tranche-7 closing frame already removed, skipping';
  ELSE
    DELETE FROM loi_position WHERE id = v_pos;
    RAISE NOTICE 'tranche-8 supersession: removed tranche-7 closing-frame position %', v_pos;
  END IF;

  DELETE FROM loi_canonical_body
   WHERE segment_key IN ('closing_statement','tenant_signature_block')
     AND source = 'national-template-drop'
     AND version = 'v1';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'tranche-8 supersession: deleted % superseded canonical body/bodies', v_deleted;

  -- The landlord body must still be here for tranche 8 to re-reference.
  IF NOT EXISTS (SELECT 1 FROM loi_canonical_body
                  WHERE segment_key = 'landlord_signature_block'
                    AND source = 'national-template-drop' AND version = 'v1') THEN
    RAISE EXCEPTION 'tranche-8 supersession: the landlord signature body was removed - it must survive';
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
