-- Truck Stops map layer: Pilot, Flying J, Love's, TA / Petro, QuikTrip truck
-- stops, Buc-ee's (Georgia). Source: Google Places grid search; see
-- docs/TRUCK_STOPS_LAYER.md. Everyone signed in can read. Internal users can
-- verify a pin's location (drag) or remove a wrong pin (soft delete) via the
-- two SECURITY DEFINER RPCs below; there is no direct write grant.

CREATE TABLE IF NOT EXISTS public.truck_stop (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand               text NOT NULL CHECK (brand IN ('Pilot','Flying J','Love''s','TA / Petro','QuikTrip','Buc-ee''s')),
  google_place_id     text NOT NULL UNIQUE,
  name                text,
  formatted_address   text,
  latitude            numeric NOT NULL,
  longitude           numeric NOT NULL,
  verified_latitude   numeric,
  verified_longitude  numeric,
  verified_at         timestamptz,
  verified_by         uuid REFERENCES public."user"(id) ON DELETE SET NULL,
  excluded_at         timestamptz,
  excluded_by         uuid REFERENCES public."user"(id) ON DELETE SET NULL,
  business_status     text NOT NULL DEFAULT 'OPERATIONAL',
  last_fetched_at     timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS truck_stop_brand_idx ON public.truck_stop (brand);

ALTER TABLE public.truck_stop ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS truck_stop_select ON public.truck_stop;
CREATE POLICY truck_stop_select ON public.truck_stop
  FOR SELECT TO authenticated
  USING (true);

-- Verify: pin dragged to the real storefront. Never touched by re-imports.
CREATE OR REPLACE FUNCTION public.truck_stop_set_verified_location(p_id uuid, p_lat numeric, p_lng numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid coordinates';
  END IF;
  UPDATE public.truck_stop
     SET verified_latitude = p_lat,
         verified_longitude = p_lng,
         verified_at = now(),
         verified_by = (SELECT id FROM "user" WHERE auth_user_id = auth.uid())
   WHERE id = p_id;
END;
$$;

-- Remove: soft delete, so a re-import (keyed on google_place_id) can't resurrect it.
CREATE OR REPLACE FUNCTION public.truck_stop_exclude(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.truck_stop
     SET excluded_at = now(),
         excluded_by = (SELECT id FROM "user" WHERE auth_user_id = auth.uid())
   WHERE id = p_id AND excluded_at IS NULL;
END;
$$;

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.truck_stop FROM anon, authenticated;
GRANT SELECT ON public.truck_stop TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.truck_stop TO service_role;

REVOKE ALL ON FUNCTION public.truck_stop_set_verified_location(uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.truck_stop_set_verified_location(uuid, numeric, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.truck_stop_exclude(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.truck_stop_exclude(uuid) TO authenticated;
