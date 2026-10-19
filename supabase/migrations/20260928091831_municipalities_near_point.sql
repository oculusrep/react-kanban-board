-- Which municipalities a site's KML export should cover.
--
-- municipality has no boundary column, so "near the site" can only mean "holds a project near the
-- site". The radius decides WHICH municipalities get a file; what goes inside one is that
-- municipality's whole project set, matching the export button.

CREATE OR REPLACE FUNCTION public.municipalities_near_point(
  p_latitude      double precision,
  p_longitude     double precision,
  p_radius_miles  numeric DEFAULT 10)
 RETURNS TABLE (municipality_id uuid, municipality_name text, projects_in_radius bigint, nearest_miles numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.id, m.name, count(*),
         round(min(ST_Distance(
           ST_SetSRID(ST_MakePoint(p.centroid_lng, p.centroid_lat), 4326)::geography,
           ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography) / 1609.344)::numeric, 1)
    FROM municipal_project_v p
    JOIN municipality m ON m.id = p.municipality_id
   WHERE p.centroid_lat IS NOT NULL AND p.centroid_lng IS NOT NULL
     AND ST_DWithin(
           ST_SetSRID(ST_MakePoint(p.centroid_lng, p.centroid_lat), 4326)::geography,
           ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
           p_radius_miles * 1609.344)
   GROUP BY m.id, m.name
   ORDER BY 4;
$function$;

REVOKE ALL ON FUNCTION public.municipalities_near_point(double precision, double precision, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipalities_near_point(double precision, double precision, numeric) TO authenticated, service_role;
