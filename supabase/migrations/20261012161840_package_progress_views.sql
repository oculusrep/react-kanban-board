-- Package Tracker read model: per-slide effective status and per-package progress + gates.
-- Spec: docs/PACKAGE_TRACKER_SPEC.md §3–§5. Decisions §2.29 + 2026-10-12.
--
-- v_deal_package_slide     one row per slide, with inputs resolved:
--   missing_inputs          inputs on the slide that aren't in yet
--   effective_status        done / na as stored; otherwise 'waiting_on_mike'
--                           while any input is missing (derived, never stored);
--                           otherwise the stored status
--   waiting_reason          'input' | 'review' | NULL
--   effective_done_by_gate  a Gate-1 slide whose inputs aren't in slips to
--                           Gate 2 (Road Improvements without the DOT study)
--
-- v_deal_package_progress  one row per package:
--   applicable / done / waiting_on_mike / waiting_on_input / any_started
--   gate{1,2,3}_at, gate{1,2,3}_state ('reached' | 'not_reached' | 'unknown')
--   gate{1,2,3}_missing     items short at that gate (meaningful once reached)
--   behind_since            earliest reached gate with items missing (NULL = on pace)
-- Pace (on pace / behind / late at PACKAGE_LATE_DAYS) and the stale "Sent to
-- Noree" badge are computed client-side from these, so the tolerances live in
-- config beside the board's heat thresholds.
--
-- Inputs:
--   market_research  research_run.state = 'approved' for deal.site_submit_id
--   site_story       research_thread_run kind 'deep_pass', state 'complete'
--   site_plan / dot_study / final_loi  deal_package timestamps
-- A deal with no site_submit can never satisfy the two research inputs.
--
-- Gates (court events from deal_court_event, dated by court start):
--   Gate 1  first flip to 'them' after Negotiating LOI entry. Sources, in order:
--           manual date; document_handoff LOI turns; board events, trusted only
--           when the LOI window began after court_log_start(); board events
--           recorded after gates_confirmed_at when Mike left Gate 1 blank.
--   Gate 2  first flip back to 'us' after Gate 1, same sources/trust rules.
--   Gate 3  deal_package.final_loi_at.
--   'unknown' (rendered as absence, §1.7) when the deal is at/after LOI and no
--   trusted source can say whether the gate happened. Mike's once-only entry
--   (gates_confirmed_at) resolves it.
--   LOI entry = latest deal_stage_history move into Negotiating LOI
--   (corrected_date wins). 6 of 13 current LOI deals have none; for those only
--   the handoff backfill or manual entry can supply gates.
--
-- Starbucks family only: both views keep packages whose deal's client passes
-- client_in_starbucks_family() (..161837), so a deal moved off a Starbucks
-- client drops out instead of lingering.
--
-- security_invoker: every base table is internal-only, so the views are too.
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

CREATE VIEW public.v_deal_package_slide
WITH (security_invoker = true) AS
WITH pkg AS (
  SELECT p.*,
         d.site_submit_id,
         (d.site_submit_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.research_run r
             WHERE r.site_submit_id = d.site_submit_id AND r.state = 'approved'))      AS has_market_research,
         (d.site_submit_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.research_thread t
              JOIN public.research_thread_run tr ON tr.thread_id = t.id
             WHERE t.site_submit_id = d.site_submit_id
               AND tr.kind = 'deep_pass' AND tr.state = 'complete'))                    AS has_site_story
    FROM public.deal_package p
    JOIN public.deal d ON d.id = p.deal_id
   WHERE public.client_in_starbucks_family(d.client_id)
),
resolved AS (
  SELECT s.*,
         pkg.deal_id,
         pkg.site_submit_id,
         array_remove(ARRAY[
           CASE WHEN 'market_research' = ANY (s.inputs) AND NOT pkg.has_market_research    THEN 'market_research' END,
           CASE WHEN 'site_story'      = ANY (s.inputs) AND NOT pkg.has_site_story         THEN 'site_story'      END,
           CASE WHEN 'site_plan'       = ANY (s.inputs) AND pkg.site_plan_received_at IS NULL THEN 'site_plan'    END,
           CASE WHEN 'dot_study'       = ANY (s.inputs) AND pkg.dot_study_received_at IS NULL THEN 'dot_study'    END,
           CASE WHEN 'final_loi'       = ANY (s.inputs) AND pkg.final_loi_at IS NULL          THEN 'final_loi'    END
         ], NULL) AS missing_inputs
    FROM public.deal_package_slide s
    JOIN pkg ON pkg.id = s.package_id
)
SELECT r.id,
       r.package_id,
       r.deal_id,
       r.site_submit_id,
       r.template_key,
       r.label,
       r.position,
       r.owner_user_id,
       r.handoff,
       r.inputs,
       r.allows_na,
       r.after_key,
       r.done_by_gate,
       r.started_by_gate,
       r.status,
       r.status_changed_at,
       r.status_changed_by,
       r.owner_done_at,
       r.done_at,
       r.missing_inputs,
       cardinality(r.missing_inputs) = 0 AS inputs_ready,
       CASE
         WHEN r.status IN ('done', 'na')          THEN r.status
         WHEN cardinality(r.missing_inputs) > 0   THEN 'waiting_on_mike'
         ELSE r.status
       END AS effective_status,
       CASE
         WHEN r.status IN ('done', 'na')          THEN NULL
         WHEN cardinality(r.missing_inputs) > 0   THEN 'input'
         WHEN r.status = 'waiting_on_mike'        THEN 'review'
       END AS waiting_reason,
       CASE
         WHEN r.done_by_gate = 1 AND cardinality(r.missing_inputs) > 0 THEN 2
         ELSE r.done_by_gate
       END AS effective_done_by_gate
  FROM resolved r;

COMMENT ON VIEW public.v_deal_package_slide IS
  'Package Tracker: slides with inputs resolved and effective status (missing input ⇒ waiting_on_mike, derived).';


CREATE VIEW public.v_deal_package_progress
WITH (security_invoker = true) AS
WITH base AS (
  SELECT p.id  AS package_id,
         p.deal_id,
         d.site_submit_id,
         p.started_at,
         p.final_loi_at,
         p.gates_confirmed_at,
         CASE WHEN p.gate1_manual_at IS NOT NULL
              THEN (p.gate1_manual_at::timestamp + interval '12 hours') AT TIME ZONE 'America/New_York' END AS gate1_manual,
         CASE WHEN p.gate2_manual_at IS NOT NULL
              THEN (p.gate2_manual_at::timestamp + interval '12 hours') AT TIME ZONE 'America/New_York' END AS gate2_manual,
         ds.label      AS deal_stage,
         ds.sort_order AS stage_order,
         (SELECT max(COALESCE(h.corrected_date, h.changed_at))
            FROM public.deal_stage_history h
            JOIN public.deal_stage hs ON hs.id = h.to_stage_id
           WHERE h.deal_id = p.deal_id AND hs.label = 'Negotiating LOI') AS loi_entry_at,
         public.court_log_start() AS log_start
    FROM public.deal_package p
    JOIN public.deal d        ON d.id = p.deal_id
    LEFT JOIN public.deal_stage ds ON ds.id = d.stage_id
   WHERE public.client_in_starbucks_family(d.client_id)
),
ev AS (
  SELECT b.package_id, e.court, e.source, e.effective_at, e.recorded_at
    FROM base b
    JOIN public.deal_court_event e
      ON e.deal_id = b.deal_id
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
         count(*) FILTER (WHERE s.effective_status NOT IN ('na', 'done'))         AS gate3_missing
    FROM public.v_deal_package_slide s
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
       ) AS behind_since
  FROM gates2 g
  LEFT JOIN counts c ON c.package_id = g.package_id;

COMMENT ON VIEW public.v_deal_package_progress IS
  'Package Tracker: per-package counts, gate dates/states and behind_since. Pace thresholds applied client-side.';

-- Views need their own grants.
REVOKE ALL ON public.v_deal_package_slide    FROM anon, authenticated;
REVOKE ALL ON public.v_deal_package_progress FROM anon, authenticated;
GRANT SELECT ON public.v_deal_package_slide    TO authenticated;
GRANT SELECT ON public.v_deal_package_progress TO authenticated;
