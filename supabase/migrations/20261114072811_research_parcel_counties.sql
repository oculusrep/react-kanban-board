-- Parcel-adapter check for research runs / sweeps: the counties a run's
-- municipalities sit in (a city maps to the county containing its centroid),
-- with how many of the run's staged records carry parcel IDs and up to 3 sample
-- IDs. The approval view compares the counties against COUNTY_ADAPTERS
-- (src/services/parcelFabric.ts) and shows a notice + "Copy cc prompt" for each
-- county with no adapter. Read-only; never blocks a run.
-- SECURITY INVOKER: staging RLS applies (internal users only).

CREATE FUNCTION public.get_research_parcel_counties(p_run_ids uuid[])
RETURNS TABLE (
  county_id uuid, county_name text, state text,
  municipalities text[], records_with_parcels integer, sample_parcel_ids text[]
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH munis AS (
    SELECT DISTINCT ci.boundary_municipality_id AS bm_id
      FROM research_checklist_item ci
     WHERE ci.research_run_id = ANY(p_run_ids)
  ), mc AS (
    SELECT m.bm_id, bm.name, bm.state,
           CASE WHEN bm.kind = 'county' THEN bm.id
                ELSE (SELECT c.id FROM boundary_municipality c
                       WHERE c.kind = 'county' AND c.state = bm.state
                         AND ST_Contains(c.geometry, bm.centroid)
                       LIMIT 1)
           END AS county_id
      FROM munis m JOIN boundary_municipality bm ON bm.id = m.bm_id
  ), recs AS (
    SELECT mc.county_id, s.parcel_numbers, s.created_at
      FROM municipal_project_staging s
      JOIN mc ON mc.bm_id = s.boundary_municipality_id
     WHERE s.research_run_id = ANY(p_run_ids)
       AND s.approval_state <> 'rejected'
       AND cardinality(coalesce(s.parcel_numbers, '{}')) > 0
  )
  SELECT c.id, c.name, c.state,
         array_agg(DISTINCT mc.name ORDER BY mc.name),
         (SELECT count(*)::int FROM recs WHERE recs.county_id = c.id),
         (SELECT array_agg(x) FROM (
            SELECT DISTINCT btrim(p) AS x
              FROM recs, unnest(recs.parcel_numbers) AS p
             WHERE recs.county_id = c.id AND btrim(p) <> ''
             LIMIT 3) t)
    FROM mc JOIN boundary_municipality c ON c.id = mc.county_id
   GROUP BY c.id, c.name, c.state
   ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION public.get_research_parcel_counties(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_research_parcel_counties(uuid[]) TO authenticated, service_role;
