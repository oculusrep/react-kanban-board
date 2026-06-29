-- Market Research Agent — add two human-readable location hints the agent
-- captures from sources and the user reads when manually placing the pin
-- and drawing the project polygon. Neither field feeds geocoding.
--
--   location_description    — e.g. "NWC of Hwy 92 & Dallas-Acworth Rd,
--                              behind the Publix"
--   parcel_boundary_notes   — e.g. "Parcel 045-123; ~42 acres; bounded by
--                              Cole Lake Rd (N) and creek (E)"
--
-- Schema changes:
--   1) Add both as nullable text on municipal_project_staging (agent writes
--      via submit_research_report → staged for review).
--   2) Add both as nullable text on municipal_project (the canonical row
--      the map layer reads from).
--   3) Recreate municipal_project_v so SELECT mp.* picks up the new columns.
--
-- RPC changes:
--   4) submit_research_report — parse both fields from each candidate record
--      and insert them on the staging row.
--   5) approve_research_staging_rows — accept both fields as per-row edits
--      (COALESCE with staging values) and write them to municipal_project.

-- ---- 1 + 2: columns -------------------------------------------------------
ALTER TABLE public.municipal_project_staging
  ADD COLUMN IF NOT EXISTS location_description  text,
  ADD COLUMN IF NOT EXISTS parcel_boundary_notes text;

ALTER TABLE public.municipal_project
  ADD COLUMN IF NOT EXISTS location_description  text,
  ADD COLUMN IF NOT EXISTS parcel_boundary_notes text;

COMMENT ON COLUMN public.municipal_project.location_description IS
  'Human-readable precise location descriptor for manual pin placement (e.g. "NWC of Hwy 92 & Dallas-Acworth Rd, behind the Publix"). Does NOT feed geocoding.';
COMMENT ON COLUMN public.municipal_project.parcel_boundary_notes IS
  'Boundary/parcel detail stated in a source — tax parcel ID(s), acreage, bounding roads/features. Used for manually drawing the project polygon. Agent captures only what sources state; does NOT derive geometry.';

-- ---- 3: recreate the view so mp.* picks up the new columns ---------------
DROP VIEW IF EXISTS public.municipal_project_v;
CREATE VIEW public.municipal_project_v
WITH (security_invoker = true) AS
SELECT
  mp.*,
  ST_Y(mp.centroid) AS centroid_lat,
  ST_X(mp.centroid) AS centroid_lng,
  CASE WHEN mp.geometry IS NULL THEN NULL ELSE ST_AsGeoJSON(mp.geometry)::jsonb END AS geometry_geojson,
  m.name  AS municipality_name,
  m.state AS municipality_state,
  m.display_color AS municipality_display_color,
  ps.name AS computed_stage_name,
  COALESCE(mp.status_override_id, mp.status_stage_id) AS effective_stage_id,
  ps_eff.name AS effective_stage_name,
  ps_eff.color AS effective_stage_color
FROM public.municipal_project mp
LEFT JOIN public.municipality m ON m.id = mp.municipality_id
LEFT JOIN public.project_stage ps ON ps.id = mp.status_stage_id
LEFT JOIN public.project_stage ps_eff ON ps_eff.id = COALESCE(mp.status_override_id, mp.status_stage_id);
GRANT SELECT ON public.municipal_project_v TO authenticated;

-- ---- 4: submit_research_report parses + stages both fields ---------------
CREATE OR REPLACE FUNCTION public.submit_research_report(
  p_run_id        uuid,
  p_candidates    jsonb,
  p_needs_review  text DEFAULT NULL,
  p_alt_avenues   text DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted        int := 0;
  v_off_checklist   int := 0;
  v_off_ids         uuid[];
BEGIN
  -- Layer-3 guard: every candidate's boundary_municipality_id must be on this
  -- run's checklist. Whole batch rejected if any are off-list.
  SELECT
    array_agg(DISTINCT (c->>'boundary_municipality_id')::uuid),
    COUNT(*)
  INTO v_off_ids, v_off_checklist
  FROM jsonb_array_elements(p_candidates) AS c
  WHERE (c->>'boundary_municipality_id')::uuid NOT IN (
    SELECT boundary_municipality_id FROM research_checklist_item WHERE research_run_id = p_run_id
  );
  IF v_off_checklist > 0 THEN
    RAISE EXCEPTION 'off_checklist_municipalities: % candidate(s) reference muni(s) not on this run''s checklist; offending boundary_municipality_ids: %',
      v_off_checklist, v_off_ids;
  END IF;

  WITH parsed AS (
    SELECT
      (c->>'boundary_municipality_id')::uuid AS bm_id,
      c->>'project_name'                     AS project_name,
      c->>'address'                          AS address,
      c->>'location_description'             AS location_description,
      c->>'parcel_boundary_notes'            AS parcel_boundary_notes,
      COALESCE(c->>'phase_label','')         AS phase_label,
      (c->>'total_housing_units')::int       AS total_housing_units,
      (c->>'single_family_lots')::int        AS single_family_lots,
      (c->>'townhouse_units')::int           AS townhouse_units,
      (c->>'duplex_units')::int              AS duplex_units,
      (c->>'apt_units')::int                 AS apt_units,
      (c->>'cottage_units')::int             AS cottage_units,
      c->>'zoning'                           AS zoning,
      (c->>'zoning_approval_date')::date     AS zoning_approval_date,
      c->>'builder_developer'                AS builder_developer,
      c->>'permit_url'                       AS permit_url,
      (c->>'permit_application_date')::date  AS permit_application_date,
      c->>'source'                           AS source,
      c->>'notes'                            AS notes,
      COALESCE(
        (c->>'status_stage_id')::uuid,
        (SELECT id FROM project_stage
          WHERE lower(btrim(name)) = lower(btrim(c->>'status_name'))
          LIMIT 1)
      )                                      AS status_stage_id,
      COALESCE(c->'raw_stages', '{}'::jsonb) AS raw_stages
    FROM jsonb_array_elements(p_candidates) AS c
  ),
  resolved AS (
    SELECT
      p.*,
      m.id AS municipality_id,
      (
        SELECT mp.id
          FROM municipal_project mp
         WHERE mp.municipality_id = m.id
           AND lower(btrim(mp.project_name)) = lower(btrim(p.project_name))
           AND lower(btrim(mp.address))      = lower(btrim(p.address))
         LIMIT 1
      ) AS matched_existing_id
    FROM parsed p
    LEFT JOIN boundary_municipality bm ON bm.id = p.bm_id
    LEFT JOIN municipality m
      ON lower(btrim(m.name)) = lower(btrim(bm.name))
     AND m.state = bm.state
  ),
  ins AS (
    INSERT INTO municipal_project_staging (
      research_run_id, boundary_municipality_id, municipality_id,
      project_name, address, phase_label,
      location_description, parcel_boundary_notes,
      single_family_lots, townhouse_units, duplex_units, apt_units, cottage_units,
      total_housing_units,
      zoning, zoning_approval_date, notes, raw_stages, status_stage_id,
      builder_developer, permit_url, permit_application_date, source,
      matched_existing_id, approval_state
    )
    SELECT
      p_run_id, r.bm_id, r.municipality_id,
      r.project_name, r.address, r.phase_label,
      r.location_description, r.parcel_boundary_notes,
      r.single_family_lots, r.townhouse_units, r.duplex_units, r.apt_units, r.cottage_units,
      r.total_housing_units,
      r.zoning, r.zoning_approval_date, r.notes, r.raw_stages, r.status_stage_id,
      r.builder_developer, r.permit_url, r.permit_application_date, r.source,
      r.matched_existing_id, 'pending'
    FROM resolved r
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  UPDATE research_run
     SET state         = 'awaiting_review',
         needs_review  = p_needs_review,
         alt_avenues   = p_alt_avenues,
         completed_at  = now()
   WHERE id = p_run_id;

  RETURN v_inserted;
END;
$$;

-- ---- 5: approve_research_staging_rows promotes both fields ---------------
CREATE OR REPLACE FUNCTION public.approve_research_staging_rows(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role                   text;
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
BEGIN
  SELECT ovis_role INTO v_role FROM public."user" WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin','broker') THEN
    RAISE EXCEPTION 'forbidden: admin or broker role required';
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

    INSERT INTO municipal_project (
      municipality_id, address, project_name, phase_label, parcel_numbers,
      location_description, parcel_boundary_notes,
      single_family_lots, townhouse_units, duplex_units, apt_units, cottage_units,
      total_housing_units, zoning, zoning_approval_date, notes, raw_stages,
      status_stage_id, builder_developer, permit_url, permit_application_date,
      source, source_research_run_id, centroid, geocoded_address
    ) VALUES (
      v_muni_id,
      COALESCE(v_row->>'address',                     v_staging.address),
      COALESCE(v_row->>'project_name',                v_staging.project_name, ''),
      COALESCE(v_row->>'phase_label',                 v_staging.phase_label, ''),
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
      v_staging.research_run_id,
      CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)
        ELSE NULL
      END,
      v_row->>'geocoded_address'
    )
    RETURNING id INTO v_mp_id;

    UPDATE municipal_project_staging
       SET approval_state = 'approved',
           approved_at = now(),
           approved_municipal_project_id = v_mp_id
     WHERE id = v_staging.id;
    v_approved_new := v_approved_new + 1;
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
$$;
-- Grants unchanged.
