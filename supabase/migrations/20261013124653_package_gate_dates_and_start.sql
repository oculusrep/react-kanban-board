-- Package Tracker Phase 2 schema: gate dates move off deal_package, plus Start Package RPC.
-- Spec: docs/PACKAGE_TRACKER_SPEC.md. Decisions §2.29 (2026-10-13).
--
-- 1. deal_gate_date — the once-only "first LOI draft sent" / "landlord's first
--    response" dates, keyed by DEAL, not package. Mike wants them stored before
--    any package exists (packages are started from the button). One row per
--    deal; a row means Mike has answered: a blank date = "hasn't happened yet",
--    and from confirmed_at on, live court events fill it in. No row = never
--    asked (the view then reports 'unknown' where history can't say).
--    Starbucks family only (same trigger function as deal_package).
--    v_deal_package_progress reads it; the three unused deal_package columns
--    (gate1_manual_at, gate2_manual_at, gates_confirmed_at — 0 rows exist) are
--    dropped so there is one place for these dates.
--
-- 2. start_deal_package(deal_id) — creates the package, its slides (snapshot of
--    the active template) and the owner tasks in ONE transaction, so a failed
--    start never leaves a half-built package. SECURITY INVOKER: RLS and the
--    Starbucks-family trigger apply to the caller.
--    Tasks: one per slide whose owner is not the person starting the package
--    (Mike starts → Noree's slides become her tasks; his own slide work is not a
--    task). Category: global 'pipeline' (task.category_id is NOT NULL). Package
--    tasks carry package_slide_id, so they never reset the board clock.
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

-- ─── 1. Gate dates ──────────────────────────────────────────────────────────

CREATE TABLE public.deal_gate_date (
  deal_id              uuid PRIMARY KEY REFERENCES public.deal(id) ON DELETE CASCADE,
  first_draft_sent_on  date,          -- Gate 1; NULL = not sent yet
  first_response_on    date,          -- Gate 2; NULL = no response yet
  confirmed_at         timestamptz NOT NULL DEFAULT now(),
  entered_by           uuid DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_gate_date_order
    CHECK (first_response_on IS NULL
           OR (first_draft_sent_on IS NOT NULL AND first_response_on >= first_draft_sent_on))
);

COMMENT ON TABLE public.deal_gate_date IS
  'Package Tracker once-only gate dates per deal (first LOI draft sent / landlord first response). Row = answered; blank = not yet.';

CREATE TRIGGER trg_deal_gate_date_updated_at
  BEFORE UPDATE ON public.deal_gate_date
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Same Starbucks-family check as deal_package (the function only reads NEW.deal_id).
CREATE TRIGGER trg_deal_gate_date_starbucks_only
  BEFORE INSERT OR UPDATE OF deal_id ON public.deal_gate_date
  FOR EACH ROW EXECUTE FUNCTION public.deal_package_starbucks_only();

ALTER TABLE public.deal_gate_date ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_gate_date_select_internal ON public.deal_gate_date
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));
CREATE POLICY deal_gate_date_insert_internal ON public.deal_gate_date
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_internal_user()));
CREATE POLICY deal_gate_date_update_internal ON public.deal_gate_date
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_internal_user())) WITH CHECK ((SELECT public.is_internal_user()));

-- Grants: no DELETE — a correction is an update; rows go with their deal.
REVOKE ALL ON public.deal_gate_date FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.deal_gate_date TO authenticated;

-- Views: dropped and recreated so the three deal_package columns can go.
-- v_deal_package_slide selected p.* (expanded at creation, so it pinned every
-- deal_package column); it now names the five columns it reads. The progress
-- view reads gate dates from deal_gate_date. Both otherwise unchanged from
-- 20261012161840, which matches the live definitions as of 2026-10-13.
DROP VIEW public.v_deal_package_progress;
DROP VIEW public.v_deal_package_slide;

ALTER TABLE public.deal_package
  DROP COLUMN gate1_manual_at,
  DROP COLUMN gate2_manual_at,
  DROP COLUMN gates_confirmed_at;

CREATE VIEW public.v_deal_package_slide
WITH (security_invoker = true) AS
WITH pkg AS (
  SELECT p.id, p.deal_id, p.site_plan_received_at, p.dot_study_received_at, p.final_loi_at,
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
         gd.confirmed_at AS gates_confirmed_at,
         CASE WHEN gd.first_draft_sent_on IS NOT NULL
              THEN (gd.first_draft_sent_on::timestamp + interval '12 hours') AT TIME ZONE 'America/New_York' END AS gate1_manual,
         CASE WHEN gd.first_response_on IS NOT NULL
              THEN (gd.first_response_on::timestamp + interval '12 hours') AT TIME ZONE 'America/New_York' END AS gate2_manual,
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
    LEFT JOIN public.deal_gate_date gd ON gd.deal_id = p.deal_id
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

-- Recreated views need their grants again.
REVOKE ALL ON public.v_deal_package_slide    FROM anon, authenticated;
REVOKE ALL ON public.v_deal_package_progress FROM anon, authenticated;
GRANT SELECT ON public.v_deal_package_slide    TO authenticated;
GRANT SELECT ON public.v_deal_package_progress TO authenticated;

-- ─── 2. Start Package ───────────────────────────────────────────────────────

CREATE FUNCTION public.start_deal_package(p_deal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me       uuid;
  v_pkg      uuid;
  v_deal     record;
  v_category uuid;
BEGIN
  SELECT id INTO v_me FROM "user" WHERE auth_user_id = auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'start_deal_package: no OVIS user for the caller' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT d.id, d.deal_name, d.site_submit_id, d.client_id INTO v_deal FROM deal d WHERE d.id = p_deal_id;
  IF v_deal.id IS NULL THEN
    RAISE EXCEPTION 'start_deal_package: deal % not found', p_deal_id USING ERRCODE = 'no_data_found';
  END IF;
  IF EXISTS (SELECT 1 FROM deal_package WHERE deal_id = p_deal_id) THEN
    RAISE EXCEPTION 'A package has already been started for this deal' USING ERRCODE = 'unique_violation';
  END IF;

  SELECT id INTO v_category FROM task_category WHERE name = 'pipeline' AND scope = 'global' AND archived_at IS NULL;

  -- Starbucks-family trigger fires here.
  INSERT INTO deal_package (deal_id, started_by) VALUES (p_deal_id, v_me) RETURNING id INTO v_pkg;

  INSERT INTO deal_package_slide
    (package_id, template_key, label, position, owner_user_id, handoff, inputs,
     allows_na, after_key, done_by_gate, started_by_gate)
  SELECT v_pkg, t.key, t.label, t.position, t.owner_user_id, t.handoff, t.inputs,
         t.allows_na, t.after_key, t.done_by_gate, t.started_by_gate
    FROM package_slide_template t
   WHERE t.active;

  INSERT INTO task
    (subject, description, status, owner_id, assigned_by_id, created_by_id,
     client_id, deal_id, site_submit_id, package_slide_id, category_id)
  SELECT 'Package · ' || s.label || ' — ' || coalesce(v_deal.deal_name, 'deal'),
         CASE s.handoff
           WHEN 'approve' THEN 'Complete this slide; it goes to Mike for approval when you check it off.'
           WHEN 'finish'  THEN 'Set this slide up; Mike finishes it when you check it off.'
           ELSE 'Complete this slide.'
         END,
         'open', s.owner_user_id, v_me, v_me,
         v_deal.client_id, p_deal_id, v_deal.site_submit_id, s.id, v_category
    FROM deal_package_slide s
   WHERE s.package_id = v_pkg
     AND s.owner_user_id <> v_me;

  RETURN v_pkg;
END;
$$;

COMMENT ON FUNCTION public.start_deal_package(uuid) IS
  'Package Tracker: create package + slides (template snapshot) + owner tasks atomically. Invoker; Starbucks family only.';

REVOKE ALL ON FUNCTION public.start_deal_package(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_deal_package(uuid) TO authenticated;
