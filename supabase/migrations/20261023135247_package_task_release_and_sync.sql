-- Package Tracker Phase 3 schema: release held tasks when inputs arrive, keep
-- Noree's task and her slide in step, and set queue order.
-- Spec: docs/PACKAGE_TRACKER_SPEC.md §4, §7. Decisions 2026-10-22 (item 2: held
-- tasks are released by Phase 3) and 2026-10-12 (Phase 3 scope).
--
-- 1. release_package_tasks(package_id): creates the owner task for every slide
--    that (a) isn't owned by the person who started the package, (b) isn't done
--    or N/A, (c) has no task yet, and (d) has all its inputs in. Same task shape
--    as start_package. Idempotent (task_package_slide_unique). Called by:
--      research_run           → state becomes 'approved'          (Market Research)
--      research_thread_run    → deep_pass becomes 'complete'      (Site Story)
--      deal_package           → site plan / DOT study / final LOI marked in
--    One sweep at the end of this migration releases anything already due.
--    The release triggers never block the write that fired them: a failure is
--    raised as a WARNING (an approval or a research run must not fail because a
--    task couldn't be created). Package tasks carry package_slide_id, so the
--    clock-reset triggers ignore them (20261012161839).
-- 2. Task ↔ slide sync (both directions, SECURITY DEFINER: task UPDATE RLS is
--    owner/creator/assigner-scoped):
--      task → completed      slide not_started/in_progress → waiting_on_mike
--                            (handoff approve/finish) or done (handoff none)
--      task → in_progress    slide not_started → in_progress
--      task → open (reopen)  slide waiting_on_mike/done → in_progress
--      slide → waiting_on_mike / done / na   open task → completed
--      slide → not_started / in_progress     completed task → open
--    pg_trigger_depth() > 1 stops each side re-firing the other. Neither side
--    touches deal_activity_state, so card heat is unaffected.
-- 3. set_task_queue_order(task_ids[]): the drag order on the queue. Writes
--    queue_rank = position × 1000 for the given tasks, in order. All tasks must
--    have the same owner; the caller must be that owner or an admin (Mike orders
--    Noree's queue, including tasks she created herself, which task RLS wouldn't
--    let him update directly).
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

-- ─── 1. Release ─────────────────────────────────────────────────────────────

CREATE FUNCTION public.release_package_tasks(p_package_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
     client_id, deal_id, site_submit_id, package_slide_id, category_id, category)
  SELECT 'Package · ' || s.label || ' — ' || coalesce(v_name, 'site'),
         CASE s.handoff
           WHEN 'approve' THEN 'Complete this slide; it goes to Mike for approval when you check it off.'
           WHEN 'finish'  THEN 'Set this slide up; Mike finishes it when you check it off.'
           ELSE 'Complete this slide.'
         END,
         'open', s.owner_user_id, v_pkg.started_by, v_pkg.started_by,
         v_client, v_pkg.deal_id, v_site, s.id, v_category, 'pipeline'
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
$$;

COMMENT ON FUNCTION public.release_package_tasks(uuid) IS
  'Package Tracker: create owner tasks for slides whose inputs are now in (held at Start Package). Idempotent.';

REVOKE ALL ON FUNCTION public.release_package_tasks(uuid) FROM PUBLIC, anon, authenticated;

-- Release every package on a site (a site has at most one package; a deal's
-- package is found through its site too).
CREATE FUNCTION public.release_package_tasks_for_site(p_site_submit_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer := 0;
  v_pkg   uuid;
BEGIN
  FOR v_pkg IN
    SELECT p.id FROM deal_package p LEFT JOIN deal d ON d.id = p.deal_id
     WHERE COALESCE(p.site_submit_id, d.site_submit_id) = p_site_submit_id
  LOOP
    v_total := v_total + public.release_package_tasks(v_pkg);
  END LOOP;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.release_package_tasks_for_site(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.release_on_research_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM public.release_package_tasks_for_site(NEW.site_submit_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'release_on_research_run: package task release failed for site %: %', NEW.site_submit_id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.release_on_research_run() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_release_package_tasks_on_research_run
  AFTER INSERT OR UPDATE OF state ON public.research_run
  FOR EACH ROW
  WHEN (NEW.state = 'approved')
  EXECUTE FUNCTION public.release_on_research_run();

CREATE FUNCTION public.release_on_site_story()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_site uuid;
BEGIN
  BEGIN
    SELECT site_submit_id INTO v_site FROM research_thread WHERE id = NEW.thread_id;
    IF v_site IS NOT NULL THEN
      PERFORM public.release_package_tasks_for_site(v_site);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'release_on_site_story: package task release failed for thread %: %', NEW.thread_id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.release_on_site_story() FROM PUBLIC, anon, authenticated;

-- Fires on the transition only (research_thread_run rows are updated often —
-- heartbeats, leases — but only a deep pass reaching 'complete' matters).
CREATE TRIGGER trg_release_package_tasks_on_site_story
  AFTER INSERT OR UPDATE OF state ON public.research_thread_run
  FOR EACH ROW
  WHEN (NEW.kind = 'deep_pass' AND NEW.state = 'complete')
  EXECUTE FUNCTION public.release_on_site_story();

CREATE FUNCTION public.release_on_package_input()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM public.release_package_tasks(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'release_on_package_input: package task release failed for package %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.release_on_package_input() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_release_package_tasks_on_input
  AFTER UPDATE OF site_plan_received_at, dot_study_received_at, final_loi_at ON public.deal_package
  FOR EACH ROW
  WHEN ((OLD.site_plan_received_at IS NULL AND NEW.site_plan_received_at IS NOT NULL)
     OR (OLD.dot_study_received_at IS NULL AND NEW.dot_study_received_at IS NOT NULL)
     OR (OLD.final_loi_at          IS NULL AND NEW.final_loi_at          IS NOT NULL))
  EXECUTE FUNCTION public.release_on_package_input();

-- ─── 2. Task ↔ slide sync ───────────────────────────────────────────────────

CREATE FUNCTION public.sync_slide_from_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slide record;
  v_me    uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;  -- came from the slide side
  SELECT * INTO v_slide FROM deal_package_slide WHERE id = NEW.package_slide_id;
  IF NOT FOUND OR v_slide.status = 'na' THEN RETURN NULL; END IF;
  SELECT id INTO v_me FROM "user" WHERE auth_user_id = auth.uid();

  IF NEW.status = 'completed' AND v_slide.status IN ('not_started', 'in_progress') THEN
    IF v_slide.handoff = 'none' THEN
      UPDATE deal_package_slide
         SET status = 'done', done_at = now(), owner_done_at = now(), status_changed_at = now(), status_changed_by = v_me
       WHERE id = v_slide.id;
    ELSE
      UPDATE deal_package_slide
         SET status = 'waiting_on_mike', owner_done_at = now(), status_changed_at = now(), status_changed_by = v_me
       WHERE id = v_slide.id;
    END IF;
  ELSIF NEW.status = 'in_progress' AND v_slide.status = 'not_started' THEN
    UPDATE deal_package_slide
       SET status = 'in_progress', status_changed_at = now(), status_changed_by = v_me
     WHERE id = v_slide.id;
  ELSIF NEW.status = 'open' AND OLD.status = 'completed' AND v_slide.status IN ('waiting_on_mike', 'done') THEN
    UPDATE deal_package_slide
       SET status = 'in_progress', done_at = NULL, owner_done_at = NULL, status_changed_at = now(), status_changed_by = v_me
     WHERE id = v_slide.id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_slide_from_task() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_sync_slide_from_task
  AFTER UPDATE OF status ON public.task
  FOR EACH ROW
  WHEN (NEW.package_slide_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.sync_slide_from_task();

CREATE FUNCTION public.sync_task_from_slide()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;  -- came from the task side
  IF NEW.status IN ('waiting_on_mike', 'done', 'na') THEN
    UPDATE task
       SET status = 'completed', completed_at = now()
     WHERE package_slide_id = NEW.id AND status IN ('open', 'in_progress');
  ELSIF NEW.status IN ('not_started', 'in_progress') AND OLD.status IN ('waiting_on_mike', 'done', 'na') THEN
    UPDATE task
       SET status = 'open', completed_at = NULL
     WHERE package_slide_id = NEW.id AND status = 'completed';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_task_from_slide() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_sync_task_from_slide
  AFTER UPDATE OF status ON public.deal_package_slide
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.sync_task_from_slide();

-- ─── 3. Queue order ─────────────────────────────────────────────────────────

CREATE FUNCTION public.set_task_queue_order(p_task_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me     uuid;
  v_owners integer;
  v_owner  uuid;
  v_n      integer;
BEGIN
  SELECT id INTO v_me FROM "user" WHERE auth_user_id = auth.uid();
  IF v_me IS NULL OR NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'set_task_queue_order: internal users only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_task_ids IS NULL OR cardinality(p_task_ids) = 0 THEN RETURN 0; END IF;

  SELECT count(DISTINCT owner_id), min(owner_id::text)::uuid INTO v_owners, v_owner
    FROM task WHERE id = ANY (p_task_ids);
  IF v_owners <> 1 THEN
    RAISE EXCEPTION 'set_task_queue_order: tasks must all belong to one owner' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_owner <> v_me AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'set_task_queue_order: only the owner or an admin can reorder this queue' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE task t
     SET queue_rank = o.ord * 1000
    FROM unnest(p_task_ids) WITH ORDINALITY AS o(id, ord)
   WHERE t.id = o.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.set_task_queue_order(uuid[]) IS
  'Tasks queue drag order: queue_rank = position × 1000. One owner per call; caller is that owner or an admin.';

REVOKE ALL ON FUNCTION public.set_task_queue_order(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_task_queue_order(uuid[]) TO authenticated;

-- ─── Sweep: release anything already due ────────────────────────────────────
-- (Inputs that arrived after a package started but before these triggers existed.)

SELECT public.release_package_tasks(p.id) FROM public.deal_package p;
