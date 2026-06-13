-- Migration: Fix Supabase Security Linter Issues
-- Description: Address security warnings from Supabase database linter
-- Date: 2026-02-25
--
-- Issues addressed:
-- 1. auth_users_exposed: v_dismissed_targets was querying auth.users directly
-- 2. rls_disabled_in_public: qb_item table had no RLS enabled
--
-- The SECURITY DEFINER views are intentional for internal dashboards and
-- are not addressed here as they are by design for aggregating data.

-- ============================================================================
-- Issue 1: auth_users_exposed - v_dismissed_targets
-- ============================================================================
-- Problem: The view was using a subquery to auth.users to get the dismisser's email.
--          This exposes auth.users data to authenticated/anon roles.
-- Solution: Join to the public.user table instead, which has the email field
--           and is properly protected by RLS.
-- Note: Must DROP and recreate due to column type change (varchar -> text)

DROP VIEW IF EXISTS v_dismissed_targets;

CREATE VIEW v_dismissed_targets AS
SELECT
  t.id,
  t.concept_name,
  t.industry_segment,
  t.signal_strength,
  t.target_geography,
  t.website,
  t.dismiss_reason,
  t.dismiss_note,
  t.dismissed_at,
  t.dismissed_by,
  t.first_seen_at,
  t.last_signal_at,
  t.source,

  -- Dismisser info - now using public.user table instead of auth.users
  u.email AS dismissed_by_email,

  -- Signal count
  (SELECT COUNT(*) FROM target_signal ts WHERE ts.target_id = t.id) AS signal_count,

  -- Linked contacts count
  (SELECT COUNT(*) FROM contact con WHERE con.target_id = t.id) AS linked_contacts_count

FROM target t
LEFT JOIN "user" u ON u.id = t.dismissed_by
WHERE t.status = 'dismissed'
ORDER BY t.dismissed_at DESC;

-- Add comment documenting the security consideration
COMMENT ON VIEW v_dismissed_targets IS 'View of dismissed targets with dismisser info. Uses public.user table instead of auth.users to avoid exposing auth data.';

-- ============================================================================
-- Issue 2: rls_disabled_in_public - qb_item
-- ============================================================================
-- Problem: The qb_item table (QuickBooks items) has no RLS enabled.
-- Solution: Enable RLS and create policies for authenticated users.
--           This is internal data that all authenticated users should be able to view.

-- Enable RLS on qb_item
ALTER TABLE qb_item ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view all QuickBooks items
CREATE POLICY "Authenticated users can view qb_item"
  ON qb_item
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert QuickBooks items (for sync)
CREATE POLICY "Authenticated users can insert qb_item"
  ON qb_item
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update QuickBooks items (for sync)
CREATE POLICY "Authenticated users can update qb_item"
  ON qb_item
  FOR UPDATE
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to delete QuickBooks items
CREATE POLICY "Authenticated users can delete qb_item"
  ON qb_item
  FOR DELETE
  TO authenticated
  USING (true);

-- Add comment documenting the table
COMMENT ON TABLE qb_item IS 'QuickBooks item/product sync table. RLS enabled - all authenticated users have full access for sync operations.';

-- ============================================================================
-- Documentation: SECURITY DEFINER views (not changed - intentional design)
-- ============================================================================
-- The following views use SECURITY DEFINER intentionally:
--
-- - v_prospecting_weekly_metrics: Aggregates prospecting data across all users
-- - v_prospecting_target: Complex target view with joined data
-- - v_prospecting_today_time: Today's time tracking metrics
-- - v_hunter_dashboard: Hunter agent dashboard aggregations
-- - portal_site_submit_status: Portal status view (needs elevated access)
-- - budget_vs_actual_monthly: Financial reporting aggregations
-- - deal_current_stage_info: Deal stage information
-- - v_prospecting_stale_targets: Stale target identification
-- - v_hunter_reconnect: Hunter reconnection logic
-- - v_prospecting_daily_metrics: Daily metrics aggregations
-- - portal_user_analytics: Portal analytics (needs elevated access)
-- - budget_vs_actual: Budget comparison data
-- - invoice_aging: Invoice aging report
-- - v_hunter_outreach_queue: Hunter outreach queue
--
-- These views are used for internal dashboards and reporting where the view
-- needs to aggregate data that the querying user might not have direct access to.
-- The SECURITY DEFINER property is intentional to bypass RLS for these specific
-- read-only aggregation use cases.
--
-- Security consideration: These views should NOT expose sensitive data like
-- passwords, tokens, or PII that shouldn't be accessible to authenticated users.
-- They are acceptable because:
-- 1. They are read-only views
-- 2. They only expose business data that authenticated users should see
-- 3. They don't query auth.users or other sensitive system tables
