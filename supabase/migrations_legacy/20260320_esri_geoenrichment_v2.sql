-- ESRI GeoEnrichment Support - Extended Attributes
-- Migration: 20260320_esri_geoenrichment_v2.sql
-- Adds columns for 10-minute drive time, total employees, and median age

-- ============================================================================
-- 10-Minute Drive Time columns
-- ============================================================================

-- Population within 10-minute drive time
ALTER TABLE property ADD COLUMN IF NOT EXISTS pop_10min_drive INTEGER;

-- Households within 10-minute drive time
ALTER TABLE property ADD COLUMN IF NOT EXISTS households_10min_drive INTEGER;

-- Average household income within 10-minute drive time
ALTER TABLE property ADD COLUMN IF NOT EXISTS hh_income_avg_10min_drive NUMERIC;

-- Median household income within 10-minute drive time
ALTER TABLE property ADD COLUMN IF NOT EXISTS hh_income_median_10min_drive NUMERIC;

-- Total employees within 10-minute drive time
ALTER TABLE property ADD COLUMN IF NOT EXISTS employees_10min_drive INTEGER;

-- Median age within 10-minute drive time
ALTER TABLE property ADD COLUMN IF NOT EXISTS median_age_10min_drive NUMERIC;

-- ============================================================================
-- Total Employees columns (for ring buffers)
-- ============================================================================

ALTER TABLE property ADD COLUMN IF NOT EXISTS employees_1_mile INTEGER;
ALTER TABLE property ADD COLUMN IF NOT EXISTS employees_3_mile INTEGER;
ALTER TABLE property ADD COLUMN IF NOT EXISTS employees_5_mile INTEGER;

-- ============================================================================
-- Median Age columns (for ring buffers)
-- ============================================================================

ALTER TABLE property ADD COLUMN IF NOT EXISTS median_age_1_mile NUMERIC;
ALTER TABLE property ADD COLUMN IF NOT EXISTS median_age_3_mile NUMERIC;
ALTER TABLE property ADD COLUMN IF NOT EXISTS median_age_5_mile NUMERIC;

-- ============================================================================
-- Documentation comments
-- ============================================================================

COMMENT ON COLUMN property.pop_10min_drive IS 'Total population within 10-minute drive time (ESRI)';
COMMENT ON COLUMN property.households_10min_drive IS 'Total households within 10-minute drive time (ESRI)';
COMMENT ON COLUMN property.hh_income_avg_10min_drive IS 'Average household income within 10-minute drive time (ESRI)';
COMMENT ON COLUMN property.hh_income_median_10min_drive IS 'Median household income within 10-minute drive time (ESRI)';
COMMENT ON COLUMN property.employees_10min_drive IS 'Total employees within 10-minute drive time (ESRI)';
COMMENT ON COLUMN property.median_age_10min_drive IS 'Median age within 10-minute drive time (ESRI)';
COMMENT ON COLUMN property.employees_1_mile IS 'Total employees within 1 mile radius (ESRI)';
COMMENT ON COLUMN property.employees_3_mile IS 'Total employees within 3 mile radius (ESRI)';
COMMENT ON COLUMN property.employees_5_mile IS 'Total employees within 5 mile radius (ESRI)';
COMMENT ON COLUMN property.median_age_1_mile IS 'Median age within 1 mile radius (ESRI)';
COMMENT ON COLUMN property.median_age_3_mile IS 'Median age within 3 mile radius (ESRI)';
COMMENT ON COLUMN property.median_age_5_mile IS 'Median age within 5 mile radius (ESRI)';
