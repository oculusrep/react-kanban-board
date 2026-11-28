-- One pipeline count, called by both the map modal and site research.
--
-- MunicipalUnitsScreenshotModal computed stage x catchment units in the browser with turf, while
-- site research counted its own way (centroid, one ring, one phase) — which is why the Macon deep
-- pass reported "860 units" when the 3 mi pipeline is 1,732 and the 10-minute drive shed is 1,924.
-- Two implementations drift, so the count lives here and both callers use it.
--
-- BOTH VARIANTS ARE RETURNED, LABELLED. A project counts by intersects when its drawn boundary
-- clips the catchment, and by centroid when its pin sits inside. Intersects credits a 600-unit
-- project in full to a ring its edge touches — right for a slide, wrong for a density index — so
-- the weighted index uses CENTROID and the export carries both.
--
-- Recently Completed weights 0: Esri _CY households are modelled current-year estimates
-- (BlockApportionment:US.BlockGroups), so occupied units are already in the denominator. Counting
-- them in the numerator too would double-count them.

CREATE TABLE IF NOT EXISTS public.pipeline_phase_weight (
  phase       text PRIMARY KEY,
  weight      numeric(4,2) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pipeline_phase_weight IS
  'Tunable weights for the pipeline index numerator. Edit the rows; nothing is hardcoded in the function.';

INSERT INTO public.pipeline_phase_weight (phase, weight, note) VALUES
  ('Under Construction', 1.00, 'Committed and arriving'),
  ('Approved',           0.60, 'Entitled, not started'),
  ('Planning',           0.25, 'Proposed only'),
  ('Recently Completed', 0.00, 'Already inside the Esri _CY household base — counting it again double-counts'),
  ('unreviewed',         0.00, 'Agent-discovered, not human-reviewed: excluded from every total')
ON CONFLICT (phase) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pipeline_distance_weight (
  max_miles   numeric(4,2) PRIMARY KEY,
  weight      numeric(4,2) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pipeline_distance_weight IS
  'Banded distance weights (not a curve): the first band whose max_miles >= the project distance wins. Beyond the last band, weight 0.';

INSERT INTO public.pipeline_distance_weight (max_miles, weight) VALUES
  (1.00, 1.00), (2.00, 0.70), (3.00, 0.50)
ON CONFLICT (max_miles) DO NOTHING;

REVOKE ALL ON TABLE public.pipeline_phase_weight, public.pipeline_distance_weight FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.pipeline_phase_weight, public.pipeline_distance_weight TO authenticated, service_role;
ALTER TABLE public.pipeline_phase_weight ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_distance_weight ENABLE ROW LEVEL SECURITY;
CREATE POLICY pipeline_phase_weight_read ON public.pipeline_phase_weight FOR SELECT TO authenticated, service_role USING (true);
CREATE POLICY pipeline_distance_weight_read ON public.pipeline_distance_weight FOR SELECT TO authenticated, service_role USING (true);

-- ---------------------------------------------------------------------------
-- site_pipeline_matrix
--   p_latitude / p_longitude  the site coordinate (the one research treats as the site)
--   p_households              {"1mi":1897,"3mi":9482,"5min":520,"10min":9926} from the snapshot,
--                             so demographics keep ONE source and are not re-derived here
--   p_site_submit_id          scopes the pending (unreviewed) rows to this site's research runs
--   p_isochrones              optional {"5min_drive":<geojson>,"10min_drive":<geojson>}; when null
--                             the newest cached pull within 50 m of the coordinate is used
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.site_pipeline_matrix(
  p_latitude double precision,
  p_longitude double precision,
  p_households jsonb DEFAULT '{}'::jsonb,
  p_site_submit_id uuid DEFAULT NULL,
  p_isochrones jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_site        geography := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography;
  v_pt          geometry  := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326);
  v_iso         jsonb     := p_isochrones;
  v_iso_at      timestamptz;
  v_iso_m       numeric;
  v_d5          geometry;
  v_d10         geometry;
  v_result      jsonb;
  v_projects    jsonb;
  v_pending     jsonb;
  v_coverage    jsonb;
BEGIN
  IF v_iso IS NULL THEN
    SELECT isochrones, called_at,
           round(ST_Distance(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography, v_site)::numeric, 1)
      INTO v_iso, v_iso_at, v_iso_m
      FROM esri_enrichment_log
     WHERE success AND isochrones ? '10min_drive'
       AND ST_DWithin(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography, v_site, 50)
     -- NEAREST coordinate first, then newest. Drive-time sheds are point-sensitive: at Macon a pull
     -- 17 m away has a 27.0 sq mi 10-minute shed against 33.5 at the site coordinate, which silently
     -- moved two projects out of the band (docs/ESRI_DRIVE_TIME_POINT_SENSITIVITY.md).
     ORDER BY ST_Distance(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography, v_site),
              called_at DESC
     LIMIT 1;
  END IF;
  IF v_iso ? '5min_drive'  THEN v_d5  := ST_GeomFromGeoJSON(v_iso->>'5min_drive');  END IF;
  IF v_iso ? '10min_drive' THEN v_d10 := ST_GeomFromGeoJSON(v_iso->>'10min_drive'); END IF;

  -- Every human-reviewed project with units, placed, with both membership tests per catchment.
  WITH proj AS (
    SELECT
      m.id, m.project_name, m.total_housing_units AS units,
      COALESCE(NULLIF(m.effective_stage_name, ''), 'Unspecified') AS phase,
      m.address, m.source, m.discovery_source, m.centroid_lat, m.centroid_lng, m.created_at, m.updated_at,
      ST_Distance(v_site, ST_SetSRID(ST_MakePoint(m.centroid_lng, m.centroid_lat), 4326)::geography) / 1609.344 AS miles,
      ST_SetSRID(ST_MakePoint(m.centroid_lng, m.centroid_lat), 4326) AS pin,
      CASE WHEN m.geometry IS NOT NULL THEN m.geometry
           WHEN m.geometry_geojson IS NOT NULL THEN ST_GeomFromGeoJSON(m.geometry_geojson::text)
           ELSE NULL END AS shape
      FROM municipal_project_v m
     WHERE m.centroid_lat IS NOT NULL AND m.centroid_lng IS NOT NULL
       AND COALESCE(m.total_housing_units, 0) > 0
  ),
  placed AS (
    SELECT p.*,
      -- centroid membership
      (p.miles <= 1) AS c_1mi,
      (p.miles <= 3) AS c_3mi,
      (v_d5  IS NOT NULL AND ST_Contains(v_d5,  p.pin)) AS c_5min,
      (v_d10 IS NOT NULL AND ST_Contains(v_d10, p.pin)) AS c_10min,
      -- boundary membership: the drawn shape clipping the catchment (falls back to the pin)
      ST_Intersects(COALESCE(p.shape, p.pin), ST_Buffer(v_pt::geography, 1609.344)::geometry) AS i_1mi,
      ST_Intersects(COALESCE(p.shape, p.pin), ST_Buffer(v_pt::geography, 4828.03)::geometry)  AS i_3mi,
      (v_d5  IS NOT NULL AND ST_Intersects(COALESCE(p.shape, p.pin), v_d5))  AS i_5min,
      (v_d10 IS NOT NULL AND ST_Intersects(COALESCE(p.shape, p.pin), v_d10)) AS i_10min,
      (SELECT w.weight FROM pipeline_phase_weight w
        WHERE lower(w.phase) = lower(COALESCE(NULLIF(p.phase, ''), 'Unspecified')) ) AS phase_weight,
      (SELECT d.weight FROM pipeline_distance_weight d
        WHERE p.miles <= d.max_miles ORDER BY d.max_miles LIMIT 1) AS distance_weight
      FROM proj p
  ),
  bands(band, key) AS (VALUES ('1mi', 1), ('3mi', 2), ('5min', 3), ('10min', 4)),
  cell AS (
    SELECT b.band, b.key, pl.phase,
           sum(pl.units) FILTER (WHERE CASE b.band WHEN '1mi' THEN pl.c_1mi WHEN '3mi' THEN pl.c_3mi
                                                   WHEN '5min' THEN pl.c_5min ELSE pl.c_10min END) AS units_centroid,
           count(*)      FILTER (WHERE CASE b.band WHEN '1mi' THEN pl.c_1mi WHEN '3mi' THEN pl.c_3mi
                                                   WHEN '5min' THEN pl.c_5min ELSE pl.c_10min END) AS projects_centroid,
           sum(pl.units) FILTER (WHERE CASE b.band WHEN '1mi' THEN pl.i_1mi WHEN '3mi' THEN pl.i_3mi
                                                   WHEN '5min' THEN pl.i_5min ELSE pl.i_10min END) AS units_intersects,
           count(*)      FILTER (WHERE CASE b.band WHEN '1mi' THEN pl.i_1mi WHEN '3mi' THEN pl.i_3mi
                                                   WHEN '5min' THEN pl.i_5min ELSE pl.i_10min END) AS projects_intersects,
           -- weighted numerator: CENTROID membership, phase weight x distance weight
           sum(pl.units * COALESCE(pl.phase_weight, 0) * COALESCE(pl.distance_weight, 0))
             FILTER (WHERE CASE b.band WHEN '1mi' THEN pl.c_1mi WHEN '3mi' THEN pl.c_3mi
                                       WHEN '5min' THEN pl.c_5min ELSE pl.c_10min END) AS weighted_units
      FROM bands b CROSS JOIN placed pl
     GROUP BY b.band, b.key, pl.phase
  ),
  band_roll AS (
    SELECT c.band, c.key,
           jsonb_object_agg(c.phase, jsonb_build_object(
             'units_centroid', COALESCE(c.units_centroid, 0), 'projects_centroid', c.projects_centroid,
             'units_intersects', COALESCE(c.units_intersects, 0), 'projects_intersects', c.projects_intersects)) AS phases,
           COALESCE(sum(c.units_centroid), 0)   AS total_units_centroid,
           COALESCE(sum(c.units_intersects), 0) AS total_units_intersects,
           COALESCE(sum(c.weighted_units), 0)   AS weighted_units
      FROM cell c GROUP BY c.band, c.key
  )
  SELECT jsonb_agg(jsonb_build_object(
           'band', br.band,
           'households', (p_households->>br.band)::numeric,
           'phases', br.phases,
           'total_units_centroid', br.total_units_centroid,
           'total_units_intersects', br.total_units_intersects,
           'weighted_units', round(br.weighted_units, 1),
           'weighted_index', CASE WHEN COALESCE((p_households->>br.band)::numeric, 0) > 0
                                  THEN round(br.weighted_units / (p_households->>br.band)::numeric, 4) END
         ) ORDER BY br.key)
    INTO v_result FROM band_roll br;

  -- Every placed project, for the export. Not filtered by distance: the caller decides.
  SELECT jsonb_agg(jsonb_build_object(
           'name', p.project_name, 'units', p.units, 'phase', p.phase,
           'distance_mi', round(p.miles::numeric, 1),
           'drive_time_band', CASE WHEN v_d5 IS NOT NULL AND ST_Contains(v_d5, ST_SetSRID(ST_MakePoint(p.centroid_lng, p.centroid_lat), 4326)) THEN '5min'
                                   WHEN v_d10 IS NOT NULL AND ST_Contains(v_d10, ST_SetSRID(ST_MakePoint(p.centroid_lng, p.centroid_lat), 4326)) THEN '10min' END,
           'in_1mi_centroid', p.miles <= 1, 'in_3mi_centroid', p.miles <= 3,
           'address', p.address, 'lat', p.centroid_lat, 'lng', p.centroid_lng,
           'status_source', p.discovery_source, 'source', p.source,
           'phase_weight', p.phase_weight, 'distance_weight', p.distance_weight,
           -- Esri _CY may not yet include a very recently occupied project; surfaced, never adjusted for.
           'recently_completed_timing_unknown',
             CASE WHEN lower(p.phase) = 'recently completed' THEN true ELSE false END
         ) ORDER BY p.miles)
    INTO v_projects
    FROM (SELECT pr.*, (SELECT w.weight FROM pipeline_phase_weight w WHERE lower(w.phase) = lower(pr.phase)) phase_weight,
                 (SELECT d.weight FROM pipeline_distance_weight d WHERE pr.miles <= d.max_miles ORDER BY d.max_miles LIMIT 1) distance_weight
            FROM (SELECT m.project_name, m.total_housing_units units,
                         COALESCE(NULLIF(m.effective_stage_name, ''), 'Unspecified') phase,
                         m.address, m.centroid_lat, m.centroid_lng, m.source, m.discovery_source,
                         ST_Distance(v_site, ST_SetSRID(ST_MakePoint(m.centroid_lng, m.centroid_lat), 4326)::geography)/1609.344 miles
                    FROM municipal_project_v m
                   WHERE m.centroid_lat IS NOT NULL AND COALESCE(m.total_housing_units,0) > 0) pr
           WHERE pr.miles <= 10) p;

  -- Pending (agent-discovered, not human-reviewed): exported, never totalled. Not geocoded, so no distance.
  IF p_site_submit_id IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object(
             'name', s.project_name, 'units', s.total_housing_units, 'phase', 'unreviewed',
             'address', COALESCE(s.address, s.location_description), 'source', s.source,
             'collected_at', s.created_at))
      INTO v_pending
      FROM municipal_project_staging s
      JOIN research_run r ON r.id = s.research_run_id
     WHERE r.site_submit_id = p_site_submit_id AND s.approval_state = 'pending';
  END IF;

  -- Coverage: is a thin result a real finding, or has nobody collected here yet?
  SELECT jsonb_build_object(
           'projects_within_10mi', (SELECT count(*) FROM municipal_project_v m
                                     WHERE m.centroid_lat IS NOT NULL
                                       AND ST_DWithin(ST_SetSRID(ST_MakePoint(m.centroid_lng, m.centroid_lat),4326)::geography, v_site, 16093.4)),
           'last_collected_at', (SELECT max(m.created_at) FROM municipal_project_v m
                                  WHERE m.centroid_lat IS NOT NULL
                                    AND ST_DWithin(ST_SetSRID(ST_MakePoint(m.centroid_lng, m.centroid_lat),4326)::geography, v_site, 16093.4)),
           'research_runs_for_site', (SELECT count(*) FROM research_run r WHERE r.site_submit_id = p_site_submit_id),
           'last_research_run_at', (SELECT max(r.triggered_at) FROM research_run r WHERE r.site_submit_id = p_site_submit_id),
           'pending_rows', COALESCE(jsonb_array_length(v_pending), 0))
    INTO v_coverage;

  RETURN jsonb_build_object(
    'site', jsonb_build_object('latitude', p_latitude, 'longitude', p_longitude),
    'isochrones_from', v_iso_at,
    'isochrones_pulled_m_from_site', v_iso_m,
    'has_5min', v_d5 IS NOT NULL, 'has_10min', v_d10 IS NOT NULL,
    'bands', COALESCE(v_result, '[]'::jsonb),
    'projects', COALESCE(v_projects, '[]'::jsonb),
    'pending_unreviewed', COALESCE(v_pending, '[]'::jsonb),
    'coverage', v_coverage,
    'weights', jsonb_build_object(
      'phase', (SELECT jsonb_object_agg(phase, weight) FROM pipeline_phase_weight),
      'distance_bands', (SELECT jsonb_agg(jsonb_build_object('max_miles', max_miles, 'weight', weight) ORDER BY max_miles) FROM pipeline_distance_weight),
      'index_uses', 'centroid membership; Recently Completed weighted 0 because Esri _CY households already include occupied units'));
END;
$function$;

REVOKE ALL ON FUNCTION public.site_pipeline_matrix(double precision, double precision, jsonb, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_pipeline_matrix(double precision, double precision, jsonb, uuid, jsonb) TO authenticated, service_role;
