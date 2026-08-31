-- Starbucks LOI Tool — economic-term catalog + unified negotiable item (Phase-2 foundation)
-- Created: August 31, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260825170000_loi_tool_clause_library.sql
--
-- Economic terms are negotiated positions with no home so far. A Phase-2 event must be able to
-- reference an economic term (a rent counter), not just a clause position. Two pieces:
--   loi_economic_term    — catalog of negotiable economic parameters (analog of the clause library),
--                          each with value_type/unit/direction_of_favor/is_derived so a change reads
--                          as a CONCESSION, not just a delta.
--   loi_negotiable_item  — a per-deal item that is EITHER a clause-position instance OR an
--                          economic-term instance, each with an OPENING value (captured at Phase-1
--                          assembly) and a CURRENT value. Phase-2 events (later) FK to this, so the
--                          LRM's provision|status|deviation columns render language + economics
--                          uniformly ("AS1 word-for-word -> modified"; "escalation 10%/5yr -> 8%/5yr").

-- ============================================================================
-- 1. loi_economic_term — catalog
-- ============================================================================
CREATE TABLE IF NOT EXISTS loi_economic_term (
  term_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  value_type TEXT NOT NULL
    CHECK (value_type IN ('money','money_psf','percent','months','years','enum')),
  unit TEXT,
  direction_of_favor TEXT NOT NULL
    CHECK (direction_of_favor IN ('lower_favors_tenant','higher_favors_tenant','neutral')),
  is_derived BOOLEAN NOT NULL DEFAULT false,   -- derived from deal type / computed output, not directly negotiated
  deal_type_scope TEXT[] NOT NULL DEFAULT ARRAY['end-cap-drive-thru'],
  enum_domain TEXT[],                          -- for value_type='enum' (e.g. measurement_basis)
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE loi_economic_term ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loi_economic_term_internal_all" ON loi_economic_term;
CREATE POLICY "loi_economic_term_internal_all" ON loi_economic_term FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_economic_term TO authenticated;

DROP TRIGGER IF EXISTS update_loi_economic_term_updated_at ON loi_economic_term;
CREATE TRIGGER update_loi_economic_term_updated_at BEFORE UPDATE ON loi_economic_term
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Starter set (CONFIRM direction_of_favor with Mike). Schedule/commission/pipeline are DERIVED
-- outputs, never negotiated directly, so they are not terms here.
INSERT INTO loi_economic_term (term_key, label, value_type, unit, direction_of_favor, is_derived, note) VALUES
  ('base_rent',          'Base Rent (year 1)',      'money_psf', '$/SF/yr', 'lower_favors_tenant',  false, 'Year-1 rent; $/SF for end-cap, annual for freestanding.'),
  ('escalation_rate',    'Escalation Rate',         'percent',   '%',       'lower_favors_tenant',  false, 'e.g. 10% per escalation period.'),
  ('escalation_period',  'Escalation Period',       'years',     'years',   'higher_favors_tenant', false, 'Years between escalations, e.g. 5.'),
  ('term_length',        'Term Length',             'years',     'years',   'neutral',              false, 'Total term incl. options.'),
  ('ti_allowance',       'TI Allowance',            'money_psf', '$/SF',    'higher_favors_tenant', false, 'Landlord improvement allowance.'),
  ('measurement_basis',  'Rent Measurement Basis',  'enum',      NULL,      'neutral',              true,  'annual (freestanding) | per_sqft (end-cap); DERIVED from deal type.')
ON CONFLICT (term_key) DO NOTHING;

UPDATE loi_economic_term SET enum_domain = ARRAY['annual','per_sqft']
  WHERE term_key = 'measurement_basis' AND enum_domain IS NULL;

-- ============================================================================
-- 2. loi_negotiable_item — unified per-deal event target (clause position OR economic term)
-- ============================================================================
-- deal_id references the OVIS deal (base schema not present in loi-tool-dev, so no hard FK here).
CREATE TABLE IF NOT EXISTS loi_negotiable_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,                       -- -> OVIS deal.id
  item_kind TEXT NOT NULL CHECK (item_kind IN ('clause_position','economic_term')),

  position_id UUID REFERENCES loi_position(id) ON DELETE RESTRICT,        -- clause_position
  economic_term_key TEXT REFERENCES loi_economic_term(term_key) ON DELETE RESTRICT,  -- economic_term

  -- Captured at Phase-1 assembly for EVERY item (language + economic); "opened at X, closed at Y"
  -- cannot be reconstructed later.
  opening_value TEXT NOT NULL,
  current_value TEXT,
  note TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT loi_negotiable_item_target CHECK (
    (item_kind = 'clause_position' AND position_id IS NOT NULL AND economic_term_key IS NULL)
    OR (item_kind = 'economic_term' AND economic_term_key IS NOT NULL AND position_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_loi_negotiable_item_deal ON loi_negotiable_item(deal_id);
CREATE INDEX IF NOT EXISTS idx_loi_negotiable_item_position ON loi_negotiable_item(position_id);
CREATE INDEX IF NOT EXISTS idx_loi_negotiable_item_term ON loi_negotiable_item(economic_term_key);

ALTER TABLE loi_negotiable_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loi_negotiable_item_internal_all" ON loi_negotiable_item;
CREATE POLICY "loi_negotiable_item_internal_all" ON loi_negotiable_item FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_negotiable_item TO authenticated;

DROP TRIGGER IF EXISTS update_loi_negotiable_item_updated_at ON loi_negotiable_item;
CREATE TRIGGER update_loi_negotiable_item_updated_at BEFORE UPDATE ON loi_negotiable_item
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
