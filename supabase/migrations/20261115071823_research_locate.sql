-- Locate step (post-run pipeline + "Fill missing units & locations" + a
-- one-off pass on committed records). Doc: docs/MARKET_RESEARCH_LOCATE.md
--
--   * staging: located_lat/lng/address (a pin the locate step found; only
--     precise geocodes), location_confidence ('estimated' until confirmed),
--     location_precision (how the record's own address geocodes), locate_status.
--   * municipal_project: location_confidence; centroid_source gains
--     'research_locate'. Approve carries a located pin + its tag across when the
--     reviewer's address geocode isn't precise and there is no boundary.
--   * research_location_estimate: one row per Gemini locate call (answer,
--     sources, tokens, cost, outcome, old/new hint).
--   * research_locate_geo(): city/county names for the prompt, site distance +
--     radius, and distance from the municipality's boundary (sanity guard).
--   * set_municipal_project_estimated_pin(): committed records only; never
--     overwrites a boundary-derived or hand-placed pin.
--   * get_research_summary: ready.with_precise_pin.
-- Live definitions rebuilt (2026-11-15): approve_research_staging_rows,
-- get_sweep_staging, get_research_summary, municipal_project_v.

ALTER TABLE public.municipal_project_staging
  ADD COLUMN located_lat numeric,
  ADD COLUMN located_lng numeric,
  ADD COLUMN located_address text,
  ADD COLUMN location_confidence text CHECK (location_confidence IN ('estimated', 'confirmed')),
  ADD COLUMN location_precision text CHECK (location_precision IN ('precise', 'imprecise', 'no_address', 'failed', 'boundary')),
  ADD COLUMN locate_status text,
  ADD COLUMN locate_at timestamptz;

ALTER TABLE public.municipal_project
  ADD COLUMN location_confidence text CHECK (location_confidence IN ('estimated', 'confirmed'));
ALTER TABLE public.municipal_project DROP CONSTRAINT municipal_project_centroid_source_check;
ALTER TABLE public.municipal_project ADD CONSTRAINT municipal_project_centroid_source_check
  CHECK (centroid_source IS NULL OR centroid_source = ANY (ARRAY['address_geocode', 'polygon', 'manual_pin', 'research_locate']));

ALTER TABLE public.research_run
  ADD COLUMN locate_calls integer,
  ADD COLUMN locate_cost_cents numeric;

CREATE TABLE public.research_location_estimate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id uuid REFERENCES public.research_run(id) ON DELETE CASCADE,
  staging_id uuid REFERENCES public.municipal_project_staging(id) ON DELETE CASCADE,
  municipal_project_id uuid REFERENCES public.municipal_project(id) ON DELETE CASCADE,
  project_name text,
  model text,
  answer text,
  parsed jsonb,
  sources jsonb,
  input_tokens integer,
  output_tokens integer,
  cost_cents numeric NOT NULL DEFAULT 0,       -- Gemini (upper bound)
  geocode_calls integer NOT NULL DEFAULT 0,
  geocode_cost_cents numeric NOT NULL DEFAULT 0,
  outcome text NOT NULL,                       -- pin | hint | parcels | nothing | guard_failed | imprecise | error
  old_hint text,
  new_hint text,
  old_point jsonb,
  new_lat numeric,
  new_lng numeric,
  located_address text,
  site_miles numeric,
  moved_to_leads boolean NOT NULL DEFAULT false,
  parcel_ids text[],
  acreage numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (staging_id IS NOT NULL OR municipal_project_id IS NOT NULL)
);
CREATE INDEX research_location_estimate_run_idx ON public.research_location_estimate (research_run_id);
CREATE INDEX research_location_estimate_staging_idx ON public.research_location_estimate (staging_id);
CREATE INDEX research_location_estimate_mp_idx ON public.research_location_estimate (municipal_project_id);
ALTER TABLE public.research_location_estimate ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_location_estimate_read ON public.research_location_estimate
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));
-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.research_location_estimate FROM anon, authenticated;
GRANT SELECT ON public.research_location_estimate TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_location_estimate TO service_role;

-- Geography for one record: names for the prompt; with a point, the distance
-- from the municipality's boundary (0 inside) and from the run's site.
CREATE FUNCTION public.research_locate_geo(p_kind text, p_id uuid, p_lat numeric DEFAULT NULL, p_lng numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_bm   boundary_municipality%ROWTYPE;
  v_run  uuid;
  v_county text;
  v_site geometry;
  v_radius int;
  v_pt   geometry;
BEGIN
  IF p_kind = 'staged' THEN
    SELECT bm.* INTO v_bm FROM municipal_project_staging s
      JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id WHERE s.id = p_id;
    SELECT s.research_run_id INTO v_run FROM municipal_project_staging s WHERE s.id = p_id;
  ELSE
    SELECT bm.* INTO v_bm FROM municipal_project mp JOIN municipality m ON m.id = mp.municipality_id
      JOIN boundary_municipality bm ON lower(bm.name) = lower(m.name) AND bm.fips_state = '13'
     WHERE mp.id = p_id ORDER BY (bm.kind = 'city') DESC LIMIT 1;
  END IF;

  IF v_bm.kind = 'county' THEN
    v_county := regexp_replace(v_bm.name, '\s+County$', '', 'i');
  ELSIF v_bm.id IS NOT NULL THEN
    SELECT regexp_replace(c.name, '\s+County$', '', 'i') INTO v_county FROM boundary_municipality c
     WHERE c.kind = 'county' AND c.fips_state = v_bm.fips_state
       AND ST_Intersects(c.geometry, ST_PointOnSurface(v_bm.geometry))
     LIMIT 1;
  END IF;

  IF v_run IS NOT NULL THEN
    SELECT ST_SetSRID(ST_MakePoint(
             COALESCE(ss.verified_longitude, p.verified_longitude, ss.sf_property_longitude, p.longitude),
             COALESCE(ss.verified_latitude,  p.verified_latitude,  ss.sf_property_latitude,  p.latitude)), 4326),
           rr.radius_miles
      INTO v_site, v_radius
      FROM research_run rr JOIN site_submit ss ON ss.id = rr.site_submit_id
      LEFT JOIN property p ON p.id = ss.property_id
     WHERE rr.id = v_run;
  END IF;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    v_pt := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
  END IF;

  RETURN jsonb_build_object(
    'muni_name', v_bm.name, 'muni_kind', v_bm.kind, 'county', v_county,
    'radius_miles', v_radius,
    'muni_miles', CASE WHEN v_pt IS NOT NULL AND v_bm.geometry IS NOT NULL
      THEN round((ST_Distance(v_bm.geometry::geography, v_pt::geography) / 1609.344)::numeric, 2) END,
    'site_miles', CASE WHEN v_pt IS NOT NULL AND ST_X(v_site) IS NOT NULL
      THEN round((ST_Distance(v_site::geography, v_pt::geography) / 1609.344)::numeric, 2) END);
END;
$$;
REVOKE ALL ON FUNCTION public.research_locate_geo(text, uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_locate_geo(text, uuid, numeric, numeric) TO service_role;

-- Committed record: place an estimated pin. Only where there is no pin, or the
-- pin came from an address geocode (the imprecise case the caller verified).
-- Never over a boundary-derived ('polygon') or hand-placed ('manual_pin') pin.
CREATE FUNCTION public.set_municipal_project_estimated_pin(p_id uuid, p_lat numeric, p_lng numeric, p_located_address text, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_old jsonb; v_n int;
BEGIN
  SELECT jsonb_build_object('lat', ST_Y(centroid), 'lng', ST_X(centroid), 'source', centroid_source,
                            'unplaced_reason', unplaced_reason, 'geocoded_address', geocoded_address)
    INTO v_old FROM municipal_project WHERE id = p_id;
  UPDATE municipal_project SET
    centroid = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
    centroid_source = 'research_locate', unplaced_reason = NULL,
    geocoded_address = p_located_address,
    location_confidence = 'estimated',
    notes = concat_ws(E'\n\n', nullif(btrim(notes), ''), p_note),
    updated_at = now()
   WHERE id = p_id AND geometry IS NULL
     AND (centroid IS NULL OR centroid_source IN ('address_geocode', 'research_locate'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_n = 1, 'old', v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.set_municipal_project_estimated_pin(uuid, numeric, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_municipal_project_estimated_pin(uuid, numeric, numeric, text, text) TO service_role;

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
      geometry_stated_acres, geometry_computed_acres, geometry_needs_review,
      geometry_source_vintage,
      location_confidence  -- ADDED research_locate
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
      -- ADDED research_locate: no precise geocode of the address, but the
      -- locate step found a precise location -> that pin, tagged estimated.
      CASE WHEN v_staging.geometry IS NOT NULL THEN ST_PointOnSurface(v_staging.geometry)
           WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)
           WHEN v_staging.located_lat IS NOT NULL AND v_staging.located_lng IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(v_staging.located_lng, v_staging.located_lat), 4326)
        ELSE NULL
      END,
      COALESCE(v_row->>'geocoded_address',
        CASE WHEN v_staging.geometry IS NULL AND (v_lat IS NULL OR v_lng IS NULL)
             THEN v_staging.located_address END),
      -- Placement invariant: a pin has a source, no pin has a reason.
      CASE WHEN v_staging.geometry IS NOT NULL THEN 'polygon'
           WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
        THEN 'address_geocode'
           WHEN v_staging.located_lat IS NOT NULL AND v_staging.located_lng IS NOT NULL
        THEN 'research_locate' ELSE NULL END,
      CASE WHEN v_staging.geometry IS NOT NULL THEN NULL
           WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL THEN NULL
           WHEN v_staging.located_lat IS NOT NULL AND v_staging.located_lng IS NOT NULL THEN NULL
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
      v_staging.geometry_computed_acres, coalesce(v_staging.geometry_needs_review, false),
      v_staging.geometry_source_vintage,
      CASE WHEN v_staging.geometry IS NULL AND (v_lat IS NULL OR v_lng IS NULL)
            AND v_staging.located_lat IS NOT NULL THEN v_staging.location_confidence END
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
          geometry_source_vintage = v_staging.geometry_source_vintage,
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

DROP FUNCTION public.get_sweep_staging(uuid);
CREATE FUNCTION public.get_sweep_staging(p_sweep_id uuid)
 RETURNS TABLE(id uuid, research_run_id uuid, sweep_chunk_index integer, boundary_municipality_id uuid, muni_name text, muni_kind text, matched_existing_id uuid, approval_state text, project_name text, address text, location_description text, parcel_boundary_notes text, total_housing_units integer, builder_developer text, permit_url text, permit_application_date date, source text, discovery_source text, discovery_source_raw text, notes text, reject_reason text, duplicate_of_staging_id uuid, duplicate_of_project_name text, duplicate_of_run_id uuid, duplicate_of_chunk_index integer, phase_label text, not_duplicate_of_ids uuid[], merged_into_staging_id uuid, is_merge_keeper boolean, units_needs_review boolean, units_review_reason text, units_confidence text, lead_reason text, count_conflict jsonb, geometry_source_vintage text, parcel_fetch_status text, has_boundary boolean, location_confidence text, located_address text, location_precision text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.research_run_id, r.sweep_chunk_index,
    s.boundary_municipality_id, bm.name, bm.kind,
    s.matched_existing_id, s.approval_state,
    s.project_name, s.address, s.location_description, s.parcel_boundary_notes,
    s.total_housing_units, s.builder_developer, s.permit_url,
    s.permit_application_date, s.source, s.discovery_source, s.discovery_source_raw,
    s.notes, s.reject_reason,
    s.duplicate_of_staging_id, d.project_name, d.research_run_id, dr.sweep_chunk_index,
    s.phase_label, s.not_duplicate_of_ids, s.merged_into_staging_id, s.merge_snapshot IS NOT NULL,
    s.units_needs_review, s.units_review_reason, s.units_confidence, s.lead_reason, s.count_conflict, s.geometry_source_vintage, s.parcel_fetch_status, s.geometry IS NOT NULL, s.location_confidence, s.located_address, s.location_precision
  FROM municipal_project_staging s
  JOIN research_run r ON r.id = s.research_run_id AND r.sweep_id = p_sweep_id
  LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
  LEFT JOIN municipal_project_staging d ON d.id = s.duplicate_of_staging_id
  LEFT JOIN research_run dr ON dr.id = d.research_run_id
  ORDER BY bm.name, r.sweep_chunk_index, s.created_at;
$function$;
REVOKE ALL ON FUNCTION public.get_sweep_staging(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sweep_staging(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_research_summary(p_run_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH p AS (
    SELECT s.id, s.units_confidence, s.count_conflict, s.duplicate_of_project_id,
           (s.geometry IS NOT NULL) AS has_boundary,
           -- ADDED research_locate: boundary, a precise geocode of the address,
           -- or a precise located pin (estimated).
           (s.geometry IS NOT NULL OR s.location_precision = 'precise' OR s.located_lat IS NOT NULL) AS precise_pin,
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
      'with_boundary', count(*) FILTER (WHERE bucket = 'ready' AND has_boundary),
      'with_precise_pin', count(*) FILTER (WHERE bucket = 'ready' AND precise_pin)),
    'decision', jsonb_build_object(
      'records', count(*) FILTER (WHERE bucket = 'decision'),
      'groups', (SELECT count(*) FROM g),
      'units_low', (SELECT coalesce(sum(lo), 0) FROM g),
      'units_high', (SELECT coalesce(sum(hi), 0) FROM g)),
    'leads', jsonb_build_object('records', count(*) FILTER (WHERE bucket = 'leads')))
  FROM b;
$function$;

CREATE OR REPLACE VIEW public.municipal_project_v AS
 SELECT mp.id,
    mp.municipality_id,
    mp.address,
    mp.project_name,
    mp.phase_label,
    mp.parcel_numbers,
    mp.single_family_lots,
    mp.townhouse_units,
    mp.duplex_units,
    mp.apt_units,
    mp.cottage_units,
    mp.total_housing_units,
    mp.zoning,
    mp.zoning_approval_date,
    mp.notes,
    mp.raw_stages,
    mp.status_stage_id,
    mp.status_override_id,
    mp.geocoded_address,
    mp.centroid,
    mp.geometry,
    mp.property_id,
    mp.source_import_id,
    mp.source_row_number,
    mp.created_at,
    mp.updated_at,
    mp.source,
    mp.builder_developer,
    mp.permit_url,
    mp.permit_application_date,
    mp.source_research_run_id,
    mp.location_description,
    mp.parcel_boundary_notes,
    mp.created_by_id,
    mp.updated_by_id,
    mp.label_offset_x_px,
    mp.label_offset_y_px,
    mp.discovery_source,
    mp.discovery_source_raw,
    mp.centroid_source,
    mp.unplaced_reason,
    mp.geometry_source,
    mp.geometry_source_parcels,
    mp.geometry_fetched_at,
    mp.geometry_stated_acres,
    mp.geometry_computed_acres,
    mp.geometry_needs_review,
    mp.geometry_reviewed_at,
    mp.is_amendment,
    mp.units_basis,
    mp.amends_case_number,
    mp.prior_total,
    st_y(mp.centroid) AS centroid_lat,
    st_x(mp.centroid) AS centroid_lng,
        CASE
            WHEN mp.geometry IS NULL THEN NULL::jsonb
            ELSE st_asgeojson(mp.geometry)::jsonb
        END AS geometry_geojson,
    mp.centroid IS NULL AS is_unplaced,
        CASE
            WHEN mp.geometry_stated_acres IS NULL OR mp.geometry_stated_acres = 0::numeric OR mp.geometry_computed_acres IS NULL THEN NULL::numeric
            ELSE round((mp.geometry_computed_acres - mp.geometry_stated_acres) / mp.geometry_stated_acres * 100::numeric, 1)
        END AS geometry_area_variance_pct,
    mp.geometry IS NOT NULL AND (mp.geometry_source = ANY (ARRAY['parcel_fetch'::text, 'parcel_fetch_adjusted'::text])) AND mp.geometry_reviewed_at IS NULL AS geometry_unreviewed,
    m.name AS municipality_name,
    m.state AS municipality_state,
    m.display_color AS municipality_display_color,
    ps.name AS computed_stage_name,
    COALESCE(mp.status_override_id, mp.status_stage_id) AS effective_stage_id,
    ps_eff.name AS effective_stage_name,
    ps_eff.color AS effective_stage_color,
    ps_eff.line_color AS effective_stage_line_color,
    mp.units_needs_review,
    mp.units_review_reason,
    mp.geometry_source_vintage,
    mp.location_confidence
   FROM municipal_project mp
     LEFT JOIN municipality m ON m.id = mp.municipality_id
     LEFT JOIN project_stage ps ON ps.id = mp.status_stage_id
     LEFT JOIN project_stage ps_eff ON ps_eff.id = COALESCE(mp.status_override_id, mp.status_stage_id);
