-- The write path for placing a municipal_project: one place that owns the rules,
-- so no caller can reintroduce a fabricated coordinate or silently drop a hole.
--
-- Rules enforced here, not in the client:
--   * the pin of a project with a polygon is ALWAYS ST_PointOnSurface of that
--     polygon — guaranteed inside the shape, unlike the vertex-average the drawer
--     used to compute, which lands outside a concave or holed parcel;
--   * a saved shape that loses interior rings is REJECTED, never silently
--     accepted (parcel 161-001 has two, and terra-draw editing cannot represent
--     them) — a rejected save is recoverable, lost holes are not;
--   * editing a fetched boundary flips it to parcel_fetch_adjusted, so a later
--     process can tell a hand-tuned boundary from an untouched fetched one;
--   * acreage validation runs on every write that supplies a stated acreage,
--     and anything beyond the tolerance is flagged for review.
--
-- SECURITY DEFINER to match the other municipal-research RPCs; each one re-checks
-- that the target row exists rather than trusting the caller's id.

-- Beyond this, a fetched boundary disagrees with the acreage its source stated by
-- enough that the parcel set is probably wrong — usually a retired parcel id.
CREATE OR REPLACE FUNCTION municipal_project_acreage_tolerance_pct()
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT 5.0::numeric $$;

-- ---------------------------------------------------------------------------
-- set the polygon (and, from it, the pin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_municipal_project_polygon(
  p_id             uuid,
  p_geojson        jsonb,
  p_source         text,
  p_parcels        text[]      DEFAULT NULL,
  p_stated_acres   numeric     DEFAULT NULL,
  p_fetched_at     timestamptz DEFAULT NULL,
  -- Only ever passed after the user has been told rings would be lost and said
  -- yes. Defaults to false so the guard is on unless deliberately waived.
  p_allow_ring_loss boolean    DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing        geometry;
  v_existing_source text;
  v_new             geometry;
  v_old_rings       int := 0;
  v_new_rings       int := 0;
  v_source          text;
  v_acres           numeric;
  v_variance        numeric;
  v_needs_review    boolean := false;
  v_pin             geometry;
BEGIN
  SELECT geometry, geometry_source INTO v_existing, v_existing_source
    FROM municipal_project WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'municipal_project % not found', p_id USING ERRCODE = 'no_data_found';
  END IF;

  IF p_geojson IS NULL THEN
    RAISE EXCEPTION 'geometry is required; use clear_municipal_project_polygon to remove one';
  END IF;

  v_new := ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326));

  IF ST_GeometryType(v_new) <> 'ST_MultiPolygon' THEN
    RAISE EXCEPTION 'expected a Polygon or MultiPolygon, got %', ST_GeometryType(v_new);
  END IF;
  -- Reject rather than ST_MakeValid: repairing a self-intersection silently
  -- changes the shape the user drew, and can demote it to a collection.
  IF NOT ST_IsValid(v_new) THEN
    RAISE EXCEPTION 'polygon is not valid: %', ST_IsValidReason(v_new)
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- interior-ring guard -------------------------------------------------
  IF v_existing IS NOT NULL THEN
    SELECT COALESCE(sum(ST_NumInteriorRings(ST_GeometryN(v_existing, i))), 0)
      INTO v_old_rings FROM generate_series(1, ST_NumGeometries(v_existing)) i;
    SELECT COALESCE(sum(ST_NumInteriorRings(ST_GeometryN(v_new, i))), 0)
      INTO v_new_rings FROM generate_series(1, ST_NumGeometries(v_new)) i;

    IF v_new_rings < v_old_rings AND NOT p_allow_ring_loss THEN
      RAISE EXCEPTION
        'this save would drop % interior ring(s) (holes) from the boundary — % before, % after',
        v_old_rings - v_new_rings, v_old_rings, v_new_rings
        USING ERRCODE = 'check_violation',
              HINT = 'The editor cannot represent holes. Re-fetch the parcel, or '
                     'confirm the loss explicitly if the holes are genuinely gone.';
    END IF;
  END IF;

  -- ---- provenance ----------------------------------------------------------
  -- Editing a fetched boundary makes it an adjusted one, permanently. It never
  -- reverts to parcel_fetch, because it is no longer what the fabric says.
  v_source := CASE
    WHEN p_source = 'hand_drawn'
         AND v_existing_source IN ('parcel_fetch','parcel_fetch_adjusted')
      THEN 'parcel_fetch_adjusted'
    ELSE p_source
  END;
  IF v_source NOT IN ('hand_drawn','parcel_fetch','parcel_fetch_adjusted') THEN
    RAISE EXCEPTION 'invalid geometry_source %', p_source;
  END IF;

  -- ---- acreage validation --------------------------------------------------
  v_acres := round((ST_Area(v_new::geography) / 4046.8564224)::numeric, 2);
  IF p_stated_acres IS NOT NULL AND p_stated_acres > 0 THEN
    v_variance := round((abs(v_acres - p_stated_acres) / p_stated_acres * 100)::numeric, 1);
    v_needs_review := v_variance > municipal_project_acreage_tolerance_pct();
  END IF;

  -- The pin always follows the shape.
  v_pin := ST_PointOnSurface(v_new);

  UPDATE municipal_project SET
    geometry                = v_new,
    geometry_source         = v_source,
    geometry_source_parcels = COALESCE(p_parcels, geometry_source_parcels),
    geometry_fetched_at     = COALESCE(p_fetched_at, geometry_fetched_at),
    geometry_stated_acres   = COALESCE(p_stated_acres, geometry_stated_acres),
    geometry_computed_acres = v_acres,
    geometry_needs_review   = v_needs_review,
    -- A hand edit is itself a review of the shape; a fresh fetch is not.
    geometry_reviewed_at    = CASE WHEN v_source = 'parcel_fetch' THEN NULL
                                   ELSE COALESCE(geometry_reviewed_at, now()) END,
    centroid                = v_pin,
    centroid_source         = 'polygon',
    unplaced_reason         = NULL,
    updated_at              = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'geometry_source', v_source,
    'computed_acres', v_acres,
    'stated_acres', p_stated_acres,
    'variance_pct', v_variance,
    'needs_review', v_needs_review,
    'tolerance_pct', municipal_project_acreage_tolerance_pct(),
    'interior_rings', v_new_rings,
    'centroid_lat', ST_Y(v_pin),
    'centroid_lng', ST_X(v_pin)
  );
END $$;

-- ---------------------------------------------------------------------------
-- drop a pin by hand, with no polygon
-- ---------------------------------------------------------------------------
-- For "I only know roughly where it is". Deliberately does NOT touch geometry: a
-- project with a polygon takes its pin from the polygon, always.
CREATE OR REPLACE FUNCTION set_municipal_project_pin(
  p_id uuid, p_lat double precision, p_lng double precision
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_has_geom boolean;
BEGIN
  SELECT geometry IS NOT NULL INTO v_has_geom FROM municipal_project WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'municipal_project % not found', p_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_has_geom THEN
    RAISE EXCEPTION 'this project has a polygon; its pin is derived from the shape'
      USING HINT = 'Edit or remove the polygon instead of moving the pin.';
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL
     OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'lat/lng out of range: %, %', p_lat, p_lng;
  END IF;

  UPDATE municipal_project SET
    centroid        = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
    centroid_source = 'manual_pin',
    unplaced_reason = NULL,
    updated_at      = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'centroid_source', 'manual_pin',
                            'centroid_lat', p_lat, 'centroid_lng', p_lng);
END $$;

-- ---------------------------------------------------------------------------
-- remove the polygon
-- ---------------------------------------------------------------------------
-- The old behaviour re-geocoded the address and snapped the pin back to whatever
-- came out — which is exactly the fabrication this work removes. Now the caller
-- must say what the pin should become: a precise geocode it already has, or
-- nothing, in which case the record goes back on the unplaced worklist.
CREATE OR REPLACE FUNCTION clear_municipal_project_polygon(
  p_id uuid,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_unplaced_reason text  DEFAULT 'geocode_failed'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_placed boolean := p_lat IS NOT NULL AND p_lng IS NOT NULL;
BEGIN
  PERFORM 1 FROM municipal_project WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'municipal_project % not found', p_id USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE municipal_project SET
    geometry                = NULL,
    geometry_source         = NULL,
    geometry_source_parcels = NULL,
    geometry_fetched_at     = NULL,
    geometry_stated_acres   = NULL,
    geometry_computed_acres = NULL,
    geometry_needs_review   = false,
    geometry_reviewed_at    = NULL,
    centroid        = CASE WHEN v_placed
                           THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326) END,
    centroid_source = CASE WHEN v_placed THEN 'address_geocode' END,
    unplaced_reason = CASE WHEN v_placed THEN NULL ELSE p_unplaced_reason END,
    updated_at      = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'placed', v_placed,
                            'unplaced_reason', CASE WHEN v_placed THEN NULL ELSE p_unplaced_reason END);
END $$;

-- ---------------------------------------------------------------------------
-- mark a fetched boundary as looked at (dashed -> solid)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_municipal_project_geometry_reviewed(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE municipal_project
     SET geometry_reviewed_at = COALESCE(geometry_reviewed_at, now()),
         geometry_needs_review = false,
         updated_at = now()
   WHERE id = p_id AND geometry IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'municipal_project % not found, or has no polygon to review', p_id
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN jsonb_build_object('id', p_id, 'reviewed', true);
END $$;

REVOKE ALL ON FUNCTION set_municipal_project_polygon(uuid, jsonb, text, text[], numeric, timestamptz, boolean) FROM public;
REVOKE ALL ON FUNCTION set_municipal_project_pin(uuid, double precision, double precision) FROM public;
REVOKE ALL ON FUNCTION clear_municipal_project_polygon(uuid, double precision, double precision, text) FROM public;
REVOKE ALL ON FUNCTION mark_municipal_project_geometry_reviewed(uuid) FROM public;

GRANT EXECUTE ON FUNCTION set_municipal_project_polygon(uuid, jsonb, text, text[], numeric, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION set_municipal_project_pin(uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_municipal_project_polygon(uuid, double precision, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_municipal_project_geometry_reviewed(uuid) TO authenticated;
