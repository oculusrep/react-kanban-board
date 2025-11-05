-- Restaurant Trends ETL Migration
-- Creates restaurant_location and restaurant_trend tables for ETL data import
-- Supports yearly Excel file imports (YE##*.xlsx format)

-- ============================================================================
-- TABLE: restaurant_location
-- ============================================================================
-- Stores static location information for restaurant stores
-- Primary Key: store_no (from Excel STORE_NO field)
-- One record per unique store location

CREATE TABLE IF NOT EXISTS restaurant_location (
  store_no TEXT PRIMARY KEY,
  chain_no TEXT,
  chain TEXT,
  geoaddress TEXT,
  geocity TEXT,
  geostate TEXT,
  geozip TEXT,
  geozip4 TEXT,
  county TEXT,
  dma_market TEXT,
  dma_no TEXT,
  segment TEXT,
  subsegment TEXT,
  category TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  geoquality TEXT,
  yr_built INTEGER,
  co_fr TEXT,
  co_fr_no TEXT,
  seg_no TEXT,

  -- Verified coordinates (populated via Salesforce migration)
  verified_latitude DOUBLE PRECISION,
  verified_longitude DOUBLE PRECISION,
  verified_source TEXT,
  verified_at TIMESTAMPTZ,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE: restaurant_trend
-- ============================================================================
-- Stores yearly trend data for restaurant stores
-- Primary Key: trend_id (UUID)
-- Foreign Key: store_no → restaurant_location(store_no)
-- Unique constraint on (store_no, year) for idempotent loads

CREATE TABLE IF NOT EXISTS restaurant_trend (
  trend_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_no TEXT NOT NULL REFERENCES restaurant_location(store_no) ON DELETE CASCADE,
  year INTEGER NOT NULL,

  -- Current year metrics
  curr_natl_grade TEXT,
  curr_natl_index DOUBLE PRECISION,
  curr_annual_sls_k DOUBLE PRECISION,
  curr_mkt_grade TEXT,
  label_cng_cmg TEXT,
  label_cng_lt_png TEXT,
  curr_mkt_index DOUBLE PRECISION,
  survey_yr_last_c INTEGER,
  survey_yr_next_c INTEGER,
  ttl_no_surveys_c INTEGER,

  -- Past year metrics
  past_yrs INTEGER,
  past_natl_grade TEXT,
  label_png TEXT,
  past_natl_index DOUBLE PRECISION,
  past_annual_sls_k DOUBLE PRECISION,
  past_mkt_grade TEXT,
  label_png_pmg TEXT,
  past_mkt_index DOUBLE PRECISION,
  survey_yr_last_p INTEGER,
  survey_yr_next_p INTEGER,
  ttl_no_surveys_p INTEGER,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one record per store per year
  UNIQUE (store_no, year)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Performance indexes for restaurant_location
CREATE INDEX IF NOT EXISTS idx_restaurant_location_chain ON restaurant_location(chain);
CREATE INDEX IF NOT EXISTS idx_restaurant_location_geostate ON restaurant_location(geostate);
CREATE INDEX IF NOT EXISTS idx_restaurant_location_geocity ON restaurant_location(geocity);
CREATE INDEX IF NOT EXISTS idx_restaurant_location_segment ON restaurant_location(segment);
CREATE INDEX IF NOT EXISTS idx_restaurant_location_coords ON restaurant_location(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurant_location_verified_coords ON restaurant_location(verified_latitude, verified_longitude) WHERE verified_latitude IS NOT NULL AND verified_longitude IS NOT NULL;

-- Performance indexes for restaurant_trend
CREATE INDEX IF NOT EXISTS idx_restaurant_trend_store_no ON restaurant_trend(store_no);
CREATE INDEX IF NOT EXISTS idx_restaurant_trend_year ON restaurant_trend(year);
CREATE INDEX IF NOT EXISTS idx_restaurant_trend_store_year ON restaurant_trend(store_no, year);
CREATE INDEX IF NOT EXISTS idx_restaurant_trend_curr_natl_grade ON restaurant_trend(curr_natl_grade);
CREATE INDEX IF NOT EXISTS idx_restaurant_trend_curr_mkt_grade ON restaurant_trend(curr_mkt_grade);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp on restaurant_location
CREATE OR REPLACE FUNCTION update_restaurant_location_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_restaurant_location_updated_at
  BEFORE UPDATE ON restaurant_location
  FOR EACH ROW
  EXECUTE FUNCTION update_restaurant_location_updated_at();

-- Trigger to update updated_at timestamp on restaurant_trend
CREATE OR REPLACE FUNCTION update_restaurant_trend_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_restaurant_trend_updated_at
  BEFORE UPDATE ON restaurant_trend
  FOR EACH ROW
  EXECUTE FUNCTION update_restaurant_trend_updated_at();

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE restaurant_location IS 'Static location information for restaurant stores, populated via yearly Excel ETL imports (YE##*.xlsx)';
COMMENT ON TABLE restaurant_trend IS 'Yearly trend data for restaurant stores including grades, indexes, and sales metrics';

COMMENT ON COLUMN restaurant_location.store_no IS 'Primary key - unique store identifier from Excel STORE_NO field';
COMMENT ON COLUMN restaurant_location.chain IS 'Restaurant chain name (e.g., "Another Broken Egg")';
COMMENT ON COLUMN restaurant_location.latitude IS 'Geographic latitude from Excel LATITUDE field';
COMMENT ON COLUMN restaurant_location.longitude IS 'Geographic longitude from Excel LONGITUDE field';
COMMENT ON COLUMN restaurant_location.verified_latitude IS 'Verified latitude imported from Salesforce (more accurate than Excel data)';
COMMENT ON COLUMN restaurant_location.verified_longitude IS 'Verified longitude imported from Salesforce (more accurate than Excel data)';
COMMENT ON COLUMN restaurant_location.verified_source IS 'Source of verified coordinates (e.g., "Salesforce")';
COMMENT ON COLUMN restaurant_location.verified_at IS 'Timestamp when verified coordinates were imported';

COMMENT ON COLUMN restaurant_trend.store_no IS 'Foreign key to restaurant_location(store_no)';
COMMENT ON COLUMN restaurant_trend.year IS 'Year of trend data (extracted from Excel filename YE## pattern)';
COMMENT ON COLUMN restaurant_trend.curr_natl_grade IS 'Current national grade from Excel CNG(CURR_NATL_GRADE) field';
COMMENT ON COLUMN restaurant_trend.curr_natl_index IS 'Current national index from Excel CNI(CURR_NATL_INDEX) field';
COMMENT ON COLUMN restaurant_trend.curr_annual_sls_k IS 'Current annual sales in thousands from Excel CURR_ANNUAL_SLS($000) field';
COMMENT ON COLUMN restaurant_trend.past_natl_grade IS 'Past national grade from Excel PNG(PAST_NATL_GRADE) field';
COMMENT ON COLUMN restaurant_trend.past_natl_index IS 'Past national index from Excel PNI(PAST_NATL_INDEX) field';
