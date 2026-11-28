-- Package Tracker: packages attach to the site_submit; deal_id is filled in later.
-- Decisions 2026-10-22 (Mike): items 1, 2, 4. Spec: docs/PACKAGE_TRACKER_SPEC.md.
--
-- Why: the deal board's unit is the site_submit (decisions §2.27). 8 of 25
-- Pre-Submittal cards have no deal, and creating a deal just to start slides
-- has side effects (master pipeline, auto critical dates, stage sync). So a
-- package can now start on a site_submit alone — the same dual-key pattern as
-- deal_activity_state. The name deal_package is kept.
--
-- 1. deal_package: + site_submit_id (unique, nullable); deal_id now nullable;
--    at least one set. Backfill: existing packages get their deal's
--    site_submit_id (Big Chicken).
--    Deletes (decision 2026-10-22, Mike):
--      site deleted  → package deleted (site_submit_id FK CASCADE)
--      deal deleted  → package stays on its site: deal_id SET NULL (FK), and
--                      its tasks lose deal_id too (task.deal_id is already
--                      ON DELETE SET NULL)
--      deal deleted, package has no site → package deleted, by a BEFORE DELETE
--                      trigger on deal (SET NULL would break the one-key check)
-- 2. Starbucks-family check covers every client present (deal's and site's):
--    package_subject_in_family(deal, site). deal_package_starbucks_only() now
--    reads both keys generically (it is shared with deal_gate_date, which has
--    no site_submit_id), and the package trigger also fires on site_submit_id.
-- 3. Attach trigger on deal (insert / relink of site_submit_id), modelled on
--    trg_attach_activity_state_to_deal:
--      site has a package, deal doesn't      → package.deal_id = the deal
--      deal has a package, site doesn't      → package.site_submit_id = the site
--      BOTH have different packages          → refuse (raise) — relink only;
--                                              a new deal never has a package
--      deal's client not Starbucks family    → skip (don't block the deal)
--    Package tasks get the deal_id / site_submit_id too. SECURITY DEFINER:
--    task UPDATE RLS is owner-scoped and the linking user rarely owns them.
-- 4. start_package(site_submit_id, deal_id): either or both. Resolves the other
--    key (deal.site_submit_id is unique). Refuses if either already has a
--    package. Tasks are created ONLY for slides not owned by the starter whose
--    inputs are already in (decision 2: Drive Time and Placer always; Demo Map /
--    Market Aerial when Market Research is approved; Generators when Market
--    Research + Site Story). Phase 3 releases the rest as inputs arrive.
--    start_deal_package(deal_id) stays (the deployed UI calls it) and now
--    delegates to start_package — same hold rule.
-- 5. Views dropped + recreated:
--    v_deal_package_slide   site from the package (or its deal); deal optional
--    v_deal_package_progress + stage (deal stage, else the site's stage mapped
--                           like the board: LOI → Negotiating LOI), tour_ready
--                           (Market Aerial + Demo Map + Site Plan all done —
--                           decision 4: a badge, gates and pace unchanged),
--                           tour_ready_done, missing_inputs. Gate logic is
--                           unchanged; a site-only package is pre-LOI → gates
--                           'not_reached'.
--    Both otherwise unchanged from 20261013124653 (matches live, checked 2026-10-22).
--
-- "To classify" cards can't start a package — enforced in the UI (it's a board
-- display state, not stored), not here.
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

-- ─── Views out first (they pin deal_package's columns) ──────────────────────

DROP VIEW public.v_deal_package_progress;
DROP VIEW public.v_deal_package_slide;

-- ─── 1. deal_package keys ───────────────────────────────────────────────────

ALTER TABLE public.deal_package
  ADD COLUMN site_submit_id uuid UNIQUE REFERENCES public.site_submit(id) ON DELETE CASCADE,
  ALTER COLUMN deal_id DROP NOT NULL,
  ADD CONSTRAINT deal_package_has_subject CHECK (num_nonnulls(deal_id, site_submit_id) >= 1),
  DROP CONSTRAINT deal_package_deal_id_fkey,
  ADD CONSTRAINT deal_package_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES public.deal(id) ON DELETE SET NULL;

-- A package with no site can't fall back to the site when its deal goes:
-- delete it first (BEFORE trigger runs ahead of the FK's SET NULL action).
CREATE FUNCTION public.delete_siteless_package_on_deal_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM deal_package WHERE deal_id = OLD.id AND site_submit_id IS NULL;
  RETURN OLD;
END;
$$;

-- Trigger-only (definer: authenticated has no DELETE on deal_package).
REVOKE ALL ON FUNCTION public.delete_siteless_package_on_deal_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_delete_siteless_package_on_deal_delete
  BEFORE DELETE ON public.deal
  FOR EACH ROW EXECUTE FUNCTION public.delete_siteless_package_on_deal_delete();

COMMENT ON COLUMN public.deal_package.site_submit_id IS
  'Board card the package belongs to (decisions §2.27). deal_id is filled in by trg_attach_package_to_deal when a deal is created/linked.';

-- ─── 2. Starbucks family, every present client ─────────────────────────────

CREATE FUNCTION public.package_subject_in_family(p_deal_id uuid, p_site_submit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (p_deal_id IS NOT NULL OR p_site_submit_id IS NOT NULL)
     AND (p_deal_id IS NULL
          OR public.client_in_starbucks_family((SELECT d.client_id FROM public.deal d WHERE d.id = p_deal_id)))
     AND (p_site_submit_id IS NULL
          OR public.client_in_starbucks_family((SELECT s.client_id FROM public.site_submit s WHERE s.id = p_site_submit_id)));
$$;

COMMENT ON FUNCTION public.package_subject_in_family(uuid, uuid) IS
  'Package Tracker eligibility: every present client (deal''s, site''s) is in the Starbucks family.';

REVOKE ALL ON FUNCTION public.package_subject_in_family(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.package_subject_in_family(uuid, uuid) TO authenticated;

-- Shared with deal_gate_date (no site_submit_id there), so read keys generically.
CREATE OR REPLACE FUNCTION public.deal_package_starbucks_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row  jsonb := to_jsonb(NEW);
  v_deal uuid  := (v_row ->> 'deal_id')::uuid;
  v_site uuid  := (v_row ->> 'site_submit_id')::uuid;
BEGIN
  IF NOT public.package_subject_in_family(v_deal, v_site) THEN
    RAISE EXCEPTION 'Package Tracker is limited to Starbucks-family deals and sites (deal %, site %)', v_deal, v_site
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER trg_deal_package_starbucks_only ON public.deal_package;
CREATE TRIGGER trg_deal_package_starbucks_only
  BEFORE INSERT OR UPDATE OF deal_id, site_submit_id ON public.deal_package
  FOR EACH ROW EXECUTE FUNCTION public.deal_package_starbucks_only();

-- Backfill (Big Chicken): the package's site is its deal's site.
UPDATE public.deal_package p
   SET site_submit_id = d.site_submit_id
  FROM public.deal d
 WHERE d.id = p.deal_id
   AND p.site_submit_id IS NULL
   AND d.site_submit_id IS NOT NULL;

-- ─── 3. Attach on deal create / relink ──────────────────────────────────────

CREATE FUNCTION public.attach_package_to_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_site_pkg uuid;
  v_deal_pkg uuid;
  v_pkg      uuid;
BEGIN
  SELECT id INTO v_site_pkg FROM deal_package WHERE site_submit_id = NEW.site_submit_id;
  SELECT id INTO v_deal_pkg FROM deal_package WHERE deal_id = NEW.id;
  IF v_site_pkg IS NULL AND v_deal_pkg IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_site_pkg IS NOT NULL AND v_deal_pkg IS NOT NULL AND v_site_pkg <> v_deal_pkg THEN
    RAISE EXCEPTION 'This site and this deal each already have a slide package; resolve one before linking them'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Never block a deal write over package eligibility: leave the package as is.
  IF NOT public.client_in_starbucks_family(NEW.client_id) THEN
    RETURN NULL;
  END IF;

  v_pkg := COALESCE(v_site_pkg, v_deal_pkg);
  BEGIN
    UPDATE deal_package
       SET deal_id = NEW.id, site_submit_id = NEW.site_submit_id
     WHERE id = v_pkg
       AND (deal_id IS DISTINCT FROM NEW.id OR site_submit_id IS DISTINCT FROM NEW.site_submit_id);
  EXCEPTION WHEN check_violation THEN
    RETURN NULL;  -- e.g. the site's client isn't Starbucks family: skip, don't block the deal
  END;

  -- Package tasks follow (they show in both sidebars' Tasks tabs). Not a touch:
  -- the clock-reset triggers fire on task INSERT / due_at only.
  UPDATE task t
     SET deal_id = NEW.id, site_submit_id = NEW.site_submit_id
    FROM deal_package_slide s
   WHERE s.package_id = v_pkg
     AND t.package_slide_id = s.id
     AND (t.deal_id IS DISTINCT FROM NEW.id OR t.site_submit_id IS DISTINCT FROM NEW.site_submit_id);
  RETURN NULL;
END;
$$;

-- Trigger-only.
REVOKE ALL ON FUNCTION public.attach_package_to_deal() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_attach_package_to_deal
  AFTER INSERT OR UPDATE OF site_submit_id ON public.deal
  FOR EACH ROW
  WHEN (NEW.site_submit_id IS NOT NULL)
  EXECUTE FUNCTION public.attach_package_to_deal();

-- ─── 4. Start Package ───────────────────────────────────────────────────────

CREATE FUNCTION public.start_package(p_site_submit_id uuid DEFAULT NULL, p_deal_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me       uuid;
  v_site     uuid := p_site_submit_id;
  v_deal     uuid := p_deal_id;
  v_name     text;
  v_client   uuid;
  v_pkg      uuid;
  v_category uuid;
  v_ready    text[] := '{}';
BEGIN
  SELECT id INTO v_me FROM "user" WHERE auth_user_id = auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'start_package: no OVIS user for the caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_site IS NULL AND v_deal IS NULL THEN
    RAISE EXCEPTION 'start_package: give a site submit or a deal' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Resolve the other key (deal.site_submit_id is unique).
  IF v_deal IS NOT NULL THEN
    SELECT d.site_submit_id, d.deal_name, d.client_id INTO v_site, v_name, v_client
      FROM deal d WHERE d.id = v_deal;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'start_package: deal % not found', v_deal USING ERRCODE = 'no_data_found';
    END IF;
    IF p_site_submit_id IS NOT NULL AND v_site IS DISTINCT FROM p_site_submit_id THEN
      RAISE EXCEPTION 'start_package: deal % is not linked to site submit %', v_deal, p_site_submit_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  ELSE
    SELECT d.id, d.deal_name, d.client_id INTO v_deal, v_name, v_client FROM deal d WHERE d.site_submit_id = v_site;
  END IF;
  IF v_site IS NOT NULL THEN
    SELECT COALESCE(v_name, s.site_submit_name), COALESCE(v_client, s.client_id) INTO v_name, v_client
      FROM site_submit s WHERE s.id = v_site;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'start_package: site submit % not found', v_site USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM deal_package
              WHERE (v_deal IS NOT NULL AND deal_id = v_deal)
                 OR (v_site IS NOT NULL AND site_submit_id = v_site)) THEN
    RAISE EXCEPTION 'A package has already been started for this site / deal' USING ERRCODE = 'unique_violation';
  END IF;

  SELECT id INTO v_category FROM task_category WHERE name = 'pipeline' AND scope = 'global' AND archived_at IS NULL;

  -- Starbucks-family trigger fires here.
  INSERT INTO deal_package (deal_id, site_submit_id, started_by)
  VALUES (v_deal, v_site, v_me) RETURNING id INTO v_pkg;

  INSERT INTO deal_package_slide
    (package_id, template_key, label, position, owner_user_id, handoff, inputs,
     allows_na, after_key, done_by_gate, started_by_gate)
  SELECT v_pkg, t.key, t.label, t.position, t.owner_user_id, t.handoff, t.inputs,
         t.allows_na, t.after_key, t.done_by_gate, t.started_by_gate
    FROM package_slide_template t
   WHERE t.active;

  -- Inputs that are already in (the manual ones can't be: the package is new).
  IF v_site IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM research_run r WHERE r.site_submit_id = v_site AND r.state = 'approved') THEN
      v_ready := array_append(v_ready, 'market_research');
    END IF;
    IF EXISTS (SELECT 1 FROM research_thread th JOIN research_thread_run tr ON tr.thread_id = th.id
                WHERE th.site_submit_id = v_site AND tr.kind = 'deep_pass' AND tr.state = 'complete') THEN
      v_ready := array_append(v_ready, 'site_story');
    END IF;
  END IF;

  -- Hold rule (decision 2): only slides whose inputs are all in get a task now.
  INSERT INTO task
    (subject, description, status, owner_id, assigned_by_id, created_by_id,
     client_id, deal_id, site_submit_id, package_slide_id, category_id, category)
  SELECT 'Package · ' || s.label || ' — ' || coalesce(v_name, 'site'),
         CASE s.handoff
           WHEN 'approve' THEN 'Complete this slide; it goes to Mike for approval when you check it off.'
           WHEN 'finish'  THEN 'Set this slide up; Mike finishes it when you check it off.'
           ELSE 'Complete this slide.'
         END,
         'open', s.owner_user_id, v_me, v_me,
         v_client, v_deal, v_site, s.id, v_category, 'pipeline'
    FROM deal_package_slide s
   WHERE s.package_id = v_pkg
     AND s.owner_user_id <> v_me
     AND s.inputs::text[] <@ v_ready;

  RETURN v_pkg;
END;
$$;

COMMENT ON FUNCTION public.start_package(uuid, uuid) IS
  'Package Tracker: start a package on a site submit and/or deal; tasks only for owner slides whose inputs are in. Invoker; Starbucks family only.';

REVOKE ALL ON FUNCTION public.start_package(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_package(uuid, uuid) TO authenticated;

-- The deployed UI calls this; keep it, same rules.
CREATE OR REPLACE FUNCTION public.start_deal_package(p_deal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.start_package(NULL, p_deal_id);
END;
$$;

-- ─── 5. Views ───────────────────────────────────────────────────────────────

CREATE VIEW public.v_deal_package_slide
WITH (security_invoker = true) AS
WITH base AS (
  SELECT p.id, p.deal_id, p.site_plan_received_at, p.dot_study_received_at, p.final_loi_at,
         COALESCE(p.site_submit_id, d.site_submit_id) AS site_submit_id
    FROM public.deal_package p
    LEFT JOIN public.deal d ON d.id = p.deal_id
),
pkg AS (
  SELECT b.*,
         (b.site_submit_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.research_run r
             WHERE r.site_submit_id = b.site_submit_id AND r.state = 'approved'))      AS has_market_research,
         (b.site_submit_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.research_thread t
              JOIN public.research_thread_run tr ON tr.thread_id = t.id
             WHERE t.site_submit_id = b.site_submit_id
               AND tr.kind = 'deep_pass' AND tr.state = 'complete'))                    AS has_site_story
    FROM base b
   WHERE public.package_subject_in_family(b.deal_id, b.site_submit_id)
),
resolved AS (
  SELECT s.*,
         pkg.deal_id,
         pkg.site_submit_id,
         array_remove(ARRAY[
           CASE WHEN 'market_research' = ANY (s.inputs) AND NOT pkg.has_market_research       THEN 'market_research' END,
           CASE WHEN 'site_story'      = ANY (s.inputs) AND NOT pkg.has_site_story            THEN 'site_story'      END,
           CASE WHEN 'site_plan'       = ANY (s.inputs) AND pkg.site_plan_received_at IS NULL THEN 'site_plan'       END,
           CASE WHEN 'dot_study'       = ANY (s.inputs) AND pkg.dot_study_received_at IS NULL THEN 'dot_study'       END,
           CASE WHEN 'final_loi'       = ANY (s.inputs) AND pkg.final_loi_at IS NULL          THEN 'final_loi'       END
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
  'Package Tracker: slides with inputs resolved and effective status (missing input ⇒ waiting_on_mike, derived). Site- or deal-keyed packages.';


CREATE VIEW public.v_deal_package_progress
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
         COALESCE(ds.label, CASE sst.name WHEN 'LOI' THEN 'Negotiating LOI' ELSE sst.name END) AS stage,
         COALESCE(ds.sort_order, ms.sort_order) AS stage_order,
         (SELECT max(COALESCE(h.corrected_date, h.changed_at))
            FROM public.deal_stage_history h
            JOIN public.deal_stage hs ON hs.id = h.to_stage_id
           WHERE p.deal_id IS NOT NULL AND h.deal_id = p.deal_id AND hs.label = 'Negotiating LOI') AS loi_entry_at,
         public.court_log_start() AS log_start
    FROM public.deal_package p
    LEFT JOIN public.deal d            ON d.id = p.deal_id
    LEFT JOIN public.deal_stage ds     ON ds.id = d.stage_id
    LEFT JOIN public.site_submit s     ON s.id = COALESCE(p.site_submit_id, d.site_submit_id)
    LEFT JOIN public.submit_stage sst  ON sst.id = s.submit_stage_id
    LEFT JOIN public.deal_stage ms     ON ms.label = CASE sst.name WHEN 'LOI' THEN 'Negotiating LOI' ELSE sst.name END
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

COMMENT ON VIEW public.v_deal_package_progress IS
  'Package Tracker: per-package counts, gates, behind_since, board stage, tour_ready, missing inputs. Pace thresholds client-side.';

-- Recreated views need their grants again.
REVOKE ALL ON public.v_deal_package_slide    FROM anon, authenticated;
REVOKE ALL ON public.v_deal_package_progress FROM anon, authenticated;
GRANT SELECT ON public.v_deal_package_slide    TO authenticated;
GRANT SELECT ON public.v_deal_package_progress TO authenticated;
