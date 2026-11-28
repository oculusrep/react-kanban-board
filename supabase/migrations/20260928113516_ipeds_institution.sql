-- Higher education, bulk-loaded. Same shape as the PSS private-school load.
--
-- Why a table and not an API call in the run path: a third-party API that fails mid-run fails
-- SILENTLY AS ZERO COLLEGES, which reads exactly like "there is no higher education here" — the
-- same failure mode that made the deep pass report 860 units when the pipeline was 1,732. A
-- deterministic table either has rows or is provably empty.
--
-- Deliberately an enrollment number, not a profile. One count column, in the same unit as the K-12
-- rows (total headcount), or the banded school totals are adding unlike things. FTE, the
-- full-time/part-time split and dormitory capacity beyond a residential/commuter read are left out.
--
-- WHAT THIS CANNOT SEE: IPEDS is keyed on institutions that report their own UNITID. A satellite
-- or instructional site of a larger system that does not report separately is absent, and neither
-- IPEDS nor the Urban Institute API exposes an "additional locations" dataset — checked
-- 2026-09-28 against the full endpoint index. That gap is closed, if at all, by the deep pass's
-- two-search allowance for satellites, not by this table.

CREATE TABLE IF NOT EXISTS public.ipeds_institution (
  unitid                integer PRIMARY KEY,
  name                  text NOT NULL,
  street                text,
  city                  text,
  state                 text,
  zip                   text,
  latitude              double precision,
  longitude             double precision,
  -- 1 public, 2 private not-for-profit, 3 private for-profit
  control               smallint,
  -- 1 four-year+, 2 at least 2 but less than 4, 3 less than 2 years
  institution_level     smallint,
  degree_granting       boolean,
  system_name           text,
  /** Total headcount, undergraduate + graduate, the figure that goes in the count column. */
  headcount_total       integer,
  headcount_undergrad   integer,
  headcount_graduate    integer,
  /** The year the ENROLLMENT is for — not when the loader ran. */
  enrollment_year       smallint,
  oncampus_housing      boolean,
  dormitory_capacity    integer,
  directory_year        smallint,
  loaded_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ipeds_institution_geo ON public.ipeds_institution (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ipeds_institution_state ON public.ipeds_institution (state);

COMMENT ON TABLE public.ipeds_institution IS
  'IPEDS higher-education institutions: location from the directory, enrollment from the Urban Institute API, joined on UNITID. Annual refresh. Satellites that do not report their own UNITID are absent.';
COMMENT ON COLUMN public.ipeds_institution.headcount_total IS
  'Undergraduate + graduate headcount, same unit as the K-12 enrollment column.';
COMMENT ON COLUMN public.ipeds_institution.enrollment_year IS
  'The year the enrollment figure describes, carried per row so a stale institution is visible.';

REVOKE ALL ON TABLE public.ipeds_institution FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.ipeds_institution TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.ipeds_institution TO service_role;
ALTER TABLE public.ipeds_institution ENABLE ROW LEVEL SECURITY;
CREATE POLICY ipeds_institution_read ON public.ipeds_institution FOR SELECT TO authenticated, service_role USING (true);

-- ---------------------------------------------------------------------------
-- Higher-ed institutions near a point, shaped to slot in beside the K-12 rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ipeds_near_point(
  p_latitude     double precision,
  p_longitude    double precision,
  p_radius_miles numeric DEFAULT 5)
 RETURNS TABLE (
   unitid integer, name text, street text, city text, state text, zip text,
   latitude double precision, longitude double precision,
   enrollment integer, enrollment_year smallint, school_level text,
   residential boolean, dormitory_capacity integer, system_name text,
   distance_miles numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT i.unitid, i.name, i.street, i.city, i.state, i.zip, i.latitude, i.longitude,
         i.headcount_total, i.enrollment_year,
         CASE
           WHEN i.institution_level = 1 AND i.headcount_graduate > 0 THEN 'University'
           WHEN i.institution_level = 1 THEN 'College'
           WHEN i.institution_level IN (2, 3) THEN 'Technical College'
           ELSE 'College'
         END,
         i.oncampus_housing,
         i.dormitory_capacity,
         nullif(i.system_name, ''),
         round((ST_Distance(
           ST_SetSRID(ST_MakePoint(i.longitude, i.latitude), 4326)::geography,
           ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography) / 1609.344)::numeric, 1)
    FROM ipeds_institution i
   WHERE i.latitude IS NOT NULL AND i.longitude IS NOT NULL
     AND ST_DWithin(
           ST_SetSRID(ST_MakePoint(i.longitude, i.latitude), 4326)::geography,
           ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
           p_radius_miles * 1609.344)
   ORDER BY 15;
$function$;

REVOKE ALL ON FUNCTION public.ipeds_near_point(double precision, double precision, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ipeds_near_point(double precision, double precision, numeric) TO authenticated, service_role;
