-- Make submit_research_report idempotent per research_run + harden field casts.
--
-- Context: on the 2026-07-13 market-research run (run 7389ced0-...), the agent
-- called submit_research_report more than once on the SAME research_run_id. The
-- prior version blindly INSERTed on every call, so the retries APPENDED rows and
-- produced duplicate staging records (Chamblin Road Gateway Development, Baker
-- Place Subdivision, Light Hill Creek, Hamilton Grove — each staged twice).
--
-- Two fixes here:
--
--   1) Idempotency (replace-on-resubmit). A second submit on the same run_id
--      wipes that run's still-PENDING staging rows and re-inserts the fresh
--      batch — last-write-wins, never append. If ANY staging row for the run has
--      already left 'pending' (approved/rejected by a human reviewer), the call
--      is REJECTED instead: re-staging then would orphan promoted
--      municipal_project rows or silently discard reviewer decisions.
--
--   2) Defensive numeric/date casts. The most likely trigger of the original
--      failure was a value-level cast crash on an optional field (a non-ISO date
--      or non-numeric unit count) in the richer "full detail" payload — the
--      minimal-record workaround succeeded with the same municipalities, which
--      rules out the off-checklist guard (the only explicit validation) and
--      points at an implicit ::int / ::date cast aborting the whole batch. Bad
--      optional values now fall back to NULL instead of failing the submit,
--      matching the tool's existing "unknown status_name -> NULL silently"
--      contract.
--
-- Replaces public.submit_research_report from
-- 20260629170000_add_location_description_and_parcel_boundary_notes.sql.

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
  v_reviewed        int := 0;
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

  -- Idempotency guard (per run). submit_research_report is the single end-of-run
  -- write, but an agent retry can invoke it more than once on the same run_id.
  -- If a human has already acted on this run's staging rows, refuse to re-stage.
  SELECT COUNT(*) INTO v_reviewed
  FROM municipal_project_staging
  WHERE research_run_id = p_run_id
    AND approval_state <> 'pending';
  IF v_reviewed > 0 THEN
    RAISE EXCEPTION 'run_already_reviewed: run % has % staging row(s) already approved/rejected; refusing to re-stage. Start a new research_run instead.',
      p_run_id, v_reviewed;
  END IF;

  -- Replace-on-resubmit: drop this run's prior PENDING rows so a retry can never
  -- double-stage. Fresh batch below becomes the authoritative staged set.
  DELETE FROM municipal_project_staging
   WHERE research_run_id = p_run_id
     AND approval_state = 'pending';

  WITH parsed AS (
    SELECT
      (c->>'boundary_municipality_id')::uuid AS bm_id,
      c->>'project_name'                     AS project_name,
      c->>'address'                          AS address,
      c->>'location_description'             AS location_description,
      c->>'parcel_boundary_notes'            AS parcel_boundary_notes,
      COALESCE(c->>'phase_label','')         AS phase_label,
      -- Defensive casts: a single malformed optional value must not abort the
      -- batch (root cause of the 2026-07-13 duplicate-staging run).
      CASE WHEN c->>'total_housing_units' ~ '^-?\d+$' THEN (c->>'total_housing_units')::int END AS total_housing_units,
      CASE WHEN c->>'single_family_lots'  ~ '^-?\d+$' THEN (c->>'single_family_lots')::int  END AS single_family_lots,
      CASE WHEN c->>'townhouse_units'     ~ '^-?\d+$' THEN (c->>'townhouse_units')::int     END AS townhouse_units,
      CASE WHEN c->>'duplex_units'        ~ '^-?\d+$' THEN (c->>'duplex_units')::int        END AS duplex_units,
      CASE WHEN c->>'apt_units'           ~ '^-?\d+$' THEN (c->>'apt_units')::int           END AS apt_units,
      CASE WHEN c->>'cottage_units'       ~ '^-?\d+$' THEN (c->>'cottage_units')::int       END AS cottage_units,
      c->>'zoning'                           AS zoning,
      CASE WHEN c->>'zoning_approval_date'    ~ '^\d{4}-\d{2}-\d{2}$' THEN (c->>'zoning_approval_date')::date    END AS zoning_approval_date,
      c->>'builder_developer'                AS builder_developer,
      c->>'permit_url'                       AS permit_url,
      CASE WHEN c->>'permit_application_date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (c->>'permit_application_date')::date END AS permit_application_date,
      c->>'source'                           AS source,
      c->>'notes'                            AS notes,
      COALESCE(
        CASE WHEN c->>'status_stage_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN (c->>'status_stage_id')::uuid END,
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

REVOKE ALL ON FUNCTION public.submit_research_report(uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_research_report(uuid, jsonb, text, text) TO service_role;
