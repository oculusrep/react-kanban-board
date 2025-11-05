-- Optimize restaurant layer queries for faster map loading
-- This migration adds indexes and creates a materialized view for performance

-- Add composite indexes for spatial and store_no queries
CREATE INDEX IF NOT EXISTS idx_restaurant_location_coords ON restaurant_location(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurant_location_verified_coords ON restaurant_location(verified_latitude, verified_longitude) WHERE verified_latitude IS NOT NULL AND verified_longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurant_location_store_no ON restaurant_location(store_no);

-- Add index for trend queries
CREATE INDEX IF NOT EXISTS idx_restaurant_trend_store_year ON restaurant_trend(store_no, year DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_trend_store_no ON restaurant_trend(store_no);

-- Create a materialized view for latest trends (most common query)
CREATE MATERIALIZED VIEW IF NOT EXISTS restaurant_latest_trends AS
SELECT DISTINCT ON (store_no)
  trend_id,
  store_no,
  year,
  curr_natl_grade,
  curr_mkt_grade,
  curr_annual_sls_k
FROM restaurant_trend
ORDER BY store_no, year DESC;

-- Create index on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_latest_trends_store_no ON restaurant_latest_trends(store_no);

-- Add a function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_restaurant_latest_trends()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY restaurant_latest_trends;
END;
$$;

-- Add comment
COMMENT ON MATERIALIZED VIEW restaurant_latest_trends IS 'Materialized view containing only the most recent trend data for each restaurant. Refresh periodically or after trend imports.';
