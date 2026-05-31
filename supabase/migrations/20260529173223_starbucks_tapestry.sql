-- Tapestry segment for stores + analog-finder Tapestry support, and a helper that
-- counts nearby stores around an existing store using its stored isochrones
-- (avoids re-calling ESRI for each analog).

-- 1. Tapestry columns, backfilled from the stored ESRI response (1-mile dominant segment).
ALTER TABLE starbucks_store_demographics ADD COLUMN IF NOT EXISTS tapestry_code     TEXT;
ALTER TABLE starbucks_store_demographics ADD COLUMN IF NOT EXISTS tapestry_name     TEXT;
ALTER TABLE starbucks_store_demographics ADD COLUMN IF NOT EXISTS tapestry_lifemode TEXT;

UPDATE starbucks_store_demographics
SET tapestry_code     = esri_raw#>>'{tapestry,results,0,value,FeatureSet,0,features,0,attributes,TSEGCODE}',
    tapestry_name     = esri_raw#>>'{tapestry,results,0,value,FeatureSet,0,features,0,attributes,TSEGNAME}',
    tapestry_lifemode = esri_raw#>>'{tapestry,results,0,value,FeatureSet,0,features,0,attributes,TLIFENAME}'
WHERE esri_raw IS NOT NULL;

-- 2. Nearby counts for an existing store, using its own stored drive-time isochrones.
CREATE OR REPLACE FUNCTION count_nearby_for_store(p_store_number TEXT)
RETURNS TABLE (
  store_type   TEXT,
  within_1mi   INT,
  within_3mi   INT,
  within_5min  INT,
  within_10min INT
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH src AS (
    SELECT
      sk.latitude  AS lat,
      sk.longitude AS lng,
      CASE WHEN d.esri_raw #> '{driveTime,results,0,value,FeatureSet,0,features,0,geometry,rings}' IS NOT NULL
           THEN jsonb_build_object('type','Polygon','coordinates',
                  d.esri_raw #> '{driveTime,results,0,value,FeatureSet,0,features,0,geometry,rings}') END AS iso5,
      CASE WHEN d.esri_raw #> '{driveTime,results,0,value,FeatureSet,0,features,1,geometry,rings}' IS NOT NULL
           THEN jsonb_build_object('type','Polygon','coordinates',
                  d.esri_raw #> '{driveTime,results,0,value,FeatureSet,0,features,1,geometry,rings}') END AS iso10
    FROM starbucks_store_demographics d
    JOIN starbucks_store sk ON sk.store_number = d.store_number
    WHERE d.store_number = p_store_number
  )
  SELECT c.*
  FROM src, LATERAL count_nearby_stores_by_type(src.lat, src.lng, src.iso5, src.iso10, p_store_number) c;
$$;

GRANT EXECUTE ON FUNCTION count_nearby_for_store(TEXT) TO authenticated;

-- 3. find_analogous_stores: optional Tapestry filter + return the segment.
DROP FUNCTION IF EXISTS find_analogous_stores(JSONB, TEXT, TEXT, INT);

CREATE FUNCTION find_analogous_stores(
  p_subject       JSONB,
  p_store_type    TEXT,
  p_state         TEXT DEFAULT NULL,
  p_limit         INT  DEFAULT 3,
  p_tapestry_code TEXT DEFAULT NULL
)
RETURNS TABLE (
  store_number   TEXT,
  store_name     TEXT,
  city           TEXT,
  state          TEXT,
  store_type     TEXT,
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  tapestry_code  TEXT,
  tapestry_name  TEXT,
  match_score    NUMERIC,
  distance       DOUBLE PRECISION,
  demographics   JSONB
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
      s.latitude, s.longitude, d.tapestry_code, d.tapestry_name,
      (to_jsonb(d) - 'esri_raw') AS dj
    FROM starbucks_store_demographics d
    JOIN starbucks_store s  ON s.store_number = d.store_number
    JOIN latest_type lt     ON lt.store_number = d.store_number
    WHERE lt.store_type = p_store_type
      AND (p_state IS NULL OR s.state = p_state)
      AND (p_tapestry_code IS NULL OR d.tapestry_code = p_tapestry_code)
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
    p.latitude, p.longitude, p.tapestry_code, p.tapestry_name,
    ROUND((100.0 / (1.0 + d.dist / sqrt(20.0)))::NUMERIC, 1) AS match_score,
    d.dist AS distance,
    p.dj AS demographics
  FROM dist d JOIN pool p ON p.store_number = d.store_number
  ORDER BY d.dist ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION find_analogous_stores(JSONB, TEXT, TEXT, INT, TEXT) TO authenticated;
