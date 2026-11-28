-- Orientation BOUNDARY for an UNPLACED municipal project: the municipality's
-- outline, plus the exact bounding box of that outline.
--
-- Supersedes municipal_project_orientation_bounds(uuid) for the map client. That
-- function returned four numbers on the reasoning that a county MULTIPOLYGON is
-- too large to ship. The reasoning held, but it left the reviewer with a viewport
-- change and nothing to look at: no visible anchor for where to draw. Simplifying
-- the ring at ~55m answers the size objection directly — Paulding County goes
-- from 21KB to 0.9KB, and the largest municipality on file (Cumming) from 84KB to
-- 5.5KB — so the outline can be drawn for the cost the box used to save.
--
-- Still VIEW STATE ONLY. Nothing is written, the record stays unplaced, and no
-- coordinate is derived from this. The simplified ring is for DISPLAY ONLY and is
-- never a source of truth for placement — placement comes from a drawn boundary,
-- a fetched parcel, or a dropped pin, exactly as before.
--
-- The bounding box is taken from the FULL geometry, not the simplified one, so
-- the viewport is exact even though the drawn ring is approximate.
--
-- municipal_project links to `municipality`, which has no geometry; the boundaries
-- live on `boundary_municipality`. There is no FK between them, so they are joined
-- on name, the same join municipal_project_orientation_bounds uses. Verified at
-- the time of writing: all 14 unplaced records resolve a boundary this way, with
-- no unmatched names.

CREATE OR REPLACE FUNCTION municipal_project_orientation_boundary(p_id uuid)
RETURNS TABLE (municipality_name text,
               boundary_geojson jsonb,
               min_lat double precision, min_lng double precision,
               max_lat double precision, max_lng double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.name,
         ST_AsGeoJSON(s.display_geom)::jsonb,
         ST_YMin(e.env), ST_XMin(e.env), ST_YMax(e.env), ST_XMax(e.env)
  FROM municipal_project mp
  JOIN municipality m ON m.id = mp.municipality_id
  JOIN LATERAL (
    -- Most specific first: a city boundary beats the county it sits in. Ordering
    -- by area ascending picks the tighter shape when both carry the same name.
    SELECT bm.geometry
      FROM boundary_municipality bm
     WHERE lower(bm.name) = lower(m.name)
       AND bm.geometry IS NOT NULL
     ORDER BY ST_Area(bm.geometry) ASC
     LIMIT 1
  ) b ON TRUE
  -- ~55m at this latitude. Enough to read the shape of a county or a city limit,
  -- small enough to send on every open. Falls back to the full ring if the
  -- tolerance would collapse a small boundary to nothing.
  CROSS JOIN LATERAL (
    SELECT CASE
             WHEN g IS NULL OR ST_IsEmpty(g) THEN b.geometry
             ELSE g
           END AS display_geom
      FROM (SELECT ST_SimplifyPreserveTopology(b.geometry, 0.0005) AS g) t
  ) s
  -- Envelope of the FULL geometry: the viewport must not inherit the display
  -- simplification.
  CROSS JOIN LATERAL (SELECT ST_Envelope(b.geometry) AS env) e
  -- Orientation is only ever for a record with no location of its own. A placed
  -- record is framed by its own boundary or pin, never by its whole municipality.
  WHERE mp.id = p_id AND mp.centroid IS NULL;
$$;

COMMENT ON FUNCTION municipal_project_orientation_boundary(uuid) IS
  'Simplified outline + exact bounding box of an unplaced project''s municipality, '
  'for map orientation only. Returns no row for a placed project. Writes nothing. '
  'The outline is display-only and is never a placement source.';

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON FUNCTION municipal_project_orientation_boundary(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION municipal_project_orientation_boundary(uuid) TO authenticated;
