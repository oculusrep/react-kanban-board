-- Nearby-store counts for the Site Analysis tool.
-- 1. count_nearby_stores_by_type(): DT/Cafe/DTO counts within 1mi + 3mi rings
--    (PostGIS distance) and within 5min + 10min drive isochrones (GeoJSON polygons
--    from the esri-geoenrich response). p_exclude_store omits a store from its own
--    count (used when the "subject" is an existing analog store).
-- 2. find_analogous_stores(): add latitude/longitude to the output so the caller can
--    place each analog and fetch its own isochrones.

CREATE OR REPLACE FUNCTION count_nearby_stores_by_type(
  p_lat        DOUBLE PRECISION,
  p_lng        DOUBLE PRECISION,
  p_iso_5min   JSONB DEFAULT NULL,
  p_iso_10min  JSONB DEFAULT NULL,
  p_exclude_store TEXT DEFAULT NULL
)
RETURNS TABLE (
  store_type   TEXT,
  within_1mi   INT,
  within_3mi   INT,
  within_5min  INT,
  within_10min INT
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH latest_type AS (
    SELECT DISTINCT ON (store_number) store_number, store_type
    FROM starbucks_snapshot ORDER BY store_number, snapshot_date DESC
  ),
  pt AS (SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326) AS g),
  iso5 AS (
    SELECT CASE WHEN p_iso_5min IS NOT NULL
                THEN ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(p_iso_5min::text), 4326)) END AS g
  ),
  iso10 AS (
    SELECT CASE WHEN p_iso_10min IS NOT NULL
                THEN ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(p_iso_10min::text), 4326)) END AS g
  ),
  stores AS (
    SELECT lt.store_type, ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326) AS g
    FROM starbucks_store s
    JOIN latest_type lt ON lt.store_number = s.store_number
    WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL
      AND (p_exclude_store IS NULL OR s.store_number <> p_exclude_store)
  )
  SELECT
    st.store_type,
    COUNT(*) FILTER (WHERE ST_DWithin(st.g::geography, pt.g::geography, 1609.34))::int  AS within_1mi,
    COUNT(*) FILTER (WHERE ST_DWithin(st.g::geography, pt.g::geography, 4828.03))::int  AS within_3mi,
    COUNT(*) FILTER (WHERE iso5.g  IS NOT NULL AND ST_Intersects(iso5.g,  st.g))::int   AS within_5min,
    COUNT(*) FILTER (WHERE iso10.g IS NOT NULL AND ST_Intersects(iso10.g, st.g))::int   AS within_10min
  FROM stores st CROSS JOIN pt CROSS JOIN iso5 CROSS JOIN iso10
  GROUP BY st.store_type
  ORDER BY st.store_type;
$$;

GRANT EXECUTE ON FUNCTION count_nearby_stores_by_type(DOUBLE PRECISION, DOUBLE PRECISION, JSONB, JSONB, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- find_analogous_stores: add latitude/longitude (return signature change -> drop+recreate)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS find_analogous_stores(JSONB, TEXT, TEXT, INT);

CREATE FUNCTION find_analogous_stores(
  p_subject    JSONB,
  p_store_type TEXT,
  p_state      TEXT DEFAULT NULL,
  p_limit      INT  DEFAULT 3
)
RETURNS TABLE (
  store_number  TEXT,
  store_name    TEXT,
  city          TEXT,
  state         TEXT,
  store_type    TEXT,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  match_score   NUMERIC,
  distance      DOUBLE PRECISION,
  demographics  JSONB
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH metrics(key) AS (
    VALUES
      ('pop_1_mile'),('pop_3_mile'),('pop_5min_drive'),('pop_10min_drive'),
      ('median_age_1_mile'),('median_age_3_mile'),('median_age_5min_drive'),('median_age_10min_drive'),
      ('hh_income_median_1_mile'),('hh_income_median_3_mile'),('hh_income_median_5min_drive'),('hh_income_median_10min_drive'),
      ('educ_some_college_plus_pct_1_mile'),('educ_some_college_plus_pct_3_mile'),('educ_some_college_plus_pct_5min_drive'),('educ_some_college_plus_pct_10min_drive'),
      ('employees_1_mile'),('employees_3_mile'),('employees_5min_drive'),('employees_10min_drive')
  ),
  latest_type AS (
    SELECT DISTINCT ON (sn.store_number) sn.store_number, sn.store_type
    FROM starbucks_snapshot sn
    ORDER BY sn.store_number, sn.snapshot_date DESC
  ),
  pool AS (
    SELECT
      d.store_number, s.store_name, s.city, s.state, lt.store_type,
      s.latitude, s.longitude,
      (to_jsonb(d) - 'esri_raw') AS dj
    FROM starbucks_store_demographics d
    JOIN starbucks_store s  ON s.store_number = d.store_number
    JOIN latest_type lt     ON lt.store_number = d.store_number
    WHERE lt.store_type = p_store_type
      AND (p_state IS NULL OR s.state = p_state)
  ),
  pool_long AS (
    SELECT p.store_number, m.key, (p.dj ->> m.key)::FLOAT AS val
    FROM pool p CROSS JOIN metrics m
  ),
  stats AS (
    SELECT key, NULLIF(stddev_pop(val), 0) AS sd
    FROM pool_long GROUP BY key
  ),
  dist AS (
    SELECT
      pl.store_number,
      sqrt(SUM(
        CASE
          WHEN st.sd IS NULL OR (p_subject ->> pl.key) IS NULL OR pl.val IS NULL THEN 0
          ELSE (((pl.val - (p_subject ->> pl.key)::FLOAT) / st.sd)) ^ 2
        END
      )) AS dist
    FROM pool_long pl JOIN stats st ON st.key = pl.key
    GROUP BY pl.store_number
  )
  SELECT
    p.store_number, p.store_name, p.city, p.state, p.store_type,
    p.latitude, p.longitude,
    ROUND((100.0 / (1.0 + d.dist / sqrt(20.0)))::NUMERIC, 1) AS match_score,
    d.dist AS distance,
    p.dj AS demographics
  FROM dist d JOIN pool p ON p.store_number = d.store_number
  ORDER BY d.dist ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION find_analogous_stores(JSONB, TEXT, TEXT, INT) TO authenticated;
