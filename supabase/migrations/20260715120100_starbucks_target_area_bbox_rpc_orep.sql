-- Extend get_starbucks_target_areas_in_bbox to return the OREP fields + source discriminator.
-- The RETURNS TABLE signature changes, so we DROP then CREATE (CREATE OR REPLACE can't change the
-- return type). Adds: source, orep_notes, orep_model_yr1_sales. Keeps model_yr1_sales (the raw
-- Starbucks value) so the edit UI can show it as the placeholder/reset for the OREP override.

DROP FUNCTION IF EXISTS public.get_starbucks_target_areas_in_bbox(
  double precision, double precision, double precision, double precision
);

CREATE FUNCTION public.get_starbucks_target_areas_in_bbox(
  p_south double precision,
  p_west  double precision,
  p_north double precision,
  p_east  double precision
)
RETURNS TABLE (
  id                   uuid,
  target_area_id       text,
  name                 text,
  store_type           text,
  priority             smallint,
  re_availability      text,
  notes                text,
  market_name          text,
  sdm_mdm              text,
  model_yr1_sales      numeric,
  source               text,
  orep_notes           text,
  orep_model_yr1_sales numeric,
  geom_geojson         jsonb
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
    t.source,
    t.orep_notes,
    t.orep_model_yr1_sales,
    ST_AsGeoJSON(t.geom)::jsonb AS geom_geojson
  FROM starbucks_target_area t
  WHERE t.geom && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)
    AND ST_Intersects(t.geom, ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326))
  LIMIT 5000;
$$;

GRANT EXECUTE ON FUNCTION public.get_starbucks_target_areas_in_bbox TO authenticated;
