-- Server-side post-run parcel fetch (dedupe -> Gemini -> dedupe -> parcel fetch).
-- Staged records can now carry a boundary, fetched by the edge function with
-- the same county adapters as the browser button
-- (supabase/functions/_shared/parcel-adapters.ts) and the same rules:
--   union of multi-parcel records, acreage validation (tolerance
--   municipal_project_acreage_tolerance_pct), partial-parcel flag, valid
--   MultiPolygon only, dashed until reviewed (geometry_reviewed_at stays NULL),
--   never replace an existing boundary. On approve the boundary carries over
--   and the pin is placed inside it.

ALTER TABLE public.municipal_project_staging
  ADD COLUMN geometry geometry(MultiPolygon, 4326),
  ADD COLUMN geometry_source text CHECK (geometry_source IN ('parcel_fetch')),
  ADD COLUMN geometry_source_parcels text[],
  ADD COLUMN geometry_fetched_at timestamptz,
  ADD COLUMN geometry_stated_acres numeric,
  ADD COLUMN geometry_computed_acres numeric,
  ADD COLUMN geometry_needs_review boolean NOT NULL DEFAULT false,
  -- Outcome of the last server fetch attempt: resolved / partial (some ids
  -- missing) / none_resolved / no_adapter / error. NULL = never attempted.
  ADD COLUMN parcel_fetch_status text,
  ADD COLUMN parcel_fetch_note text,
  ADD COLUMN parcel_fetch_at timestamptz;

-- Staging twin of set_municipal_project_polygon_from_parcels +
-- set_municipal_project_polygon (live definitions, 2026-11-14). Service role only.
CREATE FUNCTION public.set_staging_polygon_from_parcels(
  p_id uuid, p_parts jsonb, p_parcels text[], p_missing text[] DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row      municipal_project_staging%ROWTYPE;
  v_geoms    geometry[];
  v_new      geometry;
  v_stated   numeric;
  v_acres    numeric;
  v_variance numeric;
  v_review   boolean := false;
  v_partial  boolean;
BEGIN
  SELECT * INTO v_row FROM municipal_project_staging WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging row % not found', p_id; END IF;
  -- Never replace an existing boundary.
  IF v_row.geometry IS NOT NULL THEN
    RETURN jsonb_build_object('id', p_id, 'skipped', 'has_boundary');
  END IF;
  IF p_parts IS NULL OR jsonb_typeof(p_parts) <> 'array' OR jsonb_array_length(p_parts) = 0 THEN
    RAISE EXCEPTION 'no parcel geometry supplied';
  END IF;

  SELECT array_agg(ST_SetSRID(ST_GeomFromGeoJSON(part::text), 4326))
    INTO v_geoms FROM jsonb_array_elements(p_parts) part;
  -- Union dissolves shared lines, so contiguous parcels become one outline.
  v_new := ST_Multi(ST_Union(v_geoms));
  IF v_new IS NULL OR ST_GeometryType(v_new) <> 'ST_MultiPolygon' THEN
    RAISE EXCEPTION 'parcel union is not a (Multi)Polygon';
  END IF;
  IF NOT ST_IsValid(v_new) THEN
    RAISE EXCEPTION 'polygon is not valid: %', ST_IsValidReason(v_new) USING ERRCODE = 'check_violation';
  END IF;

  v_stated  := extract_stated_acres(v_row.parcel_boundary_notes);
  v_partial := cites_partial_parcel(v_row.parcel_boundary_notes);
  v_acres := round((ST_Area(v_new::geography) / 4046.8564224)::numeric, 2);
  IF v_stated IS NOT NULL AND v_stated > 0 THEN
    v_variance := round((abs(v_acres - v_stated) / v_stated * 100)::numeric, 1);
    v_review := v_variance > municipal_project_acreage_tolerance_pct();
  END IF;
  -- A partial parcel is wrong by construction; flag it whatever the acreage.
  v_review := v_review OR v_partial;

  UPDATE municipal_project_staging SET
    geometry = v_new, geometry_source = 'parcel_fetch',
    geometry_source_parcels = p_parcels, geometry_fetched_at = now(),
    geometry_stated_acres = v_stated, geometry_computed_acres = v_acres,
    geometry_needs_review = v_review,
    parcel_fetch_status = CASE WHEN cardinality(coalesce(p_missing, '{}')) > 0 THEN 'partial' ELSE 'resolved' END,
    parcel_fetch_note = CASE WHEN cardinality(coalesce(p_missing, '{}')) > 0
                             THEN 'missing from the current fabric (likely re-platted): ' || array_to_string(p_missing, ', ') END,
    parcel_fetch_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'computed_acres', v_acres, 'stated_acres', v_stated,
    'variance_pct', v_variance, 'needs_review', v_review, 'partial_parcel', v_partial);
END $function$;
REVOKE ALL ON FUNCTION public.set_staging_polygon_from_parcels(uuid, jsonb, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_staging_polygon_from_parcels(uuid, jsonb, text[], text[]) TO service_role;

-- approve_research_staging_rows: live definition + boundary carry-over.
CREATE OR REPLACE FUNCTION public.approve_research_staging_rows(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id                 uuid;
  v_approved_new           int := 0;
  v_approved_matched       int := 0;
  v_created_municipalities int := 0;
  v_row                    jsonb;
  v_staging                record;
  v_muni_id                uuid;
  v_bm                     record;
  v_mp_id                  uuid;
  v_lat                    numeric;
  v_lng                    numeric;
  v_addr                   text;
  v_pname                  text;
  v_phase                  text;
  v_partner                text;
  v_total                  int;   -- ADDED 20261103203347
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'p_rows must be a non-empty jsonb array';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    SELECT *
      INTO v_staging
      FROM municipal_project_staging
     WHERE id = (v_row->>'staging_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'staging row not found: %', (v_row->>'staging_id');
    END IF;
    IF v_staging.approval_state <> 'pending' THEN
      CONTINUE;
    END IF;

    IF v_run_id IS NULL THEN v_run_id := v_staging.research_run_id; END IF;
    IF v_run_id <> v_staging.research_run_id THEN
      RAISE EXCEPTION 'all p_rows must belong to the same research_run (mixed: % vs %)',
        v_run_id, v_staging.research_run_id;
    END IF;

    IF v_staging.matched_existing_id IS NOT NULL THEN
      UPDATE municipal_project_staging
         SET approval_state = 'approved',
             approved_at = now(),
             approved_municipal_project_id = v_staging.matched_existing_id
       WHERE id = v_staging.id;
      -- ADDED 20260917: rows merged into this one point at the same project.
      UPDATE municipal_project_staging
         SET approved_municipal_project_id = v_staging.matched_existing_id,
             approved_at = now()
       WHERE merged_into_staging_id = v_staging.id AND approval_state = 'merged';
      v_approved_matched := v_approved_matched + 1;
      CONTINUE;
    END IF;

    IF v_staging.municipality_id IS NOT NULL THEN
      v_muni_id := v_staging.municipality_id;
    ELSE
      SELECT * INTO v_bm FROM boundary_municipality WHERE id = v_staging.boundary_municipality_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'staging row % has no boundary_municipality lookup', v_staging.id;
      END IF;
      SELECT id INTO v_muni_id
        FROM municipality
       WHERE lower(btrim(name)) = lower(btrim(v_bm.name))
         AND state = v_bm.state
       LIMIT 1;
      IF v_muni_id IS NULL THEN
        INSERT INTO municipality (name, state) VALUES (v_bm.name, v_bm.state) RETURNING id INTO v_muni_id;
        v_created_municipalities := v_created_municipalities + 1;
      END IF;
      UPDATE municipal_project_staging SET municipality_id = v_muni_id WHERE id = v_staging.id;
    END IF;

    v_lat := (v_row->>'latitude')::numeric;
    v_lng := (v_row->>'longitude')::numeric;

    v_addr  := COALESCE(v_row->>'address',      v_staging.address);
    v_pname := COALESCE(v_row->>'project_name', v_staging.project_name, '');
    v_phase := COALESCE(v_row->>'phase_label',  v_staging.phase_label,  '');

    -- ADDED 20261103203347: per-row unit-count review flag. If the reviewer
    -- left the staged count alone, the staged flag + reason carry over. If they
    -- typed a different count, the staged reason no longer describes the value
    -- being committed, so it is dropped — and the municipal_project trigger
    -- re-flags anything that still commits with no count.
    v_total := COALESCE((v_row->>'total_housing_units')::int, v_staging.total_housing_units);

    INSERT INTO municipal_project (
      municipality_id, address, project_name, phase_label, parcel_numbers,
      location_description, parcel_boundary_notes,
      single_family_lots, townhouse_units, duplex_units, apt_units, cottage_units,
      total_housing_units, zoning, zoning_approval_date, notes, raw_stages,
      status_stage_id, builder_developer, permit_url, permit_application_date,
      source, discovery_source, discovery_source_raw,
      source_research_run_id, centroid, geocoded_address,
      centroid_source, unplaced_reason,
      is_amendment, units_basis, amends_case_number, prior_total,
      units_needs_review, units_review_reason,
      units_confidence,  -- ADDED research_unit_estimates
      -- ADDED server parcel fetch: a boundary fetched onto the staging row
      geometry, geometry_source, geometry_source_parcels, geometry_fetched_at,
      geometry_stated_acres, geometry_computed_acres, geometry_needs_review
    ) VALUES (
      v_muni_id,
      v_addr,
      v_pname,
      v_phase,
      v_staging.parcel_numbers,
      COALESCE(v_row->>'location_description',        v_staging.location_description),
      COALESCE(v_row->>'parcel_boundary_notes',       v_staging.parcel_boundary_notes),
      COALESCE((v_row->>'single_family_lots')::int,   v_staging.single_family_lots),
      COALESCE((v_row->>'townhouse_units')::int,      v_staging.townhouse_units),
      COALESCE((v_row->>'duplex_units')::int,         v_staging.duplex_units),
      COALESCE((v_row->>'apt_units')::int,            v_staging.apt_units),
      COALESCE((v_row->>'cottage_units')::int,        v_staging.cottage_units),
      COALESCE((v_row->>'total_housing_units')::int,  v_staging.total_housing_units),
      COALESCE(v_row->>'zoning',                      v_staging.zoning),
      COALESCE((v_row->>'zoning_approval_date')::date, v_staging.zoning_approval_date),
      COALESCE(v_row->>'notes',                       v_staging.notes),
      v_staging.raw_stages,
      v_staging.status_stage_id,
      COALESCE(v_row->>'builder_developer',           v_staging.builder_developer),
      COALESCE(v_row->>'permit_url',                  v_staging.permit_url),
      COALESCE((v_row->>'permit_application_date')::date, v_staging.permit_application_date),
      COALESCE(v_row->>'source',                      v_staging.source),
      -- Reviewer override wins, else the staged value. Normalized so a
      -- hand-typed override cannot violate the CHECK constraint.
      -- Key-presence test rather than COALESCE: the reviewer must be able to
      -- clear a WRONG agent value back to "not reported" (NULL). With COALESCE
      -- an explicit null would silently fall back to the staged value, making a
      -- bad attribution impossible to retract — the opposite of why this column
      -- exists. Absent key = no override; present-but-null = deliberate clear.
      -- NOTE: this differs from location_description / parcel_boundary_notes
      -- above, which use COALESCE. See docs/MARKET_RESEARCH_DISCOVERY_SOURCE.md
      -- ("Override semantics") for why the two differ.
      CASE WHEN v_row ? 'discovery_source'
           THEN normalize_discovery_source(v_row->>'discovery_source')
           ELSE v_staging.discovery_source
      END,
      -- Always the staged value, never overridden: this records what the AGENT
      -- reported. A reviewer reclassifying the row does not change the fact that
      -- the agent emitted an unrecognized string, and that fact is the taxonomy
      -- signal we are trying to accumulate.
      v_staging.discovery_source_raw,
      v_staging.research_run_id,
      -- The caller sends latitude/longitude ONLY when the geocode was precise
      -- (ROOFTOP / RANGE_INTERPOLATED). A vague address no longer arrives here as
      -- a coordinate at all, so a county or city centroid can never be written as
      -- if it were the project's location.
      -- ADDED server parcel fetch: a staged boundary wins, and the pin sits
      -- inside it (ST_PointOnSurface), same as set_municipal_project_polygon.
      CASE WHEN v_staging.geometry IS NOT NULL THEN ST_PointOnSurface(v_staging.geometry)
           WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)
        ELSE NULL
      END,
      v_row->>'geocoded_address',
      -- Placement invariant: a pin has a source, no pin has a reason.
      CASE WHEN v_staging.geometry IS NOT NULL THEN 'polygon'
           WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
        THEN 'address_geocode' ELSE NULL END,
      CASE WHEN v_staging.geometry IS NOT NULL THEN NULL
           WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL THEN NULL
        -- The reviewer's client says WHY it withheld the coordinate
        -- (admin_area_centroid / road_centroid / geocode_failed / no_address).
        -- An older client that sends neither still satisfies the constraint.
        ELSE COALESCE(v_row->>'unplaced_reason', 'geocode_failed')
      END,
      -- Amendment fields carry straight through from staging. The reviewer can
      -- correct them on the staging row before approving; there is no per-field
      -- override here because, unlike discovery_source, these describe what the
      -- SOURCE said rather than a classification we are accumulating.
      v_staging.is_amendment,
      v_staging.units_basis,
      v_staging.amends_case_number,
      v_staging.prior_total,
      CASE WHEN v_total IS NOT DISTINCT FROM v_staging.total_housing_units
           THEN v_staging.units_needs_review ELSE false END,
      CASE WHEN v_total IS NOT DISTINCT FROM v_staging.total_housing_units
           THEN v_staging.units_review_reason ELSE NULL END,
      -- ADDED research_unit_estimates: the staged confidence describes the
      -- staged count only. A reviewer-typed count is not an estimate any more.
      CASE WHEN v_total IS NOT DISTINCT FROM v_staging.total_housing_units
           THEN v_staging.units_confidence ELSE NULL END,
      v_staging.geometry, v_staging.geometry_source, v_staging.geometry_source_parcels,
      v_staging.geometry_fetched_at, v_staging.geometry_stated_acres,
      v_staging.geometry_computed_acres, coalesce(v_staging.geometry_needs_review, false)
    )
    ON CONFLICT (municipality_id, address, project_name, phase_label) DO NOTHING
    RETURNING id INTO v_mp_id;

    IF v_mp_id IS NULL THEN
      SELECT id INTO v_mp_id
        FROM municipal_project
       WHERE municipality_id = v_muni_id
         AND address         = v_addr
         AND project_name    = v_pname
         AND phase_label     = v_phase
       LIMIT 1;

      -- ADDED server parcel fetch: never replace an existing boundary; only
      -- fill one the committed record doesn't have.
      IF v_staging.geometry IS NOT NULL THEN
        UPDATE municipal_project SET
          geometry = v_staging.geometry, geometry_source = v_staging.geometry_source,
          geometry_source_parcels = v_staging.geometry_source_parcels,
          geometry_fetched_at = v_staging.geometry_fetched_at,
          geometry_stated_acres = v_staging.geometry_stated_acres,
          geometry_computed_acres = v_staging.geometry_computed_acres,
          geometry_needs_review = coalesce(v_staging.geometry_needs_review, false),
          geometry_reviewed_at = NULL,
          centroid = ST_PointOnSurface(v_staging.geometry), centroid_source = 'polygon',
          unplaced_reason = NULL, updated_at = now()
         WHERE id = v_mp_id AND geometry IS NULL;
      END IF;

      -- ADDED 20260917: keep-both collision guard. The fold-in above is right for
      -- a row that re-finds an already-committed project — but NOT when that
      -- project was committed from a row the reviewer marked as a DIFFERENT
      -- project from this one. Folding would mark this row approved, count it as
      -- matched, and drop its units without a word. Stop instead (the whole call
      -- rolls back).
      SELECT COALESCE(NULLIF(o.project_name, ''), '(unnamed)') INTO v_partner
        FROM municipal_project_staging o
       WHERE o.approved_municipal_project_id = v_mp_id
         AND o.id <> v_staging.id
         AND (o.id = ANY(v_staging.not_duplicate_of_ids) OR v_staging.id = ANY(o.not_duplicate_of_ids))
       LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'keep_both_collision: "%" was kept as a separate project from "%", but both would commit with the same municipality, address, project name and phase label — the second would fold into the first and its units would be lost. Nothing was committed. Give one of them a phase label (e.g. "Phase 2") and approve again.',
          COALESCE(NULLIF(v_pname, ''), '(unnamed)'), v_partner;
      END IF;

      UPDATE municipal_project_staging
         SET approval_state = 'approved',
             approved_at = now(),
             approved_municipal_project_id = v_mp_id
       WHERE id = v_staging.id;
      v_approved_matched := v_approved_matched + 1;
    ELSE
      UPDATE municipal_project_staging
         SET approval_state = 'approved',
             approved_at = now(),
             approved_municipal_project_id = v_mp_id
       WHERE id = v_staging.id;
      v_approved_new := v_approved_new + 1;
    END IF;

    -- ADDED 20260917: rows merged into this one point at the committed project.
    UPDATE municipal_project_staging
       SET approved_municipal_project_id = v_mp_id,
           approved_at = now()
     WHERE merged_into_staging_id = v_staging.id AND approval_state = 'merged';
  END LOOP;

  IF v_run_id IS NOT NULL THEN
    UPDATE research_run
       SET state = 'approved',
           completed_at = COALESCE(completed_at, now())
     WHERE id = v_run_id;
  END IF;

  RETURN jsonb_build_object(
    'approved_new',               v_approved_new,
    'approved_matched',           v_approved_matched,
    'created_municipality_count', v_created_municipalities,
    'research_run_id',            v_run_id
  );
END;
$function$;

-- get_research_summary: live definition + ready records with a boundary.
CREATE OR REPLACE FUNCTION public.get_research_summary(p_run_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH p AS (
    SELECT s.id, s.units_confidence, s.count_conflict, s.duplicate_of_project_id,
           (s.geometry IS NOT NULL) AS has_boundary,
           s.duplicate_of_staging_id, s.lead_reason,
           CASE WHEN s.total_housing_units > 0 AND NOT s.units_needs_review
                THEN s.total_housing_units END AS u
      FROM municipal_project_staging s
     WHERE s.research_run_id = ANY(p_run_ids) AND s.approval_state = 'pending'
  ), b AS (
    SELECT p.*,
      CASE
        WHEN u IS NULL THEN 'leads'
        WHEN (jsonb_typeof(count_conflict) = 'array' AND jsonb_array_length(count_conflict) > 1)
          OR duplicate_of_project_id IS NOT NULL
          OR (duplicate_of_staging_id IS NOT NULL AND EXISTS (SELECT 1 FROM p d WHERE d.id = p.duplicate_of_staging_id))
          OR lead_reason IS NOT NULL
        THEN 'decision'
        ELSE 'ready'
      END AS bucket,
      coalesce(
        (SELECT min(x->>'id') FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(count_conflict) = 'array' THEN count_conflict ELSE '[]'::jsonb END) x
          WHERE x->>'kind' = 'staged'),
        CASE WHEN duplicate_of_staging_id IS NOT NULL
             THEN least(id::text, duplicate_of_staging_id::text) END,
        id::text) AS grp
    FROM p
  ), g AS (
    SELECT grp, min(u) AS lo, max(u) AS hi FROM b WHERE bucket = 'decision' GROUP BY grp
  )
  SELECT jsonb_build_object(
    'pending', count(*),
    'ready', jsonb_build_object(
      'records', count(*) FILTER (WHERE bucket = 'ready'),
      'units', coalesce(sum(u) FILTER (WHERE bucket = 'ready'), 0),
      'estimated_units', coalesce(sum(u) FILTER (WHERE bucket = 'ready' AND units_confidence = 'estimated'), 0),
      'with_boundary', count(*) FILTER (WHERE bucket = 'ready' AND has_boundary)),
    'decision', jsonb_build_object(
      'records', count(*) FILTER (WHERE bucket = 'decision'),
      'groups', (SELECT count(*) FROM g),
      'units_low', (SELECT coalesce(sum(lo), 0) FROM g),
      'units_high', (SELECT coalesce(sum(hi), 0) FROM g)),
    'leads', jsonb_build_object('records', count(*) FILTER (WHERE bucket = 'leads')))
  FROM b;
$function$;
