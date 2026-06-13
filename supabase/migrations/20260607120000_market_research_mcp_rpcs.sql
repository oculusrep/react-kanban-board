-- Market Research Agent — Phase C: RPC functions backing the MCP edge function tools.
-- See docs/MARKET_RESEARCH_AGENT_V1_PLAN.md Phase C.
--
-- supabase-js can't issue raw SQL, and these tools all need PostGIS / multi-row
-- transactions / cross-table dup detection. So each tool that's not a trivial
-- single-row UPDATE has a SECURITY DEFINER function here, locked down to service_role.
--
-- Three RPCs in this migration:
--   1) get_municipalities_in_radius_for_site — backs the get_municipalities_in_radius tool
--   2) create_research_run_with_checklist  — backs the create_research_checklist tool
--   3) submit_research_report               — backs the submit_research_report tool
--
-- The update_checklist_status tool calls supabase-js .update() directly (no RPC needed).

-- ============================================================================
-- 1) get_municipalities_in_radius_for_site
--    Resolves site_submit lat/lng (preferring verified over Salesforce snapshot),
--    runs ST_DWithin against boundary_municipality, returns ordered list.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_municipalities_in_radius_for_site(
  p_site_id      uuid,
  p_radius_miles int DEFAULT 10
) RETURNS TABLE(
  boundary_municipality_id uuid,
  kind                     text,
  name                     text,
  geoid                    text,
  distance_mi              numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lat numeric;
  v_lng numeric;
BEGIN
  SELECT COALESCE(verified_latitude,  sf_property_latitude),
         COALESCE(verified_longitude, sf_property_longitude)
    INTO v_lat, v_lng
    FROM site_submit
   WHERE id = p_site_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'site_submit % not found', p_site_id;
  END IF;
  IF v_lat IS NULL OR v_lng IS NULL THEN
    RAISE EXCEPTION 'site_submit % has no lat/lng (neither verified_* nor sf_property_*)', p_site_id;
  END IF;
  IF p_radius_miles < 1 OR p_radius_miles > 50 THEN
    RAISE EXCEPTION 'radius_miles % out of range (1..50)', p_radius_miles;
  END IF;

  RETURN QUERY
    SELECT
      bm.id,
      bm.kind,
      bm.name,
      bm.geoid,
      ROUND((ST_Distance(
        bm.centroid::geography,
        ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography
      ) / 1609.344)::numeric, 2) AS distance_mi
    FROM boundary_municipality bm
    WHERE bm.state = 'GA'  -- v1 limit; expand via passing state arg later
      AND ST_DWithin(
        bm.centroid::geography,
        ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography,
        p_radius_miles * 1609.344
      )
    ORDER BY distance_mi;
END;
$$;

REVOKE ALL ON FUNCTION public.get_municipalities_in_radius_for_site(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_municipalities_in_radius_for_site(uuid, int) TO service_role;

-- ============================================================================
-- 2) create_research_run_with_checklist
--    Atomic: inserts research_run + research_checklist_item rows in one transaction.
--    Boundary IDs are inserted in array order; priority = array index + 1.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_research_run_with_checklist(
  p_site_id           uuid,
  p_radius_miles      int,
  p_boundary_muni_ids uuid[],
  p_openclaw_run_id   text DEFAULT NULL,
  p_triggered_by      uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
BEGIN
  IF p_boundary_muni_ids IS NULL OR array_length(p_boundary_muni_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'boundary_muni_ids must be a non-empty array';
  END IF;

  INSERT INTO research_run (site_submit_id, radius_miles, state, openclaw_run_id, triggered_by)
    VALUES (p_site_id, p_radius_miles, 'running', p_openclaw_run_id, p_triggered_by)
    RETURNING id INTO v_run_id;

  INSERT INTO research_checklist_item (research_run_id, boundary_municipality_id, priority, status)
    SELECT v_run_id, bm_id, ord, 'pending'
      FROM unnest(p_boundary_muni_ids) WITH ORDINALITY AS u(bm_id, ord);

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_research_run_with_checklist(uuid, int, uuid[], text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_research_run_with_checklist(uuid, int, uuid[], text, uuid) TO service_role;

-- ============================================================================
-- 3) submit_research_report
--    Atomic batch write:
--      a) Insert candidate staging rows from p_candidates jsonb array.
--      b) For each, server-side dup detection:
--           - Resolve municipality_id by case-insensitive match against
--             boundary_municipality.name → municipality.name.
--           - If municipality exists, scan municipal_project for matches by
--             normalized (project_name, address). First match wins.
--           - Set matched_existing_id on the staging row.
--      c) Update research_run.state = 'awaiting_review', save needs_review +
--         alt_avenues + completed_at.
--    Returns count of staging rows inserted.
--
--    Expected candidate shape (per item):
--      {
--        "boundary_municipality_id": "uuid",
--        "project_name": "Winder Crossing",
--        "address": "100 Maple St",
--        "phase_label": "",
--        "total_housing_units": 50,
--        "single_family_lots": null,
--        "townhouse_units": null,
--        "duplex_units": null,
--        "apt_units": null,
--        "cottage_units": null,
--        "zoning": null,
--        "zoning_approval_date": null,
--        "builder_developer": "ABC Homes",
--        "permit_url": "https://citizens.example/permit/123",
--        "permit_application_date": "2026-03-15",
--        "source": "Citizens Portal permit #123",
--        "notes": null,
--        "status_stage_id": null,
--        "raw_stages": {}
--      }
-- ============================================================================
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
  v_inserted int := 0;
BEGIN
  -- Step a + b: insert staging rows with dup detection in a single CTE.
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
      -- Dup detection: find existing municipal_project where the normalized
      -- (project_name, address) matches and the municipality matches.
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

  -- Step c: update run state to awaiting_review + write narrative fields.
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
