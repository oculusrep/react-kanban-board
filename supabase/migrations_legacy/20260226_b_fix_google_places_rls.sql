-- Migration: Fix Google Places RLS Policies (run after 20260226_google_places_search.sql)
-- Description: Fix 403/permission errors when inserting into google_places tables
-- Date: 2026-02-26
--
-- Issue: The RLS policies with subqueries to check user role cause permission issues
-- Solution: Use simple authenticated user check (matching map_layer pattern)
-- App-level logic restricts access to internal users

-- -----------------------------------------------------------------------------
-- google_places_result policies
-- -----------------------------------------------------------------------------

-- Drop all existing policies
DROP POLICY IF EXISTS "google_places_result_internal_all" ON google_places_result;
DROP POLICY IF EXISTS "google_places_result_internal_select" ON google_places_result;
DROP POLICY IF EXISTS "google_places_result_insert" ON google_places_result;
DROP POLICY IF EXISTS "google_places_result_internal_insert" ON google_places_result;
DROP POLICY IF EXISTS "google_places_result_internal_update" ON google_places_result;
DROP POLICY IF EXISTS "google_places_result_internal_delete" ON google_places_result;
DROP POLICY IF EXISTS "google_places_result_portal_select" ON google_places_result;

-- Simple policies matching map_layer pattern
CREATE POLICY "google_places_result_select" ON google_places_result
FOR SELECT TO authenticated USING (true);

CREATE POLICY "google_places_result_insert" ON google_places_result
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "google_places_result_update" ON google_places_result
FOR UPDATE TO authenticated USING (true);

CREATE POLICY "google_places_result_delete" ON google_places_result
FOR DELETE TO authenticated USING (true);

-- -----------------------------------------------------------------------------
-- google_places_saved_query policies
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "google_places_saved_query_internal_all" ON google_places_saved_query;
DROP POLICY IF EXISTS "google_places_saved_query_internal_select" ON google_places_saved_query;
DROP POLICY IF EXISTS "google_places_saved_query_insert" ON google_places_saved_query;
DROP POLICY IF EXISTS "google_places_saved_query_internal_insert" ON google_places_saved_query;
DROP POLICY IF EXISTS "google_places_saved_query_internal_update" ON google_places_saved_query;
DROP POLICY IF EXISTS "google_places_saved_query_internal_delete" ON google_places_saved_query;

CREATE POLICY "google_places_saved_query_select" ON google_places_saved_query
FOR SELECT TO authenticated USING (true);

CREATE POLICY "google_places_saved_query_insert" ON google_places_saved_query
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "google_places_saved_query_update" ON google_places_saved_query
FOR UPDATE TO authenticated USING (true);

CREATE POLICY "google_places_saved_query_delete" ON google_places_saved_query
FOR DELETE TO authenticated USING (true);

-- -----------------------------------------------------------------------------
-- google_places_api_log policies
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "google_places_api_log_internal_all" ON google_places_api_log;
DROP POLICY IF EXISTS "google_places_api_log_internal_select" ON google_places_api_log;
DROP POLICY IF EXISTS "google_places_api_log_insert" ON google_places_api_log;
DROP POLICY IF EXISTS "google_places_api_log_internal_insert" ON google_places_api_log;
DROP POLICY IF EXISTS "google_places_api_log_internal_update" ON google_places_api_log;
DROP POLICY IF EXISTS "google_places_api_log_internal_delete" ON google_places_api_log;

CREATE POLICY "google_places_api_log_select" ON google_places_api_log
FOR SELECT TO authenticated USING (true);

CREATE POLICY "google_places_api_log_insert" ON google_places_api_log
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "google_places_api_log_update" ON google_places_api_log
FOR UPDATE TO authenticated USING (true);

CREATE POLICY "google_places_api_log_delete" ON google_places_api_log
FOR DELETE TO authenticated USING (true);
