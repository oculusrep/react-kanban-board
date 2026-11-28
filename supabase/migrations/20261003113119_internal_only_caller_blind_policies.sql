-- Lock the caller-blind policies: tables whose SELECT policy was `USING (true)` for
-- `authenticated`, which let ANY logged-in account -- including a client with a
-- portal login -- read every row. Not an anon hole (20260928120000 /
-- 20260928190000 closed that); this is about what a portal client can see.
--
-- Full audit, measured per-role effect, and the reasoning for what is NOT included:
-- docs/SUPABASE_ANON_EXPOSURE_AUDIT.md (round four).
--
-- Predicate is `(select is_internal_user())`, parenthesised, so it is evaluated once
-- per query as an InitPlan rather than once per row. That also fixes a live
-- performance bug: restaurant_trend's per-row can_manage_operations() made the table
-- un-queryable within the statement timeout (50,112 rows).
--
-- Deliberately NOT locked, because the portal app genuinely reads them -- each needs
-- per-client scoping via portal_user_client_ids(), tracked as open work:
--   property_note (3,302 internal notes), dropbox_mapping (3,027), map_layer /
--   map_layer_shape / map_layer_client_share, role, and the enum/label lookups.

BEGIN;

-- Deal / site submit internals
ALTER POLICY "select_attachment"                             ON public.attachment                USING ((select is_internal_user()));
ALTER POLICY "Users can read deal stage history"             ON public.deal_stage_history        USING ((select is_internal_user()));
ALTER POLICY "Authenticated read site_submit_stage_history"  ON public.site_submit_stage_history USING ((select is_internal_user()));
ALTER POLICY "Authenticated write site_submit_stage_history" ON public.site_submit_stage_history USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to deal_rent_schedule" ON public.deal_rent_schedule USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated read client_broker"              ON public.client_broker             USING ((select is_internal_user()));
ALTER POLICY "Authenticated write client_broker"             ON public.client_broker             USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated read pending_client_comment_email"  ON public.pending_client_comment_email USING ((select is_internal_user()));
ALTER POLICY "Authenticated write pending_client_comment_email" ON public.pending_client_comment_email USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));

-- LOI / negotiation
ALTER POLICY "Authenticated users full access to legal_loi_decision"      ON public.legal_loi_decision      USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to legal_loi_round"         ON public.legal_loi_round         USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to legal_loi_session"       ON public.legal_loi_session       USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to legal_playbook"          ON public.legal_playbook          USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to legal_playbook_position" ON public.legal_playbook_position USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to negotiation_logs"        ON public.negotiation_logs        USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to clause_type"             ON public.clause_type             USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to comment_templates"       ON public.comment_templates       USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));

-- Prospecting intel (same class as target / prospecting_target, done in 20260928170000)
ALTER POLICY hunter_contact_enrichment_select ON public.hunter_contact_enrichment USING ((select is_internal_user()));
ALTER POLICY hunter_feedback_select           ON public.hunter_feedback           USING ((select is_internal_user()));
ALTER POLICY hunter_run_log_select            ON public.hunter_run_log            USING ((select is_internal_user()));
ALTER POLICY hunter_signal_select             ON public.hunter_signal             USING ((select is_internal_user()));
ALTER POLICY hunter_source_select             ON public.hunter_source             USING ((select is_internal_user()));

-- Market research
ALTER POLICY research_checklist_item_read     ON public.research_checklist_item     USING ((select is_internal_user()));
ALTER POLICY research_run_read                ON public.research_run                USING ((select is_internal_user()));
ALTER POLICY research_sweep_read              ON public.research_sweep              USING ((select is_internal_user()));
ALTER POLICY research_sweep_chunk_read        ON public.research_sweep_chunk        USING ((select is_internal_user()));
ALTER POLICY research_thread_read             ON public.research_thread             USING ((select is_internal_user()));
ALTER POLICY research_thread_message_read     ON public.research_thread_message     USING ((select is_internal_user()));
ALTER POLICY research_thread_run_read         ON public.research_thread_run         USING ((select is_internal_user()));
ALTER POLICY research_thread_run_step_read    ON public.research_thread_run_step    USING ((select is_internal_user()));
ALTER POLICY research_thread_tool_result_read ON public.research_thread_tool_result USING ((select is_internal_user()));

-- Paid third-party data
ALTER POLICY google_places_api_log_select     ON public.google_places_api_log     USING ((select is_internal_user()));
ALTER POLICY google_places_result_select      ON public.google_places_result      USING ((select is_internal_user()));
ALTER POLICY google_places_saved_query_select ON public.google_places_saved_query USING ((select is_internal_user()));
ALTER POLICY "All authenticated users can read brands"     ON public.merchant_brand         USING ((select is_internal_user()));
ALTER POLICY "All authenticated users can read categories" ON public.merchant_category      USING ((select is_internal_user()));
ALTER POLICY "All authenticated users can read alerts"     ON public.merchant_closure_alert USING ((select is_internal_user()));
ALTER POLICY "All authenticated users can read locations"  ON public.merchant_location      USING ((select is_internal_user()));
ALTER POLICY restaurant_location_select    ON public.restaurant_location    USING ((select is_internal_user()));
ALTER POLICY restaurant_placer_rank_select ON public.restaurant_placer_rank USING ((select is_internal_user()));
ALTER POLICY restaurant_trend_select       ON public.restaurant_trend       USING ((select is_internal_user()));
ALTER POLICY "Allow authenticated read"    ON public.traffic_cache          USING ((select is_internal_user()));
ALTER POLICY "Allow authenticated read"    ON public.esri_data_vintage      USING ((select is_internal_user()));
ALTER POLICY nces_private_school_read      ON public.nces_private_school    USING ((select is_internal_user()));
ALTER POLICY ipeds_institution_read        ON public.ipeds_institution      USING ((select is_internal_user()));
ALTER POLICY boundary_municipality_read    ON public.boundary_municipality  USING ((select is_internal_user()));

-- StreetLight (paid traffic data; 20260928150000 created these as USING (true))
ALTER POLICY streetlight_segment_select           ON public.streetlight_segment           USING ((select is_internal_user()));
ALTER POLICY streetlight_segment_metrics_select   ON public.streetlight_segment_metrics   USING ((select is_internal_user()));
ALTER POLICY streetlight_usage_log_select         ON public.streetlight_usage_log         USING ((select is_internal_user()));
ALTER POLICY streetlight_usage_log_segment_select ON public.streetlight_usage_log_segment USING ((select is_internal_user()));
ALTER POLICY streetlight_quota_config_select      ON public.streetlight_quota_config      USING ((select is_internal_user()));
ALTER POLICY streetlight_user_limit_select        ON public.streetlight_user_limit        USING ((select is_internal_user()));
ALTER POLICY streetlight_backfill_config_select   ON public.streetlight_backfill_config   USING ((select is_internal_user()));
ALTER POLICY streetlight_backfill_progress_select ON public.streetlight_backfill_progress USING ((select is_internal_user()));

-- Finance / ops
ALTER POLICY "Authenticated users can view qb_item" ON public.qb_item USING ((select is_internal_user()));
ALTER POLICY "Anyone can read goals"                ON public.goal    USING ((select is_internal_user()));
ALTER POLICY "Allow all authenticated users to read special_layer" ON public.special_layer USING ((select is_internal_user()));
ALTER POLICY portal_file_visibility_select_all ON public.portal_file_visibility USING ((select is_internal_user()));

-- email_template has TWO SELECT policies: a per-user one ("Users can view own and
-- shared templates") and a blanket one that overrides it, since policies are OR-ed.
-- DROPPING the blanket one is WRONG and was caught in testing: the per-user rule is
-- `created_by = auth.uid() OR is_shared OR admin`, and the two existing templates are
-- admin-created and not flagged shared, so broker_full and va went 2 -> 0. Scope it
-- instead. (That per-user policy also compares `u.id = auth.uid()` rather than
-- auth_user_id, so it likely never matches anyone but admin — left alone.)
ALTER POLICY email_template_select ON public.email_template USING ((select is_internal_user()));

-- Added 2026-10-03: these two arrived from the merchant-regions work AFTER this
-- migration was drafted, with the same `USING (true)` default. Same class as
-- merchant_brand / merchant_location above.
ALTER POLICY "All authenticated users can read region ingest"  ON public.merchant_brand_region_ingest         USING ((select is_internal_user()));
ALTER POLICY "All authenticated users can read reassignments"  ON public.merchant_location_brand_reassignment USING ((select is_internal_user()));

COMMIT;
