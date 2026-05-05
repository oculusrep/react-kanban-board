-- RPC: return all cached streetlight segments whose geometry intersects the given viewport bbox.
-- Used by the frontend (loadCachedSegments) to render the union of every segment we have in
-- cache, regardless of which past geometry-fetch bbox originally brought them in.
--
-- This is the *primary* render path. The /geometry edge-function call still runs in the
-- background to grow the catalog for new areas, but the user sees segments from this RPC
-- immediately on layer-enable / pan / zoom.
--
-- Backed by the existing GiST index idx_streetlight_segment_geom for fast bbox lookups.

CREATE OR REPLACE FUNCTION public.get_streetlight_segments_in_bbox(
  p_south double precision,
  p_west double precision,
  p_north double precision,
  p_east double precision
)
RETURNS TABLE (
  id bigint,
  road_name text,
  road_type text,
  geom_geojson jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.road_name,
    s.road_type,
    ST_AsGeoJSON(s.geom)::jsonb AS geom_geojson
  FROM streetlight_segment s
  WHERE s.geom && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)
    AND ST_Intersects(s.geom, ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326))
  LIMIT 5000;
$$;

GRANT EXECUTE ON FUNCTION public.get_streetlight_segments_in_bbox TO authenticated, anon;
