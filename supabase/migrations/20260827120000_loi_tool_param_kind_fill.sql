-- Starbucks LOI Tool — param_kind 'fill' (plain per-deal free-fill) (Pass One)
-- Created: August 27, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260825210000_loi_tool_param_kinds_and_brace_relax.sql
--
-- Tranche 1 surfaced a third parameter shape: a plain per-deal FREE-FILL blank (e.g. premises
-- dimensions "___ x ___") that is neither a concession (no preferred/fallback) nor a choose-one
-- (no enumerated list). Add param_kind 'fill': no preferred/fallback, no options.

ALTER TABLE loi_body_parameter DROP CONSTRAINT IF EXISTS loi_body_parameter_param_kind_check;
ALTER TABLE loi_body_parameter ADD CONSTRAINT loi_body_parameter_param_kind_check
  CHECK (param_kind IN ('concession','choose_one','fill'));

ALTER TABLE loi_body_parameter DROP CONSTRAINT IF EXISTS loi_body_parameter_kind_shape;
ALTER TABLE loi_body_parameter ADD CONSTRAINT loi_body_parameter_kind_shape CHECK (
  (param_kind = 'concession' AND preferred_value IS NOT NULL)
  OR (param_kind = 'choose_one' AND preferred_value IS NULL AND fallback_value IS NULL)
  OR (param_kind = 'fill'       AND preferred_value IS NULL AND fallback_value IS NULL)
);

-- Option-count enforcement: fill (like concession) must carry zero options.
CREATE OR REPLACE FUNCTION loi_assert_body_parameter_options(v_param UUID) RETURNS void AS $$
DECLARE
  v_kind TEXT;
  v_count INTEGER;
BEGIN
  SELECT param_kind INTO v_kind FROM loi_body_parameter WHERE id = v_param;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*) INTO v_count FROM loi_body_parameter_option WHERE body_parameter_id = v_param;

  IF v_kind IN ('concession','fill') AND v_count > 0 THEN
    RAISE EXCEPTION '% parameter % must not carry options', v_kind, v_param;
  ELSIF v_kind = 'choose_one' AND v_count < 2 THEN
    RAISE EXCEPTION 'choose_one parameter % must have >= 2 options (has %)', v_param, v_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
