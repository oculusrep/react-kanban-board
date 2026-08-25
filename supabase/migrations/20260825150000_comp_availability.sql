-- Comp Database — mark a comp as available / being marketed, with asking terms.
-- asking_type gates which asking fields are relevant (land / shopping center / lease conversion).

ALTER TABLE comp_property ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE comp_property ADD COLUMN IF NOT EXISTS availability_type TEXT
  CHECK (availability_type IN ('for_lease', 'for_purchase', 'for_lease_or_purchase'));
ALTER TABLE comp_property ADD COLUMN IF NOT EXISTS asking_type TEXT
  CHECK (asking_type IN ('land', 'shopping_center', 'lease_conversion'));
ALTER TABLE comp_property ADD COLUMN IF NOT EXISTS asking_purchase_price NUMERIC;
ALTER TABLE comp_property ADD COLUMN IF NOT EXISTS asking_ground_lease_price NUMERIC;
ALTER TABLE comp_property ADD COLUMN IF NOT EXISTS asking_rent_psf NUMERIC;
ALTER TABLE comp_property ADD COLUMN IF NOT EXISTS asking_nnn_psf NUMERIC;
ALTER TABLE comp_property ADD COLUMN IF NOT EXISTS asking_annual_rent NUMERIC;
ALTER TABLE comp_property ADD COLUMN IF NOT EXISTS availability_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_comp_property_available ON comp_property(is_available) WHERE is_available;
