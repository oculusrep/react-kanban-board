-- Starbucks LOI Tool — Param kinds (choose_one) + brace-guard relaxation (Pass One)
-- Created: August 25, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260825200000_loi_tool_body_parameters.sql
--
-- From the "canonical body vs emitted text" pass on the national drop:
--
-- Brace codes are NEVER emitted (the {CODE} marker is a separate run, always stripped).
-- canonical_body.body_text stores CLEAN emitted text; the code lives in brace_code.
-- (Data/extraction rule — no schema change for that part.)
--
-- Four bracket types; two need schema:
--  1. [{EU0}]  code marker        -> stripped, never in body_text.
--  2. [Fallback: 90]  concession  -> loi_body_parameter (already built).
--  3. [Property/Shopping Center]  CHOOSE-ONE fill -> param_kind 'choose_one' + option list,
--     resolved to exactly one value at assembly; NO preferred/fallback (no concession, a deal fact).
--  4. [FOR DRIVE-THROUGH..., ADD:]  instructional GATE -> becomes applies_when at extraction;
--     the gated (often UNCODED) add-on needs a home, so the no-coded-gaps guard is relaxed:
--     brace required only for alternative/conditional_alternative under coded-position.

-- ============================================================================
-- 1. Relax the no-coded-gaps guard
--    Required: alternative/conditional_alternative under coded-position (the AS1 items).
--    Optional: modifier (may be coded like EU1 or uncoded boilerplate) + standing-default.
--    Forbidden: custom-owned.
-- ============================================================================
CREATE OR REPLACE FUNCTION loi_position_brace_code_guard() RETURNS trigger AS $$
DECLARE
  v_bucket TEXT;
BEGIN
  SELECT c.bucket INTO v_bucket
  FROM loi_variant v JOIN loi_clause c ON c.id = v.clause_id
  WHERE v.id = NEW.variant_id;

  IF v_bucket = 'custom-owned' THEN
    IF NEW.brace_code IS NOT NULL THEN
      RAISE EXCEPTION 'custom-owned clause positions must not carry a brace code (variant %)', NEW.variant_id;
    END IF;
  ELSIF v_bucket = 'coded-position'
        AND NEW.position_kind IN ('alternative','conditional_alternative') THEN
    IF NEW.brace_code IS NULL THEN
      RAISE EXCEPTION 'coded ladder/partition position must carry a brace code — no coded gaps (variant %)', NEW.variant_id;
    END IF;
  END IF;
  -- modifiers + standing-default content: brace_code optional (coded or uncoded add-ons).
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. loi_body_parameter — add param_kind; concession vs choose_one
-- ============================================================================
ALTER TABLE loi_body_parameter ADD COLUMN IF NOT EXISTS param_kind TEXT NOT NULL DEFAULT 'concession'
  CHECK (param_kind IN ('concession','choose_one'));

ALTER TABLE loi_body_parameter ALTER COLUMN preferred_value DROP NOT NULL;

-- concession: preferred required (fallback optional). choose_one: no preferred/fallback (options instead).
ALTER TABLE loi_body_parameter DROP CONSTRAINT IF EXISTS loi_body_parameter_kind_shape;
ALTER TABLE loi_body_parameter ADD CONSTRAINT loi_body_parameter_kind_shape CHECK (
  (param_kind = 'concession' AND preferred_value IS NOT NULL)
  OR (param_kind = 'choose_one' AND preferred_value IS NULL AND fallback_value IS NULL)
);

-- ============================================================================
-- 3. loi_body_parameter_option — enumerated options for choose_one params
-- ============================================================================
CREATE TABLE IF NOT EXISTS loi_body_parameter_option (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body_parameter_id UUID NOT NULL REFERENCES loi_body_parameter(id) ON DELETE CASCADE,
  option_value TEXT NOT NULL,          -- e.g. 'Shopping Center'
  is_free_fill BOOLEAN NOT NULL DEFAULT false,  -- the '___' blank option
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (body_parameter_id, option_value)
);
CREATE INDEX IF NOT EXISTS idx_loi_body_parameter_option_param ON loi_body_parameter_option(body_parameter_id);

ALTER TABLE loi_body_parameter_option ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loi_body_parameter_option_internal_all" ON loi_body_parameter_option;
CREATE POLICY "loi_body_parameter_option_internal_all" ON loi_body_parameter_option FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_body_parameter_option TO authenticated;

-- ============================================================================
-- 4. LOAD-TIME option-count enforcement (deferred): choose_one >= 2 options; concession = 0.
-- ============================================================================
CREATE OR REPLACE FUNCTION loi_assert_body_parameter_options(v_param UUID) RETURNS void AS $$
DECLARE
  v_kind TEXT;
  v_count INTEGER;
BEGIN
  SELECT param_kind INTO v_kind FROM loi_body_parameter WHERE id = v_param;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*) INTO v_count FROM loi_body_parameter_option WHERE body_parameter_id = v_param;

  IF v_kind = 'concession' AND v_count > 0 THEN
    RAISE EXCEPTION 'concession parameter % must not carry options', v_param;
  ELSIF v_kind = 'choose_one' AND v_count < 2 THEN
    RAISE EXCEPTION 'choose_one parameter % must have >= 2 options (has %)', v_param, v_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION loi_body_parameter_options_from_option() RETURNS trigger AS $$
BEGIN
  PERFORM loi_assert_body_parameter_options(COALESCE(NEW.body_parameter_id, OLD.body_parameter_id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION loi_body_parameter_options_from_param() RETURNS trigger AS $$
BEGIN
  PERFORM loi_assert_body_parameter_options(COALESCE(NEW.id, OLD.id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loi_body_parameter_option_ck ON loi_body_parameter_option;
CREATE CONSTRAINT TRIGGER loi_body_parameter_option_ck
  AFTER INSERT OR UPDATE OR DELETE ON loi_body_parameter_option
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION loi_body_parameter_options_from_option();

DROP TRIGGER IF EXISTS loi_body_parameter_kind_ck ON loi_body_parameter;
CREATE CONSTRAINT TRIGGER loi_body_parameter_kind_ck
  AFTER INSERT OR UPDATE ON loi_body_parameter
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION loi_body_parameter_options_from_param();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
