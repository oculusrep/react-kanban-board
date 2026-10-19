-- Write a project's boundary from a set of fetched parcel polygons.
--
-- The union must happen in PostGIS, not in the browser: ST_Union DISSOLVES shared
-- boundaries, so five contiguous parcels become one outline rather than five
-- stacked shapes. Verified on the three real multi-parcel records in production —
-- Bannister Rd (5 parcels, 102 vertices -> 82), District 2 (8, 170 -> 84),
-- Dahlonega/Elm (4, 69 -> 50) — each collapsing to a single Polygon whose area
-- equals the sum of its parts exactly.
--
-- A non-contiguous set yields a MultiPolygon, which the widened geometry column
-- now holds. Convex hull is deliberately NOT a fallback: measured on a disjoint
-- pair it reported 5,302 acres against 505 true.

CREATE OR REPLACE FUNCTION set_municipal_project_polygon_from_parcels(
  p_id           uuid,
  p_parts        jsonb,          -- JSON array of GeoJSON Polygon/MultiPolygon
  p_parcels      text[],         -- the parcel ids that actually resolved
  p_stated_acres numeric     DEFAULT NULL,
  p_fetched_at   timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_geoms geometry[];
  v_union geometry;
BEGIN
  IF p_parts IS NULL OR jsonb_typeof(p_parts) <> 'array' OR jsonb_array_length(p_parts) = 0 THEN
    RAISE EXCEPTION 'no parcel geometry supplied';
  END IF;

  SELECT array_agg(ST_SetSRID(ST_GeomFromGeoJSON(part::text), 4326))
    INTO v_geoms
    FROM jsonb_array_elements(p_parts) part;

  v_union := ST_Union(v_geoms);
  IF v_union IS NULL THEN
    RAISE EXCEPTION 'parcel union produced no geometry';
  END IF;

  -- Delegate so the pin, provenance, acreage check and ring guard stay in exactly
  -- one place. A fetch never drops rings (there is nothing to drop yet on a first
  -- fetch), but if a boundary already exists the guard still applies.
  RETURN set_municipal_project_polygon(
    p_id           => p_id,
    p_geojson      => ST_AsGeoJSON(ST_Multi(v_union))::jsonb,
    p_source       => 'parcel_fetch',
    p_parcels      => p_parcels,
    p_stated_acres => p_stated_acres,
    p_fetched_at   => COALESCE(p_fetched_at, now())
  );
END $$;

-- ---------------------------------------------------------------------------
-- stated acreage, for the cross-check
-- ---------------------------------------------------------------------------
-- "68.012 acres", "~29.3 acres", "approximately 60.25 acres total",
-- "38.717 acres combined". A RANGE ("Approx 312-318 acres") is deliberately not
-- parsed: there is no single stated figure to check against, and inventing one
-- would produce a variance that means nothing.
CREATE OR REPLACE FUNCTION extract_stated_acres(p_text text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE m text[];
BEGIN
  IF p_text IS NULL THEN RETURN NULL; END IF;
  IF p_text ~* '[0-9]+\s*-\s*[0-9]+\s*(\+/-)?\s*acres' THEN
    RETURN NULL;   -- a range, not a figure
  END IF;
  SELECT regexp_match(p_text, '([0-9]+(?:\.[0-9]+)?)\s*(?:\+/-)?\s*acres', 'i') INTO m;
  IF m IS NULL THEN RETURN NULL; END IF;
  RETURN m[1]::numeric;
END $$;

COMMENT ON FUNCTION extract_stated_acres(text) IS
  'The acreage a source stated, for cross-checking a fetched boundary. NULL for a '
  'range, where there is no single figure to check against.';

REVOKE ALL ON FUNCTION set_municipal_project_polygon_from_parcels(uuid, jsonb, text[], numeric, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION set_municipal_project_polygon_from_parcels(uuid, jsonb, text[], numeric, timestamptz) TO authenticated;
