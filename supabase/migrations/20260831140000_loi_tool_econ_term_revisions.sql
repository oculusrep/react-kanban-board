-- Starbucks LOI Tool — economic-term catalog revisions + body_parameter negotiable item
-- Created: August 31, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260831130000_loi_tool_economic_terms_negotiable_item.sql
--
-- From Mike's review of direction_of_favor + the concession-param/economic-term ownership conflict.

-- ============================================================================
-- 1. Catalog revisions
-- ============================================================================
-- add 'count' value_type (extension option count)
ALTER TABLE loi_economic_term DROP CONSTRAINT IF EXISTS loi_economic_term_value_type_check;
ALTER TABLE loi_economic_term ADD CONSTRAINT loi_economic_term_value_type_check
  CHECK (value_type IN ('money','money_psf','percent','months','years','enum','count'));

-- term_length: NOT neutral. With ETR permanently omitted, exit optionality is already thin, so a
-- longer BASE term is worse for Starbucks -> a shorter base term favors tenant.
UPDATE loi_economic_term
  SET direction_of_favor = 'lower_favors_tenant',
      note = 'Base term length. With ETR omitted, exit optionality is thin, so a longer base term is worse for Starbucks (shorter favors tenant). Extension optionality is a SEPARATE term (favors tenant).'
  WHERE term_key = 'term_length';

-- escalation_period: state the reason so nobody flips it.
UPDATE loi_economic_term
  SET note = 'Years between escalations. Higher favors tenant: a longer interval means fewer escalations over the term.'
  WHERE term_key = 'escalation_period';

-- Extension options were missing entirely — heavily negotiated and strongly tenant-favorable
-- (Powder Springs: six unconditional five-year options). Count and length are independently negotiated.
INSERT INTO loi_economic_term (term_key, label, value_type, unit, direction_of_favor, is_derived, note) VALUES
  ('extension_option_count',  'Extension Option Count',  'count', 'options', 'higher_favors_tenant', false, 'Number of renewal options (e.g. 6). More options favor tenant.'),
  ('extension_option_length', 'Extension Option Length', 'years', 'years',   'higher_favors_tenant', false, 'Length of each renewal option (e.g. 5 years). Longer options favor tenant.')
ON CONFLICT (term_key) DO NOTHING;

-- measurement_basis stays is_derived = true (derived from deal type, not negotiated). Rule below:
-- is_derived terms never become negotiable items (no concession events).

-- ============================================================================
-- 2. Ownership rule -> loi_negotiable_item gains a 'body_parameter' kind
-- ============================================================================
-- RULE: a negotiated value has exactly ONE home.
--   loi_economic_term      owns structured, COMPUTATION-DRIVING unit values (rent, escalation, TI,
--                          term, options) — never inline body fills.
--   loi_body_parameter     (kind='concession') owns INLINE document concessions that do NOT drive
--                          computation (e.g. Rent Commencement 120->90, cure days).
-- Both surface in the LRM via loi_negotiable_item, each concession appearing once (no double-count).
ALTER TABLE loi_negotiable_item ADD COLUMN IF NOT EXISTS body_parameter_id UUID
  REFERENCES loi_body_parameter(id) ON DELETE RESTRICT;

ALTER TABLE loi_negotiable_item DROP CONSTRAINT IF EXISTS loi_negotiable_item_item_kind_check;
ALTER TABLE loi_negotiable_item ADD CONSTRAINT loi_negotiable_item_item_kind_check
  CHECK (item_kind IN ('clause_position','economic_term','body_parameter'));

ALTER TABLE loi_negotiable_item DROP CONSTRAINT IF EXISTS loi_negotiable_item_target;
ALTER TABLE loi_negotiable_item ADD CONSTRAINT loi_negotiable_item_target CHECK (
  (item_kind = 'clause_position' AND position_id IS NOT NULL AND economic_term_key IS NULL AND body_parameter_id IS NULL)
  OR (item_kind = 'economic_term'  AND economic_term_key IS NOT NULL AND position_id IS NULL AND body_parameter_id IS NULL)
  OR (item_kind = 'body_parameter' AND body_parameter_id IS NOT NULL AND position_id IS NULL AND economic_term_key IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_loi_negotiable_item_bodyparam ON loi_negotiable_item(body_parameter_id);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
