-- Tour day start/end locations (Phase 3+)
-- Created: July 26, 2026
-- Description: A day can start and/or end at a non-site address (airport, hotel, office —
--   e.g. picking up the client). These anchor the route and let the optimizer reorder ALL
--   the sites in between. Additive columns on tour_day (geocoded to lat/lng in the app).

ALTER TABLE tour_day ADD COLUMN IF NOT EXISTS start_location_address TEXT;
ALTER TABLE tour_day ADD COLUMN IF NOT EXISTS start_latitude DOUBLE PRECISION;
ALTER TABLE tour_day ADD COLUMN IF NOT EXISTS start_longitude DOUBLE PRECISION;

ALTER TABLE tour_day ADD COLUMN IF NOT EXISTS end_location_address TEXT;
ALTER TABLE tour_day ADD COLUMN IF NOT EXISTS end_latitude DOUBLE PRECISION;
ALTER TABLE tour_day ADD COLUMN IF NOT EXISTS end_longitude DOUBLE PRECISION;
