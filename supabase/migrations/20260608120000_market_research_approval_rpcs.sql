-- Market Research Agent — Phase E: Approval RPCs
--
-- Two functions back the Approve & Commit workflow on the research_run
-- approval modal. Both check the caller's ovis_role inside the function
-- (admin or broker only) so they can be called directly from the browser
-- via supabase-js .rpc(); no separate edge function needed.
--
-- See docs/MARKET_RESEARCH_AGENT_V1_PLAN.md Phase E + decision #10
-- (auto-create municipality on promote).

-- ============================================================================
-- approve_research_staging_rows
--   - Promotes each given staging row into municipal_project, applying per-row
--     edits supplied by the approval UI.
--   - Auto-creates a municipality row if the staging row's boundary_municipality
--     doesn't yet have an OVIS municipality counterpart (decision #10):
--       case-insensitive name match against municipality.(name, state); if
--       no match, INSERT a new row using boundary_municipality.name verbatim
--       (which already follows the OVIS convention — counties "Barrow County",
--       cities "Winder" — set during Phase A backfill).
--   - Marks the staging row approved (approval_state='approved', approved_at,
--     approved_municipal_project_id) and the research_run done
--     (research_run.state='approved').
--   - Idempotent: rows already in approval_state='approved' or 'rejected' are
--     skipped.
--
--  p_rows shape (per item):
--    {
--      staging_id              uuid (required),
--      project_name            text (override; falls back to staging.project_name),
--      address                 text,
--      phase_label             text,
--      total_housing_units     int,
--      single_family_lots      int,
--      townhouse_units         int,
--      duplex_units            int,
--      apt_units               int,
--      cottage_units           int,
--      zoning                  text,
--      zoning_approval_date    date,
--      builder_developer       text,
--      permit_url              text,
--      permit_application_date date,
--      source                  text,
--      notes                   text
--    }
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_research_staging_rows(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role                  text;
  v_run_id                uuid;
  v_approved_count        int := 0;
  v_created_municipalities int := 0;
  v_row                   jsonb;
  v_staging               record;
  v_muni_id               uuid;
  v_bm                    record;
  v_mp_id                 uuid;
BEGIN
  -- Role gate
  SELECT ovis_role INTO v_role FROM public."user" WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin','broker') THEN
    RAISE EXCEPTION 'forbidden: admin or broker role required';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'p_rows must be a non-empty jsonb array';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    -- Fetch the staging row
    SELECT *
      INTO v_staging
      FROM municipal_project_staging
     WHERE id = (v_row->>'staging_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'staging row not found: %', (v_row->>'staging_id');
    END IF;

    -- Idempotency: skip if already resolved
    IF v_staging.approval_state <> 'pending' THEN
      CONTINUE;
    END IF;

    -- Capture run_id (all rows must belong to the same run; checked at end)
    IF v_run_id IS NULL THEN v_run_id := v_staging.research_run_id; END IF;
    IF v_run_id <> v_staging.research_run_id THEN
      RAISE EXCEPTION 'all p_rows must belong to the same research_run (mixed: % vs %)',
        v_run_id, v_staging.research_run_id;
    END IF;

    -- Resolve municipality_id, find-or-create per decision #10
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
        INSERT INTO municipality (name, state)
          VALUES (v_bm.name, v_bm.state)
          RETURNING id INTO v_muni_id;
        v_created_municipalities := v_created_municipalities + 1;
      END IF;

      -- Backfill the staging row with the resolved municipality_id
      UPDATE municipal_project_staging
         SET municipality_id = v_muni_id
       WHERE id = v_staging.id;
    END IF;

    -- INSERT into municipal_project using per-row edits (with staging fallback)
    INSERT INTO municipal_project (
      municipality_id,
      address,
      project_name,
      phase_label,
      parcel_numbers,
      single_family_lots,
      townhouse_units,
      duplex_units,
      apt_units,
      cottage_units,
      total_housing_units,
      zoning,
      zoning_approval_date,
      notes,
      raw_stages,
      status_stage_id,
      builder_developer,
      permit_url,
      permit_application_date,
      source,
      source_research_run_id
    ) VALUES (
      v_muni_id,
      COALESCE(v_row->>'address',                     v_staging.address),
      COALESCE(v_row->>'project_name',                v_staging.project_name, ''),
      COALESCE(v_row->>'phase_label',                 v_staging.phase_label, ''),
      v_staging.parcel_numbers,
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
      v_staging.research_run_id
    )
    RETURNING id INTO v_mp_id;

    -- Mark staging row approved + backlink
    UPDATE municipal_project_staging
       SET approval_state = 'approved',
           approved_at = now(),
           approved_municipal_project_id = v_mp_id
     WHERE id = v_staging.id;

    v_approved_count := v_approved_count + 1;
  END LOOP;

  -- Transition the run to 'approved' (signals "review done", regardless of pending leftover rows).
  IF v_run_id IS NOT NULL THEN
    UPDATE research_run
       SET state = 'approved',
           completed_at = COALESCE(completed_at, now())
     WHERE id = v_run_id;
  END IF;

  RETURN jsonb_build_object(
    'approved_count',           v_approved_count,
    'created_municipality_count', v_created_municipalities,
    'research_run_id',          v_run_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_research_staging_rows(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_research_staging_rows(jsonb) TO authenticated;

-- ============================================================================
-- reject_research_staging_row
--   Marks one staging row approval_state='rejected'. Kept forever for audit.
--   Idempotent — rows already rejected return { rejected: false }.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reject_research_staging_row(p_staging_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_did boolean;
BEGIN
  SELECT ovis_role INTO v_role FROM public."user" WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin','broker') THEN
    RAISE EXCEPTION 'forbidden: admin or broker role required';
  END IF;

  UPDATE municipal_project_staging
     SET approval_state = 'rejected'
   WHERE id = p_staging_id AND approval_state = 'pending';
  v_did := FOUND;

  RETURN jsonb_build_object('rejected', v_did);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_research_staging_row(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_research_staging_row(uuid) TO authenticated;
