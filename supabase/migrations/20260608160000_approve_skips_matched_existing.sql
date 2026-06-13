-- Market Research Agent — fix: approve_research_staging_rows now respects
-- matched_existing_id so approving a "MATCHES EXISTING" row no longer
-- creates a literal duplicate row in municipal_project.
--
-- Behavior:
--   * matched_existing_id IS NULL  →  unchanged (INSERT into municipal_project,
--     auto-create municipality if needed, etc.)
--   * matched_existing_id IS NOT NULL  →  skip the INSERT. Point staging
--     row's approved_municipal_project_id at the EXISTING row. Mark approved.
--
-- Audit trail is preserved on both paths: the staging row keeps everything
-- the agent found (project_name overrides, builder, permit_url, etc.) for
-- future inspection. The canonical municipal_project table stays clean.
--
-- Return shape changes from { approved_count } to
--   { approved_new, approved_matched, created_municipality_count, research_run_id }
-- so the approval modal can show a useful split summary.

CREATE OR REPLACE FUNCTION public.approve_research_staging_rows(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role                  text;
  v_run_id                uuid;
  v_approved_new          int := 0;
  v_approved_matched      int := 0;
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
    SELECT *
      INTO v_staging
      FROM municipal_project_staging
     WHERE id = (v_row->>'staging_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'staging row not found: %', (v_row->>'staging_id');
    END IF;
    IF v_staging.approval_state <> 'pending' THEN
      CONTINUE; -- idempotent skip
    END IF;

    IF v_run_id IS NULL THEN v_run_id := v_staging.research_run_id; END IF;
    IF v_run_id <> v_staging.research_run_id THEN
      RAISE EXCEPTION 'all p_rows must belong to the same research_run (mixed: % vs %)',
        v_run_id, v_staging.research_run_id;
    END IF;

    -- ========================================================================
    --  MATCHED EXISTING — point at existing row, no INSERT.
    -- ========================================================================
    IF v_staging.matched_existing_id IS NOT NULL THEN
      UPDATE municipal_project_staging
         SET approval_state = 'approved',
             approved_at = now(),
             approved_municipal_project_id = v_staging.matched_existing_id
       WHERE id = v_staging.id;
      v_approved_matched := v_approved_matched + 1;
      CONTINUE;
    END IF;

    -- ========================================================================
    --  NEW — resolve municipality_id, INSERT into municipal_project.
    -- ========================================================================
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

      UPDATE municipal_project_staging
         SET municipality_id = v_muni_id
       WHERE id = v_staging.id;
    END IF;

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

    UPDATE municipal_project_staging
       SET approval_state = 'approved',
           approved_at = now(),
           approved_municipal_project_id = v_mp_id
     WHERE id = v_staging.id;

    v_approved_new := v_approved_new + 1;
  END LOOP;

  -- Transition run to 'approved' if we acted on any rows
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

-- Grants unchanged (authenticated, role-gated inside the function).
