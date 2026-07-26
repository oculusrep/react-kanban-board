-- Comp Database Schema (Phase 1)
-- Created: July 25, 2026
-- Description: Foundation for the OVIS comparable ("comp") database — a best-in-class store of
--   comparable LEASES, comparable SALES, and Operating Memorandums (OMs) tied to physical locations,
--   feeding the Starbucks trade-area analysis ("what is every tenant paying / when do they expire").
--
--   See docs/COMP_DATABASE_DESIGN.md for the full scope and locked decisions.
--
-- Model:
--   comp_property         -- the map pin / location (optional FK to an OVIS property when matched)
--   lease_comp            -- tenant-level rent-roll rows under a comp_property
--   sale_comp             -- transaction rows under a comp_property
--   operating_memorandum  -- broker OM package (PDF stored via Dropbox pattern, not in DB)
--   comp_note             -- lightweight internal notes (mirrors property_note)
--
-- Every comp-bearing table carries PROVENANCE columns (source_type / confidence / verified) so
-- multi-source data (CoStar, Crexi, AI agent) stays trustworthy and de-dupable.
--
-- Additive only (new tables). Internal-only data:
--   RLS = public.is_internal_user() full access (helper from client_portal_rls_v3).
--   updated_at via update_updated_at_column() (from client_portal_schema).
--   Reuses existing lookups: property_type(id), merchant_brand(id).
--
-- Conventions: uuid PKs, snake_case, cap_rate/escalation stored as PERCENT (e.g. 6.25 = 6.25%).

-- ============================================================================
-- 1. COMP_PROPERTY — the location / map pin
-- ============================================================================

CREATE TABLE IF NOT EXISTS comp_property (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to a real OVIS property ONLY when this comp matches one we track. Usually NULL
  -- (external CoStar/Crexi/OM comps are deliberately kept out of the deal pipeline).
  property_id UUID REFERENCES property(id) ON DELETE SET NULL,

  name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  county TEXT,

  -- Coordinate precedence: verified_* wins over raw (matches OVIS coord resolution rule).
  latitude NUMERIC,
  longitude NUMERIC,
  verified_latitude NUMERIC,
  verified_longitude NUMERIC,

  property_type_id UUID REFERENCES property_type(id) ON DELETE SET NULL,
  building_sqft NUMERIC,
  land_acres NUMERIC,
  year_built INTEGER,
  anchor_tenant TEXT,          -- free-text co-tenancy context
  trade_area TEXT,
  parcel_id TEXT,

  -- Provenance
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual','costar','crexi','om','ai_agent')),
  source_url TEXT,
  source_reference TEXT,       -- external listing/record id (dedupe key)
  source_captured_at TIMESTAMP WITH TIME ZONE,
  confidence TEXT NOT NULL DEFAULT 'unverified'
    CHECK (confidence IN ('unverified','reported','verified')),
  verified_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP WITH TIME ZONE,

  -- Audit
  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_property_property_id ON comp_property(property_id);
CREATE INDEX IF NOT EXISTS idx_comp_property_type ON comp_property(property_type_id);
CREATE INDEX IF NOT EXISTS idx_comp_property_coords ON comp_property(verified_latitude, verified_longitude);
CREATE INDEX IF NOT EXISTS idx_comp_property_source_ref ON comp_property(source_type, source_reference);

-- ============================================================================
-- 2. LEASE_COMP — a tenant's lease at a location (rent-roll row)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lease_comp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_property_id UUID NOT NULL REFERENCES comp_property(id) ON DELETE CASCADE,

  tenant_name TEXT,                                            -- free-text fallback
  merchant_brand_id UUID REFERENCES merchant_brand(id) ON DELETE SET NULL,  -- known chain -> rollups
  suite TEXT,
  tenant_sqft NUMERIC,

  lease_type TEXT CHECK (lease_type IN ('nnn','gross','modified_gross','ground')),
  base_rent_psf NUMERIC,
  annual_base_rent NUMERIC,
  nnn_psf NUMERIC,
  all_in_rent_psf NUMERIC,

  lease_commencement_date DATE,
  lease_expiration_date DATE,
  lease_term_months INTEGER,
  escalation_pct NUMERIC,          -- percent, e.g. 3.00 = 3%/yr
  rent_steps JSONB,                -- detailed step schedule when known
  free_rent_months NUMERIC,
  ti_psf NUMERIC,
  option_periods JSONB,            -- renewal options

  reported_tenant_sales NUMERIC,   -- annual, if known
  sales_psf NUMERIC,
  occupancy_status TEXT CHECK (occupancy_status IN ('occupied','vacant','dark')),

  -- Provenance
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual','costar','crexi','om','ai_agent')),
  source_url TEXT,
  source_reference TEXT,
  source_captured_at TIMESTAMP WITH TIME ZONE,
  confidence TEXT NOT NULL DEFAULT 'unverified'
    CHECK (confidence IN ('unverified','reported','verified')),
  verified_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP WITH TIME ZONE,

  -- Audit
  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lease_comp_property ON lease_comp(comp_property_id);
-- Expiration index powers the future "expiring leases near a target" opportunity report.
CREATE INDEX IF NOT EXISTS idx_lease_comp_expiration ON lease_comp(lease_expiration_date);
CREATE INDEX IF NOT EXISTS idx_lease_comp_brand ON lease_comp(merchant_brand_id);

-- ============================================================================
-- 3. SALE_COMP — a transaction at a location
-- ============================================================================

CREATE TABLE IF NOT EXISTS sale_comp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_property_id UUID NOT NULL REFERENCES comp_property(id) ON DELETE CASCADE,

  sale_date DATE,
  sale_price NUMERIC,
  price_psf NUMERIC,
  cap_rate NUMERIC,                -- percent, e.g. 6.25 = 6.25%
  noi NUMERIC,
  grm NUMERIC,
  buyer_name TEXT,
  seller_name TEXT,
  broker TEXT,
  financing TEXT,
  sale_condition TEXT CHECK (sale_condition IN ('arms_length','distressed','portfolio','related_party','other')),
  occupancy_at_sale NUMERIC,       -- percent occupied at sale

  -- Provenance
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual','costar','crexi','om','ai_agent')),
  source_url TEXT,
  source_reference TEXT,
  source_captured_at TIMESTAMP WITH TIME ZONE,
  confidence TEXT NOT NULL DEFAULT 'unverified'
    CHECK (confidence IN ('unverified','reported','verified')),
  verified_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP WITH TIME ZONE,

  -- Audit
  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_comp_property ON sale_comp(comp_property_id);
CREATE INDEX IF NOT EXISTS idx_sale_comp_date ON sale_comp(sale_date);

-- ============================================================================
-- 4. OPERATING_MEMORANDUM — broker OM package
-- ============================================================================

CREATE TABLE IF NOT EXISTS operating_memorandum (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_property_id UUID NOT NULL REFERENCES comp_property(id) ON DELETE CASCADE,
  sale_comp_id UUID REFERENCES sale_comp(id) ON DELETE SET NULL,  -- if it produced a closed sale

  title TEXT,
  broker_name TEXT,
  brokerage TEXT,
  list_date DATE,
  asking_price NUMERIC,
  asking_cap_rate NUMERIC,         -- percent
  guidance TEXT,                   -- free-form marketing notes
  -- OM PDF itself is stored via the Dropbox pattern (dropbox_mapping entity_type='comp_property').

  -- Provenance
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual','costar','crexi','om','ai_agent')),
  source_url TEXT,
  source_reference TEXT,
  source_captured_at TIMESTAMP WITH TIME ZONE,
  confidence TEXT NOT NULL DEFAULT 'unverified'
    CHECK (confidence IN ('unverified','reported','verified')),
  verified_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP WITH TIME ZONE,

  -- Audit
  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operating_memorandum_property ON operating_memorandum(comp_property_id);
CREATE INDEX IF NOT EXISTS idx_operating_memorandum_sale ON operating_memorandum(sale_comp_id);

-- ============================================================================
-- 5. COMP_NOTE — lightweight internal notes (mirrors property_note)
-- ============================================================================

CREATE TABLE IF NOT EXISTS comp_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_property_id UUID NOT NULL REFERENCES comp_property(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_note_property ON comp_note(comp_property_id);

-- ============================================================================
-- 6. updated_at TRIGGERS (reuse existing update_updated_at_column())
-- ============================================================================

DROP TRIGGER IF EXISTS update_comp_property_updated_at ON comp_property;
CREATE TRIGGER update_comp_property_updated_at
  BEFORE UPDATE ON comp_property
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lease_comp_updated_at ON lease_comp;
CREATE TRIGGER update_lease_comp_updated_at
  BEFORE UPDATE ON lease_comp
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sale_comp_updated_at ON sale_comp;
CREATE TRIGGER update_sale_comp_updated_at
  BEFORE UPDATE ON sale_comp
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_operating_memorandum_updated_at ON operating_memorandum;
CREATE TRIGGER update_operating_memorandum_updated_at
  BEFORE UPDATE ON operating_memorandum
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_comp_note_updated_at ON comp_note;
CREATE TRIGGER update_comp_note_updated_at
  BEFORE UPDATE ON comp_note
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. RLS — internal users full access (comps are internal-only data)
-- ============================================================================

ALTER TABLE comp_property ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_comp ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_comp ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_memorandum ENABLE ROW LEVEL SECURITY;
ALTER TABLE comp_note ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comp_property_internal_all" ON comp_property;
CREATE POLICY "comp_property_internal_all" ON comp_property FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "lease_comp_internal_all" ON lease_comp;
CREATE POLICY "lease_comp_internal_all" ON lease_comp FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "sale_comp_internal_all" ON sale_comp;
CREATE POLICY "sale_comp_internal_all" ON sale_comp FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "operating_memorandum_internal_all" ON operating_memorandum;
CREATE POLICY "operating_memorandum_internal_all" ON operating_memorandum FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "comp_note_internal_all" ON comp_note;
CREATE POLICY "comp_note_internal_all" ON comp_note FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

-- ============================================================================
-- 8. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON comp_property TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lease_comp TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sale_comp TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON operating_memorandum TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON comp_note TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
