-- Tour live day: actual departure stamps
-- Created: October 28, 2026
-- Description: tour_stop.actual_departure_at — when the tour actually left this stop
--   ("Leaving now" on a live day). The latest stamped stop anchors the re-projected rest
--   of the day. NULL = not stamped. Stored UTC; displayed in America/New_York.
--
-- No new relations: existing tour_stop grants (20261028165400_tour_hardening) cover it.
-- No BEGIN/COMMIT: apply with psql --single-transaction (round-trip testable).

ALTER TABLE public.tour_stop ADD COLUMN IF NOT EXISTS actual_departure_at TIMESTAMPTZ;

COMMENT ON COLUMN public.tour_stop.actual_departure_at IS
  'When the tour actually departed this stop (live day). NULL = not stamped.';
