-- RPC: return Starbucks target-area polygons whose geometry intersects the viewport bbox.
-- Used by StarbucksTargetAreaLayer on the map to render polygons within view.
--
-- Mirrors get_streetlight_segments_in_bbox in shape and reasoning:
--   - SECURITY INVOKER so RLS on starbucks_target_area applies (gates by user_has_starbucks_access)
--   - bbox params (south/west/north/east) backed by the GiST index on geom
--   - ST_AsGeoJSON(geom)::jsonb so frontends can construct google.maps.Polygon directly
--   - LIMIT 5000 (well above the 319-row dataset; defensive against future growth)
--
-- Returned fields are exactly what the InfoWindow needs per STARBUCKS_LAYER_SPEC.md
-- ("name, priority, store_type, re_availability, notes, market_name, sdm_mdm, model_yr1_sales")
-- plus id/target_area_id for keying.

CREATE OR REPLACE FUNCTION public.get_starbucks_target_areas_in_bbox(
  p_south double precision,
  p_west  double precision,
  p_north double precision,
  p_east  double precision
)
RETURNS TABLE (
  id              uuid,
  target_area_id  text,
  name            text,
  store_type      text,
  priority        smallint,
  re_availability text,
  notes           text,
  market_name     text,
  sdm_mdm         text,
  model_yr1_sales numeric,
  geom_geojson    jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.target_area_id,
    t.name,
    t.store_type,
    t.priority,
    t.re_availability,
    t.notes,
    t.market_name,
    t.sdm_mdm,
    t.model_yr1_sales,
    ST_AsGeoJSON(t.geom)::jsonb AS geom_geojson
  FROM starbucks_target_area t
  WHERE t.geom && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)
    AND ST_Intersects(t.geom, ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326))
  LIMIT 5000;
$$;

GRANT EXECUTE ON FUNCTION public.get_starbucks_target_areas_in_bbox TO authenticated;
