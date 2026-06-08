-- Market Research Agent — fix: get_municipalities_in_radius_for_site
-- was only looking at site_submit.{verified_latitude, sf_property_latitude},
-- but some site_submits have NULL lat/lng on their own row and only carry
-- coordinates on the linked property (e.g. Villa Rica Hwy 2 — site_submit row
-- has both lat/lng columns NULL; property.verified_latitude is the only
-- non-null source). Falls back through the full coalesce chain:
--   site_submit.verified_latitude
--     → site_submit.sf_property_latitude
--       → property.verified_latitude
--         → property.latitude

CREATE OR REPLACE FUNCTION public.get_municipalities_in_radius_for_site(
  p_site_id      uuid,
  p_radius_miles int DEFAULT 10
) RETURNS TABLE(
  boundary_municipality_id uuid,
  kind                     text,
  name                     text,
  geoid                    text,
  distance_mi              numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lat numeric;
  v_lng numeric;
BEGIN
  SELECT
    COALESCE(ss.verified_latitude,  ss.sf_property_latitude,  p.verified_latitude,  p.latitude),
    COALESCE(ss.verified_longitude, ss.sf_property_longitude, p.verified_longitude, p.longitude)
    INTO v_lat, v_lng
    FROM site_submit ss
    LEFT JOIN property p ON p.id = ss.property_id
   WHERE ss.id = p_site_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'site_submit % not found', p_site_id;
  END IF;
  IF v_lat IS NULL OR v_lng IS NULL THEN
    RAISE EXCEPTION 'site_submit % has no lat/lng (checked site_submit + property)', p_site_id;
  END IF;
  IF p_radius_miles < 1 OR p_radius_miles > 50 THEN
    RAISE EXCEPTION 'radius_miles % out of range (1..50)', p_radius_miles;
  END IF;

  RETURN QUERY
    SELECT
      bm.id,
      bm.kind,
      bm.name,
      bm.geoid,
      ROUND((ST_Distance(
        bm.centroid::geography,
        ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography
      ) / 1609.344)::numeric, 2) AS distance_mi
    FROM boundary_municipality bm
    WHERE bm.state = 'GA'
      AND ST_DWithin(
        bm.centroid::geography,
        ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography,
        p_radius_miles * 1609.344
      )
    ORDER BY distance_mi;
END;
$$;

-- Grants unchanged (service_role only).
