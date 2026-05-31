-- Starbucks store demographics (ESRI GeoEnrichment)
-- One row per store. Demographic snapshot used to find analogous stores when
-- evaluating a proposed site. Areas: 1mi + 3mi ring buffers, 5min + 10min drive times.
-- Metrics: population, median age, median HH income, "some college or higher" %
-- (of pop age 25+), and daytime workers ("employees").
--
-- Refreshed periodically (ESRI updates demographics ~annually). Written by the
-- batch ETL via the service role, which bypasses RLS. Read access is gated by the
-- same user_has_starbucks_access() function used by the rest of the Starbucks layer.

CREATE TABLE starbucks_store_demographics (
  store_number  TEXT PRIMARY KEY REFERENCES starbucks_store(store_number) ON DELETE CASCADE,

  -- Population
  pop_1_mile                          DOUBLE PRECISION,
  pop_3_mile                          DOUBLE PRECISION,
  pop_5min_drive                      DOUBLE PRECISION,
  pop_10min_drive                     DOUBLE PRECISION,

  -- Median age
  median_age_1_mile                   DOUBLE PRECISION,
  median_age_3_mile                   DOUBLE PRECISION,
  median_age_5min_drive               DOUBLE PRECISION,
  median_age_10min_drive              DOUBLE PRECISION,

  -- Median household income
  hh_income_median_1_mile             DOUBLE PRECISION,
  hh_income_median_3_mile             DOUBLE PRECISION,
  hh_income_median_5min_drive         DOUBLE PRECISION,
  hh_income_median_10min_drive        DOUBLE PRECISION,

  -- Education: % of pop age 25+ with some college or higher
  educ_some_college_plus_pct_1_mile        DOUBLE PRECISION,
  educ_some_college_plus_pct_3_mile        DOUBLE PRECISION,
  educ_some_college_plus_pct_5min_drive    DOUBLE PRECISION,
  educ_some_college_plus_pct_10min_drive   DOUBLE PRECISION,

  -- Employees (daytime working population, ESRI DPOPWRK_CY)
  employees_1_mile                    DOUBLE PRECISION,
  employees_3_mile                    DOUBLE PRECISION,
  employees_5min_drive                DOUBLE PRECISION,
  employees_10min_drive               DOUBLE PRECISION,

  -- Provenance
  enriched_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enriched_latitude   DOUBLE PRECISION,
  enriched_longitude  DOUBLE PRECISION,
  esri_raw            JSONB
);

-- RLS — SELECT gated by Starbucks access; writes via service role (ETL) bypass RLS.
ALTER TABLE starbucks_store_demographics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "starbucks_store_demographics_select"
  ON starbucks_store_demographics FOR SELECT TO authenticated
  USING (user_has_starbucks_access());
