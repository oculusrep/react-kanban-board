-- Add source_year column to restaurant_location table
-- This tracks which year's data was used to populate each location record
-- Ensures that newer year data takes precedence over older year data

ALTER TABLE restaurant_location
ADD COLUMN IF NOT EXISTS source_year INTEGER;

COMMENT ON COLUMN restaurant_location.source_year IS 'Year of the source data file used to populate this location record';

-- Create index for queries filtering by source_year
CREATE INDEX IF NOT EXISTS idx_restaurant_location_source_year ON restaurant_location(source_year);

-- Update existing records to have source_year from the most recent trend data
UPDATE restaurant_location l
SET source_year = (
    SELECT MAX(year)
    FROM restaurant_trend t
    WHERE t.store_no = l.store_no
)
WHERE source_year IS NULL;
