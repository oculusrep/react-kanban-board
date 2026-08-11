-- Deep-Sweep "Re-run gaps" + sequencing hardening.
--
-- Ships with the "Re-run gaps" approval-view action and closes the bugs that the
-- Aug 10 Hall County sweep (f4b86098) exposed:
--
--   1. TIMEOUT TOO SHORT → FALSE GAPS + CONCURRENCY. The 25-min chunk timeout
--      fired on slow-but-ALIVE agents (dense-county Deep runs took 32-33 min).
--      advance_sweep marked those chunks 'failed' and the next tick fired the
--      next chunk ON TOP of the still-running one (~5-6 min of two concurrent
--      agents → the Firecrawl/Anthropic rate-limit collisions). Chunks 1 & 3 of
--      that sweep were marked 'failed' yet their runs reached awaiting_review
--      with 5 and 10 staged records. Fix: raise the default timeout to 45 min.
--
--   2. GAP != chunk.state='failed'. The authoritative "this window has no
--      coverage" signal is the RUN's terminal state, not the chunk's: a chunk is
--      a true gap only if its research_run is ABSENT or in a non-successful
--      terminal state (failed/cancelled). A chunk whose run reached
--      awaiting_review/approved/archived HAS coverage (its records already show
--      in get_sweep_staging) — re-running it would DUPLICATE that data. So
--      re-run keys off run state and first HEALS the mislabeled chunks.
--
--   3. ORPHAN CLEANUP. Cancelling a sweep (or a sweep-child run) mid-flight must
--      terminate the in-flight research_run so it can't sit at state='running'.

-- ============================================================================
-- 1) Raise the per-chunk timeout default. Existing sweeps keep their stored
--    value (historical); rerun_sweep_gaps bumps a re-run sweep to >= 45 so the
--    same false-gap/overlap bug can't recur on the retry.
-- ============================================================================
ALTER TABLE public.research_sweep
  ALTER COLUMN chunk_timeout_minutes SET DEFAULT 45;

-- ============================================================================
-- get_sweep_gaps — read-only, authoritative gap classification for the UI.
--
-- Classifies every chunk of a sweep by its RUN's terminal state:
--   • is_gap      — chunk failed AND run absent/failed/cancelled → a real gap.
--   • is_healable — chunk failed BUT run succeeded (awaiting_review/approved/
--                   archived) → mislabeled by a premature timeout; not a gap.
-- Returns a summary the approval view uses to render the "Re-run gaps" button
-- and its confirmation (windows + count). Never mutates.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_sweep_gaps(p_sweep_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH classified AS (
    SELECT
      c.chunk_index, c.window_start, c.window_end,
      (c.state = 'failed' AND (r.id IS NULL OR r.state IN ('failed','cancelled'))) AS is_gap,
      (c.state = 'failed' AND r.state IN ('awaiting_review','approved','archived')) AS is_healable
    FROM research_sweep_chunk c
    LEFT JOIN research_run r ON r.id = c.research_run_id
    WHERE c.sweep_id = p_sweep_id
  )
  SELECT jsonb_build_object(
    'sweep_state',    (SELECT state FROM research_sweep WHERE id = p_sweep_id),
    'gap_count',      count(*) FILTER (WHERE is_gap),
    'healable_count', count(*) FILTER (WHERE is_healable),
    'gaps', COALESCE(
      jsonb_agg(
        jsonb_build_object('chunk_index', chunk_index,
                           'window_start', window_start,
                           'window_end', window_end)
        ORDER BY chunk_index
      ) FILTER (WHERE is_gap),
      '[]'::jsonb)
  )
  FROM classified;
$$;

REVOKE ALL ON FUNCTION public.get_sweep_gaps(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sweep_gaps(uuid) TO authenticated, service_role;

-- ============================================================================
-- rerun_sweep_gaps — reset the true-gap chunks to 'pending' and hand the sweep
-- back to the existing sequential engine (ovis-sweep-tick + advance_sweep). No
-- new firing path: setting the sweep back to 'running' with the gap chunks
-- 'pending' is exactly the state the tick already knows how to drive, ONE chunk
-- at a time — so re-runs are sequential by construction, never parallel.
--
-- Idempotency:
--   • Successful chunks (run awaiting_review/approved/archived) are untouched,
--     so their staged records are never duplicated.
--   • Mislabeled "failed" chunks whose run actually succeeded are HEALED to
--     'done' (not re-fired).
--   • The old failed research_run rows are detached (research_run_id → NULL) and
--     left as audit; they carry 0 staging so nothing double-counts.
-- Uses the SAME per-sweep advisory lock as advance_sweep so it can't race a tick.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rerun_sweep_gaps(p_sweep_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sweep   research_sweep%ROWTYPE;
  v_healed  int := 0;
  v_reset   int := 0;
  v_done    int;
  v_failed  int;
  v_final   text;
BEGIN
  IF NOT public.user_has_market_research_run_access() THEN
    RAISE EXCEPTION 'forbidden: can_run_market_research required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_sweep_id::text, 0));

  SELECT * INTO v_sweep FROM research_sweep WHERE id = p_sweep_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'research_sweep % not found', p_sweep_id;
  END IF;
  -- Only re-run a sweep that has finished. 'running' = still in progress;
  -- 'cancelled' = deliberately abandoned (start a fresh sweep instead).
  IF v_sweep.state NOT IN ('complete','complete_with_failures','failed') THEN
    RAISE EXCEPTION 'sweep % is % — can only re-run gaps on a finished sweep', p_sweep_id, v_sweep.state;
  END IF;

  -- Heal false gaps: chunk 'failed' but its run actually succeeded. These have
  -- coverage already; flip them to 'done' so they aren't re-fired/duplicated.
  WITH healed AS (
    UPDATE research_sweep_chunk c
       SET state = 'done',
           terminal_at = COALESCE(c.terminal_at, r.completed_at, now())
      FROM research_run r
     WHERE c.sweep_id = p_sweep_id
       AND c.state = 'failed'
       AND r.id = c.research_run_id
       AND r.state IN ('awaiting_review','approved','archived')
    RETURNING 1
  )
  SELECT count(*) INTO v_healed FROM healed;

  -- Reset true gaps: chunk still 'failed' after healing (run absent or
  -- failed/cancelled). Detach the dead run and hand back to the fire queue.
  WITH reset AS (
    UPDATE research_sweep_chunk
       SET state = 'pending',
           research_run_id = NULL,
           fired_at = NULL,
           terminal_at = NULL
     WHERE sweep_id = p_sweep_id
       AND state = 'failed'
    RETURNING 1
  )
  SELECT count(*) INTO v_reset FROM reset;

  IF v_reset > 0 THEN
    -- Bump the timeout so the retry can't hit the same premature-timeout bug,
    -- then hand the sweep back to the tick engine.
    UPDATE research_sweep
       SET state = 'running',
           chunk_timeout_minutes = GREATEST(chunk_timeout_minutes, 45)
     WHERE id = p_sweep_id;
    v_final := 'running';
  ELSE
    -- Nothing to re-run (only heals). Recompute the terminal state, since
    -- healing may have removed the last failure.
    SELECT count(*) FILTER (WHERE state = 'done'),
           count(*) FILTER (WHERE state = 'failed')
      INTO v_done, v_failed
      FROM research_sweep_chunk WHERE sweep_id = p_sweep_id;
    v_final := CASE
      WHEN v_failed = 0 THEN 'complete'
      WHEN v_done   = 0 THEN 'failed'
      ELSE 'complete_with_failures'
    END;
    UPDATE research_sweep SET state = v_final WHERE id = p_sweep_id;
  END IF;

  RETURN jsonb_build_object(
    'reset_count',  v_reset,
    'healed_count', v_healed,
    'sweep_state',  v_final
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rerun_sweep_gaps(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rerun_sweep_gaps(uuid) TO authenticated, service_role;

-- ============================================================================
-- cancel_sweep — stop a running sweep and clean up its in-flight chunk so no
-- research_run is orphaned at state='running'. advance_sweep early-returns once
-- the sweep isn't 'running', so pending chunks simply never fire (no cleanup
-- needed there); only the active chunk + its run must be terminated here.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_sweep(p_sweep_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prior text;
BEGIN
  IF NOT public.user_has_market_research_run_access() THEN
    RAISE EXCEPTION 'forbidden: can_run_market_research required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_sweep_id::text, 0));

  SELECT state INTO v_prior FROM research_sweep WHERE id = p_sweep_id;
  IF v_prior IS NULL THEN
    RAISE EXCEPTION 'research_sweep % not found', p_sweep_id;
  END IF;
  IF v_prior <> 'running' THEN
    RETURN jsonb_build_object('cancelled', false, 'prior_state', v_prior);
  END IF;

  -- Terminate the active chunk's run so it can't linger at 'running'.
  UPDATE research_run r
     SET state = 'cancelled', completed_at = COALESCE(r.completed_at, now())
    FROM research_sweep_chunk c
   WHERE c.sweep_id = p_sweep_id
     AND c.state IN ('firing','running')
     AND r.id = c.research_run_id
     AND r.state IN ('pending','running');

  UPDATE research_sweep_chunk
     SET state = 'failed', terminal_at = now()
   WHERE sweep_id = p_sweep_id AND state IN ('firing','running');

  UPDATE research_sweep SET state = 'cancelled' WHERE id = p_sweep_id;

  RETURN jsonb_build_object('cancelled', true, 'prior_state', v_prior);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_sweep(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sweep(uuid) TO authenticated, service_role;

-- ============================================================================
-- cancel_research_run — extend so cancelling a sweep-CHILD run also terminalizes
-- its chunk. Without this, a cancelled run whose sweep is already terminal would
-- leave the chunk stuck at 'running' (advance_sweep no longer visits it). Body
-- is otherwise identical to 20260630120000.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_research_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prior text;
BEGIN
  IF NOT public.user_has_market_research_run_access() THEN
    RAISE EXCEPTION 'forbidden: can_run_market_research required';
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

  -- If this run is a sweep chunk, mark its (non-terminal) chunk failed too so the
  -- sweep's chunk ledger can't be left pointing at a cancelled run as 'running'.
  UPDATE research_sweep_chunk
     SET state = 'failed', terminal_at = now()
   WHERE research_run_id = p_run_id
     AND state IN ('firing','running');

  RETURN jsonb_build_object('cancelled', true, 'prior_state', v_prior);
END;
$$;
