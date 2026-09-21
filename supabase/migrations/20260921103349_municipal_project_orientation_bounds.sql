-- Orientation bounds for an UNPLACED municipal project: the bounding box of the
-- municipality it belongs to.
--
-- Purely so the map can show the reviewer roughly where to look while they place
-- a record by hand. This is VIEW STATE ONLY — nothing is written, and the record
-- stays unplaced until a boundary is drawn, a parcel fetched, or a pin dropped.
-- It cannot reintroduce a fabricated location because it never touches the row.
--
-- Returns a BOX, not the geometry: a county MULTIPOLYGON is large, and the client
-- only needs four numbers to call fitBounds. Sending the polygon would be tens of
-- kilobytes per open for no benefit.
--
-- municipal_project links to `municipality`, which has no geometry; the boundaries
-- live on `boundary_municipality`. There is no FK between them, so they are joined
-- on name — checked against the real data: all 22 unplaced records that have a
-- municipality resolve this way, with no unmatched names. The remaining 2 unplaced
-- records have no municipality at all and correctly get nothing back.

CREATE OR REPLACE FUNCTION municipal_project_orientation_bounds(p_id uuid)
RETURNS TABLE (min_lat double precision, min_lng double precision,
               max_lat double precision, max_lng double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ST_YMin(e.env), ST_XMin(e.env), ST_YMax(e.env), ST_XMax(e.env)
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
  CROSS JOIN LATERAL (SELECT ST_Envelope(b.geometry) AS env) e
  -- Orientation is only ever for a record with no location of its own. A placed
  -- record is framed by its own boundary or pin, never by its whole municipality.
  WHERE mp.id = p_id AND mp.centroid IS NULL;
$$;

COMMENT ON FUNCTION municipal_project_orientation_bounds(uuid) IS
  'Bounding box of an unplaced project''s municipality, for map orientation only. '
  'Returns no row for a placed project. Writes nothing.';

REVOKE ALL ON FUNCTION municipal_project_orientation_bounds(uuid) FROM public;
GRANT EXECUTE ON FUNCTION municipal_project_orientation_bounds(uuid) TO authenticated;
