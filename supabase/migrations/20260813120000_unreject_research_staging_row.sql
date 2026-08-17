-- Market Research — reject was a one-way door in the UI. Rejected staging rows
-- are soft-deleted (approval_state='rejected', kept forever for audit — see
-- 20260606130000), so the data was always recoverable; there was simply no RPC
-- to flip a row back. Reviewers had to get every reject right the first time,
-- which is exactly the wrong incentive on a dedupe screen where "which of these
-- two is the real one" is genuinely ambiguous.
--
-- unreject_research_staging_row is the inverse of reject_research_staging_row
-- (20260721141253): it moves a row 'rejected' -> 'pending' and, because that run
-- now has work to review again, re-opens a run that reject had auto-closed.
--
-- Re-open scope: reject only ever moves a run to 'archived' from 'awaiting_review'
-- ("archived" is otherwise unused for research runs — see the reject migration's
-- note), and approve moves it to 'approved'. Either terminal state can legitimately
-- still carry rejected rows, so un-rejecting one means the run has a pending row
-- again and belongs back in the review queue. We therefore re-open from BOTH
-- 'archived' and 'approved' back to 'awaiting_review'. Running/pending/failed/
-- cancelled runs are left untouched.

CREATE OR REPLACE FUNCTION public.unreject_research_staging_row(p_staging_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_did      boolean;
  v_run_id   uuid;
  v_reopened boolean := false;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  UPDATE municipal_project_staging
     SET approval_state = 'pending'
   WHERE id = p_staging_id AND approval_state = 'rejected'
   RETURNING research_run_id INTO v_run_id;
  v_did := FOUND;

  -- The run has a pending row again -> pull it back out of its terminal state so
  -- it re-surfaces in the review queue. completed_at is left as-is (audit trail).
  IF v_did AND v_run_id IS NOT NULL THEN
    UPDATE research_run
       SET state = 'awaiting_review'
     WHERE id = v_run_id AND state IN ('archived', 'approved');
    v_reopened := FOUND;
  END IF;

  RETURN jsonb_build_object('unrejected', v_did, 'run_reopened', v_reopened);
END;
$$;

REVOKE ALL ON FUNCTION public.unreject_research_staging_row(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unreject_research_staging_row(uuid) TO authenticated, service_role;
