-- Let the parcel fetch derive the stated acreage itself.
--
-- The acreage to check against is sitting in the project's own
-- parcel_boundary_notes, and extract_stated_acres() already parses it. Having the
-- browser mirror that regex would be a second implementation that silently drifts,
-- so the RPC falls back to it when the caller passes nothing. An explicit value
-- still wins, for the case where a reviewer knows better than the prose.

CREATE OR REPLACE FUNCTION set_municipal_project_polygon_from_parcels(
  p_id           uuid,
  p_parts        jsonb,
  p_parcels      text[],
  p_stated_acres numeric     DEFAULT NULL,
  p_fetched_at   timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_geoms geometry[];
  v_union geometry;
  v_acres numeric := p_stated_acres;
BEGIN
  IF p_parts IS NULL OR jsonb_typeof(p_parts) <> 'array' OR jsonb_array_length(p_parts) = 0 THEN
    RAISE EXCEPTION 'no parcel geometry supplied';
  END IF;

  IF v_acres IS NULL THEN
    SELECT extract_stated_acres(parcel_boundary_notes) INTO v_acres
      FROM municipal_project WHERE id = p_id;
  END IF;

  SELECT array_agg(ST_SetSRID(ST_GeomFromGeoJSON(part::text), 4326))
    INTO v_geoms
    FROM jsonb_array_elements(p_parts) part;

  v_union := ST_Union(v_geoms);
  IF v_union IS NULL THEN
    RAISE EXCEPTION 'parcel union produced no geometry';
  END IF;

  RETURN set_municipal_project_polygon(
    p_id           => p_id,
    p_geojson      => ST_AsGeoJSON(ST_Multi(v_union))::jsonb,
    p_source       => 'parcel_fetch',
    p_parcels      => p_parcels,
    p_stated_acres => v_acres,
    p_fetched_at   => COALESCE(p_fetched_at, now())
  );
END $$;
