-- Market Research windowing (run depth tiers) — DB foundation.
--
-- Adds an explicit, per-record-type search window to each research_run so a run
-- searches only a bounded date range instead of the agent's hardcoded lookback.
-- Two independent windows because the Quick tier is asymmetric (P&Z/rezoning
-- approvals lead construction, so they get a wider lookback than permits):
--   pz_window_*     — P&Z / rezoning / approvals search bounds
--   permit_window_* — permit search bounds
-- Both are [older_start .. newer_end], inclusive, stored as the SAME bounds OVIS
-- emits to the agent (see buildOpenClawMessage) so coverage tracking reflects
-- exactly what was searched. NULL on historical (pre-windowing) runs.
--
-- News/context has NO window column: the agent scopes news to pz_window (outer
-- envelope) and judges the reported event's date, since article date != event
-- date. See project memory project_market_research_windowing.
--
-- Locked trigger contract (Mike writes the OpenClaw agent side to read these):
--   pz_window_start / pz_window_end / permit_window_start / permit_window_end
--   YYYY-MM-DD, Eastern local date, inclusive, *_start older / *_end newer.

ALTER TABLE public.research_run
  ADD COLUMN pz_window_start     date,
  ADD COLUMN pz_window_end       date,
  ADD COLUMN permit_window_start date,
  ADD COLUMN permit_window_end   date;

COMMENT ON COLUMN public.research_run.pz_window_start     IS 'Older bound (inclusive) of the P&Z/rezoning search window actually searched by this run. NULL on pre-windowing runs.';
COMMENT ON COLUMN public.research_run.pz_window_end       IS 'Newer bound (inclusive) of the P&Z/rezoning search window.';
COMMENT ON COLUMN public.research_run.permit_window_start IS 'Older bound (inclusive) of the permit search window.';
COMMENT ON COLUMN public.research_run.permit_window_end   IS 'Newer bound (inclusive) of the permit search window.';

-- Extend create_research_run_with_checklist to persist the window bounds.
-- Signature changes (4 new params), so DROP the old signature first to avoid
-- leaving an ambiguous overload. Body is carried forward verbatim from the live
-- definition plus the window INSERT — nothing else changed.
DROP FUNCTION IF EXISTS public.create_research_run_with_checklist(uuid, int, uuid[], text, uuid);

CREATE OR REPLACE FUNCTION public.create_research_run_with_checklist(
  p_site_id             uuid,
  p_radius_miles        int,
  p_boundary_muni_ids   uuid[],
  p_openclaw_run_id     text DEFAULT NULL,
  p_triggered_by        uuid DEFAULT NULL,
  p_pz_window_start     date DEFAULT NULL,
  p_pz_window_end       date DEFAULT NULL,
  p_permit_window_start date DEFAULT NULL,
  p_permit_window_end   date DEFAULT NULL
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

  INSERT INTO research_run (
    site_submit_id, radius_miles, state, openclaw_run_id, triggered_by,
    pz_window_start, pz_window_end, permit_window_start, permit_window_end
  )
    VALUES (
      p_site_id, p_radius_miles, 'running', p_openclaw_run_id, p_triggered_by,
      p_pz_window_start, p_pz_window_end, p_permit_window_start, p_permit_window_end
    )
    RETURNING id INTO v_run_id;

  INSERT INTO research_checklist_item (research_run_id, boundary_municipality_id, priority, status)
    SELECT v_run_id, bm_id, ord, 'pending'
      FROM unnest(p_boundary_muni_ids) WITH ORDINALITY AS u(bm_id, ord);

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_research_run_with_checklist(uuid, int, uuid[], text, uuid, date, date, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_research_run_with_checklist(uuid, int, uuid[], text, uuid, date, date, date, date) TO service_role;
