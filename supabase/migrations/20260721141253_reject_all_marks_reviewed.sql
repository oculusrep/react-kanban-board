-- Market Research — a run where every candidate is REJECTED (nothing committed)
-- was stuck at state='awaiting_review' forever: approve_research_staging_rows is
-- the only thing that moved a run terminal, and rejecting doesn't approve.
--
-- Fix: treat "no pending rows left on an awaiting_review run" as reviewed and
-- move it to 'archived' (an existing terminal, read-only run state that nothing
-- else assigns to research runs — surfaced as "Reviewed" in the runs panel).
--
--   1. reject_research_staging_row now auto-archives the run when it rejects the
--      LAST pending row (so "reject all" self-closes going forward).
--   2. mark_research_run_reviewed(run_id) — explicit close-out for runs already
--      sitting all-rejected (nothing left to trigger #1) or as a manual control.

CREATE OR REPLACE FUNCTION public.reject_research_staging_row(p_staging_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_did      boolean;
  v_run_id   uuid;
  v_pending  int;
  v_reviewed boolean := false;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  UPDATE municipal_project_staging
     SET approval_state = 'rejected'
   WHERE id = p_staging_id AND approval_state = 'pending'
   RETURNING research_run_id INTO v_run_id;
  v_did := FOUND;

  -- Last pending row gone on an awaiting_review run => fully reviewed, nothing
  -- to commit. Move it terminal so it stops showing as awaiting review.
  IF v_did AND v_run_id IS NOT NULL THEN
    SELECT count(*) INTO v_pending
      FROM municipal_project_staging
     WHERE research_run_id = v_run_id AND approval_state = 'pending';
    IF v_pending = 0 THEN
      UPDATE research_run
         SET state = 'archived', completed_at = COALESCE(completed_at, now())
       WHERE id = v_run_id AND state = 'awaiting_review';
      v_reviewed := FOUND;
    END IF;
  END IF;

  RETURN jsonb_build_object('rejected', v_did, 'run_reviewed', v_reviewed);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_research_staging_row(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_research_staging_row(uuid) TO authenticated, service_role;

-- Explicit close-out: mark an awaiting_review run with zero pending rows as
-- reviewed. Idempotent; no-op (reviewed=false) if the run has pending rows or is
-- already terminal.
CREATE OR REPLACE FUNCTION public.mark_research_run_reviewed(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending  int;
  v_reviewed boolean := false;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  SELECT count(*) INTO v_pending
    FROM municipal_project_staging
   WHERE research_run_id = p_run_id AND approval_state = 'pending';

  IF v_pending = 0 THEN
    UPDATE research_run
       SET state = 'archived', completed_at = COALESCE(completed_at, now())
     WHERE id = p_run_id AND state = 'awaiting_review';
    v_reviewed := FOUND;
  END IF;

  RETURN jsonb_build_object('reviewed', v_reviewed, 'pending', v_pending);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_research_run_reviewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_research_run_reviewed(uuid) TO authenticated, service_role;
