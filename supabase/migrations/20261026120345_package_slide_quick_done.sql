-- Package Tracker: quick-complete override (decision 2026-10-26, Mike).
--
-- A Done checkbox on every slide (sidebar and Packages dashboard) that marks
-- the slide Done regardless of owner, handoff (approve / finish) or missing
-- inputs, and closes any open linked task; unchecking sets it back to Not
-- started and reopens the task. The normal Start / hand-off / approve controls
-- stay as they are.
--
-- 1. deal_package_slide.done_by: who marked it done (done_at already says when).
--    Stamped by trg_stamp_slide_done_by on every path to Done (quick-complete,
--    sidebar Approve / Finish, a no-handoff task completed by its owner);
--    cleared whenever the slide leaves Done.
-- 2. set_package_slide_done(slide_id, done):
--      done  = true  → status 'done', done_at now, done_by = caller.
--      done  = false → status 'not_started'; done_at, done_by, owner_done_at cleared.
--    The linked task follows through the existing trg_sync_task_from_slide
--    (20261023135247): done → open task completed; back to not_started → completed
--    task reopened. That path is pure SQL — no client timeline post — so the
--    board clock is never reset (nothing here writes deal_activity_state, activity
--    or site_submit_comment). After an uncheck, release_package_tasks runs for
--    the package so a slide whose inputs are in gets its task back if it had none.
--    SECURITY DEFINER with an explicit internal-user check (it calls the
--    trigger-only release function); portal users and anon are refused.
-- 3. v_deal_package_slide gains done_by (appended; CREATE OR REPLACE keeps
--    grants). Body otherwise unchanged from 20261022110117 (matches live,
--    checked 2026-10-26).
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

ALTER TABLE public.deal_package_slide
  ADD COLUMN done_by uuid REFERENCES public."user"(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.deal_package_slide.done_by IS
  'Who marked the slide done (quick-complete or approve). Cleared when reopened.';

-- Every path to Done records who (quick-complete, sidebar Approve / Finish, a
-- no-handoff task completed by its owner); leaving Done clears it.
CREATE FUNCTION public.stamp_slide_done_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    NEW.done_by := COALESCE(NEW.done_by, (SELECT u.id FROM "user" u WHERE u.auth_user_id = auth.uid()));
    NEW.done_at := COALESCE(NEW.done_at, now());
  ELSIF NEW.status <> 'done' THEN
    NEW.done_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_slide_done_by() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_stamp_slide_done_by
  BEFORE UPDATE OF status ON public.deal_package_slide
  FOR EACH ROW EXECUTE FUNCTION public.stamp_slide_done_by();

CREATE FUNCTION public.set_package_slide_done(p_slide_id uuid, p_done boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me    uuid;
  v_slide record;
BEGIN
  IF NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'set_package_slide_done: internal users only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT id INTO v_me FROM "user" WHERE auth_user_id = auth.uid();

  SELECT * INTO v_slide FROM deal_package_slide WHERE id = p_slide_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_package_slide_done: slide % not found', p_slide_id USING ERRCODE = 'no_data_found';
  END IF;

  IF p_done THEN
    IF v_slide.status <> 'done' THEN
      UPDATE deal_package_slide
         SET status = 'done', done_at = now(), done_by = v_me,
             status_changed_at = now(), status_changed_by = v_me
       WHERE id = p_slide_id;
    END IF;
  ELSE
    IF v_slide.status <> 'not_started' THEN
      UPDATE deal_package_slide
         SET status = 'not_started', done_at = NULL, done_by = NULL, owner_done_at = NULL,
             status_changed_at = now(), status_changed_by = v_me
       WHERE id = p_slide_id;
    END IF;
    PERFORM public.release_package_tasks(v_slide.package_id);
  END IF;

  RETURN (SELECT status FROM deal_package_slide WHERE id = p_slide_id);
END;
$$;

COMMENT ON FUNCTION public.set_package_slide_done(uuid, boolean) IS
  'Package Tracker quick-complete: mark a slide Done (any owner / handoff / inputs) or back to Not started; linked task follows by trigger. Internal users only. Never touches the board clock.';

REVOKE ALL ON FUNCTION public.set_package_slide_done(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_package_slide_done(uuid, boolean) TO authenticated;

CREATE OR REPLACE VIEW public.v_deal_package_slide
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
       END AS effective_done_by_gate,
       r.done_by
  FROM resolved r;
