-- Point Layer Support
-- Adds 'point' shape_type, per-shape attributes JSONB, and per-layer icon_config JSONB.
-- Enables CSV-uploaded point layers (e.g. BWW Market Points) to coexist with polygon layers.

-- ============================================================================
-- 1. ALLOW 'point' AS A shape_type
-- ============================================================================

ALTER TABLE map_layer_shape
  DROP CONSTRAINT IF EXISTS map_layer_shape_shape_type_check;

ALTER TABLE map_layer_shape
  ADD CONSTRAINT map_layer_shape_shape_type_check
    CHECK (shape_type IN ('polygon', 'circle', 'polyline', 'rectangle', 'point'));

-- ============================================================================
-- 2. PER-SHAPE ATTRIBUTES (CSV columns, etc.)
-- ============================================================================

ALTER TABLE map_layer_shape
  ADD COLUMN IF NOT EXISTS attributes JSONB;

COMMENT ON COLUMN map_layer_shape.attributes
  IS 'Arbitrary key/value metadata for the shape. For point layers from CSV uploads, holds the source row''s columns (e.g. {"market_point_number":"197220","address":"...","city":"..."}).';

CREATE INDEX IF NOT EXISTS idx_map_layer_shape_attributes_gin
  ON map_layer_shape USING GIN (attributes);

-- ============================================================================
-- 3. PER-LAYER ICON CONFIG
-- ============================================================================
-- Used by point layers; ignored by polygon layers. Renderer reads layer.icon_config
-- to draw markers (shape, fill color, inner icon, label visibility, etc.).
-- Example:
--   { "shape": "circle", "fill": "#FACC15", "iconColor": "#000000", "icon": "bullseye",
--     "labelField": "market_point_number", "labelOnHover": true }

ALTER TABLE map_layer
  ADD COLUMN IF NOT EXISTS icon_config JSONB;

COMMENT ON COLUMN map_layer.icon_config
  IS 'Icon rendering config for point-type layers. Keys: shape (circle|square|diamond), fill (hex), iconColor (hex), icon (named: bullseye|storefront|pin|flag), labelField (attribute key), labelOnHover (bool).';

-- ============================================================================
-- 4. UPDATE GEOMETRY COMMENT TO REFLECT POINT SUPPORT
-- ============================================================================

COMMENT ON COLUMN map_layer_shape.geometry IS
  'GeoJSON-compatible geometry. Shapes:
   polygon/rectangle/polyline: {"type":"...","coordinates":[[lat,lng],...]}
   circle: {"type":"circle","center":[lat,lng],"radius":meters}
   point: {"type":"point","coordinates":[lat,lng]}';
