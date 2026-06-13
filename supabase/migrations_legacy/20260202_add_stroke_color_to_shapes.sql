-- Add stroke_color column to map_layer_shape table
-- This allows shapes to have a different stroke color than fill color

-- Add stroke_color column (defaults to the existing color value)
ALTER TABLE map_layer_shape
ADD COLUMN IF NOT EXISTS stroke_color VARCHAR(7);

-- Update existing shapes to use their current color as stroke_color
UPDATE map_layer_shape
SET stroke_color = color
WHERE stroke_color IS NULL;

-- Set a default for new shapes
ALTER TABLE map_layer_shape
ALTER COLUMN stroke_color SET DEFAULT '#3b82f6';

-- Add default_stroke_color to map_layer table for layer defaults
ALTER TABLE map_layer
ADD COLUMN IF NOT EXISTS default_stroke_color VARCHAR(7);

-- Update existing layers to use their default_color as default_stroke_color
UPDATE map_layer
SET default_stroke_color = default_color
WHERE default_stroke_color IS NULL;

-- Set a default for new layers
ALTER TABLE map_layer
ALTER COLUMN default_stroke_color SET DEFAULT '#3b82f6';

COMMENT ON COLUMN map_layer_shape.stroke_color IS 'Hex color for the shape border/stroke (e.g., #FF0000)';
COMMENT ON COLUMN map_layer.default_stroke_color IS 'Default stroke color for new shapes in this layer';
