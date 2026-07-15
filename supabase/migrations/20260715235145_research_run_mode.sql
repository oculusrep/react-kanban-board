-- Market Research windowing — add run MODE (quick vs deep).
--
-- Tiers are no longer just window sizes; they select a materially different
-- agent protocol:
--   quick — sampled "sniff test": free-form search, samples ~10 P&Z agendas to
--           estimate density, returns a directional recommendation. Makes NO
--           completeness claim. ~$5. Triage on every prospect.
--   deep  — "package run": full enumeration of every P&Z agenda + every
--           development-scale permit in the window, with a mandatory coverage
--           report (real denominators). ~$30. Run once on the pitched site.
--
-- Stored on the run so (a) the agent-side protocol branch is auditable and
-- (b) the coverage map can count ONLY deep runs — a sampled quick scan has not
-- "covered" a window in any defensible sense and must not imply it did.
-- NULL on pre-mode runs (they were the old sampled behavior ≈ quick, and are
-- likewise excluded from deep coverage).

ALTER TABLE public.research_run
  ADD COLUMN research_mode text
    CHECK (research_mode IN ('quick','deep'));

COMMENT ON COLUMN public.research_run.research_mode IS
  'Agent protocol: quick = sampled sniff test (no completeness claim); deep = full enumeration + coverage report. NULL on pre-mode runs. ONLY deep runs count toward the coverage map.';

-- Extend create_research_run_with_checklist to persist the mode. Signature grows
-- (10th param), so DROP the 9-arg version first to avoid an ambiguous overload.
-- Body carried forward verbatim from the increment-1 (windowing) definition plus
-- research_mode in the INSERT.
DROP FUNCTION IF EXISTS public.create_research_run_with_checklist(uuid, int, uuid[], text, uuid, date, date, date, date);

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
  v_run_id uuid;
BEGIN
  IF p_boundary_muni_ids IS NULL OR array_length(p_boundary_muni_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'boundary_muni_ids must be a non-empty array';
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

REVOKE ALL ON FUNCTION public.create_research_run_with_checklist(uuid, int, uuid[], text, uuid, date, date, date, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_research_run_with_checklist(uuid, int, uuid[], text, uuid, date, date, date, date, text) TO service_role;
