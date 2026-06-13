-- Client Portal RLS Policies Migration (v2 - using public schema)
-- Created: January 30, 2026
-- Description: Row Level Security policies for client portal feature

-- ============================================================================
-- CLEANUP: Drop broken policies from v1 attempt
-- ============================================================================

DROP POLICY IF EXISTS "Admins and brokers manage portal client access" ON portal_user_client_access;
DROP POLICY IF EXISTS "Portal users view own client access" ON portal_user_client_access;
DROP POLICY IF EXISTS "Admins and brokers see all comments" ON site_submit_comment;
DROP POLICY IF EXISTS "Portal users see client-visible comments" ON site_submit_comment;
DROP POLICY IF EXISTS "Admins and brokers create comments" ON site_submit_comment;
DROP POLICY IF EXISTS "Portal users create client-visible comments" ON site_submit_comment;
DROP POLICY IF EXISTS "Users update own comments" ON site_submit_comment;
DROP POLICY IF EXISTS "Admins delete comments" ON site_submit_comment;
DROP POLICY IF EXISTS "Users manage own view records" ON portal_site_submit_view;
DROP POLICY IF EXISTS "Admins see all view records" ON portal_site_submit_view;
DROP POLICY IF EXISTS "Admins and brokers see invite logs" ON portal_invite_log;
DROP POLICY IF EXISTS "Admins and brokers create invites" ON portal_invite_log;
DROP POLICY IF EXISTS "Admins update invites" ON portal_invite_log;
DROP POLICY IF EXISTS "Portal users view their site submits" ON site_submit;
DROP POLICY IF EXISTS "Portal users view properties via site submits" ON property;
DROP POLICY IF EXISTS "Portal users view their clients" ON client;
DROP POLICY IF EXISTS "Portal users view submit stages" ON submit_stage;

-- ============================================================================
-- HELPER FUNCTIONS FOR PORTAL ACCESS (in public schema)
-- ============================================================================

-- Function to check if current user is a portal user (client)
CREATE OR REPLACE FUNCTION public.is_portal_user()
RETURNS BOOLEAN AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  -- Find contact by matching email and check portal_access_enabled
  SELECT c.id INTO v_contact_id
  FROM contact c
  JOIN auth.users u ON LOWER(u.email) = LOWER(c.email)
  WHERE u.id = auth.uid()
  AND c.portal_access_enabled = TRUE
  LIMIT 1;

  RETURN v_contact_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get portal user's contact_id
CREATE OR REPLACE FUNCTION public.portal_user_contact_id()
RETURNS UUID AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  SELECT c.id INTO v_contact_id
  FROM contact c
  JOIN auth.users u ON LOWER(u.email) = LOWER(c.email)
  WHERE u.id = auth.uid()
  AND c.portal_access_enabled = TRUE
  LIMIT 1;

  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get list of client_ids a portal user can access
CREATE OR REPLACE FUNCTION public.portal_user_client_ids()
RETURNS UUID[] AS $$
DECLARE
  v_contact_id UUID;
  v_client_ids UUID[];
BEGIN
  v_contact_id := public.portal_user_contact_id();

  IF v_contact_id IS NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;

  SELECT ARRAY_AGG(client_id) INTO v_client_ids
  FROM portal_user_client_access
  WHERE contact_id = v_contact_id
  AND is_active = TRUE;

  RETURN COALESCE(v_client_ids, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if a stage is visible to portal users
CREATE OR REPLACE FUNCTION public.is_portal_visible_stage(p_stage_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_stage_name TEXT;
BEGIN
  SELECT stage_name INTO v_stage_name
  FROM submit_stage
  WHERE id = p_stage_id;

  RETURN v_stage_name IN (
    'Submitted-Reviewing',
    'Pass',
    'Use Declined',
    'Use Conflict',
    'Not Available',
    'Lost / Killed',
    'LOI',
    'At Lease/PSA',
    'Under Contract/Contingent',
    'Store Opened'
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get current user's ovis_role
CREATE OR REPLACE FUNCTION public.get_user_ovis_role()
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT ovis_role INTO v_role
  FROM "user"
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  RETURN COALESCE(v_role, 'unknown');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if user is internal (admin/broker/assistant)
CREATE OR REPLACE FUNCTION public.is_internal_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.get_user_ovis_role() IN ('admin', 'broker_full', 'broker_limited', 'assistant');
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if user can manage portal settings
CREATE OR REPLACE FUNCTION public.can_manage_portal()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.get_user_ovis_role() IN ('admin', 'broker_full');
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 1. PORTAL_USER_CLIENT_ACCESS TABLE RLS
-- ============================================================================

ALTER TABLE portal_user_client_access ENABLE ROW LEVEL SECURITY;

-- Admins and full brokers can do anything
CREATE POLICY "portal_client_access_admin_manage"
ON portal_user_client_access FOR ALL
TO authenticated
USING (public.can_manage_portal())
WITH CHECK (public.can_manage_portal());

-- Portal users can view their own access records
CREATE POLICY "portal_client_access_self_view"
ON portal_user_client_access FOR SELECT
TO authenticated
USING (contact_id = public.portal_user_contact_id());

-- ============================================================================
-- 2. SITE_SUBMIT_COMMENT TABLE RLS
-- ============================================================================

ALTER TABLE site_submit_comment ENABLE ROW LEVEL SECURITY;

-- Internal users can see all comments
CREATE POLICY "comment_internal_view_all"
ON site_submit_comment FOR SELECT
TO authenticated
USING (public.is_internal_user());

-- Portal users can see client-visible comments on their site submits
CREATE POLICY "comment_portal_view_client"
ON site_submit_comment FOR SELECT
TO authenticated
USING (
  public.is_portal_user()
  AND visibility = 'client'
  AND site_submit_id IN (
    SELECT ss.id FROM site_submit ss
    WHERE ss.client_id = ANY(public.portal_user_client_ids())
    AND public.is_portal_visible_stage(ss.submit_stage_id)
  )
);

-- Internal users can create any comments
CREATE POLICY "comment_internal_create"
ON site_submit_comment FOR INSERT
TO authenticated
WITH CHECK (public.is_internal_user());

-- Portal users can create client-visible comments on their site submits
CREATE POLICY "comment_portal_create_client"
ON site_submit_comment FOR INSERT
TO authenticated
WITH CHECK (
  public.is_portal_user()
  AND visibility = 'client'
  AND site_submit_id IN (
    SELECT ss.id FROM site_submit ss
    WHERE ss.client_id = ANY(public.portal_user_client_ids())
    AND public.is_portal_visible_stage(ss.submit_stage_id)
  )
);

-- Users can update their own comments
CREATE POLICY "comment_update_own"
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
-- 3. PORTAL_SITE_SUBMIT_VIEW TABLE RLS
-- ============================================================================

ALTER TABLE portal_site_submit_view ENABLE ROW LEVEL SECURITY;

-- Users can manage their own view records
CREATE POLICY "view_tracking_self_manage"
ON portal_site_submit_view FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Admins can see all view records (for analytics)
CREATE POLICY "view_tracking_admin_view"
ON portal_site_submit_view FOR SELECT
TO authenticated
USING (public.get_user_ovis_role() = 'admin');

-- ============================================================================
-- 4. PORTAL_INVITE_LOG TABLE RLS
-- ============================================================================

ALTER TABLE portal_invite_log ENABLE ROW LEVEL SECURITY;

-- Admins and full brokers can see all invites
CREATE POLICY "invite_log_admin_view"
ON portal_invite_log FOR SELECT
TO authenticated
USING (public.can_manage_portal());

-- Admins and full brokers can create invites
CREATE POLICY "invite_log_admin_create"
ON portal_invite_log FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_portal());

-- Admins can update invite status
CREATE POLICY "invite_log_admin_update"
ON portal_invite_log FOR UPDATE
TO authenticated
USING (public.get_user_ovis_role() = 'admin');

-- ============================================================================
-- 5. SITE_SUBMIT TABLE - ADD PORTAL POLICIES
-- ============================================================================

-- Portal users can view site submits for their clients with visible stages
CREATE POLICY "site_submit_portal_view"
ON site_submit FOR SELECT
TO authenticated
USING (
  public.is_portal_user()
  AND client_id = ANY(public.portal_user_client_ids())
  AND public.is_portal_visible_stage(submit_stage_id)
);

-- ============================================================================
-- 6. PROPERTY TABLE - ADD PORTAL POLICIES
-- ============================================================================

-- Portal users can view properties linked to their site submits
CREATE POLICY "property_portal_view"
ON property FOR SELECT
TO authenticated
USING (
  public.is_portal_user()
  AND id IN (
    SELECT ss.property_id FROM site_submit ss
    WHERE ss.client_id = ANY(public.portal_user_client_ids())
    AND public.is_portal_visible_stage(ss.submit_stage_id)
    AND ss.property_id IS NOT NULL
  )
);

-- ============================================================================
-- 7. CLIENT TABLE - ADD PORTAL POLICIES
-- ============================================================================

-- Portal users can view their associated clients
CREATE POLICY "client_portal_view"
ON client FOR SELECT
TO authenticated
USING (
  public.is_portal_user()
  AND id = ANY(public.portal_user_client_ids())
);

-- ============================================================================
-- 8. SUBMIT_STAGE TABLE - PORTAL ACCESS
-- ============================================================================

-- Portal users can view submit stages (needed for filtering UI)
CREATE POLICY "submit_stage_portal_view"
ON submit_stage FOR SELECT
TO authenticated
USING (public.is_portal_user());

-- ============================================================================
-- GRANT EXECUTE ON NEW FUNCTIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.is_portal_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_user_contact_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_user_client_ids TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_portal_visible_stage TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_ovis_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_internal_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_portal TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
