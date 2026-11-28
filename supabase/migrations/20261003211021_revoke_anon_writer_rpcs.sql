-- Close the eight anon-callable SECURITY DEFINER WRITERS, and stop the database
-- handing out anon EXECUTE on every future function.
--
-- All eight bypass RLS by definition and have no caller check, so an
-- unauthenticated POST to /rest/v1/rpc/<name> was a write. NOT TESTED by
-- calling them -- they write -- so this is closed on inspection.
--
-- BOTH GRANT PATHS ARE REVOKED, because closing one says nothing about the
-- other: Postgres grants EXECUTE to PUBLIC on every new function, AND this
-- database's ALTER DEFAULT PRIVILEGES adds an explicit anon grant at creation.
-- Earlier today each of those was revoked separately and the function stayed
-- open both times, each time for the other reason.
--
-- CALLERS CONFIRMED, not inferred:
--   submit_research_report          ovis-research-trigger/index.ts:221-223 builds
--                                   its client with SUPABASE_SERVICE_ROLE_KEY --
--                                   service_role bypasses grants
--   update_all_payment_estimates    pg_cron job 7; pg_cron runs as postgres
--   update_behind_schedule_status   pg_cron job 7
--   calculate_deal_payment_dates    called in-database by
--                                   trigger_recalculate_payment_dates (trigger
--                                   deal_payment_date_recalc on deal) and by
--                                   update_all_payment_estimates. BOTH are
--                                   SECURITY DEFINER owned by postgres, so the
--                                   nested call runs in the owner's context and
--                                   needs no grant to authenticated
--   streetlight_record_spend        NO caller anywhere in src/, supabase/ or
--                                   scripts/. Any service_role caller is
--                                   unaffected by this revoke; a caller using
--                                   the publishable key would itself be the
--                                   vulnerability, since its arguments are whole
--                                   table types and it writes the paid-API
--                                   spend ledger
--   reset_portal_file_visibility    NO caller found; deletes portal_file_visibility
--
-- authenticated is granted back ONLY where a UI caller exists:
--   record_portal_site_submit_view  2 src call sites (post-login portal)
--   set_portal_file_visibility      1 src call site
--   create_orep_target_area         1 src call site (MappingPageNew)
--
-- ROLLBACK, per function:
--   GRANT EXECUTE ON FUNCTION public.<signature> TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.<signature> TO anon;
-- and for the defaults:
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO anon;
-- Nothing is dropped or altered; only grants change.

-- ---------------------------------------------------------------- no UI caller
REVOKE EXECUTE ON FUNCTION public.streetlight_record_spend(p_usage_log streetlight_usage_log, p_segments streetlight_usage_log_segment[], p_metrics streetlight_segment_metrics[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_deal_payment_dates(p_deal_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_all_payment_estimates() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_behind_schedule_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_research_report(p_run_id uuid, p_candidates jsonb, p_needs_review text, p_alt_avenues text, p_estimated_cost_cents integer, p_input_tokens bigint, p_output_tokens bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_portal_file_visibility(p_dropbox_path text, p_entity_type character varying, p_entity_id uuid) FROM PUBLIC, anon;

-- ------------------------------------------------------------- UI caller exists
REVOKE EXECUTE ON FUNCTION public.record_portal_site_submit_view(p_user_id uuid, p_site_submit_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_portal_site_submit_view(p_user_id uuid, p_site_submit_id uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_portal_file_visibility(p_dropbox_path text, p_entity_type character varying, p_entity_id uuid, p_is_visible boolean, p_site_submit_id uuid, p_user_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_portal_file_visibility(p_dropbox_path text, p_entity_type character varying, p_entity_id uuid, p_is_visible boolean, p_site_submit_id uuid, p_user_id uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_orep_target_area(p_name text, p_geojson jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_orep_target_area(p_name text, p_geojson jsonb) TO authenticated, service_role;

-- service_role for the infrastructure callers, explicitly rather than inherited
GRANT EXECUTE ON FUNCTION public.submit_research_report(p_run_id uuid, p_candidates jsonb, p_needs_review text, p_alt_avenues text, p_estimated_cost_cents integer, p_input_tokens bigint, p_output_tokens bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.streetlight_record_spend(p_usage_log streetlight_usage_log, p_segments streetlight_usage_log_segment[], p_metrics streetlight_segment_metrics[]) TO service_role;

-- ------------------------------------------------- the default, for everything new
-- CLAUDE.md's "every new RPC needs an explicit grants block" becomes enforced by
-- the database rather than by memory: a function created without a grants block
-- is now unreachable by anon instead of open by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- The supabase_admin half CANNOT be applied from this connection:
--   ERROR: permission denied to change default privileges
-- We connect as postgres, which may not alter another role's defaults. Objects
-- created BY supabase_admin therefore still inherit anon EXECUTE. Migrations in
-- this project run as postgres, so the postgres default above covers them; the
-- gap is anything Supabase's own tooling creates as supabase_admin.
-- Needs a supabase_admin session to close:
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
