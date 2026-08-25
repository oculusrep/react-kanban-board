-- Starbucks LOI Tool — Body Parameters + seed-managed selector domains (Pass One)
-- Created: August 25, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260825190000_loi_tool_selector_domain_versioning.sql
--
-- From the "FALLBACK / IF / CHOOSE / OPTION" sweep of the national drop:
--
-- 4(a) INLINE FALLBACK PARAMETERS. Some bodies carry a negotiable parameter with a preferred
--      and a fallback value INSIDE one body (e.g. Rent Commencement "one hundred twenty (120)
--      days [Fallback: ninety (90)]"). Not a position, no brace code, no ladder. Modeled as
--      loi_body_parameter keyed to the canonical body, with a {{param:key}} token in body_text.
--      Audit compares the chosen value to preferred_value => "120, unchanged" vs "conceded 120->90".
--
-- Selector domains are now SEED-MANAGED DATA (versioned, confirmed during extraction), so the
-- premature hardcoded building_type domain is removed — building_type's very axis is unresolved
-- (may be net-vs-triple-net lease structure, not building shape; a Director question).
--
-- No LOI data loaded yet, so removing the placeholder domain is safe.

-- ============================================================================
-- 1. Remove the premature hardcoded building_type domain (now seed-managed)
-- ============================================================================
DELETE FROM loi_selector_domain WHERE selector_field = 'building_type';
DELETE FROM loi_selector        WHERE selector_field = 'building_type';

-- ============================================================================
-- 2. LOI_BODY_PARAMETER — a negotiable inline fill (preferred + fallback) within one body
-- ============================================================================
CREATE TABLE IF NOT EXISTS loi_body_parameter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_body_id UUID NOT NULL REFERENCES loi_canonical_body(id) ON DELETE CASCADE,

  param_key TEXT NOT NULL,          -- token in body_text: {{param:param_key}}
  preferred_value TEXT NOT NULL,    -- the position-1 value (e.g. 'one hundred twenty (120)')
  fallback_value TEXT,              -- nullable; presence => a negotiable concession exists (e.g. 'ninety (90)')
  value_unit TEXT,                  -- e.g. 'days'

  -- The fallback may itself be unconfirmed pending the Director.
  code_status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (code_status IN ('confirmed','provisional')),
  note TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE (canonical_body_id, param_key)
);

CREATE INDEX IF NOT EXISTS idx_loi_body_parameter_body ON loi_body_parameter(canonical_body_id);
-- "Which parameters have a negotiable fallback?" — the concession worklist.
CREATE INDEX IF NOT EXISTS idx_loi_body_parameter_fallback ON loi_body_parameter(canonical_body_id)
  WHERE fallback_value IS NOT NULL;

ALTER TABLE loi_body_parameter ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loi_body_parameter_internal_all" ON loi_body_parameter;
CREATE POLICY "loi_body_parameter_internal_all" ON loi_body_parameter FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_body_parameter TO authenticated;

DROP TRIGGER IF EXISTS update_loi_body_parameter_updated_at ON loi_body_parameter;
CREATE TRIGGER update_loi_body_parameter_updated_at BEFORE UPDATE ON loi_body_parameter
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
