-- Decision 2: make views enforce the caller's RLS instead of the owner's.
--
-- A view without security_invoker runs with its OWNER's privileges, so base-table
-- RLS never applies to the caller. That is how portal_user_analytics handed out
-- contact emails despite contact having correct policies
-- (docs/SUPABASE_ANON_EXPOSURE_AUDIT.md).
--
-- Flipping it is the correct fix, but NOT universally safe: some of these views
-- are definer-by-design and flipping empties them for staff who legitimately use
-- them. Measured with scripts/view_invoker_harness.py (per-role row counts, one
-- rolled-back transaction). Only the views where no internal role loses data are
-- flipped here. The other four are listed at the bottom with what they need first.

BEGIN;

-- No role's row count changes (base-table policies are already permissive for
-- authenticated). Flipped for defense in depth: if those policies are ever
-- tightened, the view now honors them instead of silently bypassing them.
ALTER VIEW public.municipal_project_v          SET (security_invoker = on);
ALTER VIEW public.v_prospecting_target         SET (security_invoker = on);
ALTER VIEW public.v_prospecting_stale_targets  SET (security_invoker = on);
ALTER VIEW public.v_prospecting_weekly_metrics SET (security_invoker = on);

-- Only coach and portal lose rows (3 -> 0), and both already cannot read
-- public.contact at all (SELECT requires can_manage_operations()). An empty tag
-- list for a contact they cannot open is consistent, not a regression.
ALTER VIEW public.v_contact_tags               SET (security_invoker = on);

COMMIT;

-- NOT flipped — each one needs a base-table policy decision first, and the
-- anonymous hole is already closed by 20260928120000, so none of this is urgent:
--
-- client_velocity_stats     coach 564 -> 0. Coach cannot read public.deal
--                           (can_manage_operations() excludes coach), so the
--                           coach's forecasting view exists ONLY because this
--                           view bypasses RLS. Needs a coach SELECT policy on
--                           deal before flipping.
--
-- document_handoff_history  coach 125 -> 0. Same cause: the view's policy tests
--                           EXISTS (SELECT 1 FROM deal ...), which coach fails.
--
-- v_prospecting_daily_metrics  broker_full 121 -> 11, coach 121 -> 0.
--                           prospecting_time_entry is scoped to auth.uid() =
--                           user_id, so per-user scoping is arguably CORRECT for
--                           a personal scorecard — but coach going to 0 would
--                           break coaching review. Needs a coach cross-user
--                           policy on prospecting_time_entry.
--
-- budget_vs_actual_monthly  broker_full/broker_lite/va/coach 223 -> 0.
--                           account_budget's SELECT policy is admin-only, yet
--                           BrokerForecastDashboard queries this view with no
--                           role gate — so every logged-in user currently reads
--                           the company operating budget. Policy, view and UI
--                           disagree; that is a product decision, not a fix.
--
-- portal_user_analytics     broker_lite 22 -> 1, va/coach 22 -> 0. The page
--                           gates on ['admin','broker_full','broker_limited'] —
--                           and 'broker_limited' is not a real ovis_role value
--                           ('broker_lite' is), so that gate is already broken.
--                           Fix the role string before deciding the policy.
