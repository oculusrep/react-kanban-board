-- Package progress view: stop scanning site_submit per package.
--
-- v_deal_package_progress (20261022110117) joined site_submit to get a site-only
-- package's stage. As an authenticated user, site_submit's RLS policies call
-- per-row functions and the planner seq-scans the whole table (~1,240 rows) for
-- every package: 13 packages = ~2.1s of a 2.3s view (measured 2026-10-22).
--
-- package_site_stage(site_submit_id) returns the site's board stage name (LOI →
-- 'Negotiating LOI', like the board) by primary-key lookup, SECURITY DEFINER so
-- RLS doesn't force the scan. It returns NULL unless the caller is an internal
-- user, so it reveals nothing to portal users (the view itself is internal-only).
-- The view is otherwise unchanged (CREATE OR REPLACE, same columns, grants kept).
-- Built from the 20261022110117 definition, which matches live (applied today).
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

CREATE FUNCTION public.package_site_stage(p_site_submit_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE sst.name WHEN 'LOI' THEN 'Negotiating LOI' ELSE sst.name END
    FROM public.site_submit s
    JOIN public.submit_stage sst ON sst.id = s.submit_stage_id
   WHERE s.id = p_site_submit_id
     AND public.is_internal_user();
$$;

COMMENT ON FUNCTION public.package_site_stage(uuid) IS
  'Package Tracker: a site submit''s board stage by PK (definer, internal users only) — avoids site_submit RLS seq scans in v_deal_package_progress.';

REVOKE ALL ON FUNCTION public.package_site_stage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.package_site_stage(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.v_deal_package_progress
WITH (security_invoker = true) AS
WITH base AS (
  SELECT p.id  AS package_id,
         p.deal_id,
         COALESCE(p.site_submit_id, d.site_submit_id) AS site_submit_id,
         p.started_at,
         p.final_loi_at,
         gd.confirmed_at AS gates_confirmed_at,
         CASE WHEN gd.first_draft_sent_on IS NOT NULL
              THEN (gd.first_draft_sent_on::timestamp + interval '12 hours') AT TIME ZONE 'America/New_York' END AS gate1_manual,
         CASE WHEN gd.first_response_on IS NOT NULL
              THEN (gd.first_response_on::timestamp + interval '12 hours') AT TIME ZONE 'America/New_York' END AS gate2_manual,
         ds.label AS deal_stage,
         -- Board column stage: the deal's when there is one, else the site's (LOI → Negotiating LOI).
         COALESCE(ds.label, public.package_site_stage(COALESCE(p.site_submit_id, d.site_submit_id))) AS stage,
         COALESCE(ds.sort_order,
                  (SELECT ms.sort_order FROM public.deal_stage ms
                    WHERE ms.label = public.package_site_stage(COALESCE(p.site_submit_id, d.site_submit_id)))) AS stage_order,
         (SELECT max(COALESCE(h.corrected_date, h.changed_at))
            FROM public.deal_stage_history h
            JOIN public.deal_stage hs ON hs.id = h.to_stage_id
           WHERE p.deal_id IS NOT NULL AND h.deal_id = p.deal_id AND hs.label = 'Negotiating LOI') AS loi_entry_at,
         public.court_log_start() AS log_start
    FROM public.deal_package p
    LEFT JOIN public.deal d            ON d.id = p.deal_id
    LEFT JOIN public.deal_stage ds     ON ds.id = d.stage_id
    LEFT JOIN public.deal_gate_date gd ON gd.deal_id = p.deal_id
   WHERE public.package_subject_in_family(p.deal_id, COALESCE(p.site_submit_id, d.site_submit_id))
),
ev AS (
  SELECT b.package_id, e.court, e.source, e.effective_at, e.recorded_at
    FROM base b
    JOIN public.deal_court_event e
      ON (b.deal_id IS NOT NULL AND e.deal_id = b.deal_id)
      OR (b.site_submit_id IS NOT NULL AND e.site_submit_id = b.site_submit_id)
),
g1 AS (
  SELECT b.*,
         EXISTS (SELECT 1 FROM ev WHERE ev.package_id = b.package_id AND ev.source = 'document_handoff') AS has_handoff,
         COALESCE(
           b.gate1_manual,
           LEAST(
             (SELECT min(effective_at) FROM ev
               WHERE ev.package_id = b.package_id AND ev.source = 'document_handoff' AND ev.court = 'them'),
             (SELECT min(effective_at) FROM ev
               WHERE ev.package_id = b.package_id AND ev.source = 'board' AND ev.court = 'them'
                 AND b.loi_entry_at IS NOT NULL AND b.loi_entry_at >= b.log_start
                 AND ev.effective_at > b.loi_entry_at),
             (SELECT min(effective_at) FROM ev
               WHERE ev.package_id = b.package_id AND ev.source = 'board' AND ev.court = 'them'
                 AND b.gates_confirmed_at IS NOT NULL
                 AND ev.recorded_at > b.gates_confirmed_at
                 AND (b.loi_entry_at IS NULL OR ev.effective_at > b.loi_entry_at))
           )
         ) AS gate1_at
    FROM base b
),
g2 AS (
  SELECT g1.*,
         CASE WHEN g1.gate1_at IS NULL THEN NULL ELSE
           COALESCE(
             g1.gate2_manual,
             LEAST(
               (SELECT min(effective_at) FROM ev
                 WHERE ev.package_id = g1.package_id AND ev.source = 'document_handoff' AND ev.court = 'us'
                   AND ev.effective_at > g1.gate1_at),
               (SELECT min(effective_at) FROM ev
                 WHERE ev.package_id = g1.package_id AND ev.source = 'board' AND ev.court = 'us'
                   AND g1.gate1_at >= g1.log_start
                   AND ev.effective_at > g1.gate1_at),
               (SELECT min(effective_at) FROM ev
                 WHERE ev.package_id = g1.package_id AND ev.source = 'board' AND ev.court = 'us'
                   AND g1.gates_confirmed_at IS NOT NULL
                   AND ev.recorded_at > g1.gates_confirmed_at
                   AND ev.effective_at > g1.gate1_at)
             )
           )
         END AS gate2_at
    FROM g1
),
gates AS (
  SELECT g2.*,
         CASE
           WHEN g2.gate1_at IS NOT NULL                                THEN 'reached'
           WHEN g2.stage_order IS NULL OR g2.stage_order < 2           THEN 'not_reached'
           WHEN g2.gates_confirmed_at IS NOT NULL                      THEN 'not_reached'
           WHEN g2.loi_entry_at IS NOT NULL AND g2.loi_entry_at >= g2.log_start THEN 'not_reached'
           WHEN g2.has_handoff                                         THEN 'not_reached'
           ELSE 'unknown'
         END AS gate1_state,
         g2.final_loi_at AS gate3_at
    FROM g2
),
gates2 AS (
  SELECT gates.*,
         CASE
           WHEN gates.gate2_at IS NOT NULL               THEN 'reached'
           WHEN gates.gate1_state = 'unknown'            THEN 'unknown'
           WHEN gates.gate1_state = 'not_reached'        THEN 'not_reached'
           WHEN gates.gates_confirmed_at IS NOT NULL     THEN 'not_reached'
           WHEN gates.gate1_at >= gates.log_start        THEN 'not_reached'
           ELSE 'unknown'
         END AS gate2_state,
         CASE WHEN gates.gate3_at IS NOT NULL THEN 'reached' ELSE 'not_reached' END AS gate3_state
    FROM gates
),
counts AS (
  SELECT s.package_id,
         count(*) FILTER (WHERE s.effective_status <> 'na')                       AS applicable,
         count(*) FILTER (WHERE s.effective_status = 'done')                      AS done,
         count(*) FILTER (WHERE s.effective_status = 'waiting_on_mike')           AS waiting_on_mike,
         count(*) FILTER (WHERE s.waiting_reason = 'input')                       AS waiting_on_input,
         bool_or(s.status <> 'not_started')                                       AS any_started,
         count(*) FILTER (WHERE s.effective_status NOT IN ('na', 'done')
                            AND (s.effective_done_by_gate <= 1
                                 OR (s.started_by_gate <= 1 AND s.effective_status = 'not_started'))) AS gate1_missing,
         count(*) FILTER (WHERE s.effective_status NOT IN ('na', 'done')
                            AND (s.effective_done_by_gate <= 2
                                 OR (s.started_by_gate <= 2 AND s.effective_status = 'not_started'))) AS gate2_missing,
         count(*) FILTER (WHERE s.effective_status NOT IN ('na', 'done'))         AS gate3_missing,
         -- Tour-ready (decision 4): Market Aerial, Demo Map, Site Plan all done. Badge only.
         count(*) FILTER (WHERE s.template_key IN ('market_aerial', 'demo_map', 'site_plan')
                            AND s.effective_status = 'done')                      AS tour_ready_done,
         COALESCE(bool_and(s.effective_status = 'done')
                    FILTER (WHERE s.template_key IN ('market_aerial', 'demo_map', 'site_plan')), false) AS tour_ready
    FROM public.v_deal_package_slide s
   GROUP BY s.package_id
),
missing AS (
  SELECT s.package_id, array_agg(DISTINCT m ORDER BY m) AS missing_inputs
    FROM public.v_deal_package_slide s
    CROSS JOIN LATERAL unnest(s.missing_inputs) AS m
   WHERE s.effective_status NOT IN ('done', 'na')
   GROUP BY s.package_id
)
SELECT g.package_id,
       g.deal_id,
       g.site_submit_id,
       g.started_at,
       g.deal_stage,
       g.loi_entry_at,
       COALESCE(c.applicable, 0)       AS applicable,
       COALESCE(c.done, 0)             AS done,
       COALESCE(c.waiting_on_mike, 0)  AS waiting_on_mike,
       COALESCE(c.waiting_on_input, 0) AS waiting_on_input,
       COALESCE(c.any_started, false)  AS any_started,
       g.gate1_at, g.gate1_state, COALESCE(c.gate1_missing, 0) AS gate1_missing,
       g.gate2_at, g.gate2_state, COALESCE(c.gate2_missing, 0) AS gate2_missing,
       g.gate3_at, g.gate3_state, COALESCE(c.gate3_missing, 0) AS gate3_missing,
       (g.gate1_state = 'unknown' OR g.gate2_state = 'unknown') AS gates_unknown,
       g.gates_confirmed_at,
       LEAST(
         CASE WHEN g.gate1_state = 'reached' AND g.gate1_at <= now() AND c.gate1_missing > 0 THEN g.gate1_at END,
         CASE WHEN g.gate2_state = 'reached' AND g.gate2_at <= now() AND c.gate2_missing > 0 THEN g.gate2_at END,
         CASE WHEN g.gate3_state = 'reached' AND g.gate3_at <= now() AND c.gate3_missing > 0 THEN g.gate3_at END
       ) AS behind_since,
       g.stage,
       COALESCE(c.tour_ready_done, 0)  AS tour_ready_done,
       COALESCE(c.tour_ready, false)   AS tour_ready,
       COALESCE(mi.missing_inputs, '{}') AS missing_inputs
  FROM gates2 g
  LEFT JOIN counts  c  ON c.package_id  = g.package_id
  LEFT JOIN missing mi ON mi.package_id = g.package_id;
