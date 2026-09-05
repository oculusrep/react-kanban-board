-- Market research — one live run per site.
--
-- The stall guard (20260904160000) made the SWEEP chunk loop sequential for
-- real. It does nothing for runs fired outside a sweep, and that is where the
-- worst observed overlap actually came from:
--
--   a14c3e7b  standalone deep, 2026-08-11 00:39 -> 01:15 UTC
--   ee1be095  standalone deep, 2026-08-11 00:45 -> 01:49 UTC
--
-- Six minutes apart, same Hall County scope, sweep_id NULL on both (they are
-- NOT chunks of the Aug 10 sweep f4b86098 — that sweep was already terminal at
-- 00:07). ~30 minutes of two concurrent agents. They independently staged the
-- same four BOC agenda items (2730/2468/2512/2579) under different project
-- names, and nothing caught it: the dup probes only look at committed
-- municipal_project rows, never at other staging rows, so two runs staged
-- concurrently are invisible to each other by construction (see
-- docs/MARKET_RESEARCH_DISCOVERY_SOURCE.md).
--
-- Fixing the dedupe probe is the deeper fix and is not this migration. This
-- closes the cheaper hole: don't let the second agent start.
--
-- Enforced in create_research_run_with_checklist rather than in the edge
-- function, because that RPC is the single chokepoint every path goes through
-- (ovis-research-trigger's user and internal/sweep paths, and the MCP
-- create_research_checklist tool), and because the check and the INSERT have to
-- be in one transaction to actually be a guard rather than a suggestion.
--
-- SCOPE NOTE: per SITE, and for any research_mode, not just deep. The invariant
-- is "at most one live agent per site" — a quick run staging on top of a live
-- deep run duplicates exactly the same way. It is deliberately NOT global:
-- concurrent runs on DIFFERENT sites still share the Firecrawl/Anthropic rate
-- limits, but serializing those would stop two sweeps from ever overlapping,
-- which is a bigger behavioural change than the evidence supports.

CREATE OR REPLACE FUNCTION public.create_research_run_with_checklist(
  p_site_id             uuid,
  p_radius_miles        int,
  p_boundary_muni_ids   uuid[],
  p_openclaw_run_id     text DEFAULT NULL,
  p_triggered_by        uuid DEFAULT NULL,
  p_pz_window_start     date DEFAULT NULL,
  p_pz_window_end       date DEFAULT NULL,
  p_permit_window_start date DEFAULT NULL,
  p_permit_window_end   date DEFAULT NULL,
  p_research_mode       text DEFAULT 'quick'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id     uuid;
  v_active_id  uuid;
  v_active_age int;
BEGIN
  IF p_boundary_muni_ids IS NULL OR array_length(p_boundary_muni_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'boundary_muni_ids must be a non-empty array';
  END IF;

  -- Serialize creation per site so two triggers landing in the same instant
  -- can't both pass the check. Namespaced by string prefix so it shares no lock
  -- space with advance_sweep's per-sweep lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('research_run_site:' || p_site_id::text, 0));

  -- A non-terminal run is a live claim on this site UNLESS something has
  -- already declared it dead. A sweep chunk that reached done/failed has
  -- disowned its run — advance_sweep's orphan path terminalizes the chunk
  -- first and the run a moment later, and the reaper is the backstop — so a
  -- disowned run must not block the sweep's next chunk and strand it as a
  -- spurious gap.
  SELECT r.id, round(extract(epoch FROM (now() - r.triggered_at)) / 60)
    INTO v_active_id, v_active_age
    FROM research_run r
   WHERE r.site_submit_id = p_site_id
     AND r.state IN ('pending', 'running')
     AND NOT EXISTS (
           SELECT 1 FROM research_sweep_chunk c
            WHERE c.research_run_id = r.id
              AND c.state IN ('done', 'failed'))
   ORDER BY r.triggered_at
   LIMIT 1;

  IF FOUND THEN
    -- 55006 = object_in_use. ovis-research-trigger maps this to HTTP 409 so the
    -- UI can say "already running" instead of "server error".
    RAISE EXCEPTION
      'site already has a live research run (%, started % min ago) — cancel it or wait for it to finish before starting another',
      v_active_id, v_active_age
      USING ERRCODE = '55006';
  END IF;

  INSERT INTO research_run (
    site_submit_id, radius_miles, state, openclaw_run_id, triggered_by,
    pz_window_start, pz_window_end, permit_window_start, permit_window_end,
    research_mode
  )
    VALUES (
      p_site_id, p_radius_miles, 'running', p_openclaw_run_id, p_triggered_by,
      p_pz_window_start, p_pz_window_end, p_permit_window_start, p_permit_window_end,
      p_research_mode
    )
    RETURNING id INTO v_run_id;

  INSERT INTO research_checklist_item (research_run_id, boundary_municipality_id, priority, status)
    SELECT v_run_id, bm_id, ord, 'pending'
      FROM unnest(p_boundary_muni_ids) WITH ORDINALITY AS u(bm_id, ord);

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_research_run_with_checklist(uuid, int, uuid[], text, uuid, date, date, date, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_research_run_with_checklist(uuid, int, uuid[], text, uuid, date, date, date, date, text)
  TO service_role;
