-- Per-client demographics configuration
-- Allows clients to specify custom radii and drive times for ESRI enrichment
-- instead of using system defaults (1, 3, 5 miles + 10-min drive)

-- Add demographics config columns to client table
ALTER TABLE client
  ADD COLUMN IF NOT EXISTS demographics_radii numeric[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS demographics_drive_times numeric[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS demographics_sidebar_radius numeric DEFAULT NULL;

COMMENT ON COLUMN client.demographics_radii IS 'Custom ESRI ring buffer radii in miles (e.g., {0.5, 1, 3}). NULL = use defaults {1, 3, 5}.';
COMMENT ON COLUMN client.demographics_drive_times IS 'Custom ESRI drive time values in minutes (e.g., {5}). NULL = use defaults {10}.';
COMMENT ON COLUMN client.demographics_sidebar_radius IS 'Which radius (in miles) to display in the site submit sidebar summary (e.g., 2). NULL = use middle radius from demographics_radii or default 3.';

-- Add client-specific demographics JSONB to site_submit table
ALTER TABLE site_submit
  ADD COLUMN IF NOT EXISTS client_demographics jsonb DEFAULT NULL;

COMMENT ON COLUMN site_submit.client_demographics IS 'Client-specific demographics enrichment data. Contains radii, drive_times, enriched_at, data (metric values), and tapestry.';
