-- Deep-Sweep — circuit breaker + per-chunk skip.
--
-- Both come out of the 2026-09-17 Mashburn Village session, which exposed the
-- cost of a guard tuned entirely for the slow-but-alive agent:
--
--   * Anthropic credit balance hit zero 13 min into chunk 0. Every chunk after
--     it died in under two seconds — yet each still took the full 45-min idle
--     timeout plus the 20-min cooldown to be declared dead. The sweep would have
--     spent ~6.5 hours producing nothing before finishing on its own.
--   * A transient "LLM request failed: network connection error" killed the
--     replacement sweep's chunk 0 at 19:45:49, 16 min in. Same 65-min detection.
--
-- The stall guard is right to be patient with a run that might be alive. It has
-- no answer for a run that is definitively dead, or for a provider that is down
-- for every chunk. These add the two missing exits.

-- ============================================================================
-- advance_sweep — unchanged except for the new circuit breaker between "no
-- active chunk" and "fire the next pending one".
--
-- New action: {action:'aborted', sweep_state, dead_chunks[], skipped_count}
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
  v_recent    int;
  v_dead      int;
  v_dead_list jsonb;
  v_skipped   int;
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
        UPDATE research_sweep_chunk SET state = 'running' WHERE id = v_chunk.id;
        RETURN jsonb_build_object('action', 'none');
      ELSIF now() - v_chunk.updated_at > interval '3 minutes' THEN
        UPDATE research_sweep_chunk SET updated_at = now() WHERE id = v_chunk.id;
        RETURN jsonb_build_object(
          'action', 'fire', 'chunk_id', v_chunk.id, 'chunk_index', v_chunk.chunk_index,
          'window_start', v_chunk.window_start, 'window_end', v_chunk.window_end,
          'site_submit_id', v_sweep.site_submit_id, 'radius_miles', v_sweep.radius_miles,
          'boundary_municipality_ids', to_jsonb(v_sweep.boundary_municipality_ids),
          'triggered_by', v_sweep.triggered_by);
      ELSE
        RETURN jsonb_build_object('action', 'none');
      END IF;
    END IF;

    SELECT state INTO v_run_state FROM research_run WHERE id = v_chunk.research_run_id;
    v_activity := public.research_run_last_activity(v_chunk.research_run_id);

    IF v_run_state IN ('awaiting_review', 'approved', 'archived') THEN
      UPDATE research_sweep_chunk
         SET state = 'done', terminal_at = now(), orphaned_at = NULL
       WHERE id = v_chunk.id;
      -- fall through

    ELSIF v_run_state IN ('failed', 'cancelled') THEN
      UPDATE research_sweep_chunk
         SET state = 'failed', terminal_at = now(), orphaned_at = NULL
       WHERE id = v_chunk.id;
      -- fall through

    ELSIF v_chunk.state = 'orphaned' THEN
      IF v_activity > v_chunk.orphaned_at THEN
        UPDATE research_sweep_chunk
           SET state = 'running', orphaned_at = NULL
         WHERE id = v_chunk.id;
        RETURN jsonb_build_object('action', 'none');
      ELSIF now() - v_chunk.orphaned_at > make_interval(mins => v_sweep.orphan_cooldown_minutes) THEN
        UPDATE research_sweep_chunk
           SET state = 'failed', terminal_at = now()
         WHERE id = v_chunk.id;
        RETURN jsonb_build_object(
          'action', 'orphan', 'chunk_id', v_chunk.id, 'chunk_index', v_chunk.chunk_index,
          'window_start', v_chunk.window_start, 'window_end', v_chunk.window_end,
          'research_run_id', v_chunk.research_run_id);
      ELSE
        RETURN jsonb_build_object('action', 'none');  -- HOLD
      END IF;

    ELSE
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
        RETURN jsonb_build_object('action', 'none');
      END IF;
    END IF;
  END IF;

  -- ---- 1.5) CIRCUIT BREAKER — two consecutive dead chunks ----
  -- "Dead" = reached a terminal state with nothing whatsoever to show: zero
  -- staged records AND not one checklist item ever moved off 'pending'. That is
  -- the signature of an agent that never really ran (provider unfunded, gateway
  -- down, no credits) as opposed to one that worked a window and found nothing
  -- — the latter still marks municipalities complete, so it has activity.
  --
  -- Two in a row means the cause is upstream of any single chunk and the
  -- remaining chunks will fail identically, ~65 min each. Stop instead.
  --
  -- Deliberately ordered by terminal_at, not chunk_index: after a Re-run gaps
  -- the surviving chunk indexes are non-contiguous, and "consecutive" has to
  -- mean "the last two to finish", not "the two highest-numbered".
  SELECT count(*),
         count(*) FILTER (WHERE t.staged = 0 AND t.touched = 0),
         jsonb_agg(jsonb_build_object('chunk_index',  t.chunk_index,
                                      'window_start', t.window_start,
                                      'window_end',   t.window_end)
                   ORDER BY t.chunk_index)
           FILTER (WHERE t.staged = 0 AND t.touched = 0)
    INTO v_recent, v_dead, v_dead_list
    FROM (
      SELECT c.chunk_index, c.window_start, c.window_end,
             (SELECT count(*) FROM municipal_project_staging s
               WHERE s.research_run_id = c.research_run_id) AS staged,
             (SELECT count(*) FROM research_checklist_item i
               WHERE i.research_run_id = c.research_run_id
                 AND i.status <> 'pending')                 AS touched
        FROM research_sweep_chunk c
       WHERE c.sweep_id = p_sweep_id
         AND c.state IN ('done', 'failed')
       ORDER BY c.terminal_at DESC NULLS LAST, c.chunk_index DESC
       LIMIT 2
    ) t;

  IF v_recent = 2 AND v_dead = 2 THEN
    -- Do NOT leave the unrun chunks 'pending'. get_sweep_gaps only classifies a
    -- chunk as a gap when it is 'failed', so a pending chunk would be invisible
    -- to Re-run gaps and its window would be silently lost. Marking them failed
    -- makes every unrun window recoverable once the agent side is fixed.
    WITH s AS (
      UPDATE research_sweep_chunk
         SET state = 'failed', terminal_at = now()
       WHERE sweep_id = p_sweep_id AND state = 'pending'
      RETURNING 1
    )
    SELECT count(*) INTO v_skipped FROM s;

    -- complete_with_failures, not 'cancelled': cancelled means deliberately
    -- abandoned and rerun_sweep_gaps refuses it. This state keeps Re-run gaps
    -- available, which is the whole point of stopping early.
    UPDATE research_sweep SET state = 'complete_with_failures' WHERE id = p_sweep_id;

    RETURN jsonb_build_object(
      'action', 'aborted', 'sweep_state', 'complete_with_failures',
      'dead_chunks', v_dead_list, 'skipped_count', v_skipped);
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
-- skip_sweep_chunk — the operator's "I can see it's dead, stop making me wait"
-- button. Force-terminalizes the active chunk as a GAP and lets the sweep move
-- on without serving the rest of the orphan cooldown.
--
-- This exists because there was no way to kill one chunk: the runs panel lists
-- only standalone runs (sweep_id IS NULL), so a chunk's run isn't there, and the
-- sweep's own Cancel kills all remaining chunks. The only option was to wait out
-- a cooldown on a run already known to be dead.
--
-- "Immediately advances" means the next tick, i.e. within 60s — firing a chunk
-- requires the edge function's OpenClaw POST, which a DB function cannot do.
-- What this guarantees is that nothing blocks that next tick from firing.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.skip_sweep_chunk(p_sweep_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sweep research_sweep%ROWTYPE;
  v_chunk research_sweep_chunk%ROWTYPE;
BEGIN
  IF NOT public.user_has_market_research_run_access() THEN
    RAISE EXCEPTION 'forbidden: can_run_market_research required';
  END IF;

  -- Same per-sweep lock as advance_sweep, so a skip can never interleave with a
  -- tick mid-decision.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_sweep_id::text, 0));

  SELECT * INTO v_sweep FROM research_sweep WHERE id = p_sweep_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'research_sweep % not found', p_sweep_id;
  END IF;
  IF v_sweep.state <> 'running' THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'sweep_not_running',
                              'sweep_state', v_sweep.state);
  END IF;

  SELECT * INTO v_chunk FROM research_sweep_chunk
   WHERE sweep_id = p_sweep_id AND state IN ('firing', 'running', 'orphaned')
   ORDER BY chunk_index LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'no_active_chunk');
  END IF;

  -- Terminalize the run first. Without this it stays non-terminal and keeps the
  -- one-live-run-per-site guard engaged against its own sweep. 'cancelled' not
  -- 'failed': it records that a human ended this, which stays distinguishable
  -- from an agent death in any later forensics. Both read as a gap.
  UPDATE research_run
     SET state = 'cancelled', completed_at = COALESCE(completed_at, now())
   WHERE id = v_chunk.research_run_id
     AND state IN ('pending', 'running');

  -- 'failed' marks the window as a gap, never a success — a skipped window was
  -- not covered and must stay eligible for Re-run gaps.
  UPDATE research_sweep_chunk
     SET state = 'failed', terminal_at = now(), orphaned_at = NULL
   WHERE id = v_chunk.id;

  RETURN jsonb_build_object(
    'skipped', true,
    'chunk_index',     v_chunk.chunk_index,
    'window_start',    v_chunk.window_start,
    'window_end',      v_chunk.window_end,
    'research_run_id', v_chunk.research_run_id,
    'was_state',       v_chunk.state);
END;
$$;

REVOKE ALL ON FUNCTION public.skip_sweep_chunk(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.skip_sweep_chunk(uuid) TO authenticated, service_role;
