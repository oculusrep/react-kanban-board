-- Automated Deep-Sweep — RPCs.
--   create_sweep_with_chunks — client, on confirm. Creates sweep + N pending chunks.
--   advance_sweep            — engine core. Transactional, per-sweep advisory lock.
--   mark_chunk_fired         — engine, after a successful OpenClaw POST.
--   get_sweep_staging        — unified approval: all staged rows across a sweep's runs.

-- ============================================================================
-- create_sweep_with_chunks — atomic sweep + chunk creation. triggered_by is
-- resolved from auth.uid() (never trusted from the client). p_windows is a jsonb
-- array of {window_start, window_end}, most-recent slice first (chunk_index 0).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_sweep_with_chunks(
  p_site_id           uuid,
  p_radius_miles      int,
  p_boundary_muni_ids uuid[],
  p_windows           jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid;
  v_sweep_id uuid;
  v_n        int;
BEGIN
  IF NOT public.user_has_market_research_run_access() THEN
    RAISE EXCEPTION 'forbidden: can_run_market_research required';
  END IF;
  IF p_boundary_muni_ids IS NULL OR array_length(p_boundary_muni_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'boundary_muni_ids must be a non-empty array';
  END IF;
  IF p_windows IS NULL OR jsonb_typeof(p_windows) <> 'array' OR jsonb_array_length(p_windows) = 0 THEN
    RAISE EXCEPTION 'p_windows must be a non-empty jsonb array';
  END IF;
  v_n := jsonb_array_length(p_windows);

  SELECT id INTO v_user_id FROM public."user" WHERE auth_user_id = auth.uid();

  INSERT INTO research_sweep (site_submit_id, triggered_by, radius_miles,
                              boundary_municipality_ids, total_chunks)
    VALUES (p_site_id, v_user_id, p_radius_miles, p_boundary_muni_ids, v_n)
    RETURNING id INTO v_sweep_id;

  INSERT INTO research_sweep_chunk (sweep_id, chunk_index, window_start, window_end)
    SELECT v_sweep_id, (w.idx - 1)::int,
           (w.elem->>'window_start')::date,
           (w.elem->>'window_end')::date
      FROM jsonb_array_elements(p_windows) WITH ORDINALITY AS w(elem, idx);

  RETURN v_sweep_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sweep_with_chunks(uuid, int, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sweep_with_chunks(uuid, int, uuid[], jsonb) TO authenticated, service_role;

-- ============================================================================
-- advance_sweep — the sequential engine. Called once per running sweep per tick.
-- Serialized per sweep by an advisory xact lock so overlapping ticks can't
-- double-advance. Returns ONE action for the edge function:
--   {action:'fire',   chunk_id, chunk_index, window_start, window_end,
--                     site_submit_id, radius_miles, boundary_municipality_ids, triggered_by}
--   {action:'orphan', chunk_id, chunk_index, window_start, window_end, research_run_id}
--   {action:'terminal', sweep_state}
--   {action:'none'}
-- Sequencing invariant: at most one chunk is non-terminal (firing|running) at a
-- time. On a happy terminal transition it falls through and fires the next
-- pending chunk in the SAME call (no wasted tick). Orphan returns immediately so
-- the edge can cancel+alert; the next tick fires the next chunk.
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
  v_run_trig  timestamptz;
  v_done      int;
  v_failed    int;
  v_final     text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_sweep_id::text, 0));

  SELECT * INTO v_sweep FROM research_sweep WHERE id = p_sweep_id;
  IF NOT FOUND OR v_sweep.state <> 'running' THEN
    RETURN jsonb_build_object('action', 'none');
  END IF;

  -- ---- 1) Is there a currently-active (firing|running) chunk? ----
  SELECT * INTO v_chunk FROM research_sweep_chunk
   WHERE sweep_id = p_sweep_id AND state IN ('firing', 'running')
   ORDER BY chunk_index LIMIT 1;

  IF FOUND THEN
    IF v_chunk.state = 'firing' THEN
      IF v_chunk.research_run_id IS NOT NULL THEN
        -- POST landed (run exists) but mark_chunk_fired didn't commit; adopt it.
        UPDATE research_sweep_chunk SET state = 'running' WHERE id = v_chunk.id;
        RETURN jsonb_build_object('action', 'none');
      ELSIF now() - v_chunk.updated_at > interval '3 minutes' THEN
        -- Edge crashed before creating a run; safe to re-fire (no run exists).
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

    -- state = 'running': inspect the run.
    SELECT state, triggered_at INTO v_run_state, v_run_trig
      FROM research_run WHERE id = v_chunk.research_run_id;

    IF v_run_state IN ('awaiting_review', 'approved', 'archived') THEN
      UPDATE research_sweep_chunk SET state = 'done', terminal_at = now() WHERE id = v_chunk.id;
      -- fall through to fire next
    ELSIF v_run_state IN ('failed', 'cancelled') THEN
      UPDATE research_sweep_chunk SET state = 'failed', terminal_at = now() WHERE id = v_chunk.id;
      -- fall through to fire next (failure already surfaced elsewhere)
    ELSE
      -- still running: timeout?
      IF v_run_trig IS NOT NULL
         AND now() - v_run_trig > make_interval(mins => v_sweep.chunk_timeout_minutes) THEN
        UPDATE research_sweep_chunk SET state = 'failed', terminal_at = now() WHERE id = v_chunk.id;
        RETURN jsonb_build_object(
          'action', 'orphan', 'chunk_id', v_chunk.id, 'chunk_index', v_chunk.chunk_index,
          'window_start', v_chunk.window_start, 'window_end', v_chunk.window_end,
          'research_run_id', v_chunk.research_run_id);
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
-- mark_chunk_fired — after the edge fn's internal trigger call created a run and
-- POSTed OpenClaw. Links run<->chunk and moves firing -> running.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_chunk_fired(p_chunk_id uuid, p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sweep_id uuid;
  v_idx      int;
BEGIN
  UPDATE research_sweep_chunk
     SET state = 'running', research_run_id = p_run_id, fired_at = now()
   WHERE id = p_chunk_id
   RETURNING sweep_id, chunk_index INTO v_sweep_id, v_idx;

  UPDATE research_run
     SET sweep_id = v_sweep_id, sweep_chunk_index = v_idx
   WHERE id = p_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_chunk_fired(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_chunk_fired(uuid, uuid) TO service_role;

-- ============================================================================
-- mark_chunk_failed — the edge fn calls this if the internal trigger errored or
-- OpenClaw rejected (so the chunk doesn't sit in 'firing'). Records the run_id if
-- one was created. Failure isolation: the next tick advances past it.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_chunk_failed(p_chunk_id uuid, p_run_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE research_sweep_chunk
     SET state = 'failed', terminal_at = now(),
         research_run_id = COALESCE(p_run_id, research_run_id)
   WHERE id = p_chunk_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_chunk_failed(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_chunk_failed(uuid, uuid) TO service_role;

-- ============================================================================
-- get_sweep_staging — unified approval. All staged rows across every run in the
-- sweep, joined to boundary_municipality, with research_run_id (needed for the
-- per-run fan-out approve) and chunk_index (provenance). Ordered for stable UI.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_sweep_staging(p_sweep_id uuid)
RETURNS TABLE(
  id                      uuid,
  research_run_id         uuid,
  sweep_chunk_index       int,
  boundary_municipality_id uuid,
  muni_name               text,
  muni_kind               text,
  matched_existing_id     uuid,
  approval_state          text,
  project_name            text,
  address                 text,
  location_description     text,
  parcel_boundary_notes    text,
  total_housing_units     int,
  builder_developer       text,
  permit_url              text,
  permit_application_date date,
  source                  text,
  notes                   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.research_run_id, r.sweep_chunk_index,
    s.boundary_municipality_id, bm.name, bm.kind,
    s.matched_existing_id, s.approval_state,
    s.project_name, s.address, s.location_description, s.parcel_boundary_notes,
    s.total_housing_units, s.builder_developer, s.permit_url,
    s.permit_application_date, s.source, s.notes
  FROM municipal_project_staging s
  JOIN research_run r ON r.id = s.research_run_id AND r.sweep_id = p_sweep_id
  LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
  ORDER BY bm.name, r.sweep_chunk_index, s.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_sweep_staging(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sweep_staging(uuid) TO authenticated, service_role;
