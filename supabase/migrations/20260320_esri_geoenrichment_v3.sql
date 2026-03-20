-- ESRI GeoEnrichment Support - Daytime Population
-- Migration: 20260320_esri_geoenrichment_v3.sql
-- Adds columns for total daytime population (DPOP_CY)
--
-- DPOP_CY = Total daytime population = workers + residents who stay home
-- This is different from DPOPWRK_CY (employees) which only counts workers
-- DPOP is more useful for retail site selection as it captures everyone
-- present during business hours (workers, retirees, stay-at-home parents, etc.)

-- ============================================================================
-- Daytime Population columns (ring buffers)
-- ============================================================================

ALTER TABLE property ADD COLUMN IF NOT EXISTS daytime_pop_1_mile INTEGER;
ALTER TABLE property ADD COLUMN IF NOT EXISTS daytime_pop_3_mile INTEGER;
ALTER TABLE property ADD COLUMN IF NOT EXISTS daytime_pop_5_mile INTEGER;

-- ============================================================================
-- Daytime Population column (10-minute drive time)
-- ============================================================================

ALTER TABLE property ADD COLUMN IF NOT EXISTS daytime_pop_10min_drive INTEGER;

-- ============================================================================
-- Documentation comments
-- ============================================================================

COMMENT ON COLUMN property.daytime_pop_1_mile IS 'Total daytime population within 1 mile radius (ESRI DPOP_CY) - includes workers + residents at home';
COMMENT ON COLUMN property.daytime_pop_3_mile IS 'Total daytime population within 3 mile radius (ESRI DPOP_CY) - includes workers + residents at home';
COMMENT ON COLUMN property.daytime_pop_5_mile IS 'Total daytime population within 5 mile radius (ESRI DPOP_CY) - includes workers + residents at home';
COMMENT ON COLUMN property.daytime_pop_10min_drive IS 'Total daytime population within 10-minute drive time (ESRI DPOP_CY) - includes workers + residents at home';
