-- Market Research Agent — Phase D refinement (orchestration pivot, 2026-06-08)
--
-- Adds layer-3 of the three-layer defense the user requested: even if OpenClaw
-- decides to research extra municipalities off the user-frozen checklist, the
-- MCP submit_research_report tool will refuse to land any staging row whose
-- boundary_municipality_id is not on the run's research_checklist_item set.
--
-- Layer 1 (UI checkbox), Layer 2 (server-side run creation) live in
-- supabase/functions/ovis-research-trigger/index.ts. This file adds layer 3.
--
-- Replaces public.submit_research_report from 20260607120000_market_research_mcp_rpcs.sql.

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
  -- Layer 3 guard: every candidate's boundary_municipality_id must be on the
  -- run's checklist. Reject the whole batch if any are off-list — agent must
  -- resubmit a clean payload, can't silently leak off-checklist findings in.
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

  -- Same INSERT logic as the original — see 20260607120000_market_research_mcp_rpcs.sql
  -- for inline commentary on the CTE chain.
  WITH parsed AS (
    SELECT
      (c->>'boundary_municipality_id')::uuid AS bm_id,
      c->>'project_name'                     AS project_name,
      c->>'address'                          AS address,
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
      (c->>'status_stage_id')::uuid          AS status_stage_id,
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
      single_family_lots, townhouse_units, duplex_units, apt_units, cottage_units,
      total_housing_units,
      zoning, zoning_approval_date, notes, raw_stages, status_stage_id,
      builder_developer, permit_url, permit_application_date, source,
      matched_existing_id, approval_state
    )
    SELECT
      p_run_id, r.bm_id, r.municipality_id,
      r.project_name, r.address, r.phase_label,
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

-- Grants stay as set by 20260607120000_market_research_mcp_rpcs.sql (service_role only).
