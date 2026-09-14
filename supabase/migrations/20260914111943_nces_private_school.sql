-- NCES Private School Universe Survey (PSS) — per-school rows for radius queries.
--
-- Why a table: private-school ENROLLMENT is not exposed by any NCES API. The NCES
-- EDGE ArcGIS service has private school locations but no enrollment; enrollment
-- exists only in the PSS public-use bulk file (pss2324_pu_csv.zip, 3.8 MB, 22,510
-- schools). Loading it once beats downloading and parsing the zip on every tool call.
-- Public schools stay on the live ArcGIS services (locations + characteristics).
--
-- Loaded by scripts/nces/load_pss.py — data, not schema; re-run it for a new vintage.
-- PSS is biennial, so survey_year is part of the key and vintages can coexist.
--
-- Read by ovis-site-research's query_nearby_schools tool (service role). Public data,
-- so authenticated users may read it; nobody writes through the API.

CREATE TABLE public.nces_private_school (
  ppin                     text             NOT NULL,  -- PSS school id
  survey_year              text             NOT NULL,  -- e.g. '2023-2024'
  school_name              text             NOT NULL,  -- PINST
  address                  text,                        -- physical location, else mailing
  city                     text,
  state                    text,
  zip                      text,
  address_is_mailing       boolean          NOT NULL,  -- true when PSS gave no separate physical location
  county_name              text,                        -- PCNTNM
  latitude                 double precision NOT NULL,  -- LATITUDE24
  longitude                double precision NOT NULL,  -- LONGITUDE24
  enrollment_k12_ungraded  integer,                     -- NUMSTUDS: K-12 + ungraded, EXCLUDES pre-K
  level_code               smallint,                    -- LEVEL: 1 elementary, 2 secondary, 3 combined
  lowest_grade_code        smallint,                    -- LOGR2024 (1 ungraded, 2 PK, 3 K, 4 TK, 5 T1, 6-17 = grades 1-12)
  highest_grade_code       smallint,                    -- HIGR2024 (same scheme)
  orientation_code         smallint,                    -- ORIENT (religious/nonsectarian; raw code)
  typology_code            smallint,                    -- TYPOLOGY (NCES 9-category; raw code)
  source_file              text             NOT NULL,
  loaded_at                timestamptz      NOT NULL DEFAULT now(),
  PRIMARY KEY (ppin, survey_year),
  CONSTRAINT nces_private_school_level_chk CHECK (level_code IS NULL OR level_code IN (1, 2, 3)),
  CONSTRAINT nces_private_school_grade_chk CHECK (
    (lowest_grade_code  IS NULL OR lowest_grade_code  BETWEEN 1 AND 17) AND
    (highest_grade_code IS NULL OR highest_grade_code BETWEEN 1 AND 17)
  ),
  CONSTRAINT nces_private_school_coord_chk CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180),
  CONSTRAINT nces_private_school_enrollment_chk CHECK (enrollment_k12_ungraded IS NULL OR enrollment_k12_ungraded >= 0)
);

COMMENT ON TABLE public.nces_private_school IS
  'NCES Private School Universe Survey, one row per school per survey year. Loaded from the PSS public-use CSV by scripts/nces/load_pss.py. Enrollment excludes pre-K.';
COMMENT ON COLUMN public.nces_private_school.enrollment_k12_ungraded IS
  'PSS NUMSTUDS: K-12 plus ungraded students. Excludes prekindergarten, so it is not directly comparable to CCD public-school TOTAL (which includes PK).';
COMMENT ON COLUMN public.nces_private_school.address_is_mailing IS
  'PSS reports a separate physical location (PL_*) only when it differs from the mailing address. False = physical location used; true = mailing address (same as physical, or physical not reported).';

-- Radius queries prefilter on a lat/lng bounding box within one vintage.
CREATE INDEX nces_private_school_year_latlng_idx
  ON public.nces_private_school (survey_year, latitude, longitude);

ALTER TABLE public.nces_private_school ENABLE ROW LEVEL SECURITY;

CREATE POLICY nces_private_school_read
  ON public.nces_private_school
  FOR SELECT TO authenticated
  USING (true);
