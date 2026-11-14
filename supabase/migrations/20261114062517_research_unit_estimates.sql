-- Unit-count backfill for Market Research.
--
--   * units_confidence on municipal_project + staging: 'approved' | 'reported'
--     | 'estimated' | NULL. total_housing_units stays a plain integer (the map
--     reads it directly). Existing rows stay NULL.
--   * lead_reason on staging: a non-null reason forces the row into the
--     approval screen's Leads section whatever its count (e.g. outside radius).
--   * research_unit_estimate: one row per estimator attempt, with Gemini's
--     answer, sources, tokens and cost — the per-run cost is summed from here
--     onto research_run.unit_estimate_cost_cents.
--
-- Doc: docs/MARKET_RESEARCH_UNIT_ESTIMATES.md

ALTER TABLE public.municipal_project
  ADD COLUMN units_confidence text
    CHECK (units_confidence IN ('approved', 'reported', 'estimated'));
ALTER TABLE public.municipal_project_staging
  ADD COLUMN units_confidence text
    CHECK (units_confidence IN ('approved', 'reported', 'estimated')),
  ADD COLUMN lead_reason text;

ALTER TABLE public.research_run
  ADD COLUMN unit_estimate_calls      integer       NOT NULL DEFAULT 0,
  ADD COLUMN unit_estimate_cost_cents numeric(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN unit_estimate_ran_at     timestamptz;

CREATE TABLE public.research_unit_estimate (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id  uuid NOT NULL REFERENCES public.research_run(id) ON DELETE CASCADE,
  staging_id       uuid REFERENCES public.municipal_project_staging(id) ON DELETE SET NULL,
  project_name     text,
  -- gemini = count from grounded search; density = acreage x zoning density;
  -- lead = nothing found, row left for Leads; error = the Gemini call failed.
  method           text NOT NULL CHECK (method IN ('gemini', 'density', 'lead', 'error')),
  units            integer,
  acres            numeric,
  density_per_acre numeric,
  answer           text,
  sources          jsonb,
  model            text,
  input_tokens     integer,
  output_tokens    integer,
  cost_cents       numeric(10,4) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_unit_estimate_run_idx ON public.research_unit_estimate (research_run_id);

ALTER TABLE public.research_unit_estimate ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_unit_estimate_read ON public.research_unit_estimate
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.research_unit_estimate FROM anon, authenticated;
GRANT SELECT ON public.research_unit_estimate TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_unit_estimate TO service_role;

-- approve_research_staging_rows: rebuilt from the LIVE definition
-- (pg_get_functiondef, 2026-11-14); only change = units_confidence carried over.
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
      units_confidence  -- ADDED research_unit_estimates
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
      CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)
        ELSE NULL
      END,
      v_row->>'geocoded_address',
      -- Placement invariant: a pin has a source, no pin has a reason.
      CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
        THEN 'address_geocode' ELSE NULL END,
      CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL THEN NULL
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
           THEN v_staging.units_confidence ELSE NULL END
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
$function$
;

-- get_sweep_staging: rebuilt from the LIVE definition; return type gains units_confidence + lead_reason.
DROP FUNCTION public.get_sweep_staging(uuid);
CREATE FUNCTION public.get_sweep_staging(p_sweep_id uuid)
 RETURNS TABLE(id uuid, research_run_id uuid, sweep_chunk_index integer, boundary_municipality_id uuid, muni_name text, muni_kind text, matched_existing_id uuid, approval_state text, project_name text, address text, location_description text, parcel_boundary_notes text, total_housing_units integer, builder_developer text, permit_url text, permit_application_date date, source text, discovery_source text, discovery_source_raw text, notes text, reject_reason text, duplicate_of_staging_id uuid, duplicate_of_project_name text, duplicate_of_run_id uuid, duplicate_of_chunk_index integer, phase_label text, not_duplicate_of_ids uuid[], merged_into_staging_id uuid, is_merge_keeper boolean, units_needs_review boolean, units_review_reason text, units_confidence text, lead_reason text)
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
    s.units_needs_review, s.units_review_reason, s.units_confidence, s.lead_reason
  FROM municipal_project_staging s
  JOIN research_run r ON r.id = s.research_run_id AND r.sweep_id = p_sweep_id
  LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
  LEFT JOIN municipal_project_staging d ON d.id = s.duplicate_of_staging_id
  LEFT JOIN research_run dr ON dr.id = d.research_run_id
  ORDER BY bm.name, r.sweep_chunk_index, s.created_at;
$function$
;
REVOKE ALL ON FUNCTION public.get_sweep_staging(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sweep_staging(uuid) TO authenticated, service_role;
