-- Decision 3: enable RLS on the public tables that had none.
--
-- 20260928120000 revoked anon on these, so they are already internal-only. This
-- adds the second layer, so a future anon grant (or a re-run of Supabase's
-- default privileges) cannot re-expose them.
--
-- Who actually uses each table drove the policies: the streetlight_* tables are
-- written only by edge functions (service_role, which bypasses RLS) and read
-- read-only from the browser; task_category is read AND written from the UI;
-- deal_submit_stage_map is referenced from neither src/ nor supabase/functions/
-- and is read only by SQL.

BEGIN;

-- Read-only from the browser, written by edge functions via service_role.
ALTER TABLE public.streetlight_segment           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streetlight_segment_metrics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streetlight_usage_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streetlight_usage_log_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streetlight_quota_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streetlight_user_limit        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streetlight_backfill_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streetlight_backfill_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY streetlight_segment_select           ON public.streetlight_segment           FOR SELECT TO authenticated USING (true);
CREATE POLICY streetlight_segment_metrics_select   ON public.streetlight_segment_metrics   FOR SELECT TO authenticated USING (true);
CREATE POLICY streetlight_usage_log_select         ON public.streetlight_usage_log         FOR SELECT TO authenticated USING (true);
CREATE POLICY streetlight_usage_log_segment_select ON public.streetlight_usage_log_segment FOR SELECT TO authenticated USING (true);
CREATE POLICY streetlight_quota_config_select      ON public.streetlight_quota_config      FOR SELECT TO authenticated USING (true);
CREATE POLICY streetlight_user_limit_select        ON public.streetlight_user_limit        FOR SELECT TO authenticated USING (true);
CREATE POLICY streetlight_backfill_config_select   ON public.streetlight_backfill_config   FOR SELECT TO authenticated USING (true);
CREATE POLICY streetlight_backfill_progress_select ON public.streetlight_backfill_progress FOR SELECT TO authenticated USING (true);

-- Written from the UI (3 insert/update/delete call sites in src/).
ALTER TABLE public.task_category ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_category_all ON public.task_category FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Lookup, read by SQL only.
ALTER TABLE public.deal_submit_stage_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_submit_stage_map_select ON public.deal_submit_stage_map FOR SELECT TO authenticated USING (true);

COMMIT;

-- spatial_ref_sys / geometry_columns / geography_columns are PostGIS-owned and
-- left alone on purpose: harmless, and client libraries expect to read them.
