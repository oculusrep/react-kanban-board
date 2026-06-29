-- Market Research Agent — add a way to kill a hung run.
--
-- Adds 'cancelled' to research_run.state's allowed values, plus an RPC
-- (admin/broker only) that flips a non-terminal run to 'cancelled'.
--
-- 'failed' is reserved for the agent error path. 'cancelled' is explicitly
-- for "the user gave up on this run" — distinct semantics for forensics.
--
-- Idempotent: cancelling a run that's already in a terminal state is a no-op.

ALTER TABLE public.research_run
  DROP CONSTRAINT IF EXISTS research_run_state_check;

ALTER TABLE public.research_run
  ADD CONSTRAINT research_run_state_check
  CHECK (state IN ('pending','running','awaiting_review','approved','archived','failed','cancelled'));

CREATE OR REPLACE FUNCTION public.cancel_research_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_prior text;
BEGIN
  SELECT ovis_role INTO v_role FROM public."user" WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin','broker') THEN
    RAISE EXCEPTION 'forbidden: admin or broker role required';
  END IF;

  SELECT state INTO v_prior FROM research_run WHERE id = p_run_id;
  IF v_prior IS NULL THEN
    RAISE EXCEPTION 'research_run % not found', p_run_id;
  END IF;
  IF v_prior IN ('approved','archived','failed','cancelled') THEN
    RETURN jsonb_build_object('cancelled', false, 'prior_state', v_prior);
  END IF;

  UPDATE research_run
     SET state = 'cancelled',
         completed_at = COALESCE(completed_at, now())
   WHERE id = p_run_id;

  RETURN jsonb_build_object('cancelled', true, 'prior_state', v_prior);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_research_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_research_run(uuid) TO authenticated;
