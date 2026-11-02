-- Unmapped NNN listings queue (docs/NNN_LISTING_INTAKE.md §Unmapped listings).
--
-- comp_property records WHY a comp is or isn't on the map, mirroring
-- municipal_project.unplaced_reason. "Unmapped" itself stays derived — no usable
-- coordinate (verified_* or raw latitude/longitude) — so the queue can't drift from
-- what the map actually draws.
--
--   geocode_status  placed    — a geocoder placed it (Census exact, or Google rooftop/interpolated)
--                   no_match  — no geocoder found the address
--                   ambiguous — only an inexact / partial match, deliberately not pinned
--                   manual    — a person placed or verified the pin
--                   NULL      — never attempted
--   geocode_source  census | google | manual (NULL when not known, e.g. pre-2026-10-31 rows)

ALTER TABLE public.comp_property
  ADD COLUMN IF NOT EXISTS geocode_status text,
  ADD COLUMN IF NOT EXISTS geocode_source text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

ALTER TABLE public.comp_property
  DROP CONSTRAINT IF EXISTS comp_property_geocode_status_check,
  ADD CONSTRAINT comp_property_geocode_status_check
    CHECK (geocode_status IN ('placed', 'no_match', 'ambiguous', 'manual')),
  DROP CONSTRAINT IF EXISTS comp_property_geocode_source_check,
  ADD CONSTRAINT comp_property_geocode_source_check
    CHECK (geocode_source IN ('census', 'google', 'manual'));

-- Backfill. Only rows not yet classified, so a re-run leaves later writes alone.
-- A verified coordinate was set by a person (slideout create-at-pin, or drag-verify).
UPDATE public.comp_property
   SET geocode_status = 'manual', geocode_source = 'manual'
 WHERE geocode_status IS NULL AND verified_latitude IS NOT NULL AND verified_longitude IS NOT NULL;
-- A raw coordinate only: a geocoder placed it, but which one was never recorded.
UPDATE public.comp_property
   SET geocode_status = 'placed'
 WHERE geocode_status IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;
-- No coordinate: every one of these is a listing whose geocode came back no-match
-- (4 on 2026-10-31: Villa Rica, Buford, Fayetteville, Bogart).
UPDATE public.comp_property
   SET geocode_status = 'no_match'
 WHERE geocode_status IS NULL
   AND coalesce(verified_latitude, latitude) IS NULL;

-- Place a comp by hand from the map (unmapped queue → Drop a pin → Place pin here).
-- Writes the human-set verified_* pair, which outranks a geocoded coordinate
-- everywhere, and marks the comp manual. SECURITY INVOKER: comp_property's
-- is_internal_user() policy is the gate.
CREATE OR REPLACE FUNCTION public.set_comp_property_pin(p_id uuid, p_lat numeric, p_lng numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid coordinate (%, %)', p_lat, p_lng;
  END IF;

  UPDATE public.comp_property
     SET verified_latitude = p_lat,
         verified_longitude = p_lng,
         verified_at = now(),
         verified_by_id = auth.uid(),
         geocode_status = 'manual',
         geocode_source = 'manual',
         geocoded_at = now(),
         updated_by_id = auth.uid()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'comp % not found or not permitted', p_id;
  END IF;
END;
$$;

-- Grants: the map UI calls this as the signed-in user; nobody else.
REVOKE ALL ON FUNCTION public.set_comp_property_pin(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_comp_property_pin(uuid, numeric, numeric) TO authenticated;
