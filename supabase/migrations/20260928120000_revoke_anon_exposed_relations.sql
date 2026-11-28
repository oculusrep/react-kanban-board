-- Revoke anon privileges on relations reachable without authentication.
--
-- Audit: docs/SUPABASE_ANON_EXPOSURE_AUDIT.md (2026-09-28). Every relation below
-- was confirmed readable with the publishable key and NO Authorization header,
-- because RLS is disabled (tables) or bypassed (views created without
-- security_invoker, which run with the view owner's privileges).
--
-- authenticated keeps its grants, so no app behavior changes. OVIS has no
-- pre-login screen that reads any of these.
--
-- NOT included here (needs a decision — both change behavior for authenticated
-- users): turning on security_invoker for the views, and enabling RLS on the
-- streetlight_* / lookup tables.

BEGIN;

-- 1. Views whose base-table RLS is bypassed (no security_invoker)
REVOKE ALL ON public.portal_user_analytics        FROM anon;
REVOKE ALL ON public.client_velocity_stats        FROM anon;
REVOKE ALL ON public.municipal_project_v          FROM anon;
REVOKE ALL ON public.budget_vs_actual_monthly     FROM anon;
REVOKE ALL ON public.document_handoff_history     FROM anon;
REVOKE ALL ON public.v_prospecting_stale_targets  FROM anon;
REVOKE ALL ON public.v_prospecting_target         FROM anon;
REVOKE ALL ON public.v_prospecting_daily_metrics  FROM anon;
REVOKE ALL ON public.v_prospecting_weekly_metrics FROM anon;
REVOKE ALL ON public.v_contact_tags               FROM anon;

-- 2. Tables with RLS disabled. INSERT was confirmed to reach the table on
--    task_category, deal_submit_stage_map, streetlight_quota_config,
--    streetlight_usage_log and streetlight_segment (22P02, not 42501).
REVOKE ALL ON public.streetlight_segment            FROM anon;
REVOKE ALL ON public.streetlight_segment_metrics    FROM anon;
REVOKE ALL ON public.streetlight_usage_log          FROM anon;
REVOKE ALL ON public.streetlight_usage_log_segment  FROM anon;
REVOKE ALL ON public.streetlight_quota_config       FROM anon;
REVOKE ALL ON public.streetlight_user_limit         FROM anon;
REVOKE ALL ON public.streetlight_backfill_config    FROM anon;
REVOKE ALL ON public.streetlight_backfill_progress  FROM anon;
REVOKE ALL ON public.task_category                  FROM anon;
REVOKE ALL ON public.deal_submit_stage_map          FROM anon;

-- PostGIS metadata (geometry_columns, geography_columns, spatial_ref_sys) is
-- left alone deliberately: harmless, and client libraries expect to read it.

-- 3. Stop new tables from inheriting anon grants before Supabase's 2026-10-30
--    change does it for us. Default ACLs are per-granting-role: this covers
--    tables created by postgres (the psql migration path in CLAUDE.md). The
--    separate supabase_admin default cannot be altered from here, so tables
--    created via the dashboard still inherit anon grants until 2026-10-30.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

COMMIT;

-- Verify with an anonymous request, not by re-reading the grant tables:
--   curl -s "$VITE_SUPABASE_URL/rest/v1/portal_user_analytics?select=*" \
--     -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"
-- Expect 42501 permission denied (or an empty result), not rows.
