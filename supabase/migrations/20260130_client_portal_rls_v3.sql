-- Client Portal RLS Policies Migration (v3 - OPTIMIZED)
-- Created: January 30, 2026
-- Description: Performance-optimized RLS policies for client portal
--
-- KEY CHANGES FROM v2:
-- - Uses EXISTS subqueries instead of per-row function calls
-- - Inline stage name checks to avoid function overhead
-- - PostgreSQL can optimize EXISTS with proper index usage
-- - Policies on main tables (site_submit, property, client) use efficient joins

-- ============================================================================
-- CLEANUP: Drop v2 policies that caused performance issues
-- ============================================================================

-- Portal-specific table policies (these were okay, but dropping to recreate cleaner versions)
DROP POLICY IF EXISTS "portal_client_access_admin_manage" ON portal_user_client_access;
DROP POLICY IF EXISTS "portal_client_access_self_view" ON portal_user_client_access;
DROP POLICY IF EXISTS "comment_internal_view_all" ON site_submit_comment;
DROP POLICY IF EXISTS "comment_portal_view_client" ON site_submit_comment;
DROP POLICY IF EXISTS "comment_internal_create" ON site_submit_comment;
DROP POLICY IF EXISTS "comment_portal_create_client" ON site_submit_comment;
DROP POLICY IF EXISTS "comment_update_own" ON site_submit_comment;
DROP POLICY IF EXISTS "comment_admin_delete" ON site_submit_comment;
DROP POLICY IF EXISTS "view_tracking_self_manage" ON portal_site_submit_view;
DROP POLICY IF EXISTS "view_tracking_admin_view" ON portal_site_submit_view;
DROP POLICY IF EXISTS "invite_log_admin_view" ON portal_invite_log;
DROP POLICY IF EXISTS "invite_log_admin_create" ON portal_invite_log;
DROP POLICY IF EXISTS "invite_log_admin_update" ON portal_invite_log;

-- Main table policies (these caused the timeout issues)
DROP POLICY IF EXISTS "site_submit_portal_view" ON site_submit;
DROP POLICY IF EXISTS "property_portal_view" ON property;
DROP POLICY IF EXISTS "client_portal_view" ON client;
DROP POLICY IF EXISTS "submit_stage_portal_view" ON submit_stage;

-- ============================================================================
-- HELPER FUNCTIONS (keep these but ensure they're efficient)
-- ============================================================================

-- Function to get current user's ovis_role (simple, single row lookup)
CREATE OR REPLACE FUNCTION public.get_user_ovis_role()
RETURNS TEXT AS $$
  SELECT COALESCE(ovis_role, 'unknown')
  FROM "user"
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Function to check if user is internal (admin/broker/assistant)
-- Using SQL function for better inlining
CREATE OR REPLACE FUNCTION public.is_internal_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM "user"
    WHERE auth_user_id = auth.uid()
    AND ovis_role IN ('admin', 'broker_full', 'broker_limited', 'assistant')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Function to check if user can manage portal settings
CREATE OR REPLACE FUNCTION public.can_manage_portal()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM "user"
    WHERE auth_user_id = auth.uid()
    AND ovis_role IN ('admin', 'broker_full')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Function to get portal user's contact_id (returns NULL for non-portal users)
CREATE OR REPLACE FUNCTION public.portal_user_contact_id()
RETURNS UUID AS $$
  SELECT c.id
  FROM contact c
  JOIN auth.users u ON LOWER(u.email) = LOWER(c.email)
  WHERE u.id = auth.uid()
  AND c.portal_access_enabled = TRUE
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Function to check if current user is a portal user
CREATE OR REPLACE FUNCTION public.is_portal_user()
RETURNS BOOLEAN AS $$
  SELECT public.portal_user_contact_id() IS NOT NULL;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- INDEXES: Ensure we have indexes for RLS performance
-- ============================================================================

-- Index for looking up user by auth_user_id
CREATE INDEX IF NOT EXISTS idx_user_auth_user_id ON "user"(auth_user_id);

-- Index for contact email lookups
CREATE INDEX IF NOT EXISTS idx_contact_email_lower ON contact(LOWER(email));

-- Index for portal_user_client_access lookups
CREATE INDEX IF NOT EXISTS idx_portal_user_client_access_contact ON portal_user_client_access(contact_id, is_active);
CREATE INDEX IF NOT EXISTS idx_portal_user_client_access_client ON portal_user_client_access(client_id, is_active);

-- Index for site_submit client filtering
CREATE INDEX IF NOT EXISTS idx_site_submit_client_id ON site_submit(client_id);

-- Index for submit_stage name lookups
CREATE INDEX IF NOT EXISTS idx_submit_stage_name ON submit_stage(name);

-- ============================================================================
-- 1. PORTAL_USER_CLIENT_ACCESS TABLE RLS
-- ============================================================================

ALTER TABLE portal_user_client_access ENABLE ROW LEVEL SECURITY;

-- Admins and full brokers can do anything
CREATE POLICY "portal_access_admin_all"
ON portal_user_client_access FOR ALL
TO authenticated
USING (public.can_manage_portal())
WITH CHECK (public.can_manage_portal());

-- Portal users can view their own access records
CREATE POLICY "portal_access_self_select"
ON portal_user_client_access FOR SELECT
TO authenticated
USING (contact_id = public.portal_user_contact_id());

-- ============================================================================
-- 2. SITE_SUBMIT_COMMENT TABLE RLS
-- ============================================================================

ALTER TABLE site_submit_comment ENABLE ROW LEVEL SECURITY;

-- Internal users can see all comments
CREATE POLICY "comment_internal_select"
ON site_submit_comment FOR SELECT
TO authenticated
USING (public.is_internal_user());

-- Portal users can see client-visible comments on their accessible site submits
-- Uses EXISTS for efficient evaluation
CREATE POLICY "comment_portal_select"
ON site_submit_comment FOR SELECT
TO authenticated
USING (
  visibility = 'client'
  AND EXISTS (
    SELECT 1
    FROM site_submit ss
    JOIN submit_stage st ON st.id = ss.submit_stage_id
    JOIN portal_user_client_access puca ON puca.client_id = ss.client_id AND puca.is_active = TRUE
    JOIN contact c ON c.id = puca.contact_id AND c.portal_access_enabled = TRUE
    JOIN auth.users au ON LOWER(au.email) = LOWER(c.email) AND au.id = auth.uid()
    WHERE ss.id = site_submit_comment.site_submit_id
    AND st.name IN (
      'Submitted-Reviewing', 'Pass', 'Use Declined', 'Use Conflict',
      'Not Available', 'Lost / Killed', 'LOI', 'At Lease/PSA',
      'Under Contract/Contingent', 'Store Opened'
    )
  )
);

-- Internal users can create any comments
CREATE POLICY "comment_internal_insert"
ON site_submit_comment FOR INSERT
TO authenticated
WITH CHECK (public.is_internal_user());

-- Portal users can create client-visible comments on their site submits
CREATE POLICY "comment_portal_insert"
ON site_submit_comment FOR INSERT
TO authenticated
WITH CHECK (
  visibility = 'client'
  AND EXISTS (
    SELECT 1
    FROM site_submit ss
    JOIN submit_stage st ON st.id = ss.submit_stage_id
    JOIN portal_user_client_access puca ON puca.client_id = ss.client_id AND puca.is_active = TRUE
    JOIN contact c ON c.id = puca.contact_id AND c.portal_access_enabled = TRUE
    JOIN auth.users au ON LOWER(au.email) = LOWER(c.email) AND au.id = auth.uid()
    WHERE ss.id = site_submit_comment.site_submit_id
    AND st.name IN (
      'Submitted-Reviewing', 'Pass', 'Use Declined', 'Use Conflict',
      'Not Available', 'Lost / Killed', 'LOI', 'At Lease/PSA',
      'Under Contract/Contingent', 'Store Opened'
    )
  )
);

-- Users can update their own comments
CREATE POLICY "comment_self_update"
ON site_submit_comment FOR UPDATE
TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

-- Only admins can delete comments
CREATE POLICY "comment_admin_delete"
ON site_submit_comment FOR DELETE
TO authenticated
USING (public.get_user_ovis_role() = 'admin');

-- ============================================================================
-- 3. PORTAL_SITE_SUBMIT_VIEW TABLE RLS (read tracking)
-- ============================================================================

ALTER TABLE portal_site_submit_view ENABLE ROW LEVEL SECURITY;

-- Users can manage their own view records (simple auth.uid() check - very fast)
CREATE POLICY "view_self_all"
ON portal_site_submit_view FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Admins can see all view records (for analytics)
CREATE POLICY "view_admin_select"
ON portal_site_submit_view FOR SELECT
TO authenticated
USING (public.get_user_ovis_role() = 'admin');

-- ============================================================================
-- 4. PORTAL_INVITE_LOG TABLE RLS
-- ============================================================================

ALTER TABLE portal_invite_log ENABLE ROW LEVEL SECURITY;

-- Admins and full brokers can see all invites
CREATE POLICY "invite_admin_select"
ON portal_invite_log FOR SELECT
TO authenticated
USING (public.can_manage_portal());

-- Admins and full brokers can create invites
CREATE POLICY "invite_admin_insert"
ON portal_invite_log FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_portal());

-- Admins can update invite status
CREATE POLICY "invite_admin_update"
ON portal_invite_log FOR UPDATE
TO authenticated
USING (public.get_user_ovis_role() = 'admin');

-- ============================================================================
-- 5. SITE_SUBMIT TABLE - PORTAL VIEW POLICY
--
-- IMPORTANT: This policy is an ADDITIONAL policy (OR'd with existing ones)
-- Uses efficient EXISTS pattern instead of function calls per row
-- ============================================================================

CREATE POLICY "site_submit_portal_select"
ON site_submit FOR SELECT
TO authenticated
USING (
  -- Check if user has portal access to this specific client_id
  EXISTS (
    SELECT 1
    FROM portal_user_client_access puca
    JOIN contact c ON c.id = puca.contact_id AND c.portal_access_enabled = TRUE
    JOIN auth.users au ON LOWER(au.email) = LOWER(c.email)
    WHERE au.id = auth.uid()
    AND puca.client_id = site_submit.client_id
    AND puca.is_active = TRUE
  )
  -- AND stage is visible to portal users
  AND EXISTS (
    SELECT 1 FROM submit_stage st
    WHERE st.id = site_submit.submit_stage_id
    AND st.name IN (
      'Submitted-Reviewing', 'Pass', 'Use Declined', 'Use Conflict',
      'Not Available', 'Lost / Killed', 'LOI', 'At Lease/PSA',
      'Under Contract/Contingent', 'Store Opened'
    )
  )
);

-- ============================================================================
-- 6. PROPERTY TABLE - PORTAL VIEW POLICY
--
-- Portal users can view properties linked to site_submits they can access
-- ============================================================================

CREATE POLICY "property_portal_select"
ON property FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM site_submit ss
    JOIN submit_stage st ON st.id = ss.submit_stage_id
    JOIN portal_user_client_access puca ON puca.client_id = ss.client_id AND puca.is_active = TRUE
    JOIN contact c ON c.id = puca.contact_id AND c.portal_access_enabled = TRUE
    JOIN auth.users au ON LOWER(au.email) = LOWER(c.email)
    WHERE au.id = auth.uid()
    AND ss.property_id = property.id
    AND st.name IN (
      'Submitted-Reviewing', 'Pass', 'Use Declined', 'Use Conflict',
      'Not Available', 'Lost / Killed', 'LOI', 'At Lease/PSA',
      'Under Contract/Contingent', 'Store Opened'
    )
  )
);

-- ============================================================================
-- 7. CLIENT TABLE - PORTAL VIEW POLICY
--
-- Portal users can view clients they have access to
-- ============================================================================

CREATE POLICY "client_portal_select"
ON client FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM portal_user_client_access puca
    JOIN contact c ON c.id = puca.contact_id AND c.portal_access_enabled = TRUE
    JOIN auth.users au ON LOWER(au.email) = LOWER(c.email)
    WHERE au.id = auth.uid()
    AND puca.client_id = client.id
    AND puca.is_active = TRUE
  )
);

-- ============================================================================
-- 8. SUBMIT_STAGE TABLE - PORTAL VIEW POLICY
--
-- Portal users need to see submit stages for UI filtering
-- This is a small table so a simple is_portal_user() check is acceptable
-- ============================================================================

CREATE POLICY "submit_stage_portal_select"
ON submit_stage FOR SELECT
TO authenticated
USING (public.is_portal_user());

-- ============================================================================
-- GRANT EXECUTE ON FUNCTIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.is_portal_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_user_contact_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_ovis_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_internal_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_portal TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
