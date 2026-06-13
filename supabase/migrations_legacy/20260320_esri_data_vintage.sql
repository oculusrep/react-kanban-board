-- ESRI Data Vintage Tracking
-- Migration: 20260320_esri_data_vintage.sql
-- Creates a table to track ESRI data vintages and detect when new data is available

-- ============================================================================
-- Data Vintage Tracking Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS esri_data_vintage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_vintage TEXT,                    -- The vintage string from ESRI (e.g., "2025")
  sample_population INTEGER,            -- Sample population value to detect changes
  sample_latitude NUMERIC NOT NULL,     -- Latitude used for the check
  sample_longitude NUMERIC NOT NULL,    -- Longitude used for the check
  raw_response JSONB,                   -- Full API response for debugging
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for finding the most recent check
CREATE INDEX IF NOT EXISTS idx_esri_data_vintage_checked_at ON esri_data_vintage(checked_at DESC);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE esri_data_vintage IS 'Tracks ESRI GeoEnrichment data vintages to detect annual data refreshes';
COMMENT ON COLUMN esri_data_vintage.data_vintage IS 'The data vintage year from ESRI API response';
COMMENT ON COLUMN esri_data_vintage.sample_population IS 'Population value from sample location - used to detect data changes';
COMMENT ON COLUMN esri_data_vintage.notification_sent IS 'Whether admin has been notified about this data change';
