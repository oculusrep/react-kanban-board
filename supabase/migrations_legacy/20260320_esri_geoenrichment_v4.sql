-- ESRI GeoEnrichment Support - Enriched Coordinates Tracking
-- Migration: 20260320_esri_geoenrichment_v4.sql
-- Adds columns to track the coordinates used when property was last enriched
-- This allows detecting when a property has been re-geocoded and needs re-enrichment

-- ============================================================================
-- Enriched Coordinates columns
-- ============================================================================

-- Latitude used when property was last enriched
ALTER TABLE property ADD COLUMN IF NOT EXISTS esri_enriched_latitude NUMERIC;

-- Longitude used when property was last enriched
ALTER TABLE property ADD COLUMN IF NOT EXISTS esri_enriched_longitude NUMERIC;

-- ============================================================================
-- Documentation comments
-- ============================================================================

COMMENT ON COLUMN property.esri_enriched_latitude IS 'Latitude used when property was last enriched with ESRI GeoEnrichment - used to detect coordinate changes';
COMMENT ON COLUMN property.esri_enriched_longitude IS 'Longitude used when property was last enriched with ESRI GeoEnrichment - used to detect coordinate changes';
