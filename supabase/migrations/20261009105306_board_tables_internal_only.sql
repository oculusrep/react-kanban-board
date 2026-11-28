-- Portal users must not read or write board state.
--
-- Portal users are `authenticated` (a contact with portal_access_enabled, no
-- row in "user"). Every policy below that only checked `auth.uid() IS NOT NULL`
-- therefore let all 21 portal contacts in.
--
-- Internal check: public.is_internal_user() — the existing User Management
-- helper ("user".ovis_role IN admin / broker_full / broker_lite / va). Coach
-- and client roles are not internal. Wrapped in (SELECT …) so it's evaluated
-- once per statement (InitPlan), not per row.
--
-- A. deal_activity_state (board-owned): read / insert / update internal only.
--    No DELETE policy — the app never deletes, and the table has no DELETE grant.
-- B. task: SELECT and INSERT were `auth.uid() IS NOT NULL`, so a portal user
--    could read every task and insert one. An inserted task with deal_id or
--    site_submit_id also resets a board tile's clock (trg_reset_clock_on_task_*),
--    so this is a board-integrity gap as well as a read leak. UPDATE / DELETE
--    are already owner-scoped via task_current_user_id(), which is NULL for a
--    portal user, so they're left as they are.
--
-- The reset-clock / attach / blocker triggers are SECURITY DEFINER owned by
-- postgres and are unaffected by these policies.
--
-- C. is_internal_user() is SECURITY DEFINER with no fixed search_path; pin it.
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

-- ---------------------------------------------------------------------------
-- A. deal_activity_state
-- ---------------------------------------------------------------------------
DROP POLICY deal_activity_state_select ON public.deal_activity_state;
DROP POLICY deal_activity_state_modify ON public.deal_activity_state;

CREATE POLICY deal_activity_state_select_internal ON public.deal_activity_state
  FOR SELECT TO authenticated
  USING ((SELECT public.is_internal_user()));

CREATE POLICY deal_activity_state_insert_internal ON public.deal_activity_state
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_internal_user()));

CREATE POLICY deal_activity_state_update_internal ON public.deal_activity_state
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_internal_user()))
  WITH CHECK ((SELECT public.is_internal_user()));

-- ---------------------------------------------------------------------------
-- B. task
-- ---------------------------------------------------------------------------
DROP POLICY task_select_all_authenticated ON public.task;
DROP POLICY task_insert_authenticated ON public.task;

CREATE POLICY task_select_internal ON public.task
  FOR SELECT TO authenticated
  USING ((SELECT public.is_internal_user()));

CREATE POLICY task_insert_internal ON public.task
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_internal_user()));

-- task still had the inherited anon ALL grant (the policies were the only
-- gate). Nothing pre-auth touches tasks.
REVOKE ALL ON public.task FROM anon;

-- ---------------------------------------------------------------------------
-- C. Pin is_internal_user()'s search_path (SECURITY DEFINER hardening). Its
-- body references "user" unqualified, which resolves in public.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.is_internal_user() SET search_path = public, pg_temp;
