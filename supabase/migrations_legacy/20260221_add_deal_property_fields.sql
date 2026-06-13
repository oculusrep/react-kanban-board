-- Migration: Add property-related fields to deal table
-- These fields are inherited from the property when a deal is created,
-- but can be edited independently to track negotiated values.
-- This enables tracking changes from "marketed at X" to "negotiated to Y"

-- Add LOI written date (required for deals)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS loi_written_date date;

-- Add space/size fields (inherited from property, editable on deal)
-- These apply to building types (Shopping Center, Office, Industrial, etc.)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_available_sqft numeric;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_building_sqft numeric;

-- Land-specific size field
ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_acres numeric;

-- Pricing fields for building types (Shopping Center, Office, etc.)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_asking_lease_price numeric;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_rent_psf numeric;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_nnn_psf numeric;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_all_in_rent numeric;

-- Land-specific pricing fields
ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_asking_purchase_price numeric;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_asking_ground_lease_price numeric;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_nnn numeric;  -- For land, NNN is a flat amount, not PSF

-- Add comments to document field usage
COMMENT ON COLUMN deal.loi_written_date IS 'Date the LOI was written/sent - required for deals';
COMMENT ON COLUMN deal.deal_available_sqft IS 'Negotiated available square footage (inherited from property.available_sqft)';
COMMENT ON COLUMN deal.deal_building_sqft IS 'Building square footage at time of deal (inherited from property.building_sqft)';
COMMENT ON COLUMN deal.deal_acres IS 'Land acreage for land deals (inherited from property.acres)';
COMMENT ON COLUMN deal.deal_asking_lease_price IS 'Negotiated asking lease price (inherited from property.asking_lease_price)';
COMMENT ON COLUMN deal.deal_rent_psf IS 'Negotiated rent per square foot (inherited from property.rent_psf)';
COMMENT ON COLUMN deal.deal_nnn_psf IS 'Negotiated NNN per square foot (inherited from property.nnn_psf)';
COMMENT ON COLUMN deal.deal_all_in_rent IS 'Negotiated all-in rent (inherited from property.all_in_rent)';
COMMENT ON COLUMN deal.deal_asking_purchase_price IS 'Negotiated asking purchase price for land (inherited from property.asking_purchase_price)';
COMMENT ON COLUMN deal.deal_asking_ground_lease_price IS 'Negotiated asking ground lease price for land (inherited from property.asking_lease_price for land types)';
COMMENT ON COLUMN deal.deal_nnn IS 'NNN amount for land deals - flat amount not PSF (inherited from property.nnn)';
