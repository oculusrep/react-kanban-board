-- Migration: Google Places Closed Business Search
-- Description: Tables for searching, storing, and tracking closed businesses from Google Places API
-- Date: 2026-02-26
--
-- Tables:
-- 1. google_places_saved_query - Stores reusable search configurations
-- 2. google_places_result - Stores fetched place data for persistence and history
-- 3. google_places_api_log - Tracks API usage for budget monitoring
--
-- Also adds:
-- - google_place_id column to property table for duplicate detection
-- - app_settings entry for API budget configuration

-- ============================================================================
-- 1. ADD GOOGLE_PLACE_ID TO PROPERTY TABLE
-- ============================================================================
-- Used for duplicate detection when adding places to properties

ALTER TABLE property
ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_property_google_place_id
ON property(google_place_id)
WHERE google_place_id IS NOT NULL;

COMMENT ON COLUMN property.google_place_id IS 'Google Places API place_id for duplicate detection';

-- ============================================================================
-- 2. CREATE GOOGLE_PLACES_SAVED_QUERY TABLE
-- ============================================================================
-- Stores search configurations for reuse

CREATE TABLE IF NOT EXISTS google_places_saved_query (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  query_type VARCHAR(20) NOT NULL DEFAULT 'text'
    CHECK (query_type IN ('text', 'nearby')),
  search_term VARCHAR(255) NOT NULL,
  status_filter VARCHAR(30) NOT NULL DEFAULT 'both'
    CHECK (status_filter IN ('permanently_closed', 'temporarily_closed', 'both')),
  geography_type VARCHAR(20) NOT NULL
    CHECK (geography_type IN ('state', 'county', 'city', 'zip', 'radius', 'polygon')),
  geography_data JSONB NOT NULL,
  -- For grid-based nearby search, configurable grid cell size
  grid_size_meters INTEGER DEFAULT 50000,
  -- Track last run
  last_run_at TIMESTAMP WITH TIME ZONE,
  result_count INTEGER DEFAULT 0,
  -- Link to the layer created from this query (if saved as layer)
  layer_id UUID REFERENCES map_layer(id) ON DELETE SET NULL,
  -- Timestamps and ownership
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_google_places_saved_query_created_by
ON google_places_saved_query(created_by_id);

CREATE INDEX IF NOT EXISTS idx_google_places_saved_query_layer
ON google_places_saved_query(layer_id)
WHERE layer_id IS NOT NULL;

-- ============================================================================
-- 3. CREATE GOOGLE_PLACES_RESULT TABLE
-- ============================================================================
-- Stores fetched place data for persistence and historical tracking

CREATE TABLE IF NOT EXISTS google_places_result (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Google's unique identifier for this place
  place_id VARCHAR(255) NOT NULL,
  -- Links to query and layer
  query_id UUID REFERENCES google_places_saved_query(id) ON DELETE SET NULL,
  layer_id UUID REFERENCES map_layer(id) ON DELETE SET NULL,
  -- Basic place information
  name VARCHAR(500) NOT NULL,
  formatted_address TEXT,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  -- Business status from Google
  business_status VARCHAR(50) NOT NULL,
  -- Additional place data
  types TEXT[],
  rating DECIMAL(2, 1),
  user_ratings_total INTEGER,
  phone_number VARCHAR(50),
  website TEXT,
  -- Full API response for future use
  raw_data JSONB,
  -- Link to property if added to properties table
  property_id UUID REFERENCES property(id) ON DELETE SET NULL,
  -- Tracking when we first/last saw this place
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Unique constraint on place_id per layer (same place can be in multiple layers)
  UNIQUE(place_id, layer_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_google_places_result_place_id
ON google_places_result(place_id);

CREATE INDEX IF NOT EXISTS idx_google_places_result_query_id
ON google_places_result(query_id);

CREATE INDEX IF NOT EXISTS idx_google_places_result_layer_id
ON google_places_result(layer_id);

CREATE INDEX IF NOT EXISTS idx_google_places_result_status
ON google_places_result(business_status);

CREATE INDEX IF NOT EXISTS idx_google_places_result_property
ON google_places_result(property_id)
WHERE property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_google_places_result_location
ON google_places_result(latitude, longitude);

-- ============================================================================
-- 4. CREATE GOOGLE_PLACES_API_LOG TABLE
-- ============================================================================
-- Tracks API usage for budget monitoring

CREATE TABLE IF NOT EXISTS google_places_api_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Type of request: text_search, nearby_search, place_details
  request_type VARCHAR(50) NOT NULL,
  -- Link to query if part of a saved query run
  query_id UUID REFERENCES google_places_saved_query(id) ON DELETE SET NULL,
  -- API endpoint called
  api_endpoint VARCHAR(100) NOT NULL,
  -- Number of requests made (for batch operations)
  request_count INTEGER DEFAULT 1,
  -- Estimated cost in cents (for budget tracking)
  -- Text Search: ~1.7 cents, Nearby Search: ~1.7 cents, Place Details: ~1.7 cents
  estimated_cost_cents INTEGER DEFAULT 2,
  -- API response status
  response_status VARCHAR(50),
  -- Number of results returned
  results_count INTEGER DEFAULT 0,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for usage tracking
-- Index on created_at for date range queries (monthly usage can be calculated with WHERE clause)
CREATE INDEX IF NOT EXISTS idx_google_places_api_log_created
ON google_places_api_log(created_at);

CREATE INDEX IF NOT EXISTS idx_google_places_api_log_type
ON google_places_api_log(request_type);

-- ============================================================================
-- 5. TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- google_places_saved_query updated_at trigger
DROP TRIGGER IF EXISTS update_google_places_saved_query_updated_at ON google_places_saved_query;
CREATE TRIGGER update_google_places_saved_query_updated_at
  BEFORE UPDATE ON google_places_saved_query
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE google_places_saved_query ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_places_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_places_api_log ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- google_places_saved_query policies
-- -----------------------------------------------------------------------------

-- Internal users (admins and brokers) can manage all saved queries
CREATE POLICY "google_places_saved_query_internal_all" ON google_places_saved_query
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role IN ('admin', 'broker_full', 'broker_limited')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role IN ('admin', 'broker_full', 'broker_limited')
  )
);

-- -----------------------------------------------------------------------------
-- google_places_result policies
-- -----------------------------------------------------------------------------

-- Internal users can manage all results
CREATE POLICY "google_places_result_internal_all" ON google_places_result
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role IN ('admin', 'broker_full', 'broker_limited')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role IN ('admin', 'broker_full', 'broker_limited')
  )
);

-- Portal users can view results for layers shared to their clients
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portal_user_client_access') THEN
    EXECUTE '
      CREATE POLICY "google_places_result_portal_select" ON google_places_result
      FOR SELECT TO authenticated
      USING (
        layer_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM map_layer_client_share mlcs
          JOIN portal_user_client_access puca ON puca.client_id = mlcs.client_id
          JOIN contact c ON c.id = puca.contact_id
          JOIN auth.users au ON LOWER(au.email) = LOWER(c.email)
          WHERE au.id = auth.uid()
          AND c.portal_access_enabled = TRUE
          AND puca.is_active = TRUE
          AND mlcs.layer_id = google_places_result.layer_id
        )
      )
    ';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- google_places_api_log policies
-- -----------------------------------------------------------------------------

-- Internal users can view and create API logs
CREATE POLICY "google_places_api_log_internal_all" ON google_places_api_log
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role IN ('admin', 'broker_full', 'broker_limited')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role IN ('admin', 'broker_full', 'broker_limited')
  )
);

-- ============================================================================
-- 7. APP SETTINGS FOR API BUDGET
-- ============================================================================

-- Insert default budget configuration if not exists
INSERT INTO app_settings (key, value, description)
VALUES (
  'google_places_api_budget',
  '{"monthly_budget_cents": 20000, "warn_at_percent": 80}'::jsonb,
  'Google Places API monthly budget configuration. monthly_budget_cents is the limit in cents ($200 default), warn_at_percent triggers a warning when usage exceeds this percentage.'
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 8. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE google_places_saved_query IS 'Saved search configurations for Google Places closed business searches';
COMMENT ON TABLE google_places_result IS 'Cached results from Google Places API searches, linked to layers and properties';
COMMENT ON TABLE google_places_api_log IS 'API usage log for budget tracking and monitoring';

COMMENT ON COLUMN google_places_saved_query.geography_data IS 'JSON containing geography details: {state: "GA"} or {lat: x, lng: y, radius: m} or {polygon: [[lat,lng]...]}';
COMMENT ON COLUMN google_places_result.business_status IS 'Google business status: OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY';
COMMENT ON COLUMN google_places_result.raw_data IS 'Full Google Places API response for this place';
