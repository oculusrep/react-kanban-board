-- RPC to create an OREP-drawn target-area polygon from the map.
-- Inserting PostGIS geometry through PostgREST is awkward, so we take a GeoJSON Polygon and build
-- the geometry server-side. SECURITY DEFINER + an explicit permission check: only users with
-- can_edit_starbucks_target_area (internal, per the helper) may create rows, and the row is always
-- stamped source='orep'.

CREATE OR REPLACE FUNCTION public.create_orep_target_area(p_name text, p_geojson jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT user_can_edit_starbucks_target_area() THEN
    RAISE EXCEPTION 'Not authorized to add OREP target areas';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  INSERT INTO starbucks_target_area (name, source, geom)
  VALUES (
    btrim(p_name),
    'orep',
    ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_orep_target_area TO authenticated;
