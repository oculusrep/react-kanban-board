-- Brief pass, record Q&A, and pitch-outcome tracking.
--
-- THE BRIEF IS A SEPARATE PASS. The deep pass writes the record and is unchanged. brief_pass reads
-- that finished record and writes a short brief, so it cannot cherry-pick mid-research, and the brief
-- wording can be tuned by re-running the brief alone against a stored record — no $2.85 of research
-- repeated. Same for record_qa: a question answered from the stored record, tools off, no searching.
--
-- The brief lives on research_thread, not site_submit: it belongs to the record it was written from,
-- and a site can hold several records. The sidebar shows the newest thread's brief.
--
-- Outcome tracking lives on site_submit because it is about the pitch, not about a research record.
-- Nothing reads these columns yet; they exist so the data accumulates from today.

-- ---------------------------------------------------------------------------
-- Brief on the record
-- ---------------------------------------------------------------------------
ALTER TABLE public.research_thread
  ADD COLUMN brief_text text,
  ADD COLUMN brief_generated_at timestamptz,
  ADD COLUMN brief_prompt_template_id uuid REFERENCES public.prompt_template(id),
  ADD COLUMN brief_run_id uuid REFERENCES public.research_thread_run(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.research_thread.brief_text IS
  'Under-200-word brief written by brief_pass from this thread''s finished record. Re-runnable on its own; replaced in place each time.';

-- ---------------------------------------------------------------------------
-- Two new run kinds: brief (no tools, no search) and record_qa (answers from the record)
-- ---------------------------------------------------------------------------
ALTER TABLE public.research_thread_run DROP CONSTRAINT research_thread_run_kind_check;
ALTER TABLE public.research_thread_run ADD CONSTRAINT research_thread_run_kind_check
  CHECK (kind = ANY (ARRAY['archetype', 'turn', 'deep_pass', 'brief', 'record_qa']));

-- ---------------------------------------------------------------------------
-- enqueue_brief_run: one live run per thread still applies (partial unique index).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_brief_run(
  p_thread_id uuid, p_prompt_template_id uuid, p_convo jsonb, p_created_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id   uuid;
  v_next int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_thread_id::text, 0));
  IF EXISTS (SELECT 1 FROM research_thread_run WHERE thread_id = p_thread_id AND state IN ('queued', 'running')) THEN
    RAISE EXCEPTION 'a run is already in progress on this thread' USING ERRCODE = 'unique_violation';
  END IF;
  -- The brief writes a column, not a message; target_seq points past the last message so the
  -- NOT NULL column has a sane value and nothing collides with a real message seq.
  SELECT COALESCE(max(seq) + 1, 0) INTO v_next FROM research_thread_message WHERE thread_id = p_thread_id;
  INSERT INTO research_thread_run (thread_id, kind, target_seq, prompt_template_id, convo, search_budget, created_by, phase)
  VALUES (p_thread_id, 'brief', v_next, p_prompt_template_id, p_convo, 0, p_created_by, 'queued')
  RETURNING id INTO v_id;
  PERFORM recompute_research_thread_state(p_thread_id);
  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- finalize_brief_run: writes the brief onto the thread, completes the run, writes NO message.
-- Idempotent on a retry: a run already complete returns already_final.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_brief_run(
  p_run_id uuid, p_owner uuid, p_iteration integer, p_attempt integer, p_convo jsonb, p_brief_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_run research_thread_run%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_run_id::text, 1));
  SELECT * INTO v_run FROM research_thread_run WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run % not found', p_run_id; END IF;
  IF v_run.state = 'complete' THEN RETURN jsonb_build_object('status', 'already_final'); END IF;
  IF v_run.lease_owner IS DISTINCT FROM p_owner OR v_run.iteration <> p_iteration OR v_run.state <> 'running' THEN
    RETURN jsonb_build_object('status', 'lease_lost');
  END IF;

  UPDATE research_thread
     SET brief_text = p_brief_text,
         brief_generated_at = now(),
         brief_prompt_template_id = v_run.prompt_template_id,
         brief_run_id = p_run_id
   WHERE id = v_run.thread_id;

  UPDATE research_thread_run_step SET outcome = 'committed', finished_at = now()
   WHERE run_id = p_run_id AND iteration = p_iteration AND attempt = p_attempt;
  UPDATE research_thread_run
     SET convo = p_convo, iteration = iteration + 1, state = 'complete', phase = 'complete',
         finished_at = now(), lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = now()
   WHERE id = p_run_id;
  PERFORM recompute_research_thread_state(v_run.thread_id);
  RETURN jsonb_build_object('status', 'finalized');
END;
$function$;

-- ---------------------------------------------------------------------------
-- enqueue_record_qa: a question answered from the stored record. Mirrors enqueue_thread_turn, but
-- the worker runs this kind with no tools and no web search, so it cannot re-run research.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_record_qa(
  p_thread_id uuid, p_expected_seq integer, p_question text, p_prompt_template_id uuid,
  p_convo jsonb, p_created_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  VALUES (p_thread_id, v_next, 'user', p_question);
  INSERT INTO research_thread_run (thread_id, kind, target_seq, prompt_template_id, convo, search_budget, created_by, phase)
  VALUES (p_thread_id, 'record_qa', v_next + 1, p_prompt_template_id, p_convo, 0, p_created_by, 'queued')
  RETURNING id INTO v_id;
  PERFORM recompute_research_thread_state(p_thread_id);
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_brief_run(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_brief_run(uuid, uuid, integer, integer, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_record_qa(uuid, integer, text, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_brief_run(uuid, uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_brief_run(uuid, uuid, integer, integer, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_record_qa(uuid, integer, text, uuid, jsonb, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Pitch outcomes on the site submit. Nothing reads these yet — they accumulate so that in a few
-- months the verdicts and story types that actually landed can be told apart from the ones that did not.
-- ---------------------------------------------------------------------------
ALTER TABLE public.site_submit
  ADD COLUMN pitched boolean NOT NULL DEFAULT false,
  ADD COLUMN pitched_date date,
  ADD COLUMN starbucks_response text NOT NULL DEFAULT 'not yet pitched',
  ADD COLUMN pushback text,
  ADD COLUMN broker_note text;

ALTER TABLE public.site_submit
  ADD CONSTRAINT site_submit_starbucks_response_check
    CHECK (starbucks_response = ANY (ARRAY['approved', 'passed', 'deferred', 'not yet pitched']));

COMMENT ON COLUMN public.site_submit.pushback IS 'What Starbucks actually objected to, in their words. Free text on purpose.';
COMMENT ON COLUMN public.site_submit.broker_note IS 'Was the brief right? Written after the pitch, free text.';
