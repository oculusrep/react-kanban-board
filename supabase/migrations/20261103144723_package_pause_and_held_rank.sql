-- Package pause + rank for fully-held cards (Tasks command center, /tasks/queue).
--
-- 1. Pause a package. deal_package.paused_at / paused_by / pause_reason.
--    pause_package(): the package's open / in-progress tasks go to status 'paused'
--    (prior status kept in task.paused_prior_status; queue_rank untouched), so they drop
--    out of every queue that reads open / in_progress. Slides, done state, progress,
--    the package row's inputs and the site are not touched.
--    release_package_tasks() returns 0 while paused, so no held slide is released
--    (input arrival, research approval, Site Story completion, Start Package all go
--    through it). v_deal_package_progress reports behind_since NULL while paused (no
--    pace / late flag) and exposes paused_at / pause_reason.
--    resume_package(): clears the pause, puts each task back to its prior status at its
--    old queue_rank (a slide finished meanwhile → its task completes instead), then
--    releases anything now due.
--    task_hold_while_package_paused (BEFORE trigger): any write that would make a paused
--    package's task open / in_progress (slide reopened → sync_task_from_slide, /tasks
--    "Reopen") parks it as 'paused' instead, so nothing leaks back into a queue.
--    Readers of task.status (audited 2026-11-03): every queue / lane / count reads
--    status IN ('open','in_progress') or = 'open', so 'paused' is excluded with no change;
--    no view, cron job or edge function reads task.status.
--    Auto-pause: a site_submit moving to Pass / Lost / Killed / Use Declined / Not
--    Available, or a deal moving to Lost, pauses its package(s). Never auto-resumes.
--
-- 2. Rank for fully-held cards. A package whose slides for an owner are all held has
--    no tasks, so nothing to carry queue_rank. package_queue_rank(owner_id, package_id)
--    holds it; set_queue_order() writes task ranks and held-card ranks in one list, and
--    release_package_tasks() starts a newly released task at its card's rank.
--
-- Board clock: none of this touches deal_activity_state. Task status / queue_rank updates
-- have no clock trigger (only task INSERT / due_at, and both skip package tasks); slides,
-- deal_package and package_queue_rank have none. Proven by
-- supabase/tests/package_pause_test.sql. (A stage change itself already logs activity
-- and moves the clock via existing triggers; the auto-pause adds nothing to that.)
--
-- RPCs: authenticated + internal only (is_internal_user()); anon and PUBLIC revoked.
-- v_deal_package_progress is rebuilt from its LIVE definition (pg_get_viewdef,
-- 2026-11-03) with only behind_since wrapped and two columns appended.
--
-- No BEGIN/COMMIT of its own: apply with psql --single-transaction.

-- ─── Columns ─────────────────────────────────────────────────────────────────
ALTER TABLE public.deal_package
  ADD COLUMN paused_at    timestamptz,
  ADD COLUMN paused_by    uuid REFERENCES public."user"(id) ON DELETE SET NULL,
  ADD COLUMN pause_reason text;

ALTER TABLE public.task DROP CONSTRAINT task_status_check;
ALTER TABLE public.task ADD CONSTRAINT task_status_check
  CHECK (status = ANY (ARRAY['open', 'in_progress', 'completed', 'cancelled', 'paused']));
ALTER TABLE public.task
  ADD COLUMN paused_prior_status text CHECK (paused_prior_status IN ('open', 'in_progress')),
  ADD CONSTRAINT task_paused_has_prior CHECK ((status = 'paused') = (paused_prior_status IS NOT NULL));

-- ─── Held-card rank ──────────────────────────────────────────────────────────
CREATE TABLE public.package_queue_rank (
  owner_id   uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.deal_package(id) ON DELETE CASCADE,
  queue_rank integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, package_id)
);
ALTER TABLE public.package_queue_rank ENABLE ROW LEVEL SECURITY;
CREATE POLICY package_queue_rank_select ON public.package_queue_rank FOR SELECT TO authenticated
  USING ((SELECT public.is_internal_user()));
-- Grants: don't inherit the defaults, state what the app uses (writes go through set_queue_order).
REVOKE ALL ON public.package_queue_rank FROM anon, authenticated;
GRANT SELECT ON public.package_queue_rank TO authenticated;

-- One ordered list for a queue: 't:<task id>' or 'p:<package id>' (a fully-held card).
-- Position n gets rank n*1000, the same scale set_task_queue_order uses.
CREATE OR REPLACE FUNCTION public.set_queue_order(p_owner uuid, p_items text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me uuid;
  v_n  integer := 0;
  v_m  integer;
BEGIN
  SELECT id INTO v_me FROM "user" WHERE auth_user_id = auth.uid();
  IF v_me IS NULL OR NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'set_queue_order: internal users only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_owner IS DISTINCT FROM v_me AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'set_queue_order: only the owner or an admin can reorder this queue' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_items IS NULL OR cardinality(p_items) = 0 THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_items) i WHERE i !~ '^[tp]:[0-9a-f-]{36}$') THEN
    RAISE EXCEPTION 'set_queue_order: items must be t:<uuid> or p:<uuid>' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_items) i JOIN task t ON t.id = substr(i, 3)::uuid
              WHERE left(i, 2) = 't:' AND t.owner_id IS DISTINCT FROM p_owner) THEN
    RAISE EXCEPTION 'set_queue_order: tasks must all belong to the queue owner' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE task t SET queue_rank = o.ord * 1000
    FROM unnest(p_items) WITH ORDINALITY AS o(item, ord)
   WHERE left(o.item, 2) = 't:' AND t.id = substr(o.item, 3)::uuid;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  INSERT INTO package_queue_rank (owner_id, package_id, queue_rank)
  SELECT p_owner, substr(o.item, 3)::uuid, o.ord * 1000
    FROM unnest(p_items) WITH ORDINALITY AS o(item, ord)
   WHERE left(o.item, 2) = 'p:'
  ON CONFLICT (owner_id, package_id) DO UPDATE SET queue_rank = EXCLUDED.queue_rank, updated_at = now();
  GET DIAGNOSTICS v_m = ROW_COUNT;
  RETURN v_n + v_m;
END;
$function$;

-- ─── Release guard + held-card rank (from the LIVE definition) ───────────────
CREATE OR REPLACE FUNCTION public.release_package_tasks(p_package_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pkg      record;
  v_site     uuid;
  v_name     text;
  v_client   uuid;
  v_category uuid;
  v_ready    text[] := '{}';
  v_n        integer;
BEGIN
  SELECT p.*, d.deal_name, d.client_id AS deal_client, d.site_submit_id AS deal_site
    INTO v_pkg
    FROM deal_package p LEFT JOIN deal d ON d.id = p.deal_id
   WHERE p.id = p_package_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  -- Paused (20261103144723): nothing is released until resume_package().
  IF v_pkg.paused_at IS NOT NULL THEN RETURN 0; END IF;

  v_site := COALESCE(v_pkg.site_submit_id, v_pkg.deal_site);
  v_name := v_pkg.deal_name;
  v_client := v_pkg.deal_client;
  IF v_site IS NOT NULL THEN
    SELECT COALESCE(v_name, s.site_submit_name), COALESCE(v_client, s.client_id) INTO v_name, v_client
      FROM site_submit s WHERE s.id = v_site;
    IF EXISTS (SELECT 1 FROM research_run r WHERE r.site_submit_id = v_site AND r.state = 'approved') THEN
      v_ready := array_append(v_ready, 'market_research');
    END IF;
    IF EXISTS (SELECT 1 FROM research_thread th JOIN research_thread_run tr ON tr.thread_id = th.id
                WHERE th.site_submit_id = v_site AND tr.kind = 'deep_pass' AND tr.state = 'complete') THEN
      v_ready := array_append(v_ready, 'site_story');
    END IF;
  END IF;
  IF v_pkg.site_plan_received_at IS NOT NULL THEN v_ready := array_append(v_ready, 'site_plan'); END IF;
  IF v_pkg.dot_study_received_at IS NOT NULL THEN v_ready := array_append(v_ready, 'dot_study'); END IF;
  IF v_pkg.final_loi_at          IS NOT NULL THEN v_ready := array_append(v_ready, 'final_loi'); END IF;

  SELECT id INTO v_category FROM task_category WHERE name = 'pipeline' AND scope = 'global' AND archived_at IS NULL;

  INSERT INTO task
    (subject, description, status, owner_id, assigned_by_id, created_by_id,
     client_id, deal_id, site_submit_id, package_slide_id, category_id, category, queue_rank)
  SELECT 'Package · ' || s.label || ' — ' || coalesce(v_name, 'site'),
         CASE s.handoff
           WHEN 'approve' THEN 'Complete this slide; it goes to Mike for approval when you check it off.'
           WHEN 'finish'  THEN 'Set this slide up; Mike finishes it when you check it off.'
           ELSE 'Complete this slide.'
         END,
         'open', s.owner_user_id, v_pkg.started_by, v_pkg.started_by,
         v_client, v_pkg.deal_id, v_site, s.id, v_category, 'pipeline',
         -- A held card the owner ranked keeps its place once its tasks exist.
         (SELECT r.queue_rank FROM package_queue_rank r WHERE r.owner_id = s.owner_user_id AND r.package_id = p_package_id)
    FROM deal_package_slide s
   WHERE s.package_id = p_package_id
     AND s.owner_user_id IS DISTINCT FROM v_pkg.started_by
     AND s.status NOT IN ('done', 'na')
     AND s.inputs <@ v_ready
     AND NOT EXISTS (SELECT 1 FROM task t WHERE t.package_slide_id = s.id)
  ON CONFLICT (package_slide_id) WHERE package_slide_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

-- ─── Pause / resume ──────────────────────────────────────────────────────────
-- Internal worker (also used by the auto-pause triggers). Idempotent: an already
-- paused package keeps its original reason and time.
CREATE OR REPLACE FUNCTION public.package_pause_apply(p_package_id uuid, p_by uuid, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_n integer;
BEGIN
  UPDATE deal_package SET paused_at = now(), paused_by = p_by, pause_reason = p_reason
   WHERE id = p_package_id AND paused_at IS NULL;
  IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE task t
     SET paused_prior_status = t.status, status = 'paused'
    FROM deal_package_slide s
   WHERE s.package_id = p_package_id AND t.package_slide_id = s.id AND t.status IN ('open', 'in_progress');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pause_package(p_package_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_me uuid;
BEGIN
  SELECT id INTO v_me FROM "user" WHERE auth_user_id = auth.uid();
  IF v_me IS NULL OR NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'pause_package: internal users only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.package_pause_apply(p_package_id, v_me, 'manual');
END;
$function$;

-- Tasks back to their prior status at their old queue_rank; a task whose slide was
-- finished (or set N/A) meanwhile completes instead. Then release what's now due.
CREATE OR REPLACE FUNCTION public.resume_package(p_package_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me uuid;
  v_n  integer;
BEGIN
  SELECT id INTO v_me FROM "user" WHERE auth_user_id = auth.uid();
  IF v_me IS NULL OR NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'resume_package: internal users only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE deal_package SET paused_at = NULL, paused_by = NULL, pause_reason = NULL
   WHERE id = p_package_id AND paused_at IS NOT NULL;
  IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE task t
     SET status = CASE WHEN s.status IN ('waiting_on_mike', 'done', 'na') THEN 'completed' ELSE t.paused_prior_status END,
         completed_at = CASE WHEN s.status IN ('waiting_on_mike', 'done', 'na') THEN now() ELSE NULL END,
         paused_prior_status = NULL
    FROM deal_package_slide s
   WHERE s.package_id = p_package_id AND t.package_slide_id = s.id AND t.status = 'paused';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n + public.release_package_tasks(p_package_id);
END;
$function$;

-- Guard: a package task can't be open / in progress while its package is paused, whatever
-- path writes it (a slide reopened done → in_progress makes sync_task_from_slide reopen its
-- completed task; /tasks bulk "Reopen"; any future insert). It goes to 'paused' instead,
-- remembering the status it asked for, and resume restores that. Completing or cancelling a
-- paused task by hand is allowed (it just stops being paused). Status only: no due_at, no clock.
CREATE OR REPLACE FUNCTION public.task_hold_while_package_paused()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status IN ('open', 'in_progress') AND EXISTS (
       SELECT 1 FROM deal_package_slide s JOIN deal_package p ON p.id = s.package_id
        WHERE s.id = NEW.package_slide_id AND p.paused_at IS NOT NULL) THEN
    NEW.paused_prior_status := NEW.status;
    NEW.status := 'paused';
  ELSIF NEW.status IN ('completed', 'cancelled') THEN
    NEW.paused_prior_status := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_task_hold_while_package_paused
  BEFORE INSERT OR UPDATE OF status ON public.task
  FOR EACH ROW WHEN (NEW.package_slide_id IS NOT NULL)
  EXECUTE FUNCTION public.task_hold_while_package_paused();

-- ─── Auto-pause on closing stages (never auto-resume) ────────────────────────
CREATE OR REPLACE FUNCTION public.auto_pause_package_on_site_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_stage text;
  v_pkg   uuid;
BEGIN
  SELECT name INTO v_stage FROM submit_stage WHERE id = NEW.submit_stage_id;
  IF v_stage IS NULL OR v_stage NOT IN ('Pass', 'Lost / Killed', 'Use Declined', 'Not Available') THEN RETURN NULL; END IF;
  BEGIN
    FOR v_pkg IN
      SELECT p.id FROM deal_package p LEFT JOIN deal d ON d.id = p.deal_id
       WHERE COALESCE(p.site_submit_id, d.site_submit_id) = NEW.id AND p.paused_at IS NULL
    LOOP
      PERFORM public.package_pause_apply(v_pkg, (SELECT id FROM "user" WHERE auth_user_id = auth.uid()), 'stage: ' || v_stage);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_pause_package_on_site_stage: site %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_pause_package_on_deal_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_stage text;
  v_pkg   uuid;
BEGIN
  SELECT label INTO v_stage FROM deal_stage WHERE id = NEW.stage_id;
  IF v_stage IS DISTINCT FROM 'Lost' THEN RETURN NULL; END IF;
  BEGIN
    FOR v_pkg IN SELECT p.id FROM deal_package p WHERE p.deal_id = NEW.id AND p.paused_at IS NULL LOOP
      PERFORM public.package_pause_apply(v_pkg, (SELECT id FROM "user" WHERE auth_user_id = auth.uid()), 'stage: Lost');
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_pause_package_on_deal_stage: deal %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_auto_pause_package_on_site_stage
  AFTER UPDATE OF submit_stage_id ON public.site_submit
  FOR EACH ROW WHEN (NEW.submit_stage_id IS DISTINCT FROM OLD.submit_stage_id)
  EXECUTE FUNCTION public.auto_pause_package_on_site_stage();
CREATE TRIGGER trg_auto_pause_package_on_deal_stage
  AFTER UPDATE OF stage_id ON public.deal
  FOR EACH ROW WHEN (NEW.stage_id IS DISTINCT FROM OLD.stage_id)
  EXECUTE FUNCTION public.auto_pause_package_on_deal_stage();

-- ─── Progress view: pace suppressed while paused (LIVE definition + 2 columns) ─
CREATE OR REPLACE VIEW public.v_deal_package_progress WITH (security_invoker = true) AS
 WITH base AS (
         SELECT p.id AS package_id,
            p.deal_id,
            COALESCE(p.site_submit_id, d.site_submit_id) AS site_submit_id,
            p.started_at,
            p.final_loi_at,
            gd.confirmed_at AS gates_confirmed_at,
                CASE
                    WHEN gd.first_draft_sent_on IS NOT NULL THEN ((gd.first_draft_sent_on::timestamp without time zone + '12:00:00'::interval) AT TIME ZONE 'America/New_York'::text)
                    ELSE NULL::timestamp with time zone
                END AS gate1_manual,
                CASE
                    WHEN gd.first_response_on IS NOT NULL THEN ((gd.first_response_on::timestamp without time zone + '12:00:00'::interval) AT TIME ZONE 'America/New_York'::text)
                    ELSE NULL::timestamp with time zone
                END AS gate2_manual,
            ds.label AS deal_stage,
            COALESCE(ds.label, package_site_stage(COALESCE(p.site_submit_id, d.site_submit_id))) AS stage,
            COALESCE(ds.sort_order, ( SELECT ms.sort_order
                   FROM deal_stage ms
                  WHERE ms.label = package_site_stage(COALESCE(p.site_submit_id, d.site_submit_id)))) AS stage_order,
            ( SELECT max(COALESCE(h.corrected_date, h.changed_at)) AS max
                   FROM deal_stage_history h
                     JOIN deal_stage hs ON hs.id = h.to_stage_id
                  WHERE p.deal_id IS NOT NULL AND h.deal_id = p.deal_id AND hs.label = 'Negotiating LOI'::text) AS loi_entry_at,
            court_log_start() AS log_start
           FROM deal_package p
             LEFT JOIN deal d ON d.id = p.deal_id
             LEFT JOIN deal_stage ds ON ds.id = d.stage_id
             LEFT JOIN deal_gate_date gd ON gd.deal_id = p.deal_id
          WHERE package_subject_in_family(p.deal_id, COALESCE(p.site_submit_id, d.site_submit_id))
        ), ev AS (
         SELECT b.package_id,
            e.court,
            e.source,
            e.effective_at,
            e.recorded_at
           FROM base b
             JOIN deal_court_event e ON b.deal_id IS NOT NULL AND e.deal_id = b.deal_id OR b.site_submit_id IS NOT NULL AND e.site_submit_id = b.site_submit_id
        ), g1 AS (
         SELECT b.package_id,
            b.deal_id,
            b.site_submit_id,
            b.started_at,
            b.final_loi_at,
            b.gates_confirmed_at,
            b.gate1_manual,
            b.gate2_manual,
            b.deal_stage,
            b.stage,
            b.stage_order,
            b.loi_entry_at,
            b.log_start,
            (EXISTS ( SELECT 1
                   FROM ev
                  WHERE ev.package_id = b.package_id AND ev.source = 'document_handoff'::text)) AS has_handoff,
            COALESCE(b.gate1_manual, LEAST(( SELECT min(ev.effective_at) AS min
                   FROM ev
                  WHERE ev.package_id = b.package_id AND ev.source = 'document_handoff'::text AND ev.court = 'them'::text), ( SELECT min(ev.effective_at) AS min
                   FROM ev
                  WHERE ev.package_id = b.package_id AND ev.source = 'board'::text AND ev.court = 'them'::text AND b.loi_entry_at IS NOT NULL AND b.loi_entry_at >= b.log_start AND ev.effective_at > b.loi_entry_at), ( SELECT min(ev.effective_at) AS min
                   FROM ev
                  WHERE ev.package_id = b.package_id AND ev.source = 'board'::text AND ev.court = 'them'::text AND b.gates_confirmed_at IS NOT NULL AND ev.recorded_at > b.gates_confirmed_at AND (b.loi_entry_at IS NULL OR ev.effective_at > b.loi_entry_at)))) AS gate1_at
           FROM base b
        ), g2 AS (
         SELECT g1.package_id,
            g1.deal_id,
            g1.site_submit_id,
            g1.started_at,
            g1.final_loi_at,
            g1.gates_confirmed_at,
            g1.gate1_manual,
            g1.gate2_manual,
            g1.deal_stage,
            g1.stage,
            g1.stage_order,
            g1.loi_entry_at,
            g1.log_start,
            g1.has_handoff,
            g1.gate1_at,
                CASE
                    WHEN g1.gate1_at IS NULL THEN NULL::timestamp with time zone
                    ELSE COALESCE(g1.gate2_manual, LEAST(( SELECT min(ev.effective_at) AS min
                       FROM ev
                      WHERE ev.package_id = g1.package_id AND ev.source = 'document_handoff'::text AND ev.court = 'us'::text AND ev.effective_at > g1.gate1_at), ( SELECT min(ev.effective_at) AS min
                       FROM ev
                      WHERE ev.package_id = g1.package_id AND ev.source = 'board'::text AND ev.court = 'us'::text AND g1.gate1_at >= g1.log_start AND ev.effective_at > g1.gate1_at), ( SELECT min(ev.effective_at) AS min
                       FROM ev
                      WHERE ev.package_id = g1.package_id AND ev.source = 'board'::text AND ev.court = 'us'::text AND g1.gates_confirmed_at IS NOT NULL AND ev.recorded_at > g1.gates_confirmed_at AND ev.effective_at > g1.gate1_at)))
                END AS gate2_at
           FROM g1
        ), gates AS (
         SELECT g2.package_id,
            g2.deal_id,
            g2.site_submit_id,
            g2.started_at,
            g2.final_loi_at,
            g2.gates_confirmed_at,
            g2.gate1_manual,
            g2.gate2_manual,
            g2.deal_stage,
            g2.stage,
            g2.stage_order,
            g2.loi_entry_at,
            g2.log_start,
            g2.has_handoff,
            g2.gate1_at,
            g2.gate2_at,
                CASE
                    WHEN g2.gate1_at IS NOT NULL THEN 'reached'::text
                    WHEN g2.stage_order IS NULL OR g2.stage_order < 2 THEN 'not_reached'::text
                    WHEN g2.gates_confirmed_at IS NOT NULL THEN 'not_reached'::text
                    WHEN g2.loi_entry_at IS NOT NULL AND g2.loi_entry_at >= g2.log_start THEN 'not_reached'::text
                    WHEN g2.has_handoff THEN 'not_reached'::text
                    ELSE 'unknown'::text
                END AS gate1_state,
            g2.final_loi_at AS gate3_at
           FROM g2
        ), gates2 AS (
         SELECT gates.package_id,
            gates.deal_id,
            gates.site_submit_id,
            gates.started_at,
            gates.final_loi_at,
            gates.gates_confirmed_at,
            gates.gate1_manual,
            gates.gate2_manual,
            gates.deal_stage,
            gates.stage,
            gates.stage_order,
            gates.loi_entry_at,
            gates.log_start,
            gates.has_handoff,
            gates.gate1_at,
            gates.gate2_at,
            gates.gate1_state,
            gates.gate3_at,
                CASE
                    WHEN gates.gate2_at IS NOT NULL THEN 'reached'::text
                    WHEN gates.gate1_state = 'unknown'::text THEN 'unknown'::text
                    WHEN gates.gate1_state = 'not_reached'::text THEN 'not_reached'::text
                    WHEN gates.gates_confirmed_at IS NOT NULL THEN 'not_reached'::text
                    WHEN gates.gate1_at >= gates.log_start THEN 'not_reached'::text
                    ELSE 'unknown'::text
                END AS gate2_state,
                CASE
                    WHEN gates.gate3_at IS NOT NULL THEN 'reached'::text
                    ELSE 'not_reached'::text
                END AS gate3_state
           FROM gates
        ), counts AS (
         SELECT s.package_id,
            count(*) FILTER (WHERE s.effective_status <> 'na'::text) AS applicable,
            count(*) FILTER (WHERE s.effective_status = 'done'::text) AS done,
            count(*) FILTER (WHERE s.effective_status = 'waiting_on_mike'::text) AS waiting_on_mike,
            count(*) FILTER (WHERE s.waiting_reason = 'input'::text) AS waiting_on_input,
            bool_or(s.status <> 'not_started'::text) AS any_started,
            count(*) FILTER (WHERE (s.effective_status <> ALL (ARRAY['na'::text, 'done'::text])) AND (s.effective_done_by_gate <= 1 OR s.started_by_gate <= 1 AND s.effective_status = 'not_started'::text)) AS gate1_missing,
            count(*) FILTER (WHERE (s.effective_status <> ALL (ARRAY['na'::text, 'done'::text])) AND (s.effective_done_by_gate <= 2 OR s.started_by_gate <= 2 AND s.effective_status = 'not_started'::text)) AS gate2_missing,
            count(*) FILTER (WHERE s.effective_status <> ALL (ARRAY['na'::text, 'done'::text])) AS gate3_missing,
            count(*) FILTER (WHERE (s.template_key = ANY (ARRAY['market_aerial'::text, 'demo_map'::text, 'site_plan'::text])) AND s.effective_status = 'done'::text) AS tour_ready_done,
            COALESCE(bool_and(s.effective_status = 'done'::text) FILTER (WHERE s.template_key = ANY (ARRAY['market_aerial'::text, 'demo_map'::text, 'site_plan'::text])), false) AS tour_ready
           FROM v_deal_package_slide s
          GROUP BY s.package_id
        ), missing AS (
         SELECT s.package_id,
            array_agg(DISTINCT m.m ORDER BY m.m) AS missing_inputs
           FROM v_deal_package_slide s
             CROSS JOIN LATERAL unnest(s.missing_inputs) m(m)
          WHERE s.effective_status <> ALL (ARRAY['done'::text, 'na'::text])
          GROUP BY s.package_id
        )
 SELECT g.package_id,
    g.deal_id,
    g.site_submit_id,
    g.started_at,
    g.deal_stage,
    g.loi_entry_at,
    COALESCE(c.applicable, 0::bigint) AS applicable,
    COALESCE(c.done, 0::bigint) AS done,
    COALESCE(c.waiting_on_mike, 0::bigint) AS waiting_on_mike,
    COALESCE(c.waiting_on_input, 0::bigint) AS waiting_on_input,
    COALESCE(c.any_started, false) AS any_started,
    g.gate1_at,
    g.gate1_state,
    COALESCE(c.gate1_missing, 0::bigint) AS gate1_missing,
    g.gate2_at,
    g.gate2_state,
    COALESCE(c.gate2_missing, 0::bigint) AS gate2_missing,
    g.gate3_at,
    g.gate3_state,
    COALESCE(c.gate3_missing, 0::bigint) AS gate3_missing,
    g.gate1_state = 'unknown'::text OR g.gate2_state = 'unknown'::text AS gates_unknown,
    g.gates_confirmed_at,
    CASE WHEN dp.paused_at IS NOT NULL THEN NULL::timestamp with time zone ELSE LEAST(
        CASE
            WHEN g.gate1_state = 'reached'::text AND g.gate1_at <= now() AND c.gate1_missing > 0 THEN g.gate1_at
            ELSE NULL::timestamp with time zone
        END,
        CASE
            WHEN g.gate2_state = 'reached'::text AND g.gate2_at <= now() AND c.gate2_missing > 0 THEN g.gate2_at
            ELSE NULL::timestamp with time zone
        END,
        CASE
            WHEN g.gate3_state = 'reached'::text AND g.gate3_at <= now() AND c.gate3_missing > 0 THEN g.gate3_at
            ELSE NULL::timestamp with time zone
        END) END AS behind_since,
    g.stage,
    COALESCE(c.tour_ready_done, 0::bigint) AS tour_ready_done,
    COALESCE(c.tour_ready, false) AS tour_ready,
    COALESCE(mi.missing_inputs, '{}'::text[]) AS missing_inputs,
    dp.paused_at,
    dp.pause_reason
   FROM gates2 g
     LEFT JOIN counts c ON c.package_id = g.package_id
     LEFT JOIN missing mi ON mi.package_id = g.package_id
     LEFT JOIN deal_package dp ON dp.id = g.package_id;

-- ─── Grants ──────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.set_queue_order(uuid, text[])                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pause_package(uuid)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resume_package(uuid)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.package_pause_apply(uuid, uuid, text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_pause_package_on_site_stage()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_pause_package_on_deal_stage()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.task_hold_while_package_paused()             FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_queue_order(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_package(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_package(uuid)          TO authenticated;
-- The view keeps its grants (CREATE OR REPLACE); restated so a rebuild can't drop them.
REVOKE ALL ON public.v_deal_package_progress FROM anon;
GRANT SELECT ON public.v_deal_package_progress TO authenticated;
