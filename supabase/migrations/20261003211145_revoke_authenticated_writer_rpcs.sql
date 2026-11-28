-- Finish the job: the six writers with no UI caller lose `authenticated` too.
--
-- The previous migration closed anon on all eight, and verification showed
-- authenticated still held EXECUTE on every one -- including the six that have
-- no UI caller at all. That grant comes from the same ALTER DEFAULT PRIVILEGES
-- that hands out the anon one, so revoking anon alone left the functions
-- callable by ANY logged-in account, portal clients included, with no caller
-- check. For submit_research_report that means deleting a research run's
-- staging rows; for streetlight_record_spend, fabricating paid-API spend.
--
-- Safe because none of these is called from the browser:
--   update_all_payment_estimates    pg_cron job 7 (runs as postgres)
--   update_behind_schedule_status   pg_cron job 7
--   calculate_deal_payment_dates    called in-database by
--                                   trigger_recalculate_payment_dates and
--                                   update_all_payment_estimates, BOTH
--                                   SECURITY DEFINER owned by postgres, so the
--                                   nested call runs in the owner's context
--   submit_research_report          ovis-research-trigger, SERVICE_ROLE_KEY
--   streetlight_record_spend        no caller in src/, supabase/ or scripts/
--   reset_portal_file_visibility    no caller found
--
-- service_role keeps (or is given) EXECUTE explicitly; it bypasses grants
-- anyway, but stating it beats relying on that.
--
-- ROLLBACK:
--   GRANT EXECUTE ON FUNCTION public.<signature> TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_all_payment_estimates() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_behind_schedule_status() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_deal_payment_dates(p_deal_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_research_report(p_run_id uuid, p_candidates jsonb, p_needs_review text, p_alt_avenues text, p_estimated_cost_cents integer, p_input_tokens bigint, p_output_tokens bigint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.streetlight_record_spend(p_usage_log streetlight_usage_log, p_segments streetlight_usage_log_segment[], p_metrics streetlight_segment_metrics[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_portal_file_visibility(p_dropbox_path text, p_entity_type character varying, p_entity_id uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.update_all_payment_estimates() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_behind_schedule_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_deal_payment_dates(p_deal_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_portal_file_visibility(p_dropbox_path text, p_entity_type character varying, p_entity_id uuid) TO service_role;
