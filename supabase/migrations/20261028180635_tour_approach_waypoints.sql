-- Tour site approach routes
-- Created: October 28, 2026
-- Description: Let a broker control HOW a tour arrives at a site (main corridor, correct
--   entrance) with ordered pass-through points routed as non-stopover Directions waypoints
--   immediately before the stop.
--     site_submit.approach_waypoints          — the site's default approach
--     tour_stop.approach_waypoints_override   — per-tour override
--   Effective approach = override (when NOT NULL; '[]' = explicitly none on this tour)
--                        → site default → none.
--   Shape: ordered JSON array of {"lat": number, "lng": number}, at most 10 points (keeps one
--   stop's approach inside a single Directions request when a day is chunked).
--
-- No new relations: existing grants on site_submit / tour_stop cover the new columns.
-- Note: writing site_submit.approach_waypoints fires update_site_submit_audit_fields
--   (bumps updated_at / updated_by_id). No other site_submit trigger fires for it.
-- No BEGIN/COMMIT: apply with psql --single-transaction (round-trip testable).

ALTER TABLE public.site_submit ADD COLUMN IF NOT EXISTS approach_waypoints JSONB;
ALTER TABLE public.tour_stop ADD COLUMN IF NOT EXISTS approach_waypoints_override JSONB;

ALTER TABLE public.site_submit DROP CONSTRAINT IF EXISTS site_submit_approach_waypoints_shape;
ALTER TABLE public.site_submit ADD CONSTRAINT site_submit_approach_waypoints_shape CHECK (
  approach_waypoints IS NULL OR (
    jsonb_typeof(approach_waypoints) = 'array'
    AND jsonb_array_length(approach_waypoints) <= 10
    AND NOT jsonb_path_exists(
      approach_waypoints,
      '$[*] ? (!(@.lat.type() == "number" && @.lng.type() == "number" && @.lat >= -90 && @.lat <= 90 && @.lng >= -180 && @.lng <= 180))'
    )
  )
);

ALTER TABLE public.tour_stop DROP CONSTRAINT IF EXISTS tour_stop_approach_waypoints_override_shape;
ALTER TABLE public.tour_stop ADD CONSTRAINT tour_stop_approach_waypoints_override_shape CHECK (
  approach_waypoints_override IS NULL OR (
    jsonb_typeof(approach_waypoints_override) = 'array'
    AND jsonb_array_length(approach_waypoints_override) <= 10
    AND NOT jsonb_path_exists(
      approach_waypoints_override,
      '$[*] ? (!(@.lat.type() == "number" && @.lng.type() == "number" && @.lat >= -90 && @.lat <= 90 && @.lng >= -180 && @.lng <= 180))'
    )
  )
);

COMMENT ON COLUMN public.site_submit.approach_waypoints IS
  'Default tour approach for this site: ordered [{lat,lng}] pass-through points (max 10) routed just before the stop.';
COMMENT ON COLUMN public.tour_stop.approach_waypoints_override IS
  'Per-tour approach override: NULL = use site_submit.approach_waypoints; [] = no approach on this tour.';
