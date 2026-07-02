-- Extend the Starbucks target-area bbox RPC to return planned_ops_area_id/name so the
-- map layer can filter client-side by ops area, and add a helper RPC for the toggle
-- UI to list all ops areas + counts (so the checkboxes show every area regardless
-- of what's in the current viewport).
--
-- Rationale: the dataset is small (~319 rows across 6 ops areas today) so filtering
-- client-side is fine; server-side filter would need a param on every idle re-fetch
-- for no meaningful savings.

-- Postgres won't let CREATE OR REPLACE alter the OUT parameter list, so drop first.
DROP FUNCTION IF EXISTS public.get_starbucks_target_areas_in_bbox(double precision, double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION public.get_starbucks_target_areas_in_bbox(
  p_south double precision,
  p_west  double precision,
  p_north double precision,
  p_east  double precision
)
RETURNS TABLE (
  id                     uuid,
  target_area_id         text,
  name                   text,
  store_type             text,
  priority               smallint,
  re_availability        text,
  notes                  text,
  market_name            text,
  sdm_mdm                text,
  model_yr1_sales        numeric,
  planned_ops_area_id    integer,
  planned_ops_area_name  text,
  geom_geojson           jsonb
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
    t.planned_ops_area_id,
    t.planned_ops_area_name,
    ST_AsGeoJSON(t.geom)::jsonb AS geom_geojson
  FROM starbucks_target_area t
  WHERE t.geom && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)
    AND ST_Intersects(t.geom, ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326))
  LIMIT 5000;
$$;

GRANT EXECUTE ON FUNCTION public.get_starbucks_target_areas_in_bbox TO authenticated;


-- Distinct ops areas across the whole target-area dataset, with counts.
-- Powers the ops-area filter checkbox list in StarbucksTargetAreaToggle.
-- SECURITY INVOKER so RLS on starbucks_target_area applies (user_has_starbucks_access).
CREATE OR REPLACE FUNCTION public.get_starbucks_target_area_ops_areas()
RETURNS TABLE (
  planned_ops_area_id   integer,
  planned_ops_area_name text,
  count                 bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    planned_ops_area_id,
    planned_ops_area_name,
    COUNT(*)::bigint AS count
  FROM starbucks_target_area
  GROUP BY planned_ops_area_id, planned_ops_area_name
  ORDER BY planned_ops_area_name NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_starbucks_target_area_ops_areas TO authenticated;
