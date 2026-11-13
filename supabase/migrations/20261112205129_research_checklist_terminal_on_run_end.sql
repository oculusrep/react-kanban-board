-- When a research run ends without finishing (failed / cancelled), close its
-- checklist so no screen reads a dead run as live.
--
--   in_progress -> abandoned    (the agent started this municipality, then the run died)
--   pending     -> not_reached  (the run died before getting to it)
--
-- New statuses rather than 'blocked' / 'skipped': those are the AGENT's
-- judgments (update_checklist_status), and coverage / sweep logic must be able
-- to tell "agent decided" from "run died". get_research_coverage counts only
-- 'complete', so neither new status reads as covered.
--
-- advance_sweep's circuit breaker counts a chunk as "touched" when any item
-- moved off 'pending'. 'not_reached' is still untouched, so the breaker is
-- rebuilt (from the live definition) to exclude it — otherwise closing a dead
-- chunk's checklist would hide the dead-chunk signature it trips on.
--
-- Backfill: every failed / cancelled run with a live item (21 runs on 2026-11-12,
-- incl. Senoia Deep sweep chunk 5, b29e8327).

ALTER TABLE public.research_checklist_item DROP CONSTRAINT research_checklist_item_status_check;
ALTER TABLE public.research_checklist_item ADD CONSTRAINT research_checklist_item_status_check
  CHECK (status = ANY (ARRAY['pending','in_progress','complete','skipped','blocked','abandoned','not_reached']));

CREATE OR REPLACE FUNCTION public.close_checklist_on_run_end()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE research_checklist_item
     SET status = CASE status WHEN 'in_progress' THEN 'abandoned' ELSE 'not_reached' END
   WHERE research_run_id = NEW.id
     AND status IN ('pending', 'in_progress');
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.close_checklist_on_run_end() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS research_run_close_checklist_on_end ON public.research_run;
CREATE TRIGGER research_run_close_checklist_on_end
  AFTER UPDATE OF state ON public.research_run
  FOR EACH ROW
  WHEN (NEW.state IN ('failed', 'cancelled') AND OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION public.close_checklist_on_run_end();

-- Backfill.
UPDATE public.research_checklist_item ci
   SET status = CASE ci.status WHEN 'in_progress' THEN 'abandoned' ELSE 'not_reached' END
  FROM public.research_run rr
 WHERE rr.id = ci.research_run_id
   AND rr.state IN ('failed', 'cancelled')
   AND ci.status IN ('pending', 'in_progress');

-- advance_sweep: live definition (pg_get_functiondef, 2026-11-12) with one change
-- in the circuit breaker: an item the run never reached is not activity.
CREATE OR REPLACE FUNCTION public.advance_sweep(p_sweep_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                 AND i.status NOT IN ('pending', 'not_reached'))                 AS touched
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
$function$

;

REVOKE ALL ON FUNCTION public.advance_sweep(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_sweep(uuid) TO service_role;
