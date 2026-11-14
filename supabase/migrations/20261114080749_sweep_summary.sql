-- Sweep summary: every PENDING record in exactly one bucket.
--   leads    - no usable unit count (null / <= 0 / flagged by the unit-count trigger)
--   decision - has a count, but an open dedupe conflict (count_conflict), an
--              unresolved possible duplicate (of a committed record, or of
--              another pending row in the sweep), or a distance/jurisdiction
--              flag (lead_reason)
--   ready    - has a count and none of the above
-- Units: total_housing_units after dedupe. Rejected / merged copies are already
-- out, so nothing double-counts across windows. "decision" units are a range:
-- per conflict/duplicate group, low = smallest count, high = largest.
-- Used by the sweep approval header (live) and the "Sweep ready" Telegram.
-- SECURITY INVOKER: staging RLS applies.

ALTER TABLE public.research_sweep ADD COLUMN ready_notified_at timestamptz;
-- Set by ovis-research-mcp once a run's post-submit steps (dedupe → Gemini →
-- dedupe) have finished, so "Sweep ready" waits for them.
ALTER TABLE public.research_run ADD COLUMN post_run_done_at timestamptz;

CREATE FUNCTION public.get_research_summary(p_run_ids uuid[])
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH p AS (
    SELECT s.id, s.units_confidence, s.count_conflict, s.duplicate_of_project_id,
           s.duplicate_of_staging_id, s.lead_reason,
           CASE WHEN s.total_housing_units > 0 AND NOT s.units_needs_review
                THEN s.total_housing_units END AS u
      FROM municipal_project_staging s
     WHERE s.research_run_id = ANY(p_run_ids) AND s.approval_state = 'pending'
  ), b AS (
    SELECT p.*,
      CASE
        WHEN u IS NULL THEN 'leads'
        WHEN (jsonb_typeof(count_conflict) = 'array' AND jsonb_array_length(count_conflict) > 1)
          OR duplicate_of_project_id IS NOT NULL
          OR (duplicate_of_staging_id IS NOT NULL AND EXISTS (SELECT 1 FROM p d WHERE d.id = p.duplicate_of_staging_id))
          OR lead_reason IS NOT NULL
        THEN 'decision'
        ELSE 'ready'
      END AS bucket,
      coalesce(
        (SELECT min(x->>'id') FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(count_conflict) = 'array' THEN count_conflict ELSE '[]'::jsonb END) x
          WHERE x->>'kind' = 'staged'),
        CASE WHEN duplicate_of_staging_id IS NOT NULL
             THEN least(id::text, duplicate_of_staging_id::text) END,
        id::text) AS grp
    FROM p
  ), g AS (
    SELECT grp, min(u) AS lo, max(u) AS hi FROM b WHERE bucket = 'decision' GROUP BY grp
  )
  SELECT jsonb_build_object(
    'pending', count(*),
    'ready', jsonb_build_object(
      'records', count(*) FILTER (WHERE bucket = 'ready'),
      'units', coalesce(sum(u) FILTER (WHERE bucket = 'ready'), 0),
      'estimated_units', coalesce(sum(u) FILTER (WHERE bucket = 'ready' AND units_confidence = 'estimated'), 0)),
    'decision', jsonb_build_object(
      'records', count(*) FILTER (WHERE bucket = 'decision'),
      'groups', (SELECT count(*) FROM g),
      'units_low', (SELECT coalesce(sum(lo), 0) FROM g),
      'units_high', (SELECT coalesce(sum(hi), 0) FROM g)),
    'leads', jsonb_build_object('records', count(*) FILTER (WHERE bucket = 'leads')))
  FROM b;
$$;

REVOKE ALL ON FUNCTION public.get_research_summary(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_research_summary(uuid[]) TO authenticated, service_role;

CREATE FUNCTION public.get_sweep_summary(p_sweep_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ SELECT public.get_research_summary(array(SELECT id FROM research_run WHERE sweep_id = p_sweep_id)); $$;
REVOKE ALL ON FUNCTION public.get_sweep_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sweep_summary(uuid) TO authenticated, service_role;

-- Existing finished sweeps count as already notified, so the new "Sweep ready"
-- sweeper in ovis-sweep-tick doesn't message old sweeps. Alcovy Road and
-- Senoia are left unset on purpose: Mike asked to see the new message on them.
UPDATE public.research_sweep SET ready_notified_at = now()
 WHERE state <> 'running'
   AND id NOT IN ('607d4cc7-d53e-476d-ae65-8b8d4a32a8f0', 'e40e3288-3503-40cb-8556-7dacb86fa13f');
