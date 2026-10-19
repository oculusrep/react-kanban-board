-- Which drive-time shed each point falls in, for generators.csv.
--
-- site_pipeline_matrix already classifies housing projects against the cached 5- and 10-minute
-- isochrones. Generators need the same answer for arbitrary points, and they must use the SAME
-- isochrone the pipeline used — nearest cached pull first, then newest — or a church would sit in
-- the 10-minute band on one file and outside it on another. Same selection, same 50 m guard.

CREATE OR REPLACE FUNCTION public.site_drive_time_bands(
  p_latitude double precision,
  p_longitude double precision,
  p_points jsonb,                       -- [{"id":"...","lat":33.1,"lng":-84.2}, ...]
  p_isochrones jsonb DEFAULT NULL)
 RETURNS jsonb                          -- {"isochrones_from":..., "bands":{"<id>":"5min"|"10min"}}
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_site   geography := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography;
  v_iso    jsonb := p_isochrones;
  v_iso_at timestamptz;
  v_iso_m  numeric;
  v_d5     geometry;
  v_d10    geometry;
  v_bands  jsonb;
BEGIN
  IF v_iso IS NULL THEN
    SELECT isochrones, called_at,
           round(ST_Distance(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography, v_site)::numeric, 1)
      INTO v_iso, v_iso_at, v_iso_m
      FROM esri_enrichment_log
     WHERE success AND isochrones ? '10min_drive'
       AND ST_DWithin(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography, v_site, 50)
     ORDER BY ST_Distance(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography, v_site),
              called_at DESC
     LIMIT 1;
  END IF;
  IF v_iso ? '5min_drive'  THEN v_d5  := ST_GeomFromGeoJSON(v_iso->>'5min_drive');  END IF;
  IF v_iso ? '10min_drive' THEN v_d10 := ST_GeomFromGeoJSON(v_iso->>'10min_drive'); END IF;

  SELECT COALESCE(jsonb_object_agg(x.id, x.band) FILTER (WHERE x.band IS NOT NULL), '{}'::jsonb)
    INTO v_bands
    FROM (
      SELECT p->>'id' AS id,
             CASE
               WHEN v_d5 IS NOT NULL AND ST_Contains(v_d5,
                      ST_SetSRID(ST_MakePoint((p->>'lng')::double precision, (p->>'lat')::double precision), 4326))
                 THEN '5min'
               WHEN v_d10 IS NOT NULL AND ST_Contains(v_d10,
                      ST_SetSRID(ST_MakePoint((p->>'lng')::double precision, (p->>'lat')::double precision), 4326))
                 THEN '10min'
               ELSE NULL
             END AS band
        FROM jsonb_array_elements(COALESCE(p_points, '[]'::jsonb)) p
       WHERE p ? 'id' AND (p->>'lat') IS NOT NULL AND (p->>'lng') IS NOT NULL
    ) x;

  RETURN jsonb_build_object(
    'isochrones_from', CASE WHEN p_isochrones IS NOT NULL THEN 'caller'
                            WHEN v_iso IS NULL THEN NULL
                            ELSE 'esri_enrichment_log ' || to_char(v_iso_at, 'YYYY-MM-DD') END,
    'isochrones_pulled_m_from_site', v_iso_m,
    'bands', v_bands);
END;
$function$;

REVOKE ALL ON FUNCTION public.site_drive_time_bands(double precision, double precision, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_drive_time_bands(double precision, double precision, jsonb, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.site_drive_time_bands(double precision, double precision, jsonb, jsonb) IS
  'Drive-time band (5min/10min) for arbitrary points, using the same cached isochrone selection as site_pipeline_matrix.';
