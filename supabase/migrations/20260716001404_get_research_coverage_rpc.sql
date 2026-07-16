-- Market Research windowing — coverage RPC (increment 2).
--
-- Answers "how well has this site's trade area been searched, over time?" as a
-- per-(municipality, record_type) COVERAGE-DEPTH MAP, not a binary watermark.
--
-- Design (see project memory project_market_research_windowing):
--   * DEEP-ONLY. Only research_mode='deep' runs count. A quick run is a sampled
--     sniff test and has not "covered" anything — counting it would manufacture
--     false confidence. Quick runs are surfaced elsewhere as triage, not here.
--   * A "pass" = one (deep run, municipality, record_type) where the run's
--     checklist marked that municipality status='complete' (skipped/blocked/
--     failed weren't searched) and the run isn't failed.
--   * Re-running a covered window is GOOD (recall is non-deterministic — a second
--     pass surfaces real records the first missed), so we do NOT merge intervals
--     to a floor. Instead a sweep-line returns, per (muni, type), the segmented
--     timeline of coverage DEPTH: {segment_start, segment_end, pass_count,
--     last_searched_at}. The caller derives gaps (uncovered ranges are simply
--     absent) and any "researched back to" floor from this; nothing here blocks
--     re-running a covered window.
--   * pass_count is (a) — plain Deep-pass count. Self-reported completeness
--     denominators ("X of Y agendas enumerated") are deferred to (b): the Deep
--     coverage-report format isn't stable yet, so we don't freeze a schema around
--     a number the agent isn't reliably producing.
--
-- last_searched_at per segment = the MAX per-municipality completion time
-- (research_checklist_item.updated_at) among the passes covering that segment —
-- "Deep x2 last year" reads very differently from "x1 last week".
--
-- Read-only; safe for the authenticated reviewer session.

CREATE OR REPLACE FUNCTION public.get_research_coverage(
  p_site_submit_id uuid
) RETURNS TABLE(
  boundary_municipality_id uuid,
  municipality_name        text,
  record_type              text,   -- 'pz' | 'permit'
  segment_start            date,   -- inclusive
  segment_end              date,   -- inclusive
  pass_count               int,
  last_searched_at         timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH passes AS (
    -- One row per (deep run, completed municipality, record_type) that actually
    -- searched a window. Each qualifying (run, muni) contributes up to two
    -- passes: one pz, one permit (only where that window is non-null).
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
      AND r.state         <> 'failed'
      AND rt.wstart IS NOT NULL
      AND rt.wend   IS NOT NULL
  ),
  boundaries AS (
    -- Distinct segment boundary dates per (muni, type): each window start and
    -- each window end+1 (half-open upper bound, so touching windows don't merge
    -- into a spurious extra segment).
    SELECT bm_id, record_type, b AS bdate
    FROM passes
    CROSS JOIN LATERAL (VALUES (wstart), ((wend + 1))) AS x(b)
    GROUP BY bm_id, record_type, b
  ),
  segments AS (
    -- Consecutive boundary pairs = candidate half-open segments [seg_lo, seg_hi).
    SELECT
      bm_id, record_type,
      bdate AS seg_lo,
      lead(bdate) OVER (PARTITION BY bm_id, record_type ORDER BY bdate) AS seg_hi
    FROM boundaries
  ),
  counted AS (
    -- Depth = passes covering the whole segment. Uncovered gap-segments join no
    -- pass and drop out (INNER JOIN), so only covered ranges are returned.
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
$$;

REVOKE ALL ON FUNCTION public.get_research_coverage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_research_coverage(uuid) TO authenticated, service_role;
