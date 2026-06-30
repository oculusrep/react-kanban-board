-- Market Research Agent — permission helpers + switch role-based RPC gates to use them.
--
-- The Phase B–E RPCs (cancel_research_run, approve_research_staging_rows,
-- reject_research_staging_row) hard-coded `ovis_role IN ('admin','broker')`.
-- That made it impossible to grant either of these abilities to anyone outside
-- those two roles. Now permission-driven, with two SECURITY DEFINER helper
-- functions modeled exactly on user_has_municipal_access() (20260529201227):
--
--   user_has_market_research_run_access()      — Start Research + Cancel
--   user_has_market_research_approve_access()  — Approve & Commit + Reject
--
-- Each helper:
--   - Joins auth.uid() → user.auth_user_id (NOT user.id — that bug is documented
--     in the municipal helper migration).
--   - Admin role (ovis_role='admin') always passes, no permission lookup needed.
--   - Otherwise COALESCE user-level override → role default → false. Matches
--     the merged-permission resolution the client-side usePermissions() hook
--     uses.

CREATE OR REPLACE FUNCTION public.user_has_market_research_run_access()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM "user" u
    LEFT JOIN role r ON r.name = u.ovis_role
    WHERE u.auth_user_id = auth.uid()
      AND (
        u.ovis_role = 'admin'
        OR COALESCE(
             (u.permissions ->> 'can_run_market_research')::boolean,
             (r.permissions ->> 'can_run_market_research')::boolean,
             FALSE
           ) = TRUE
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_market_research_approve_access()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM "user" u
    LEFT JOIN role r ON r.name = u.ovis_role
    WHERE u.auth_user_id = auth.uid()
      AND (
        u.ovis_role = 'admin'
        OR COALESCE(
             (u.permissions ->> 'can_approve_market_research')::boolean,
             (r.permissions ->> 'can_approve_market_research')::boolean,
             FALSE
           ) = TRUE
      )
  );
$function$;

-- ----------------------------------------------------------------------------
-- Replace the role-based gates in the three RPCs with the new helpers.
-- Function bodies are otherwise unchanged from their previous revisions.
-- ----------------------------------------------------------------------------

-- cancel_research_run: was 20260629140000
CREATE OR REPLACE FUNCTION public.cancel_research_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prior text;
BEGIN
  IF NOT public.user_has_market_research_run_access() THEN
    RAISE EXCEPTION 'forbidden: can_run_market_research required';
  END IF;

  SELECT state INTO v_prior FROM research_run WHERE id = p_run_id;
  IF v_prior IS NULL THEN
    RAISE EXCEPTION 'research_run % not found', p_run_id;
  END IF;
  IF v_prior IN ('approved','archived','failed','cancelled') THEN
    RETURN jsonb_build_object('cancelled', false, 'prior_state', v_prior);
  END IF;

  UPDATE research_run
     SET state = 'cancelled',
         completed_at = COALESCE(completed_at, now())
   WHERE id = p_run_id;

  RETURN jsonb_build_object('cancelled', true, 'prior_state', v_prior);
END;
$$;

-- reject_research_staging_row: was in 20260608160000 (then 20260608120000)
CREATE OR REPLACE FUNCTION public.reject_research_staging_row(p_staging_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_did boolean;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  UPDATE municipal_project_staging
     SET approval_state = 'rejected'
   WHERE id = p_staging_id AND approval_state = 'pending';
  v_did := FOUND;

  RETURN jsonb_build_object('rejected', v_did);
END;
$$;

-- approve_research_staging_rows: was 20260629170000.
-- Only the role check at the top changes; the rest of the function body is
-- identical to that revision.
CREATE OR REPLACE FUNCTION public.approve_research_staging_rows(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
