-- Portal users (clients) must not see municipal project data or prospecting
-- lists at all. Decision taken 2026-09-28.
--
-- These tables all read `USING (true)` for the `authenticated` role, which
-- includes portal logins — so a client with a portal account could read all 350
-- municipal projects and the whole prospecting/target pipeline. The portal UI
-- never asks for them (nothing under src/pages/portal or src/components/portal
-- references these tables), so this closes an API-level hole without changing
-- any portal screen.
--
-- Predicate is is_internal_user(), already the convention on
-- prospecting_activity: ovis_role IN (admin, broker_full, broker_lite, va).
-- It excludes portal logins (no `user` row) and coach, which matches the
-- decision that coach needs no access right now.
--
-- Every view over these tables is already security_invoker (municipal_project_v,
-- v_prospecting_target, v_prospecting_stale_targets, v_prospecting_weekly_metrics,
-- v_prospecting_today_time, v_dismissed_targets, v_hunter_dashboard,
-- v_hunter_outreach_queue, v_hunter_reconnect, discovery_source_taxonomy_gap),
-- so all of them inherit these restrictions — no separate view changes needed.

BEGIN;

-- Municipal project data. Writes are already gated by user_has_municipal_access().
ALTER POLICY municipal_project_read         ON public.municipal_project         USING (is_internal_user());
ALTER POLICY municipal_project_staging_read ON public.municipal_project_staging USING (is_internal_user());
ALTER POLICY municipal_import_read          ON public.municipal_import          USING (is_internal_user());
ALTER POLICY municipality_read              ON public.municipality              USING (is_internal_user());
ALTER POLICY municipality_stage_mapping_read ON public.municipality_stage_mapping USING (is_internal_user());

-- Prospecting lists. Reads AND writes were wide open to any authenticated role.
ALTER POLICY "Allow all authenticated users to read prospecting_target"   ON public.prospecting_target USING (is_internal_user());
ALTER POLICY "Allow all authenticated users to update prospecting_target" ON public.prospecting_target USING (is_internal_user());
ALTER POLICY "Allow all authenticated users to delete prospecting_target" ON public.prospecting_target USING (is_internal_user());
ALTER POLICY "Allow all authenticated users to insert prospecting_target" ON public.prospecting_target WITH CHECK (is_internal_user());

ALTER POLICY prospecting_note_select ON public.prospecting_note USING (is_internal_user());

-- target / target_signal are the Hunter prospecting pipeline, same exposure.
ALTER POLICY target_select ON public.target USING (is_internal_user());
ALTER POLICY target_update ON public.target USING (is_internal_user());
ALTER POLICY target_delete ON public.target USING (is_internal_user());
ALTER POLICY target_insert ON public.target WITH CHECK (is_internal_user());

ALTER POLICY target_signal_select ON public.target_signal USING (is_internal_user());
ALTER POLICY target_signal_update ON public.target_signal USING (is_internal_user());
ALTER POLICY target_signal_delete ON public.target_signal USING (is_internal_user());
ALTER POLICY target_signal_insert ON public.target_signal WITH CHECK (is_internal_user());

COMMIT;

-- Edge functions are unaffected: they use the secret key (service_role), which
-- bypasses RLS entirely.
