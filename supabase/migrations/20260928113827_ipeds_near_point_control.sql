-- Add control (1 public / 2 private NFP / 3 private FP) to ipeds_near_point, so higher-ed rows can
-- fill schools.csv's public_private column honestly instead of leaving it blank.
--
-- DROP first: the return type changes, and CREATE OR REPLACE cannot alter a function's OUT columns.
-- Rebuilt from the LIVE definition (pg_get_functiondef), never from the file that created it.

DROP FUNCTION IF EXISTS public.ipeds_near_point(double precision, double precision, numeric);

CREATE OR REPLACE FUNCTION public.ipeds_near_point(p_latitude double precision, p_longitude double precision, p_radius_miles numeric DEFAULT 5)
 RETURNS TABLE(unitid integer, name text, street text, city text, state text, zip text, latitude double precision, longitude double precision, enrollment integer, enrollment_year smallint, school_level text, residential boolean, dormitory_capacity integer, system_name text, control smallint, distance_miles numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
         i.control,
         round((ST_Distance(
           ST_SetSRID(ST_MakePoint(i.longitude, i.latitude), 4326)::geography,
           ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography) / 1609.344)::numeric, 1)
    FROM ipeds_institution i
   WHERE i.latitude IS NOT NULL AND i.longitude IS NOT NULL
     AND ST_DWithin(
           ST_SetSRID(ST_MakePoint(i.longitude, i.latitude), 4326)::geography,
           ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
           p_radius_miles * 1609.344)
   ORDER BY 16;
$function$;


REVOKE ALL ON FUNCTION public.ipeds_near_point(double precision, double precision, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ipeds_near_point(double precision, double precision, numeric) TO authenticated, service_role;
