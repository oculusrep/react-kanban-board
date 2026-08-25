-- Comp Database — make asking terms HISTORICAL. Move the single availability snapshot off
-- comp_property into a dated child table (comp_availability), mirroring lease_comp/sale_comp.
-- comp_property.is_available stays as the manual "on market" flag that drives the amber pin.

CREATE TABLE IF NOT EXISTS comp_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_property_id UUID NOT NULL REFERENCES comp_property(id) ON DELETE CASCADE,
  as_of_date DATE,
  availability_type TEXT CHECK (availability_type IN ('for_lease','for_purchase','for_lease_or_purchase')),
  asking_type TEXT CHECK (asking_type IN ('land','shopping_center','lease_conversion')),
  asking_purchase_price NUMERIC,
  asking_ground_lease_price NUMERIC,
  asking_rent_psf NUMERIC,
  asking_nnn_psf NUMERIC,
  asking_annual_rent NUMERIC,
  notes TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','costar','crexi','om','ai_agent')),
  source_url TEXT,
  source_reference TEXT,
  source_captured_at TIMESTAMP WITH TIME ZONE,
  confidence TEXT NOT NULL DEFAULT 'unverified' CHECK (confidence IN ('unverified','reported','verified')),
  verified_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_availability_property ON comp_availability(comp_property_id);
CREATE INDEX IF NOT EXISTS idx_comp_availability_as_of ON comp_availability(comp_property_id, as_of_date DESC);

DROP TRIGGER IF EXISTS update_comp_availability_updated_at ON comp_availability;
CREATE TRIGGER update_comp_availability_updated_at BEFORE UPDATE ON comp_availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE comp_availability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comp_availability_internal_all" ON comp_availability;
CREATE POLICY "comp_availability_internal_all" ON comp_availability FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON comp_availability TO authenticated;

-- Migrate the existing single snapshot into a first dated record.
INSERT INTO comp_availability (comp_property_id, as_of_date, availability_type, asking_type,
  asking_purchase_price, asking_ground_lease_price, asking_rent_psf, asking_nnn_psf, asking_annual_rent,
  notes, created_by_id, created_at, updated_at)
SELECT id, created_at::date, availability_type, asking_type,
  asking_purchase_price, asking_ground_lease_price, asking_rent_psf, asking_nnn_psf, asking_annual_rent,
  availability_notes, created_by_id, created_at, updated_at
FROM comp_property
WHERE availability_type IS NOT NULL OR asking_type IS NOT NULL
   OR asking_purchase_price IS NOT NULL OR asking_ground_lease_price IS NOT NULL
   OR asking_rent_psf IS NOT NULL OR asking_nnn_psf IS NOT NULL OR asking_annual_rent IS NOT NULL
   OR availability_notes IS NOT NULL;

-- Retire the snapshot columns (keep is_available as the on-market flag).
ALTER TABLE comp_property DROP COLUMN IF EXISTS availability_type;
ALTER TABLE comp_property DROP COLUMN IF EXISTS asking_type;
ALTER TABLE comp_property DROP COLUMN IF EXISTS asking_purchase_price;
ALTER TABLE comp_property DROP COLUMN IF EXISTS asking_ground_lease_price;
ALTER TABLE comp_property DROP COLUMN IF EXISTS asking_rent_psf;
ALTER TABLE comp_property DROP COLUMN IF EXISTS asking_nnn_psf;
ALTER TABLE comp_property DROP COLUMN IF EXISTS asking_annual_rent;
ALTER TABLE comp_property DROP COLUMN IF EXISTS availability_notes;
