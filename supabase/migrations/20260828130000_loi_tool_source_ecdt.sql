-- Starbucks LOI Tool — add source 'national-template-ecdt' (Pass One)
-- Created: August 28, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260825170000_loi_tool_clause_library.sql
--
-- Tranche 3 attribution: Bucket 1 (custom-owned / Oculus-authored) is EMPTY — all seven "custom"
-- clauses are Starbucks language. Three of them (Audit Right, Title Contingency, Recorded Documents)
-- exist only in the July 2025 ECDT template, a DISTINCT Starbucks document from the national drop.
-- It gets its own source value so (brace_code, source, version) provenance stays honest and the
-- collision guard keeps its meaning across the template transition.

ALTER TABLE loi_canonical_body DROP CONSTRAINT IF EXISTS loi_canonical_body_source_check;
ALTER TABLE loi_canonical_body ADD CONSTRAINT loi_canonical_body_source_check
  CHECK (source IN ('national-template-drop','national-handbook','southeast-doc','oculus-authored','national-template-ecdt'));

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
