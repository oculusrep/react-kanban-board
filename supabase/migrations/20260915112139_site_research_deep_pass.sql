-- Site research Step 2 (deep pass) on the background run engine.
-- Design: docs/SITE_RESEARCH_STEP2_DEEP_PASS_PLAN.md ("As built").
--
-- A deep_pass run is ONE research_thread_run that moves through four phases:
--   prepare      code only: read Step 1's persisted school results, check NCES EDGE, build the fill list
--   school_fill  model: fill null enrollment / unconfirmed addresses (deep_pass_school_fill prompt, 15 searches)
--   deep_pass    model: go deep on the story carriers, record employers, write the case (deep_pass prompt, 20 searches)
--   exports      code only: schools.csv + employers.csv to the site submit's Dropbox folder, then finalize
-- Each phase has its own conversation, prompt and search budget. Iterations, attempts, leases,
-- step rows and cost are the existing engine's, unchanged.
--
-- claim_thread_run and the enqueue path are rebuilt from their LIVE definitions
-- (pg_get_functiondef, 2026-09-15), not from the older migration file.

ALTER TABLE public.research_thread_run
  ADD COLUMN pass_phase text,
  ADD COLUMN phase_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN phase_iteration_base integer NOT NULL DEFAULT 0,
  ADD COLUMN phase_search_base integer NOT NULL DEFAULT 0;

ALTER TABLE public.research_thread_run
  ADD CONSTRAINT research_thread_run_pass_phase_check
    CHECK (pass_phase IS NULL OR pass_phase IN ('prepare', 'school_fill', 'deep_pass', 'exports')),
  ADD CONSTRAINT research_thread_run_pass_phase_kind_check
    CHECK ((kind = 'deep_pass') = (pass_phase IS NOT NULL)),
  ADD CONSTRAINT research_thread_run_phase_bases_check
    CHECK (phase_iteration_base >= 0 AND phase_search_base >= 0);

COMMENT ON COLUMN public.research_thread_run.pass_phase IS
  'deep_pass runs only: prepare | school_fill | deep_pass | exports. NULL for archetype and turn runs.';
COMMENT ON COLUMN public.research_thread_run.phase_state IS
  'deep_pass runs only: data carried between phases (school rows and banded totals from Step 1, fill list, fill summary, report text, export results).';
COMMENT ON COLUMN public.research_thread_run.phase_search_base IS
  'web_search_requests when the current phase began. search_budget is cumulative: phase budget = search_budget - phase_search_base.';
COMMENT ON COLUMN public.research_thread_run.phase_iteration_base IS
  'iteration when the current phase began; the per-phase iteration ceiling counts from here.';

-- ---------------------------------------------------------------------------
-- claim_thread_run: live definition + phase fields and the thread's archetype in the payload.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_thread_run(p_run_id uuid, p_owner uuid, p_lease_seconds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run     research_thread_run%ROWTYPE;
  v_thread  research_thread%ROWTYPE;
  v_retry   numeric(10,6);
  v_attempt int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_run_id::text, 1));
  SELECT * INTO v_run FROM research_thread_run WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.state NOT IN ('queued', 'running') THEN RETURN NULL; END IF;
  IF v_run.lease_owner IS NOT NULL AND v_run.lease_expires_at > now() THEN RETURN NULL; END IF;

  -- Any attempt still 'in_progress' at this iteration belongs to a worker that
  -- died. Its cost is already on the run (recorded at response time); account it
  -- as retry cost and mark it discarded.
  WITH d AS (
    UPDATE research_thread_run_step
       SET outcome = 'discarded', finished_at = COALESCE(finished_at, now()),
           error = COALESCE(error, 'worker died or lease expired before this attempt committed')
     WHERE run_id = p_run_id AND iteration = v_run.iteration AND outcome = 'in_progress'
    RETURNING cost_usd
  )
  SELECT COALESCE(sum(cost_usd), 0) INTO v_retry FROM d;

  IF v_run.attempts >= v_run.max_attempts THEN
    UPDATE research_thread_run
       SET state = 'failed', finished_at = now(), lease_owner = NULL, lease_expires_at = NULL,
           retry_cost_usd = retry_cost_usd + v_retry,
           error = COALESCE(error, format('gave up after %s attempts at iteration %s', v_run.attempts, v_run.iteration))
     WHERE id = p_run_id;
    PERFORM recompute_research_thread_state(v_run.thread_id);
    RETURN NULL;
  END IF;

  v_attempt := v_run.attempts + 1;
  UPDATE research_thread_run
     SET state = 'running', phase = 'researching', attempts = v_attempt,
         lease_owner = p_owner, lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         heartbeat_at = now(), started_at = COALESCE(started_at, now()),
         retry_cost_usd = retry_cost_usd + v_retry
   WHERE id = p_run_id
  RETURNING * INTO v_run;

  INSERT INTO research_thread_run_step (run_id, iteration, attempt) VALUES (p_run_id, v_run.iteration, v_attempt);
  PERFORM recompute_research_thread_state(v_run.thread_id);
  SELECT * INTO v_thread FROM research_thread WHERE id = v_run.thread_id;

  RETURN jsonb_build_object(
    'id', v_run.id, 'thread_id', v_run.thread_id, 'kind', v_run.kind, 'target_seq', v_run.target_seq,
    'prompt_template_id', v_run.prompt_template_id, 'iteration', v_run.iteration, 'attempt', v_attempt,
    'max_attempts', v_run.max_attempts,
    'convo', v_run.convo, 'search_budget', v_run.search_budget,
    'web_search_requests', v_run.web_search_requests, 'web_search_locked', v_run.web_search_locked,
    'pass_phase', v_run.pass_phase, 'phase_state', v_run.phase_state,
    'phase_iteration_base', v_run.phase_iteration_base, 'phase_search_base', v_run.phase_search_base,
    'site_submit_id', v_thread.site_submit_id, 'pinned_context', v_thread.pinned_context,
    'archetype_primary', v_thread.archetype_primary, 'archetype_secondary', v_thread.archetype_secondary,
    'story_carriers', to_jsonb(v_thread.story_carriers));
END;
$function$;

-- ---------------------------------------------------------------------------
-- advance_thread_run_phase: commit this iteration AND move a deep_pass run to its next
-- phase, with that phase's conversation, prompt and search budget. Lease-checked like
-- complete_thread_run_step. The per-phase budget is stored cumulatively
-- (search_budget = searches so far + phase budget), so loop.ts's run-level accounting
-- enforces it unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_thread_run_phase(
  p_run_id uuid, p_owner uuid, p_iteration integer, p_attempt integer,
  p_next_phase text, p_convo jsonb, p_prompt_template_id uuid, p_phase_search_budget integer,
  p_state_patch jsonb, p_client_tool_calls integer DEFAULT 0)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_next_phase NOT IN ('school_fill', 'deep_pass', 'exports') THEN
    RAISE EXCEPTION 'invalid next phase %', p_next_phase;
  END IF;
  IF p_phase_search_budget < 0 THEN RAISE EXCEPTION 'negative phase search budget'; END IF;

  UPDATE research_thread_run
     SET pass_phase = p_next_phase,
         convo = p_convo,
         prompt_template_id = COALESCE(p_prompt_template_id, prompt_template_id),
         phase_state = phase_state || COALESCE(p_state_patch, '{}'::jsonb),
         phase_search_base = web_search_requests,
         search_budget = web_search_requests + p_phase_search_budget,
         phase_iteration_base = iteration + 1,
         web_search_locked = false,  -- the new conversation has no search blocks in it
         client_tool_calls = client_tool_calls + COALESCE(p_client_tool_calls, 0),
         iteration = iteration + 1, attempts = 0,
         lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = now()
   WHERE id = p_run_id AND lease_owner = p_owner AND iteration = p_iteration
     AND state = 'running' AND kind = 'deep_pass';
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE research_thread_run_step SET outcome = 'committed', finished_at = now()
   WHERE run_id = p_run_id AND iteration = p_iteration AND attempt = p_attempt;
  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- patch_thread_run_state: merge keys into phase_state mid-iteration (e.g. an upload that
-- succeeded before a later step failed). Lease-checked; does not commit the iteration.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.patch_thread_run_state(p_run_id uuid, p_owner uuid, p_patch jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE research_thread_run
     SET phase_state = phase_state || COALESCE(p_patch, '{}'::jsonb), heartbeat_at = now()
   WHERE id = p_run_id AND lease_owner = p_owner AND state = 'running';
  RETURN FOUND;
END;
$function$;

-- ---------------------------------------------------------------------------
-- enqueue_deep_pass: modeled on the live enqueue_thread_turn.
--   p_user_content NOT NULL: write the user message at p_expected_seq, run targets p_expected_seq + 1.
--   p_user_content NULL (retry): the user message already exists at p_expected_seq - 1 and nothing
--   was written at p_expected_seq; the new run targets p_expected_seq.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_deep_pass(
  p_thread_id uuid, p_expected_seq integer, p_user_content text, p_prompt_template_id uuid, p_created_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next   int;
  v_target int;
  v_id     uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_thread_id::text, 0));
  IF EXISTS (SELECT 1 FROM research_thread_run WHERE thread_id = p_thread_id AND state IN ('queued', 'running')) THEN
    RAISE EXCEPTION 'a run is already in progress on this thread' USING ERRCODE = 'unique_violation';
  END IF;
  SELECT COALESCE(max(seq) + 1, 0) INTO v_next FROM research_thread_message WHERE thread_id = p_thread_id;

  IF p_user_content IS NOT NULL THEN
    IF v_next <> p_expected_seq THEN
      RAISE EXCEPTION 'thread changed (expected seq %, next is %)', p_expected_seq, v_next USING ERRCODE = 'serialization_failure';
    END IF;
    INSERT INTO research_thread_message (thread_id, seq, role, content)
    VALUES (p_thread_id, v_next, 'user', p_user_content);
    v_target := v_next + 1;
  ELSE
    IF v_next <> p_expected_seq OR NOT EXISTS (
         SELECT 1 FROM research_thread_message
          WHERE thread_id = p_thread_id AND seq = p_expected_seq - 1 AND role = 'user') THEN
      RAISE EXCEPTION 'deep pass retry target % is not the open slot after a user message', p_expected_seq
        USING ERRCODE = 'serialization_failure';
    END IF;
    v_target := p_expected_seq;
  END IF;

  INSERT INTO research_thread_run
    (thread_id, kind, target_seq, prompt_template_id, convo, search_budget, created_by, phase, pass_phase)
  VALUES
    (p_thread_id, 'deep_pass', v_target, p_prompt_template_id, '[]'::jsonb, 0, p_created_by, 'queued', 'prepare')
  RETURNING id INTO v_id;
  PERFORM recompute_research_thread_state(p_thread_id);
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.advance_thread_run_phase(uuid, uuid, integer, integer, text, jsonb, uuid, integer, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.patch_thread_run_state(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_deep_pass(uuid, integer, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_thread_run_phase(uuid, uuid, integer, integer, text, jsonb, uuid, integer, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.patch_thread_run_state(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_deep_pass(uuid, integer, text, uuid, uuid) TO service_role;
