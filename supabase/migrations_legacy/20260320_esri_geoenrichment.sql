-- ESRI GeoEnrichment Support
-- Migration: 20260320_esri_geoenrichment.sql
-- Adds columns to track ESRI GeoEnrichment demographic and psychographic data on properties

-- ============================================================================
-- Add ESRI enrichment metadata columns to property table
-- ============================================================================

-- Track when property was last enriched from ESRI
ALTER TABLE property ADD COLUMN IF NOT EXISTS esri_enriched_at TIMESTAMPTZ;

-- Store full ESRI API response for reference/debugging and future data access
ALTER TABLE property ADD COLUMN IF NOT EXISTS esri_enrichment_data JSONB;

-- ============================================================================
-- Tapestry Segmentation columns (primary psychographic value)
-- ============================================================================

-- Tapestry segment code (e.g., "1A", "3B", "6F")
ALTER TABLE property ADD COLUMN IF NOT EXISTS tapestry_segment_code TEXT;

-- Tapestry segment name (e.g., "Top Tier", "Laptops and Lattes")
ALTER TABLE property ADD COLUMN IF NOT EXISTS tapestry_segment_name TEXT;

-- Tapestry segment description (full description of the segment)
ALTER TABLE property ADD COLUMN IF NOT EXISTS tapestry_segment_description TEXT;

-- Tapestry LifeMode category (e.g., "Affluent Estates", "Upscale Avenues")
ALTER TABLE property ADD COLUMN IF NOT EXISTS tapestry_lifemodes TEXT;

-- ============================================================================
-- Demographic columns (flat columns for easy querying and display)
-- ============================================================================

-- Population within radius rings
ALTER TABLE property ADD COLUMN IF NOT EXISTS pop_1_mile INTEGER;
ALTER TABLE property ADD COLUMN IF NOT EXISTS pop_3_mile INTEGER;
ALTER TABLE property ADD COLUMN IF NOT EXISTS pop_5_mile INTEGER;

-- Households within radius rings
ALTER TABLE property ADD COLUMN IF NOT EXISTS households_1_mile INTEGER;
ALTER TABLE property ADD COLUMN IF NOT EXISTS households_3_mile INTEGER;
ALTER TABLE property ADD COLUMN IF NOT EXISTS households_5_mile INTEGER;

-- Average household income (complements existing hh_income_median_3_mile)
ALTER TABLE property ADD COLUMN IF NOT EXISTS hh_income_avg_1_mile NUMERIC;
ALTER TABLE property ADD COLUMN IF NOT EXISTS hh_income_avg_3_mile NUMERIC;
ALTER TABLE property ADD COLUMN IF NOT EXISTS hh_income_avg_5_mile NUMERIC;

-- Median household income for additional radii
ALTER TABLE property ADD COLUMN IF NOT EXISTS hh_income_median_1_mile NUMERIC;
ALTER TABLE property ADD COLUMN IF NOT EXISTS hh_income_median_5_mile NUMERIC;

-- ============================================================================
-- Indexes for filtering and reporting
-- ============================================================================

-- Index for Tapestry segment lookups and filtering
CREATE INDEX IF NOT EXISTS idx_property_tapestry_segment_code ON property(tapestry_segment_code);

-- Index for finding properties needing enrichment
CREATE INDEX IF NOT EXISTS idx_property_esri_enriched_at ON property(esri_enriched_at);

-- ============================================================================
-- Documentation comments
-- ============================================================================

COMMENT ON COLUMN property.esri_enriched_at IS 'Timestamp of last successful ESRI GeoEnrichment API call';
COMMENT ON COLUMN property.esri_enrichment_data IS 'Full ESRI GeoEnrichment API response for reference and future data access';
COMMENT ON COLUMN property.tapestry_segment_code IS 'ESRI Tapestry segment code (e.g., 1A, 3B, 6F)';
COMMENT ON COLUMN property.tapestry_segment_name IS 'ESRI Tapestry segment name (e.g., Top Tier, Laptops and Lattes)';
COMMENT ON COLUMN property.tapestry_segment_description IS 'Full description of the ESRI Tapestry psychographic segment';
COMMENT ON COLUMN property.tapestry_lifemodes IS 'ESRI Tapestry LifeMode category (e.g., Affluent Estates)';
COMMENT ON COLUMN property.pop_1_mile IS 'Total population within 1 mile radius (ESRI)';
COMMENT ON COLUMN property.pop_3_mile IS 'Total population within 3 mile radius (ESRI)';
COMMENT ON COLUMN property.pop_5_mile IS 'Total population within 5 mile radius (ESRI)';
COMMENT ON COLUMN property.households_1_mile IS 'Total households within 1 mile radius (ESRI)';
COMMENT ON COLUMN property.households_3_mile IS 'Total households within 3 mile radius (ESRI)';
COMMENT ON COLUMN property.households_5_mile IS 'Total households within 5 mile radius (ESRI)';
COMMENT ON COLUMN property.hh_income_avg_1_mile IS 'Average household income within 1 mile radius (ESRI)';
COMMENT ON COLUMN property.hh_income_avg_3_mile IS 'Average household income within 3 mile radius (ESRI)';
COMMENT ON COLUMN property.hh_income_avg_5_mile IS 'Average household income within 5 mile radius (ESRI)';
COMMENT ON COLUMN property.hh_income_median_1_mile IS 'Median household income within 1 mile radius (ESRI)';
COMMENT ON COLUMN property.hh_income_median_5_mile IS 'Median household income within 5 mile radius (ESRI)';
