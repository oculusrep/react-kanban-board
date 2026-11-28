-- Flip the remaining definer views, per two decisions taken 2026-09-28:
--   1. The company operating budget should be visible to admin ONLY.
--   2. The coach role does not need access to anything right now (no coach
--      engagement is active), so a coach losing rows is an accepted outcome
--      rather than a regression.
--
-- These four were held back by 20260928140000 precisely because they would
-- restrict staff; the decisions above are what make that restriction correct.
-- Measured with scripts/view_invoker_harness.py — its verdicts read "DO NOT
-- FLIP" for all four, which is expected: it flags any internal-role loss and
-- cannot know a loss is intended.
--
-- Effect per role (before -> after):
--   budget_vs_actual_monthly   admin 223 (unchanged); broker_full/va/coach -> 0
--   client_velocity_stats      admin/broker_full/va 564 (unchanged); coach -> 0
--   document_handoff_history   admin/broker_full/va 125 (unchanged); coach -> 0
--   portal_user_analytics      admin/broker_full 22 (unchanged); va/coach -> 0
--
-- portal_user_analytics also drops broker_lite 22 -> 1; no broker_lite account
-- exists (4 users total: 1 admin, 1 broker_full, 1 va, 1 coach), and the page
-- excludes va already, so no live user loses anything they can currently reach.

BEGIN;

ALTER VIEW public.budget_vs_actual_monthly SET (security_invoker = on);
ALTER VIEW public.client_velocity_stats    SET (security_invoker = on);
ALTER VIEW public.document_handoff_history SET (security_invoker = on);
ALTER VIEW public.portal_user_analytics    SET (security_invoker = on);

COMMIT;

-- Still definer, deliberately: v_prospecting_daily_metrics. Flipping it drops
-- broker_full from 121 to 11 because prospecting_time_entry is scoped to
-- auth.uid() = user_id. Own-rows-only is arguably correct for a personal
-- scorecard, but useScorecardMetrics can query it unfiltered (user_id is an
-- optional filter), so a cross-user view would silently become own-rows-only.
-- Needs a product decision, and the anonymous hole is already closed.
