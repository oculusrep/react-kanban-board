-- Enable RLS and add policies for restaurant_location table
-- This allows authenticated users to view and update restaurant locations

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE restaurant_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_trend ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES FOR restaurant_location
-- ============================================================================

-- Allow all authenticated users to read restaurant locations
CREATE POLICY "restaurant_location_select" ON restaurant_location
    FOR SELECT TO authenticated
    USING (true);

-- Allow all authenticated users to update restaurant locations (for pin verification)
CREATE POLICY "restaurant_location_update" ON restaurant_location
    FOR UPDATE TO authenticated
    USING (true);

-- Note: INSERT and DELETE are intentionally NOT allowed for regular users
-- Restaurant data is imported via ETL process using service role

-- ============================================================================
-- RLS POLICIES FOR restaurant_trend
-- ============================================================================

-- Allow all authenticated users to read restaurant trends
CREATE POLICY "restaurant_trend_select" ON restaurant_trend
    FOR SELECT TO authenticated
    USING (true);

-- Note: INSERT, UPDATE, and DELETE are intentionally NOT allowed for regular users
-- Trend data is imported via ETL process using service role

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "restaurant_location_select" ON restaurant_location IS
    'Allow all authenticated users to view restaurant locations';
COMMENT ON POLICY "restaurant_location_update" ON restaurant_location IS
    'Allow all authenticated users to update restaurant locations (for pin verification on map)';
COMMENT ON POLICY "restaurant_trend_select" ON restaurant_trend IS
    'Allow all authenticated users to view restaurant trend data';
