-- Custom Map Layers Schema Migration
-- Created: February 1, 2026
-- Description: Add tables for custom polygon map layers feature (Phase 1)

-- ============================================================================
-- 1. CREATE MAP_LAYER TABLE
-- ============================================================================
-- Stores layer metadata (name, defaults, ownership)

CREATE TABLE IF NOT EXISTS map_layer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  layer_type VARCHAR(20) NOT NULL DEFAULT 'custom'
    CHECK (layer_type IN ('custom', 'us_state', 'county')),
  default_color VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
  default_opacity DECIMAL(3,2) NOT NULL DEFAULT 0.35
    CHECK (default_opacity >= 0 AND default_opacity <= 1),
  default_stroke_width INTEGER NOT NULL DEFAULT 2
    CHECK (default_stroke_width >= 1 AND default_stroke_width <= 10),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for map_layer
CREATE INDEX IF NOT EXISTS idx_map_layer_type
ON map_layer(layer_type);

CREATE INDEX IF NOT EXISTS idx_map_layer_active
ON map_layer(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_map_layer_created_by
ON map_layer(created_by_id);

-- ============================================================================
-- 2. CREATE MAP_LAYER_SHAPE TABLE
-- ============================================================================
-- Stores individual shapes (polygons, circles, polylines, rectangles)

CREATE TABLE IF NOT EXISTS map_layer_shape (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id UUID NOT NULL REFERENCES map_layer(id) ON DELETE CASCADE,
  name VARCHAR(255),
  shape_type VARCHAR(20) NOT NULL
    CHECK (shape_type IN ('polygon', 'circle', 'polyline', 'rectangle')),
  geometry JSONB NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
  fill_opacity DECIMAL(3,2) NOT NULL DEFAULT 0.35
    CHECK (fill_opacity >= 0 AND fill_opacity <= 1),
  stroke_width INTEGER NOT NULL DEFAULT 2
    CHECK (stroke_width >= 1 AND stroke_width <= 10),
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for map_layer_shape
CREATE INDEX IF NOT EXISTS idx_map_layer_shape_layer
ON map_layer_shape(layer_id);

CREATE INDEX IF NOT EXISTS idx_map_layer_shape_type
ON map_layer_shape(layer_id, shape_type);

CREATE INDEX IF NOT EXISTS idx_map_layer_shape_sort
ON map_layer_shape(layer_id, sort_order);

-- ============================================================================
-- 3. CREATE MAP_LAYER_CLIENT_SHARE TABLE
-- ============================================================================
-- Tracks which layers are shared to which clients

CREATE TABLE IF NOT EXISTS map_layer_client_share (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id UUID REFERENCES map_layer(id) ON DELETE CASCADE,
  source_layer_id UUID REFERENCES map_layer(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  share_type VARCHAR(20) NOT NULL DEFAULT 'reference'
    CHECK (share_type IN ('reference', 'copy')),
  is_visible_by_default BOOLEAN NOT NULL DEFAULT TRUE,
  shared_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  shared_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- For reference shares, layer_id must be set
  -- For copy shares, source_layer_id tracks the original
  CONSTRAINT share_layer_reference CHECK (
    (share_type = 'reference' AND layer_id IS NOT NULL) OR
    (share_type = 'copy' AND source_layer_id IS NOT NULL)
  ),
  -- Unique constraint: one share per layer per client
  UNIQUE(layer_id, client_id)
);

-- Indexes for map_layer_client_share
CREATE INDEX IF NOT EXISTS idx_map_layer_client_share_layer
ON map_layer_client_share(layer_id);

CREATE INDEX IF NOT EXISTS idx_map_layer_client_share_client
ON map_layer_client_share(client_id);

CREATE INDEX IF NOT EXISTS idx_map_layer_client_share_source
ON map_layer_client_share(source_layer_id) WHERE source_layer_id IS NOT NULL;

-- ============================================================================
-- 4. TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- map_layer updated_at trigger
DROP TRIGGER IF EXISTS update_map_layer_updated_at ON map_layer;
CREATE TRIGGER update_map_layer_updated_at
  BEFORE UPDATE ON map_layer
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- map_layer_shape updated_at trigger
DROP TRIGGER IF EXISTS update_map_layer_shape_updated_at ON map_layer_shape;
CREATE TRIGGER update_map_layer_shape_updated_at
  BEFORE UPDATE ON map_layer_shape
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- map_layer_client_share updated_at trigger
DROP TRIGGER IF EXISTS update_map_layer_client_share_updated_at ON map_layer_client_share;
CREATE TRIGGER update_map_layer_client_share_updated_at
  BEFORE UPDATE ON map_layer_client_share
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE map_layer ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_layer_shape ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_layer_client_share ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- map_layer policies
-- -----------------------------------------------------------------------------

-- Internal users (admins and brokers) can do everything
CREATE POLICY "map_layer_internal_all" ON map_layer
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

-- Portal users can SELECT layers that are shared to their clients
-- Only created if portal_user_client_access table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portal_user_client_access') THEN
    EXECUTE '
      CREATE POLICY "map_layer_portal_select" ON map_layer
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM contact c
          JOIN auth.users au ON LOWER(au.email) = LOWER(c.email)
          WHERE au.id = auth.uid()
          AND c.portal_access_enabled = TRUE
        )
        AND
        EXISTS (
          SELECT 1 FROM map_layer_client_share mlcs
          JOIN portal_user_client_access puca ON puca.client_id = mlcs.client_id
          JOIN contact c ON c.id = puca.contact_id
          JOIN auth.users au ON LOWER(au.email) = LOWER(c.email)
          WHERE au.id = auth.uid()
          AND c.portal_access_enabled = TRUE
          AND puca.is_active = TRUE
          AND (mlcs.layer_id = map_layer.id OR mlcs.source_layer_id = map_layer.id)
        )
      )
    ';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- map_layer_shape policies
-- -----------------------------------------------------------------------------

-- Internal users can do everything with shapes
CREATE POLICY "map_layer_shape_internal_all" ON map_layer_shape
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

-- Portal users can SELECT shapes for layers shared to their clients
-- Only created if portal_user_client_access table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portal_user_client_access') THEN
    EXECUTE '
      CREATE POLICY "map_layer_shape_portal_select" ON map_layer_shape
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM contact c
          JOIN auth.users au ON LOWER(au.email) = LOWER(c.email)
          WHERE au.id = auth.uid()
          AND c.portal_access_enabled = TRUE
        )
        AND
        EXISTS (
          SELECT 1 FROM map_layer_client_share mlcs
          JOIN portal_user_client_access puca ON puca.client_id = mlcs.client_id
          JOIN contact c ON c.id = puca.contact_id
          JOIN auth.users au ON LOWER(au.email) = LOWER(c.email)
          WHERE au.id = auth.uid()
          AND c.portal_access_enabled = TRUE
          AND puca.is_active = TRUE
          AND (mlcs.layer_id = map_layer_shape.layer_id OR mlcs.source_layer_id = map_layer_shape.layer_id)
        )
      )
    ';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- map_layer_client_share policies
-- -----------------------------------------------------------------------------

-- Internal users can manage all shares
CREATE POLICY "map_layer_client_share_internal_all" ON map_layer_client_share
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

-- Portal users can see shares for their clients (read-only)
-- Only created if portal_user_client_access table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portal_user_client_access') THEN
    EXECUTE '
      CREATE POLICY "map_layer_client_share_portal_select" ON map_layer_client_share
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM portal_user_client_access puca
          JOIN contact c ON c.id = puca.contact_id
          JOIN auth.users au ON LOWER(au.email) = LOWER(c.email)
          WHERE au.id = auth.uid()
          AND c.portal_access_enabled = TRUE
          AND puca.is_active = TRUE
          AND puca.client_id = map_layer_client_share.client_id
        )
      )
    ';
  END IF;
END $$;

-- ============================================================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE map_layer IS 'Custom map layers containing polygon shapes for territories';
COMMENT ON TABLE map_layer_shape IS 'Individual shapes (polygons, circles, polylines, rectangles) within a layer';
COMMENT ON TABLE map_layer_client_share IS 'Tracks which layers are shared to which client accounts';

COMMENT ON COLUMN map_layer_shape.geometry IS 'GeoJSON-compatible geometry: {"type": "polygon|circle|polyline", "coordinates": [...]} or {"type": "circle", "center": [lat, lng], "radius": meters}';
COMMENT ON COLUMN map_layer_client_share.share_type IS 'reference = live link to layer, copy = independent copy for client';
