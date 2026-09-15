-- Site Research — background runs.
--
-- Every v4/v5 Step 1 run returned 504 IDLE_TIMEOUT (Johnson Ferry 150,278 ms,
-- Macon 150,221 ms) and survived only because the worker kept running after the
-- browser gave up. A run past the 400 s wall clock would be killed mid-loop and
-- leave the thread 'active' with no report. This moves the loop into background
-- runs driven by ovis-site-research-worker, on the Deep-Sweep engine's shape:
-- a DB state machine, transactional claim/advance RPCs under an advisory lock, a
-- per-minute cron tick authenticated with a vault secret, and a reaper.
--
-- One deliberate difference from the sweep: no quarantine/cooldown. The sweep
-- waits because an OpenClaw agent may still be alive and OVIS cannot observe it.
-- Our worker is our own edge function, which the platform hard-kills at 400 s, so
-- once a lease (400 s + margin) has expired no worker can still hold it.
--
-- Design: docs/SITE_RESEARCH_BACKGROUND_RUNS_DESIGN.md

-- ============================================================================
-- 1) research_thread.state: queued | running | complete | failed | archived
-- ============================================================================
ALTER TABLE public.research_thread DROP CONSTRAINT research_thread_state_check;
UPDATE public.research_thread SET state = 'complete' WHERE state = 'active';
ALTER TABLE public.research_thread ALTER COLUMN state SET DEFAULT 'queued';
ALTER TABLE public.research_thread ADD CONSTRAINT research_thread_state_check
  CHECK (state IN ('queued', 'running', 'complete', 'failed', 'archived'));
COMMENT ON COLUMN public.research_thread.state IS
  'Mirrors the thread''s runs: queued/running while a run is live; otherwise complete if a seq-0 report exists, else failed. archived is sticky. A failed follow-up turn leaves the thread complete; the error is on the run.';

-- ============================================================================
-- 2) research_thread_run — one background execution (archetype call, follow-up
--    turn, or later the Step 2 deep pass)
-- ============================================================================
CREATE TABLE public.research_thread_run (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id            uuid NOT NULL REFERENCES public.research_thread(id) ON DELETE CASCADE,
  kind                 text NOT NULL CHECK (kind IN ('archetype', 'turn', 'deep_pass')),
  target_seq           int  NOT NULL CHECK (target_seq >= 0),
  prompt_template_id   uuid REFERENCES public.prompt_template(id),
  state                text NOT NULL DEFAULT 'queued'
                         CHECK (state IN ('queued', 'running', 'complete', 'failed', 'cancelled')),
  phase                text,
  iteration            int  NOT NULL DEFAULT 0 CHECK (iteration >= 0),
  convo                jsonb NOT NULL,
  search_budget        int  NOT NULL CHECK (search_budget >= 0),
  web_search_requests  int  NOT NULL DEFAULT 0 CHECK (web_search_requests >= 0),
  web_search_locked    boolean NOT NULL DEFAULT false,
  client_tool_calls    int  NOT NULL DEFAULT 0 CHECK (client_tool_calls >= 0),
  input_tokens         bigint NOT NULL DEFAULT 0,
  output_tokens        bigint NOT NULL DEFAULT 0,
  cost_usd             numeric(10,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  retry_cost_usd       numeric(10,6) NOT NULL DEFAULT 0 CHECK (retry_cost_usd >= 0),
  lease_owner          uuid,
  lease_expires_at     timestamptz,
  heartbeat_at         timestamptz,
  attempts             int  NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts         int  NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  error                text,
  created_by           uuid REFERENCES public."user"(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  started_at           timestamptz,
  finished_at          timestamptz
);
COMMENT ON TABLE public.research_thread_run IS
  'One background execution on a research_thread. One model iteration per worker invocation; convo holds the full message history with assistant blocks verbatim (thinking, server_tool_use, encrypted search content) because the API requires them passed back unchanged.';
COMMENT ON COLUMN public.research_thread_run.cost_usd IS
  'Everything this run was billed: tokens + web search fees, INCLUDING attempts that died and were retried. retry_cost_usd is the part spent on discarded attempts.';
COMMENT ON COLUMN public.research_thread_run.attempts IS
  'Attempts at the CURRENT iteration (reset when an iteration commits). Reaching max_attempts fails the run.';
COMMENT ON COLUMN public.research_thread_run.web_search_locked IS
  'The API rejected removing web_search from a history containing searches, so this run keeps the tool defined with tool_choice none once its budget is spent.';

CREATE INDEX research_thread_run_thread_idx ON public.research_thread_run (thread_id, created_at DESC);
CREATE INDEX research_thread_run_live_idx ON public.research_thread_run (state) WHERE state IN ('queued', 'running');
-- One live run per thread (mirrors one_live_run_per_site).
CREATE UNIQUE INDEX research_thread_run_one_live_per_thread
  ON public.research_thread_run (thread_id) WHERE state IN ('queued', 'running');

-- ============================================================================
-- 3) research_thread_run_step — one row per ATTEMPT at an iteration
-- ============================================================================
CREATE TABLE public.research_thread_run_step (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               uuid NOT NULL REFERENCES public.research_thread_run(id) ON DELETE CASCADE,
  iteration            int  NOT NULL,
  attempt              int  NOT NULL,
  outcome              text NOT NULL DEFAULT 'in_progress'
                         CHECK (outcome IN ('in_progress', 'committed', 'discarded', 'failed')),
  started_at           timestamptz NOT NULL DEFAULT now(),
  response_at          timestamptz,
  finished_at          timestamptz,
  stop_reason          text,
  client_tool_calls    int NOT NULL DEFAULT 0,
  web_search_requests  int NOT NULL DEFAULT 0,
  input_tokens         bigint NOT NULL DEFAULT 0,
  output_tokens        bigint NOT NULL DEFAULT 0,
  cache_read_tokens    bigint NOT NULL DEFAULT 0,
  cache_write_tokens   bigint NOT NULL DEFAULT 0,
  cost_usd             numeric(10,6) NOT NULL DEFAULT 0,
  error                text,
  UNIQUE (run_id, iteration, attempt)
);
COMMENT ON TABLE public.research_thread_run_step IS
  'Per-attempt log. cost_usd is recorded the moment the model responds, so an attempt that dies afterwards still shows what it cost. outcome: committed (its response is in convo), discarded (worker died; retried), failed. Answers "which iteration was running at 150 s".';
CREATE INDEX research_thread_run_step_run_idx ON public.research_thread_run_step (run_id, iteration, attempt);

-- ============================================================================
-- 4) research_thread_tool_result — each client tool call, written as it returns
-- ============================================================================
CREATE TABLE public.research_thread_tool_result (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    uuid NOT NULL REFERENCES public.research_thread(id) ON DELETE CASCADE,
  run_id       uuid NOT NULL REFERENCES public.research_thread_run(id) ON DELETE CASCADE,
  iteration    int  NOT NULL,
  attempt      int  NOT NULL,
  tool_use_id  text NOT NULL,
  tool_name    text NOT NULL,
  input        jsonb NOT NULL,
  output       jsonb,
  is_error     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, tool_use_id)
);
COMMENT ON TABLE public.research_thread_tool_result IS
  'Client tool results (NCES schools, Starbucks, pipeline, traffic), persisted the moment each returns so a killed run keeps what it fetched. Step 2 reads Step 1''s school rows and banded totals from here.';
CREATE INDEX research_thread_tool_result_thread_idx ON public.research_thread_tool_result (thread_id, tool_name, created_at);

-- ============================================================================
-- 5) research_thread_message: run linkage (idempotent finalize) + search/retry cost
-- ============================================================================
ALTER TABLE public.research_thread_message
  ADD COLUMN run_id uuid REFERENCES public.research_thread_run(id) ON DELETE SET NULL,
  ADD COLUMN web_search_requests int,
  ADD COLUMN retry_cost_usd numeric(10,6);
-- A run writes at most ONE message. A retried final iteration cannot duplicate it.
CREATE UNIQUE INDEX research_thread_message_one_per_run
  ON public.research_thread_message (run_id) WHERE run_id IS NOT NULL;
COMMENT ON COLUMN public.research_thread_message.cost_usd IS
  'For assistant messages written by a run: the run''s full cost, tokens + web search fees + retried attempts. retry_cost_usd is the retried share.';

-- ============================================================================
-- 6) RLS — read for authenticated, writes only via service role (worker/RPCs)
-- ============================================================================
ALTER TABLE public.research_thread_run         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_thread_run_step    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_thread_tool_result ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_thread_run_read         ON public.research_thread_run         FOR SELECT TO authenticated USING (true);
CREATE POLICY research_thread_run_step_read    ON public.research_thread_run_step    FOR SELECT TO authenticated USING (true);
CREATE POLICY research_thread_tool_result_read ON public.research_thread_tool_result FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 7) Thread state recompute
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recompute_research_thread_state(p_thread_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text;
  v_live  text;
BEGIN
  SELECT state INTO v_state FROM research_thread WHERE id = p_thread_id FOR UPDATE;
  IF v_state IS NULL OR v_state = 'archived' THEN RETURN v_state; END IF;

  SELECT state INTO v_live FROM research_thread_run
   WHERE thread_id = p_thread_id AND state IN ('queued', 'running') LIMIT 1;

  v_state := CASE
    WHEN v_live IS NOT NULL THEN v_live
    WHEN EXISTS (SELECT 1 FROM research_thread_message
                  WHERE thread_id = p_thread_id AND seq = 0 AND role = 'assistant') THEN 'complete'
    ELSE 'failed'
  END;
  UPDATE research_thread SET state = v_state WHERE id = p_thread_id AND state IS DISTINCT FROM v_state;
  RETURN v_state;
END;
$$;

-- ============================================================================
-- 8) Enqueue
-- ============================================================================
-- Archetype call / retry. Raises unique_violation (23505) if a run is already live.
CREATE OR REPLACE FUNCTION public.enqueue_thread_run(
  p_thread_id uuid, p_kind text, p_target_seq int, p_prompt_template_id uuid,
  p_convo jsonb, p_search_budget int, p_created_by uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_thread_id::text, 0));
  INSERT INTO research_thread_run (thread_id, kind, target_seq, prompt_template_id, convo, search_budget, created_by, phase)
  VALUES (p_thread_id, p_kind, p_target_seq, p_prompt_template_id, p_convo, p_search_budget, p_created_by, 'queued')
  RETURNING id INTO v_id;
  PERFORM recompute_research_thread_state(p_thread_id);
  RETURN v_id;
END;
$$;

-- Follow-up turn: the user message and its run are written together, or neither.
-- p_expected_seq is the seq the edge function computed its replay against; if the
-- thread moved on meanwhile, raise so the caller returns 409 instead of replaying
-- a stale history.
CREATE OR REPLACE FUNCTION public.enqueue_thread_turn(
  p_thread_id uuid, p_expected_seq int, p_user_content text, p_prompt_template_id uuid,
  p_convo jsonb, p_search_budget int, p_created_by uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next int;
  v_id   uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_thread_id::text, 0));
  IF EXISTS (SELECT 1 FROM research_thread_run WHERE thread_id = p_thread_id AND state IN ('queued', 'running')) THEN
    RAISE EXCEPTION 'a run is already in progress on this thread' USING ERRCODE = 'unique_violation';
  END IF;
  SELECT COALESCE(max(seq) + 1, 0) INTO v_next FROM research_thread_message WHERE thread_id = p_thread_id;
  IF v_next <> p_expected_seq THEN
    RAISE EXCEPTION 'thread changed (expected seq %, next is %)', p_expected_seq, v_next USING ERRCODE = 'serialization_failure';
  END IF;
  INSERT INTO research_thread_message (thread_id, seq, role, content)
  VALUES (p_thread_id, v_next, 'user', p_user_content);
  INSERT INTO research_thread_run (thread_id, kind, target_seq, prompt_template_id, convo, search_budget, created_by, phase)
  VALUES (p_thread_id, 'turn', v_next + 1, p_prompt_template_id, p_convo, p_search_budget, p_created_by, 'queued')
  RETURNING id INTO v_id;
  PERFORM recompute_research_thread_state(p_thread_id);
  RETURN v_id;
END;
$$;

-- ============================================================================
-- 9) Worker RPCs — every write checks the caller still holds the lease
-- ============================================================================

-- Claim a run for one iteration. Returns the run + what the worker needs, or NULL
-- if it is terminal, leased to a live worker, or out of attempts (then failed).
CREATE OR REPLACE FUNCTION public.claim_thread_run(p_run_id uuid, p_owner uuid, p_lease_seconds int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    'convo', v_run.convo, 'search_budget', v_run.search_budget,
    'web_search_requests', v_run.web_search_requests, 'web_search_locked', v_run.web_search_locked,
    'site_submit_id', v_thread.site_submit_id, 'pinned_context', v_thread.pinned_context);
END;
$$;

-- The model answered. Record this attempt's usage and cost on the step AND the run
-- immediately, before any tool runs — a worker that dies after this point still
-- leaves its spend (and its searches, which count against the budget) on record.
CREATE OR REPLACE FUNCTION public.record_thread_run_response(
  p_run_id uuid, p_owner uuid, p_iteration int, p_attempt int, p_stop_reason text,
  p_web_search_requests int, p_input_tokens bigint, p_output_tokens bigint,
  p_cache_read_tokens bigint, p_cache_write_tokens bigint, p_cost_usd numeric
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_outcome text;
BEGIN
  -- response_at IS NULL makes this once-per-attempt: a duplicate call cannot double-count.
  UPDATE research_thread_run_step
     SET response_at = now(), stop_reason = p_stop_reason, web_search_requests = p_web_search_requests,
         input_tokens = p_input_tokens, output_tokens = p_output_tokens,
         cache_read_tokens = p_cache_read_tokens, cache_write_tokens = p_cache_write_tokens, cost_usd = p_cost_usd
   WHERE run_id = p_run_id AND iteration = p_iteration AND attempt = p_attempt AND response_at IS NULL
  RETURNING outcome INTO v_outcome;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Billed either way, so always recorded. If this attempt was already superseded
  -- (discarded by a re-claim, or failed), its spend is retry cost.
  UPDATE research_thread_run
     SET cost_usd = cost_usd + p_cost_usd,
         retry_cost_usd = retry_cost_usd + CASE WHEN v_outcome = 'in_progress' THEN 0 ELSE p_cost_usd END,
         web_search_requests = web_search_requests + p_web_search_requests,
         input_tokens = input_tokens + p_input_tokens, output_tokens = output_tokens + p_output_tokens,
         heartbeat_at = now()
   WHERE id = p_run_id;
  RETURN v_outcome = 'in_progress'
     AND EXISTS (SELECT 1 FROM research_thread_run WHERE id = p_run_id AND lease_owner = p_owner);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_thread_tool_result(
  p_run_id uuid, p_owner uuid, p_iteration int, p_attempt int,
  p_tool_use_id text, p_tool_name text, p_input jsonb, p_output jsonb, p_is_error boolean
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_thread uuid;
BEGIN
  SELECT thread_id INTO v_thread FROM research_thread_run WHERE id = p_run_id AND lease_owner = p_owner;
  IF v_thread IS NULL THEN RETURN false; END IF;
  INSERT INTO research_thread_tool_result (thread_id, run_id, iteration, attempt, tool_use_id, tool_name, input, output, is_error)
  VALUES (v_thread, p_run_id, p_iteration, p_attempt, p_tool_use_id, p_tool_name, p_input, p_output, p_is_error)
  ON CONFLICT (run_id, tool_use_id) DO UPDATE
     SET output = EXCLUDED.output, is_error = EXCLUDED.is_error, attempt = EXCLUDED.attempt;
  UPDATE research_thread_run_step SET client_tool_calls = client_tool_calls + 1
   WHERE run_id = p_run_id AND iteration = p_iteration AND attempt = p_attempt;
  UPDATE research_thread_run SET heartbeat_at = now() WHERE id = p_run_id;
  RETURN true;
END;
$$;

-- A non-final iteration is done: commit its response (+ tool results) into convo,
-- advance the iteration, release the lease for the next invocation.
CREATE OR REPLACE FUNCTION public.complete_thread_run_step(
  p_run_id uuid, p_owner uuid, p_iteration int, p_attempt int,
  p_convo jsonb, p_client_tool_calls int, p_web_search_locked boolean
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE research_thread_run
     SET convo = p_convo, iteration = iteration + 1, attempts = 0,
         client_tool_calls = client_tool_calls + p_client_tool_calls,
         web_search_locked = web_search_locked OR p_web_search_locked,
         lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = now()
   WHERE id = p_run_id AND lease_owner = p_owner AND iteration = p_iteration AND state = 'running';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE research_thread_run_step SET outcome = 'committed', finished_at = now()
   WHERE run_id = p_run_id AND iteration = p_iteration AND attempt = p_attempt;
  RETURN true;
END;
$$;

-- The final iteration: the report message, the archetype columns, the step and the
-- run's terminal state commit in ONE transaction, so a retry can never leave a
-- partial or duplicate message. A run that is already complete returns its existing
-- message id (a retry that arrives after a successful finalize is a no-op).
CREATE OR REPLACE FUNCTION public.finalize_thread_run(
  p_run_id uuid, p_owner uuid, p_iteration int, p_attempt int, p_convo jsonb,
  p_content text, p_model text, p_parsed boolean,
  p_archetype_primary text, p_archetype_secondary text, p_story_carriers text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run research_thread_run%ROWTYPE;
  v_msg uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_run_id::text, 1));
  SELECT * INTO v_run FROM research_thread_run WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run % not found', p_run_id; END IF;

  SELECT id INTO v_msg FROM research_thread_message WHERE run_id = p_run_id;
  IF v_run.state = 'complete' OR v_msg IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_final', 'message_id', v_msg);
  END IF;
  IF v_run.lease_owner IS DISTINCT FROM p_owner OR v_run.iteration <> p_iteration OR v_run.state <> 'running' THEN
    RETURN jsonb_build_object('status', 'lease_lost');
  END IF;

  INSERT INTO research_thread_message
    (thread_id, seq, role, content, model, input_tokens, output_tokens, cost_usd, retry_cost_usd, web_search_requests, run_id)
  VALUES
    (v_run.thread_id, v_run.target_seq, 'assistant', p_content, p_model, v_run.input_tokens, v_run.output_tokens,
     v_run.cost_usd, v_run.retry_cost_usd, v_run.web_search_requests, p_run_id)
  RETURNING id INTO v_msg;

  IF p_parsed THEN
    UPDATE research_thread
       SET archetype_primary = p_archetype_primary, archetype_secondary = p_archetype_secondary,
           story_carriers = COALESCE(p_story_carriers, '{}')
     WHERE id = v_run.thread_id;
  END IF;

  UPDATE research_thread_run_step SET outcome = 'committed', finished_at = now()
   WHERE run_id = p_run_id AND iteration = p_iteration AND attempt = p_attempt;
  UPDATE research_thread_run
     SET convo = p_convo, iteration = iteration + 1, state = 'complete', phase = 'complete',
         finished_at = now(), lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = now()
   WHERE id = p_run_id;
  PERFORM recompute_research_thread_state(v_run.thread_id);
  RETURN jsonb_build_object('status', 'finalized', 'message_id', v_msg);
END;
$$;

-- Give up the lease after a transient error so the tick retries soon (instead of
-- waiting out the lease). The attempt is marked failed; its cost stays recorded.
CREATE OR REPLACE FUNCTION public.release_thread_run(
  p_run_id uuid, p_owner uuid, p_iteration int, p_attempt int, p_error text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cost numeric(10,6);
BEGIN
  UPDATE research_thread_run_step
     SET outcome = 'failed', finished_at = now(), error = left(p_error, 2000)
   WHERE run_id = p_run_id AND iteration = p_iteration AND attempt = p_attempt AND outcome = 'in_progress'
  RETURNING cost_usd INTO v_cost;
  UPDATE research_thread_run
     SET lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = now(),
         retry_cost_usd = retry_cost_usd + COALESCE(v_cost, 0), error = left(p_error, 2000)
   WHERE id = p_run_id AND lease_owner = p_owner;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_thread_run(p_run_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_thread uuid;
BEGIN
  UPDATE research_thread_run
     SET state = 'failed', phase = 'failed', finished_at = now(), lease_owner = NULL, lease_expires_at = NULL,
         error = left(p_error, 2000)
   WHERE id = p_run_id AND state IN ('queued', 'running')
  RETURNING thread_id INTO v_thread;
  IF v_thread IS NULL THEN RETURN; END IF;
  UPDATE research_thread_run_step SET outcome = 'failed', finished_at = now(), error = COALESCE(error, left(p_error, 2000))
   WHERE run_id = p_run_id AND outcome = 'in_progress';
  PERFORM recompute_research_thread_state(v_thread);
END;
$$;

-- ============================================================================
-- 10) Tick: which runs need a kick, and the stall guard
-- ============================================================================
CREATE OR REPLACE FUNCTION public.advance_thread_runs(p_kick_after_seconds int DEFAULT 60)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM (
    SELECT id FROM research_thread_run
     WHERE state IN ('queued', 'running')
       AND (lease_owner IS NULL OR lease_expires_at < now())
       AND COALESCE(heartbeat_at, created_at) < now() - make_interval(secs => p_kick_after_seconds)
     ORDER BY created_at
  ) r;
$$;

-- Backstop for anything the kick path cannot see (cron down, a bug): a live run
-- with no heartbeat for p_idle_minutes is failed. A healthy run beats every
-- iteration (~60 s), so 20 min never touches one.
CREATE OR REPLACE FUNCTION public.reap_stalled_thread_runs(p_idle_minutes int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_id  uuid;
BEGIN
  IF p_idle_minutes IS NULL OR p_idle_minutes <= 0 THEN RAISE EXCEPTION 'p_idle_minutes must be > 0'; END IF;
  SELECT COALESCE(array_agg(id), '{}') INTO v_ids FROM research_thread_run
   WHERE state IN ('queued', 'running')
     AND COALESCE(heartbeat_at, created_at) < now() - make_interval(mins => p_idle_minutes);
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM fail_thread_run(v_id, format('reaped: no activity for %s+ minutes', p_idle_minutes));
  END LOOP;
  RETURN jsonb_build_object('reaped_count', COALESCE(array_length(v_ids, 1), 0), 'run_ids', to_jsonb(v_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_research_thread_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_thread_run(uuid, text, int, uuid, jsonb, int, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_thread_turn(uuid, int, text, uuid, jsonb, int, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_thread_run(uuid, uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_thread_run_response(uuid, uuid, int, int, text, int, bigint, bigint, bigint, bigint, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_thread_tool_result(uuid, uuid, int, int, text, text, jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_thread_run_step(uuid, uuid, int, int, jsonb, int, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_thread_run(uuid, uuid, int, int, jsonb, text, text, boolean, text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_thread_run(uuid, uuid, int, int, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_thread_run(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_thread_runs(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reap_stalled_thread_runs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_research_thread_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_thread_run(uuid, text, int, uuid, jsonb, int, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_thread_turn(uuid, int, text, uuid, jsonb, int, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_thread_run(uuid, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_thread_run_response(uuid, uuid, int, int, text, int, bigint, bigint, bigint, bigint, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_thread_tool_result(uuid, uuid, int, int, text, text, jsonb, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_thread_run_step(uuid, uuid, int, int, jsonb, int, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_thread_run(uuid, uuid, int, int, jsonb, text, text, boolean, text, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_thread_run(uuid, uuid, int, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_thread_run(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_thread_runs(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.reap_stalled_thread_runs(int) TO service_role;

-- ============================================================================
-- 11) Worker auth secret + per-minute tick (the ovis-sweep-tick pattern)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'site_research_worker_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'site_research_worker_secret',
      'Shared secret authenticating calls to ovis-site-research-worker (cron tick, self-chain, enqueue kick)');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_site_research_worker_secret()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public, vault AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'site_research_worker_secret' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_site_research_worker_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_research_worker_secret() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ovis-site-research-tick') THEN
    PERFORM cron.unschedule('ovis-site-research-tick');
  END IF;
END $$;

SELECT cron.schedule('ovis-site-research-tick', '* * * * *', $cron$
  select net.http_post(
    url := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/ovis-site-research-worker',
    headers := jsonb_build_object(
      'X-Worker-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'site_research_worker_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{"action":"tick"}'::jsonb
  );
$cron$);

-- ============================================================================
-- 12) Realtime: thread state, messages and per-attempt steps (small rows).
--     research_thread_run itself is NOT published: its convo column is large and
--     rewritten every iteration; the UI refetches the run's summary columns when
--     a step or thread event arrives.
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.research_thread, public.research_thread_message, public.research_thread_run_step;
