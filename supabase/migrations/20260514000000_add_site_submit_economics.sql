-- Migration: Snapshot property economics onto site_submit
--
-- Until now, the "Deal Details" panel on the site submit sidebar read/wrote
-- property.* and property_unit.* directly, so a single property's marketing
-- data was shared across every site submit on it. Editing rent or sqft from
-- one site submit propagated to every other submit on the same property.
--
-- Going forward, each site submit owns its own snapshot of these values.
-- They are populated from the property (and property_unit, when applicable)
-- at site submit creation, and diverge independently from that point on.
-- LOI deal creation will source from site_submit instead of property.

-- Building / land sizing
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS available_sqft numeric;
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS building_sqft numeric;
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS acres numeric;

-- Pricing (building types)
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS asking_lease_price numeric;
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS rent_psf numeric;
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS nnn_psf numeric;
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS all_in_rent numeric;

-- Pricing (land types)
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS asking_purchase_price numeric;
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS asking_ground_lease_price numeric;
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS nnn numeric;

COMMENT ON COLUMN site_submit.available_sqft IS 'Snapshot of property.available_sqft (or property_unit.sqft) at submit creation; diverges independently thereafter';
COMMENT ON COLUMN site_submit.building_sqft IS 'Snapshot of property.building_sqft at submit creation';
COMMENT ON COLUMN site_submit.acres IS 'Snapshot of property.acres at submit creation';
COMMENT ON COLUMN site_submit.asking_lease_price IS 'Snapshot of property.asking_lease_price at submit creation';
COMMENT ON COLUMN site_submit.rent_psf IS 'Snapshot of property.rent_psf (or property_unit.rent) at submit creation';
COMMENT ON COLUMN site_submit.nnn_psf IS 'Snapshot of property.nnn_psf (or property_unit.nnn) at submit creation';
COMMENT ON COLUMN site_submit.all_in_rent IS 'Snapshot of property.all_in_rent at submit creation; usually derived as rent_psf + nnn_psf';
COMMENT ON COLUMN site_submit.asking_purchase_price IS 'Snapshot of property.asking_purchase_price at submit creation (land deals)';
COMMENT ON COLUMN site_submit.asking_ground_lease_price IS 'Snapshot of property.asking_lease_price at submit creation (land ground-lease deals)';
COMMENT ON COLUMN site_submit.nnn IS 'Snapshot of property.nnn at submit creation (land deals, flat amount)';

-- Backfill existing site submits from their property (and unit, when present).
-- Prefer property_unit values for sqft/rent/nnn when a unit is selected and has a value;
-- otherwise fall back to property.*.
-- Note: property has no `nnn` column (only `nnn_psf`), so site_submit.nnn (the
-- land flat NNN amount, parallel to deal.deal_nnn) is left NULL during backfill.
--
-- The UPDATE target (site_submit) cannot be referenced from the LEFT JOIN's ON
-- clause in Postgres, so the source row (property + optional unit) is computed
-- in a subquery and matched back to site_submit by id.
UPDATE site_submit ss
SET
  available_sqft = src.available_sqft,
  building_sqft = src.building_sqft,
  acres = src.acres,
  asking_lease_price = src.asking_lease_price,
  rent_psf = src.rent_psf,
  nnn_psf = src.nnn_psf,
  all_in_rent = src.all_in_rent,
  asking_purchase_price = src.asking_purchase_price,
  asking_ground_lease_price = src.asking_ground_lease_price
FROM (
  SELECT
    ss2.id,
    COALESCE(pu.sqft, p.available_sqft) AS available_sqft,
    p.building_sqft AS building_sqft,
    p.acres AS acres,
    p.asking_lease_price AS asking_lease_price,
    COALESCE(pu.rent, p.rent_psf) AS rent_psf,
    COALESCE(pu.nnn, p.nnn_psf) AS nnn_psf,
    p.all_in_rent AS all_in_rent,
    p.asking_purchase_price AS asking_purchase_price,
    p.asking_lease_price AS asking_ground_lease_price
  FROM site_submit ss2
  JOIN property p ON p.id = ss2.property_id
  LEFT JOIN property_unit pu ON pu.id = ss2.property_unit_id
) src
WHERE src.id = ss.id
  AND ss.available_sqft IS NULL
  AND ss.building_sqft IS NULL
  AND ss.acres IS NULL
  AND ss.asking_lease_price IS NULL
  AND ss.rent_psf IS NULL
  AND ss.nnn_psf IS NULL
  AND ss.all_in_rent IS NULL
  AND ss.asking_purchase_price IS NULL
  AND ss.asking_ground_lease_price IS NULL;
