-- Package tasks show "pipeline", not "personal".
--
-- task has two category fields: category_id (FK to task_category, set to the
-- global 'pipeline' row by start_deal_package) and the older text column
-- `category` (DEFAULT 'personal'), which the task lists display. The first
-- package (Big Chicken, 2026-10-19) showed its 5 tasks as "personal".
--
-- 1. start_deal_package also sets category = 'pipeline'. Rebuilt from the LIVE
--    definition (pg_get_functiondef, 2026-10-19); only the column list and
--    values change. CREATE OR REPLACE keeps the existing grants
--    (EXECUTE: authenticated only).
-- 2. Existing package tasks with the default 'personal' are corrected.
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

CREATE OR REPLACE FUNCTION public.start_deal_package(p_deal_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
     client_id, deal_id, site_submit_id, package_slide_id, category_id, category)
  SELECT 'Package · ' || s.label || ' — ' || coalesce(v_deal.deal_name, 'deal'),
         CASE s.handoff
           WHEN 'approve' THEN 'Complete this slide; it goes to Mike for approval when you check it off.'
           WHEN 'finish'  THEN 'Set this slide up; Mike finishes it when you check it off.'
           ELSE 'Complete this slide.'
         END,
         'open', s.owner_user_id, v_me, v_me,
         v_deal.client_id, p_deal_id, v_deal.site_submit_id, s.id, v_category, 'pipeline'
    FROM deal_package_slide s
   WHERE s.package_id = v_pkg
     AND s.owner_user_id <> v_me;

  RETURN v_pkg;
END;
$function$;

UPDATE public.task
   SET category = 'pipeline'
 WHERE package_slide_id IS NOT NULL
   AND category = 'personal';
