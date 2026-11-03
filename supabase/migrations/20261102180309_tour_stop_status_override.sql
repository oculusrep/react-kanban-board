-- Tour stop status override (feature/tour-routing).
-- The itinerary Status is derived in the app: site-submit stops map the site submit's current
-- stage to client-friendly text (src/lib/tourStopStatus.ts); store/custom stops keep their
-- kind default. status_override, when set, always wins. NULL = automatic.
-- No new relation: tour_stop's existing table grants (authenticated) and RLS cover the column.

ALTER TABLE public.tour_stop
  ADD COLUMN IF NOT EXISTS status_override text;

ALTER TABLE public.tour_stop
  ADD CONSTRAINT tour_stop_status_override_len
  CHECK (status_override IS NULL OR char_length(btrim(status_override)) BETWEEN 1 AND 80);

COMMENT ON COLUMN public.tour_stop.status_override IS
  'Itinerary status shown on the tour + PDF. NULL = automatic (site submit stage mapping / stop-kind default).';
