-- Deep Sweep evergreen (undated) chunk. Plan: docs/DEEP_SWEEP_EVERGREEN_CHUNK_PLAN.md
--
-- research_scope on every run:
--   'full'      - legacy: date-bound AND undated sources, within the window
--   'window'    - date-bound sources only (minutes, agendas, permits, plats);
--                 the window chunks of a sweep that HAS an evergreen chunk
--   'evergreen' - undated sources only (builder sites, news, community pages,
--                 known subdivisions in the radius); one per sweep, chunk 0
-- A sweep gets an evergreen chunk only when created with p_include_evergreen.

ALTER TABLE public.research_run
  ADD COLUMN research_scope text NOT NULL DEFAULT 'full'
    CHECK (research_scope IN ('full', 'window', 'evergreen'));

ALTER TABLE public.research_sweep_chunk
  ADD COLUMN kind text NOT NULL DEFAULT 'window' CHECK (kind IN ('window', 'evergreen')),
  ALTER COLUMN window_start DROP NOT NULL,
  ALTER COLUMN window_end DROP NOT NULL,
  ADD CONSTRAINT research_sweep_chunk_window_by_kind CHECK (
    (kind = 'window' AND window_start IS NOT NULL AND window_end IS NOT NULL)
    OR (kind = 'evergreen' AND window_start IS NULL AND window_end IS NULL));

-- Scope a chunk's run gets: evergreen chunk -> 'evergreen'; a window chunk in a
-- sweep that has an evergreen chunk -> 'window'; otherwise 'full' (legacy).
CREATE FUNCTION public.sweep_chunk_scope(p_sweep_id uuid, p_kind text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_kind = 'evergreen' THEN 'evergreen'
    WHEN EXISTS (SELECT 1 FROM research_sweep_chunk WHERE sweep_id = p_sweep_id AND kind = 'evergreen') THEN 'window'
    ELSE 'full'
  END;
$$;
REVOKE ALL ON FUNCTION public.sweep_chunk_scope(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_chunk_scope(uuid, text) TO service_role;

-- create_sweep_with_chunks: + p_include_evergreen (default false, so existing
-- callers are unchanged). Evergreen = chunk_index 0, windows shift to 1..N.
-- Rebuilt from the live definition.
DROP FUNCTION public.create_sweep_with_chunks(uuid, integer, uuid[], jsonb);
CREATE FUNCTION public.create_sweep_with_chunks(p_site_id uuid, p_radius_miles integer, p_boundary_muni_ids uuid[], p_windows jsonb, p_include_evergreen boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid; v_sweep_id uuid; v_n int; v_off int;
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
  v_off := CASE WHEN p_include_evergreen THEN 1 ELSE 0 END;
  v_n := jsonb_array_length(p_windows) + v_off;
  SELECT id INTO v_user_id FROM public."user" WHERE auth_user_id = auth.uid();
  INSERT INTO research_sweep (site_submit_id, triggered_by, radius_miles, boundary_municipality_ids, total_chunks)
    VALUES (p_site_id, v_user_id, p_radius_miles, p_boundary_muni_ids, v_n)
    RETURNING id INTO v_sweep_id;
  IF p_include_evergreen THEN
    INSERT INTO research_sweep_chunk (sweep_id, chunk_index, kind, window_start, window_end)
      VALUES (v_sweep_id, 0, 'evergreen', NULL, NULL);
  END IF;
  INSERT INTO research_sweep_chunk (sweep_id, chunk_index, window_start, window_end)
    SELECT v_sweep_id, (w.idx - 1 + v_off)::int, (w.elem->>'window_start')::date, (w.elem->>'window_end')::date
      FROM jsonb_array_elements(p_windows) WITH ORDINALITY AS w(elem, idx);
  RETURN v_sweep_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_sweep_with_chunks(uuid, integer, uuid[], jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sweep_with_chunks(uuid, integer, uuid[], jsonb, boolean) TO authenticated, service_role;

-- What the sweep has already staged, for the agent (MCP get_sweep_known_projects):
-- every non-rejected staged row in the caller's sweep, from OTHER runs.
CREATE FUNCTION public.get_sweep_known_projects(p_research_run_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'sweep_id', me.sweep_id,
    'projects', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'project_name', s.project_name,
               'phase_label', nullif(s.phase_label, ''),
               'municipality', bm.name,
               'boundary_municipality_id', s.boundary_municipality_id,
               'address', s.address,
               'total_housing_units', s.total_housing_units,
               'case_numbers', to_jsonb(public.research_case_numbers(s.project_name, s.zoning)),
               'chunk_index', r.sweep_chunk_index,
               'research_scope', r.research_scope,
               'approval_state', s.approval_state)
             ORDER BY bm.name, s.project_name)
        FROM municipal_project_staging s
        JOIN research_run r ON r.id = s.research_run_id
        LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
       WHERE r.sweep_id = me.sweep_id
         AND r.id <> me.id
         AND s.approval_state <> 'rejected'), '[]'::jsonb))
  FROM research_run me
  WHERE me.id = p_research_run_id AND me.sweep_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_sweep_known_projects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sweep_known_projects(uuid) TO service_role;

-- advance_sweep: live definition + kind / research_scope / sweep span in both fire payloads.
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
          'triggered_by', v_sweep.triggered_by,
          -- ADDED evergreen chunk (see docs/DEEP_SWEEP_EVERGREEN_CHUNK_PLAN.md)
          'kind', v_chunk.kind,
          'research_scope', public.sweep_chunk_scope(v_chunk.sweep_id, v_chunk.kind),
          'sweep_window_start', (SELECT min(window_start) FROM research_sweep_chunk WHERE sweep_id = p_sweep_id),
          'sweep_window_end',   (SELECT max(window_end)   FROM research_sweep_chunk WHERE sweep_id = p_sweep_id));
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
      'triggered_by', v_sweep.triggered_by,
          -- ADDED evergreen chunk (see docs/DEEP_SWEEP_EVERGREEN_CHUNK_PLAN.md)
          'kind', v_chunk.kind,
          'research_scope', public.sweep_chunk_scope(v_chunk.sweep_id, v_chunk.kind),
          'sweep_window_start', (SELECT min(window_start) FROM research_sweep_chunk WHERE sweep_id = p_sweep_id),
          'sweep_window_end',   (SELECT max(window_end)   FROM research_sweep_chunk WHERE sweep_id = p_sweep_id));
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
$function$;

-- get_sweep_gaps: live definition + kind on each gap.
CREATE OR REPLACE FUNCTION public.get_sweep_gaps(p_sweep_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH classified AS (
    SELECT
      c.chunk_index, c.window_start, c.window_end, c.kind,
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
                           'window_end', window_end,
                           'kind', kind)
        ORDER BY chunk_index
      ) FILTER (WHERE is_gap),
      '[]'::jsonb)
  )
  FROM classified;
$function$;

-- get_research_coverage: live definition; evergreen runs are not date coverage.
CREATE OR REPLACE FUNCTION public.get_research_coverage(p_site_submit_id uuid)
 RETURNS TABLE(boundary_municipality_id uuid, municipality_name text, record_type text, segment_start date, segment_end date, pass_count integer, last_searched_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH passes AS (
    SELECT
      ci.boundary_municipality_id AS bm_id,
      rt.record_type,
      rt.wstart,
      rt.wend,
      ci.updated_at               AS searched_at
    FROM research_run r
    JOIN research_checklist_item ci
      ON ci.research_run_id = r.id
     AND ci.status = 'complete'
    CROSS JOIN LATERAL (
      VALUES
        ('pz'::text,     r.pz_window_start,     r.pz_window_end),
        ('permit'::text, r.permit_window_start, r.permit_window_end)
    ) AS rt(record_type, wstart, wend)
    WHERE r.site_submit_id = p_site_submit_id
      AND r.research_mode  = 'deep'
      -- ADDED: an evergreen (undated) run searched no date-bound sources.
      AND r.research_scope <> 'evergreen'
      AND r.state         <> 'failed'
      AND rt.wstart IS NOT NULL
      AND rt.wend   IS NOT NULL
  ),
  boundaries AS (
    SELECT bm_id, record_type, b AS bdate
    FROM passes
    CROSS JOIN LATERAL (VALUES (wstart), ((wend + 1))) AS x(b)
    GROUP BY bm_id, record_type, b
  ),
  segments AS (
    SELECT
      bm_id, record_type,
      bdate AS seg_lo,
      lead(bdate) OVER (PARTITION BY bm_id, record_type ORDER BY bdate) AS seg_hi
    FROM boundaries
  ),
  counted AS (
    SELECT
      s.bm_id, s.record_type, s.seg_lo, s.seg_hi,
      count(p.*)         AS pass_count,
      max(p.searched_at) AS last_searched_at
    FROM segments s
    JOIN passes p
      ON p.bm_id       = s.bm_id
     AND p.record_type = s.record_type
     AND p.wstart      <= s.seg_lo
     AND (p.wend + 1)  >= s.seg_hi
    WHERE s.seg_hi IS NOT NULL
    GROUP BY s.bm_id, s.record_type, s.seg_lo, s.seg_hi
  )
  SELECT
    c.bm_id,
    bm.name,
    c.record_type,
    c.seg_lo         AS segment_start,
    (c.seg_hi - 1)   AS segment_end,
    c.pass_count::int,
    c.last_searched_at
  FROM counted c
  LEFT JOIN boundary_municipality bm ON bm.id = c.bm_id
  WHERE c.pass_count >= 1
  ORDER BY bm.name, c.record_type, c.seg_lo;
$function$;
