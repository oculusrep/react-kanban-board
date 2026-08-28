-- Starbucks LOI Tool — explicit omit option + attachment requirements (Pass One)
-- Created: August 27, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260825210000_loi_tool_param_kinds_and_brace_relax.sql
--
-- Tranche 1 surfaced two patterns:
--
-- 1. [OPTIONAL: <phrase>] inline optional phrase (OS0). Modeled as a choose_one with an "emit
--    nothing" option. An empty-string option_value is indistinguishable from a forgotten value,
--    so make omit EXPLICIT: is_omit boolean; omit options carry no value.
--
-- 2. Stripped [ATTACH ...] instructions (U1 exclusives list, OS0 site plan) are ATTACHMENT
--    obligations, not document text — they surface as wizard tasks tied to position selection.
--    New table loi_attachment_requirement (position-level; more will turn up in later tranches).

-- ============================================================================
-- 1. Explicit omit option
-- ============================================================================
ALTER TABLE loi_body_parameter_option ALTER COLUMN option_value DROP NOT NULL;
ALTER TABLE loi_body_parameter_option ADD COLUMN IF NOT EXISTS is_omit BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE loi_body_parameter_option DROP CONSTRAINT IF EXISTS loi_body_parameter_option_shape;
ALTER TABLE loi_body_parameter_option ADD CONSTRAINT loi_body_parameter_option_shape CHECK (
  -- omit: emits nothing, carries no value and is not a free-fill
  (is_omit = true  AND option_value IS NULL AND is_free_fill = false)
  -- normal / free-fill: must carry a non-empty value
  OR (is_omit = false AND option_value IS NOT NULL AND option_value <> '')
);

-- At most one omit option per parameter.
CREATE UNIQUE INDEX IF NOT EXISTS loi_body_parameter_option_single_omit
  ON loi_body_parameter_option (body_parameter_id) WHERE is_omit;

-- ============================================================================
-- 2. loi_attachment_requirement — obligations raised by selecting a position
-- ============================================================================
CREATE TABLE IF NOT EXISTS loi_attachment_requirement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES loi_position(id) ON DELETE CASCADE,
  requirement TEXT NOT NULL,     -- what must be attached (e.g. "exclusives/prohibited-uses/use-restrictions list")
  exhibit_ref TEXT,              -- optional exhibit label if the template names one
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loi_attachment_requirement_position ON loi_attachment_requirement(position_id);

ALTER TABLE loi_attachment_requirement ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loi_attachment_requirement_internal_all" ON loi_attachment_requirement;
CREATE POLICY "loi_attachment_requirement_internal_all" ON loi_attachment_requirement FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_attachment_requirement TO authenticated;

-- Wizard task list: attachment obligations with clause/position context.
CREATE OR REPLACE VIEW loi_attachment_task AS
SELECT a.id, a.position_id, c.clause_key, v.variant_key, p.brace_code,
       a.requirement, a.exhibit_ref, a.sort_order
FROM loi_attachment_requirement a
JOIN loi_position p ON p.id = a.position_id
JOIN loi_variant  v ON v.id = p.variant_id
JOIN loi_clause   c ON c.id = v.clause_id;
GRANT SELECT ON loi_attachment_task TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
