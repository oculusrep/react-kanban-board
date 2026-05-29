-- Starbucks analog-store finder
-- 1. Adds a `state` column to starbucks_store, backfilled from the `market` label
--    (e.g. "Atlanta-Sandy Springs-Roswell, GA" -> GA, "Tallahassee, FL" -> FL).
--    Border CBSAs like "Augusta-Richmond County, GA-SC" resolve to the first code (GA);
--    refine manually if a specific store needs the other state.
-- 2. find_analogous_stores(): given a proposed site's demographic profile, store type,
--    and state, returns the N most demographically similar existing stores. Equal-weight
--    z-score (standardized) Euclidean distance across all 5 metrics x 4 trade areas.

-- ---------------------------------------------------------------------------
-- 1. state column
-- ---------------------------------------------------------------------------
ALTER TABLE starbucks_store ADD COLUMN IF NOT EXISTS state TEXT;

UPDATE starbucks_store
SET state = UPPER(SUBSTRING(market FROM ',\s*([A-Za-z]{2})'))
WHERE market IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_starbucks_store_state ON starbucks_store (state);

-- ---------------------------------------------------------------------------
-- 2. find_analogous_stores
-- p_subject: jsonb of the proposed site's demographics, keys matching the 20
--   metric columns (e.g. {"pop_1_mile": 8360, "median_age_3_mile": 35.9, ...}).
-- p_store_type: 'DT' | 'Cafe' | 'DTO' (matched against the store's latest snapshot).
-- p_state: filter to stores in this state (NULL = no state filter).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_analogous_stores(
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
      d.store_number,
      s.store_name,
      s.city,
      s.state,
      lt.store_type,
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
    FROM pool_long
    GROUP BY key
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
    FROM pool_long pl
    JOIN stats st ON st.key = pl.key
    GROUP BY pl.store_number
  )
  SELECT
    p.store_number,
    p.store_name,
    p.city,
    p.state,
    p.store_type,
    ROUND((100.0 / (1.0 + d.dist / sqrt(20.0)))::NUMERIC, 1) AS match_score,
    d.dist AS distance,
    p.dj AS demographics
  FROM dist d
  JOIN pool p ON p.store_number = d.store_number
  ORDER BY d.dist ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION find_analogous_stores(JSONB, TEXT, TEXT, INT) TO authenticated;
