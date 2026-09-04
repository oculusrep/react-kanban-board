-- Deep-Sweep — stall guard + orphaned-run reaper.
--
-- Closes the two remaining state bugs in the sweep engine. Both are about a run
-- that stops reporting: OVIS learns NOTHING about a run after ovis-research-trigger
-- POSTs it (OpenClaw returns only openclaw_run_id; there is no status or cancel
-- endpoint on the far side of that boundary — see 20260901120000). So "is this
-- agent still alive?" can only ever be inferred from what the run writes back.
--
--   BUG 1 — ORPHANED RUNS. A killed run (an `openclaw gateway restart` drains
--   in-flight runs) leaves research_run at state='running' forever: the agent
--   that would have written a terminal state is gone. The cancel paths were
--   already covered by 20260811155746 (cancel_sweep, cancel_research_run); what
--   was missing is a reaper for rows that got stuck without anyone cancelling.
--
--   BUG 2 — STALLED-CHUNK CONCURRENCY. The sequencing guard held for every case
--   EXCEPT the one that matters. advance_sweep timed a chunk out on WALL CLOCK
--   from research_run.triggered_at, marked it 'failed', and let the next tick
--   fire the next chunk — while the timed-out agent was very often still alive
--   and working. Sweep f4b86098 (Hall County, Aug 10) is the proof:
--
--     chunk 1  triggered 21:56  completed 22:28 (awaiting_review, 5 staged)
--     chunk 2  triggered 22:23  <-- fired 5.4 min BEFORE chunk 1 finished
--     chunk 3  triggered 22:47  completed 23:20 (awaiting_review, 10 staged)
--     chunk 4  triggered 23:14  <-- fired 6.3 min BEFORE chunk 3 finished
--     chunks 4 and 5 then died at exactly the 25-min timeout with 0 staged.
--
--   Two agents ran concurrently for ~6 minutes, twice, and the chunks that ran
--   immediately after those collisions are the ones that produced nothing.
--   20260811155746 raised the timeout 25 -> 45 min, which makes a false timeout
--   rarer but cannot prevent one: deep runs in this database range 9 to 65
--   minutes, so ANY fixed wall-clock bound will eventually cut a live agent.
--   The overlap is not a tuning problem, it is a missing guard.
--
-- The guard, in two parts:
--   (a) time the chunk out on IDLE, not wall clock — measured from the run's
--       last write (see research_run_last_activity), so a slow-but-alive agent
--       is not declared dead for being slow; and
--   (b) never advance on a timeout alone. A timed-out chunk enters QUARANTINE
--       (state='orphaned') and the sweep HOLDS — no next chunk fires — until the
--       run either resurrects (heartbeat moves, or it reaches a terminal state)
--       or stays silent through orphan_cooldown_minutes, which is the only
--       evidence of death available to us. Bounded, so a truly hung agent still
--       ends the sweep instead of wedging it.
--
--   Replayed against Aug 10: chunks 1 and 3 sit in quarantine instead of
--   terminalizing, their runs reach awaiting_review 6 minutes later, both heal
--   to 'done'. Zero overlap, and two fewer false gaps.

-- ============================================================================
-- research_run_last_activity — the liveness signal, such as it is.
--
-- GREATEST of: triggered_at (the floor — a run that has written nothing has
-- been silent since it started), research_run.updated_at (openclaw_run_id
-- write-back, cost accounting), and the newest research_checklist_item write
-- (update_checklist_status, the agent's per-municipality progress call).
--
-- CALIBRATION NOTE, so nobody over-trusts this: the checklist beat is SPARSE.
-- Runs carry 1-2 checklist items and the agent updates one when it FINISHES a
-- municipality, so a healthy run can be silent for 40 minutes and then beat
-- once near the end (run f3545607: triggered 16:13, first beat 16:53). This is
-- therefore a useful floor on liveness and NOT a heartbeat you can poll on a
-- short interval. It is why (b) above exists: idle timing alone is not enough,
-- the quarantine is what actually prevents the overlap.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.research_run_last_activity(p_run_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
           r.triggered_at,
           r.updated_at,
           COALESCE((SELECT max(i.updated_at) FROM research_checklist_item i
                      WHERE i.research_run_id = r.id), r.triggered_at))
    FROM research_run r
   WHERE r.id = p_run_id;
$$;

REVOKE ALL ON FUNCTION public.research_run_last_activity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_run_last_activity(uuid) TO authenticated, service_role;

-- ============================================================================
-- Schema: the quarantine state + its ledger.
-- ============================================================================
ALTER TABLE public.research_sweep_chunk
  DROP CONSTRAINT IF EXISTS research_sweep_chunk_state_check;
ALTER TABLE public.research_sweep_chunk
  ADD CONSTRAINT research_sweep_chunk_state_check
  CHECK (state IN ('pending','firing','running','orphaned','done','failed'));

ALTER TABLE public.research_sweep_chunk
  ADD COLUMN IF NOT EXISTS orphaned_at timestamptz;

COMMENT ON COLUMN public.research_sweep_chunk.orphaned_at IS
  'When the chunk entered quarantine (idle timeout). NULL unless state=''orphaned''. The sweep does not advance while any chunk is orphaned.';

COMMENT ON TABLE public.research_sweep_chunk IS
  'Per-chunk state for a research_sweep. state flow: pending -> firing -> running -> done|failed, with running -> orphaned (quarantine) -> running|done|failed on an idle timeout. research_run_id existence is the fire idempotency token.';

-- How long a quarantined chunk must stay silent before we accept it as dead.
-- 20 min sits above the worst observed overshoot (the two false timeouts on Aug
-- 10 finished 7-8 min past a 25-min bound) and, with the 45-min idle timeout,
-- puts the ceiling at 65 min — the longest deep run this database has recorded.
ALTER TABLE public.research_sweep
  ADD COLUMN IF NOT EXISTS orphan_cooldown_minutes int NOT NULL DEFAULT 20;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.research_sweep'::regclass
                    AND conname  = 'research_sweep_orphan_cooldown_check') THEN
    ALTER TABLE public.research_sweep
      ADD CONSTRAINT research_sweep_orphan_cooldown_check CHECK (orphan_cooldown_minutes > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.research_sweep.orphan_cooldown_minutes IS
  'Silence required after an idle timeout before a quarantined chunk is accepted as dead and the sweep advances.';

-- ============================================================================
-- advance_sweep — unchanged in shape; the 'running' branch now times out on
-- idle and quarantines instead of terminalizing.
--
-- Actions returned to ovis-sweep-tick:
--   {action:'fire',     ...}                     fire this chunk
--   {action:'stalled',  chunk_id, chunk_index, window_start, window_end,
--                       research_run_id, idle_minutes, cooldown_minutes}
--                                                just quarantined; sweep is HELD
--   {action:'orphan',   chunk_id, chunk_index, window_start, window_end,
--                       research_run_id}         quarantine expired; confirmed dead
--   {action:'terminal', sweep_state}
--   {action:'none'}                              healthy, in-flight, or holding
--
-- Sequencing invariant, now airtight: at most one chunk is non-terminal
-- (firing|running|orphaned), and step 2 is reachable only after step 1 finds
-- none — so a stalled chunk cannot let the next chunk start. 'orphaned' being
-- an active state also makes step 3 unreachable while a chunk is quarantined,
-- so a sweep can never terminalize with a run still possibly in flight.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.advance_sweep(p_sweep_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sweep     research_sweep%ROWTYPE;
  v_chunk     research_sweep_chunk%ROWTYPE;
  v_run_state text;
  v_activity  timestamptz;
  v_done      int;
  v_failed    int;
  v_final     text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_sweep_id::text, 0));

  SELECT * INTO v_sweep FROM research_sweep WHERE id = p_sweep_id;
  IF NOT FOUND OR v_sweep.state <> 'running' THEN
    RETURN jsonb_build_object('action', 'none');
  END IF;

  -- ---- 1) Is there a currently-active (firing|running|orphaned) chunk? ----
  SELECT * INTO v_chunk FROM research_sweep_chunk
   WHERE sweep_id = p_sweep_id AND state IN ('firing', 'running', 'orphaned')
   ORDER BY chunk_index LIMIT 1;

  IF FOUND THEN
    IF v_chunk.state = 'firing' THEN
      IF v_chunk.research_run_id IS NOT NULL THEN
        -- POST landed (run exists) but mark_chunk_fired didn't commit; adopt it.
        UPDATE research_sweep_chunk SET state = 'running' WHERE id = v_chunk.id;
        RETURN jsonb_build_object('action', 'none');
      ELSIF now() - v_chunk.updated_at > interval '3 minutes' THEN
        -- Edge crashed before creating a run; safe to re-fire (no run exists).
        -- Stamp updated_at so a fire that is merely SLOW (the tick runs every
        -- minute) is not re-fired on every subsequent tick — that would put two
        -- agents on the same chunk, the same collision by a different route.
        UPDATE research_sweep_chunk SET updated_at = now() WHERE id = v_chunk.id;
        RETURN jsonb_build_object(
          'action', 'fire', 'chunk_id', v_chunk.id, 'chunk_index', v_chunk.chunk_index,
          'window_start', v_chunk.window_start, 'window_end', v_chunk.window_end,
          'site_submit_id', v_sweep.site_submit_id, 'radius_miles', v_sweep.radius_miles,
          'boundary_municipality_ids', to_jsonb(v_sweep.boundary_municipality_ids),
          'triggered_by', v_sweep.triggered_by);
      ELSE
        RETURN jsonb_build_object('action', 'none');  -- give the in-flight fire a moment
      END IF;
    END IF;

    -- state = 'running' or 'orphaned': inspect the run.
    SELECT state INTO v_run_state FROM research_run WHERE id = v_chunk.research_run_id;
    v_activity := public.research_run_last_activity(v_chunk.research_run_id);

    IF v_run_state IN ('awaiting_review', 'approved', 'archived') THEN
      -- Reached a good terminal state. If it was quarantined, this IS the heal:
      -- the agent was alive all along, and holding the sweep is what kept the
      -- next chunk off its back.
      UPDATE research_sweep_chunk
         SET state = 'done', terminal_at = now(), orphaned_at = NULL
       WHERE id = v_chunk.id;
      -- fall through to fire next

    ELSIF v_run_state IN ('failed', 'cancelled') THEN
      UPDATE research_sweep_chunk
         SET state = 'failed', terminal_at = now(), orphaned_at = NULL
       WHERE id = v_chunk.id;
      -- fall through to fire next (failure already surfaced elsewhere)

    ELSIF v_chunk.state = 'orphaned' THEN
      -- QUARANTINE. The run is still non-terminal and we have already declared
      -- it idle. The sweep stays held here; only two things get us out.
      IF v_activity > v_chunk.orphaned_at THEN
        -- It wrote something after we quarantined it: alive, just slow. Release
        -- back to 'running' and restart the idle clock from that write.
        UPDATE research_sweep_chunk
           SET state = 'running', orphaned_at = NULL
         WHERE id = v_chunk.id;
        RETURN jsonb_build_object('action', 'none');

      ELSIF now() - v_chunk.orphaned_at > make_interval(mins => v_sweep.orphan_cooldown_minutes) THEN
        -- Silent through the whole cooldown. Accept it as dead and let the edge
        -- terminalize the run; the next tick fires the next chunk.
        UPDATE research_sweep_chunk
           SET state = 'failed', terminal_at = now()
         WHERE id = v_chunk.id;
        RETURN jsonb_build_object(
          'action', 'orphan', 'chunk_id', v_chunk.id, 'chunk_index', v_chunk.chunk_index,
          'window_start', v_chunk.window_start, 'window_end', v_chunk.window_end,
          'research_run_id', v_chunk.research_run_id);

      ELSE
        RETURN jsonb_build_object('action', 'none');  -- HOLD: do not fire anything
      END IF;

    ELSE
      -- state = 'running': idle timeout? Measured from the run's last write, so
      -- a long-but-productive run is never cut off for its duration alone.
      IF v_activity IS NOT NULL
         AND now() - v_activity > make_interval(mins => v_sweep.chunk_timeout_minutes) THEN
        UPDATE research_sweep_chunk
           SET state = 'orphaned', orphaned_at = now()
         WHERE id = v_chunk.id;
        RETURN jsonb_build_object(
          'action', 'stalled', 'chunk_id', v_chunk.id, 'chunk_index', v_chunk.chunk_index,
          'window_start', v_chunk.window_start, 'window_end', v_chunk.window_end,
          'research_run_id', v_chunk.research_run_id,
          'idle_minutes', round(extract(epoch FROM (now() - v_activity)) / 60),
          'cooldown_minutes', v_sweep.orphan_cooldown_minutes);
      ELSE
        RETURN jsonb_build_object('action', 'none');  -- healthy, still working
      END IF;
    END IF;
  END IF;

  -- ---- 2) No active chunk: fire the next pending one ----
  SELECT * INTO v_chunk FROM research_sweep_chunk
   WHERE sweep_id = p_sweep_id AND state = 'pending'
   ORDER BY chunk_index LIMIT 1;

  IF FOUND THEN
    UPDATE research_sweep_chunk SET state = 'firing', updated_at = now() WHERE id = v_chunk.id;
    RETURN jsonb_build_object(
      'action', 'fire', 'chunk_id', v_chunk.id, 'chunk_index', v_chunk.chunk_index,
      'window_start', v_chunk.window_start, 'window_end', v_chunk.window_end,
      'site_submit_id', v_sweep.site_submit_id, 'radius_miles', v_sweep.radius_miles,
      'boundary_municipality_ids', to_jsonb(v_sweep.boundary_municipality_ids),
      'triggered_by', v_sweep.triggered_by);
  END IF;

  -- ---- 3) No active, no pending: the sweep is terminal ----
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
  RETURN jsonb_build_object('action', 'terminal', 'sweep_state', v_final);
END;
$$;

REVOKE ALL ON FUNCTION public.advance_sweep(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_sweep(uuid) TO service_role;

-- ============================================================================
-- reap_orphaned_research_runs — BUG 1. The sweep for rows already stuck.
--
-- A run whose agent was killed (gateway restart, host reboot, OpenClaw crash)
-- has nobody left to write its terminal state, so it sits at 'running' forever:
-- it never becomes a coverage gap, never shows in the failed count, and
-- get_sweep_gaps will not offer to re-run it. This reaps them on idle.
--
-- Ownership boundary: runs belonging to a live sweep's active chunk are SKIPPED.
-- advance_sweep owns those, with its own timeout and quarantine, and two
-- terminalizers racing over one run is how you get the state churn this whole
-- migration exists to stop. The reaper covers standalone runs and runs whose
-- sweep has already moved on or been cancelled.
--
-- 90 min default: above the longest deep run on record (65 min) and above the
-- sweep engine's own ceiling (45 idle + 20 cooldown), so it only ever fires on
-- runs the engine was never going to resolve.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reap_orphaned_research_runs(p_idle_minutes int DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_ids uuid[];
  v_chunks  int;
BEGIN
  IF p_idle_minutes IS NULL OR p_idle_minutes <= 0 THEN
    RAISE EXCEPTION 'p_idle_minutes must be > 0';
  END IF;

  WITH candidates AS (
    SELECT r.id
      FROM research_run r
     WHERE r.state IN ('pending', 'running')
       AND now() - public.research_run_last_activity(r.id)
             > make_interval(mins => p_idle_minutes)
       AND NOT EXISTS (
             SELECT 1
               FROM research_sweep_chunk c
               JOIN research_sweep s ON s.id = c.sweep_id
              WHERE c.research_run_id = r.id
                AND c.state IN ('firing', 'running', 'orphaned')
                AND s.state = 'running')
  ), reaped AS (
    UPDATE research_run r
       SET state = 'failed', completed_at = COALESCE(r.completed_at, now())
      FROM candidates cd
     WHERE r.id = cd.id
    RETURNING r.id
  )
  SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_run_ids FROM reaped;

  -- Terminalize any chunk still pointing at a reaped run (an abandoned or
  -- cancelled sweep), so the chunk ledger can't claim 'running' against a dead
  -- run and get_sweep_gaps classifies the window as the gap it is.
  WITH c AS (
    UPDATE research_sweep_chunk
       SET state = 'failed', terminal_at = now(), orphaned_at = NULL
     WHERE research_run_id = ANY(v_run_ids)
       AND state IN ('firing', 'running', 'orphaned')
    RETURNING 1
  )
  SELECT count(*) INTO v_chunks FROM c;

  RETURN jsonb_build_object(
    'reaped_count',  COALESCE(array_length(v_run_ids, 1), 0),
    'run_ids',       to_jsonb(v_run_ids),
    'chunks_closed', v_chunks,
    'idle_minutes',  p_idle_minutes);
END;
$$;

REVOKE ALL ON FUNCTION public.reap_orphaned_research_runs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_orphaned_research_runs(int) TO service_role;

-- ============================================================================
-- cancel_sweep / cancel_research_run — 'orphaned' is a non-terminal chunk state
-- and must be cleaned up by the cancel paths exactly like 'firing'/'running'.
-- Bodies are otherwise identical to 20260811155746.
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
     AND c.state IN ('firing','running','orphaned')
     AND r.id = c.research_run_id
     AND r.state IN ('pending','running');

  UPDATE research_sweep_chunk
     SET state = 'failed', terminal_at = now(), orphaned_at = NULL
   WHERE sweep_id = p_sweep_id AND state IN ('firing','running','orphaned');

  UPDATE research_sweep SET state = 'cancelled' WHERE id = p_sweep_id;

  RETURN jsonb_build_object('cancelled', true, 'prior_state', v_prior);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_sweep(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sweep(uuid) TO authenticated, service_role;

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
     SET state = 'failed', terminal_at = now(), orphaned_at = NULL
   WHERE research_run_id = p_run_id
     AND state IN ('firing','running','orphaned');

  RETURN jsonb_build_object('cancelled', true, 'prior_state', v_prior);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_research_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_research_run(uuid) TO authenticated, service_role;
