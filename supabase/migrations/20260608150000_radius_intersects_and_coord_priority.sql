-- Market Research Agent — fix get_municipalities_in_radius_for_site:
--
-- 1) Containment: a muni whose polygon contains the site point is ALWAYS in
--    scope, regardless of centroid-to-site distance. For a large county like
--    Paulding (where Villa Rica Hwy 2 sits), the centroid can be 7+ miles
--    from the site even though the site is physically inside the county.
--    Before this fix, a 5-mi radius returned zero munis for that site.
--
-- 2) Coordinate priority: verified beats unverified, regardless of which
--    table the value lives on. See memory feedback_coordinate_resolution.md.
--    Order: site_submit.verified → property.verified → site_submit.sf → property.lat.

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
  v_point geography;
BEGIN
  -- Verified always wins, even if it lives on the other table.
  SELECT
    COALESCE(ss.verified_latitude,  p.verified_latitude,  ss.sf_property_latitude,  p.latitude),
    COALESCE(ss.verified_longitude, p.verified_longitude, ss.sf_property_longitude, p.longitude)
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

  v_point := ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography;

  RETURN QUERY
    SELECT
      bm.id,
      bm.kind,
      bm.name,
      bm.geoid,
      ROUND((ST_Distance(bm.centroid::geography, v_point) / 1609.344)::numeric, 2) AS distance_mi
    FROM boundary_municipality bm
    WHERE bm.state = 'GA'
      AND (
        -- Containment: site is physically inside this muni's polygon.
        -- Cast to geometry so the GIST(geometry) index can serve the check
        -- via an index-supported bounding-box prefilter, then exact polygon
        -- containment after.
        ST_Intersects(bm.geometry, ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326))
        -- OR: centroid is within the requested radius.
        OR ST_DWithin(bm.centroid::geography, v_point, p_radius_miles * 1609.344)
      )
    ORDER BY distance_mi;
END;
$$;

-- Grants unchanged (service_role only).
