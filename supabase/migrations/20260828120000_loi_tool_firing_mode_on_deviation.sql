-- Starbucks LOI Tool — firing_mode 'on-deviation' (Pass One)
-- Created: August 28, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260825170000_loi_tool_clause_library.sql
--
-- Tranche 2 (Hazardous Materials): a standing default whose approval fires when the language is
-- DEVIATED FROM, not when a fallback is selected (there is no fallback). The existing firing_mode
-- values ('per-deal' = fires on selecting this position; 'standing-acknowledged' = a once-decided
-- owned deviation like ETR omission) can't express it, so the audit couldn't distinguish
-- "approval if you deviate" from "approval if you pick a fallback rung". Add 'on-deviation'.
--
-- Audit rendering: an on-deviation position combines with the word-for-word-vs-modified computation
-- — approval is actually triggered only when that position is emitted MODIFIED.

ALTER TABLE loi_position DROP CONSTRAINT IF EXISTS loi_position_firing_mode_check;
ALTER TABLE loi_position ADD CONSTRAINT loi_position_firing_mode_check
  CHECK (firing_mode IN ('per-deal','standing-acknowledged','on-deviation'));

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
