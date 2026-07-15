-- Soft dedupe signal: find already-committed municipal_project records whose
-- centroid sits within a small radius of a staged candidate's geocoded location.
--
-- Context (feature/research-dedupe-safety-net): the hard match in
-- submit_research_report (normalized name/address, plus permit_url) produces
-- matched_existing_id and is the basis for the "MATCHES EXISTING" badge. But
-- P&Z records and news bleed across date/jurisdiction boundaries, and the same
-- physical project can resurface under a different name AND a different address
-- with NO permit_url to tie them together — defeating every hard probe.
--
-- Proximity is the cheapest strong same-project signal that survives all of
-- that: municipal_project already carries an indexed centroid (Point,4326), and
-- two records ~150m apart are almost always the same development. This is
-- deliberately a SOFT signal — surfaced for the reviewer to judge, never
-- auto-rejected — because dense areas can legitimately host distinct nearby
-- projects. It is municipality-agnostic on purpose (kills the annexation bleed).
--
-- Read-only, additive, no writes: the approval UI geocodes its pending,
-- not-yet-hard-matched rows at review-load and passes the points in. Candidates
-- are not geocoded until approval in the normal flow, so coordinates come from
-- the caller rather than a stored column — keeping this a pure lookup with no
-- change to the staging schema or the submit/approve write paths.
--
-- p_points shape: [{ "staging_id": "<uuid>", "lat": <num>, "lng": <num> }, ...]

CREATE OR REPLACE FUNCTION public.find_nearby_municipal_projects(
  p_points        jsonb,
  p_radius_meters numeric DEFAULT 150
) RETURNS TABLE(
  staging_id            uuid,
  municipal_project_id  uuid,
  project_name          text,
  municipality_name     text,
  address               text,
  distance_m            numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (pt->>'staging_id')::uuid AS staging_id,
    mp.id                     AS municipal_project_id,
    mp.project_name,
    muni.name                 AS municipality_name,
    mp.address,
    ROUND(
      ST_Distance(
        mp.centroid::geography,
        ST_SetSRID(ST_MakePoint((pt->>'lng')::float8, (pt->>'lat')::float8), 4326)::geography
      )::numeric, 1
    ) AS distance_m
  FROM jsonb_array_elements(p_points) AS pt
  JOIN municipal_project mp
    ON mp.centroid IS NOT NULL
   AND ST_DWithin(
         mp.centroid::geography,
         ST_SetSRID(ST_MakePoint((pt->>'lng')::float8, (pt->>'lat')::float8), 4326)::geography,
         p_radius_meters
       )
  LEFT JOIN municipality muni ON muni.id = mp.municipality_id
  WHERE pt->>'lat' IS NOT NULL
    AND pt->>'lng' IS NOT NULL
  ORDER BY (pt->>'staging_id')::uuid, distance_m;
$$;

-- Read-only lookup over projects already visible on the map; safe for the
-- authenticated reviewer session (the approval modal runs as the user, not
-- service_role).
REVOKE ALL ON FUNCTION public.find_nearby_municipal_projects(jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_nearby_municipal_projects(jsonb, numeric) TO authenticated, service_role;
