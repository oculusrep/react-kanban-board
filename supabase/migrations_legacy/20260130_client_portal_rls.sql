-- Client Portal RLS Policies Migration
-- Created: January 30, 2026
-- Description: Row Level Security policies for client portal feature

-- ============================================================================
-- HELPER FUNCTIONS FOR PORTAL ACCESS
-- ============================================================================

-- Function to check if current user is a portal user (client)
CREATE OR REPLACE FUNCTION auth.is_portal_user()
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
CREATE OR REPLACE FUNCTION auth.portal_user_contact_id()
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
CREATE OR REPLACE FUNCTION auth.portal_user_client_ids()
RETURNS UUID[] AS $$
DECLARE
  v_contact_id UUID;
  v_client_ids UUID[];
BEGIN
  v_contact_id := auth.portal_user_contact_id();

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
CREATE OR REPLACE FUNCTION is_portal_visible_stage(p_stage_id UUID)
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

-- ============================================================================
-- 1. PORTAL_USER_CLIENT_ACCESS TABLE RLS
-- ============================================================================

ALTER TABLE portal_user_client_access ENABLE ROW LEVEL SECURITY;

-- Admins and full brokers can do anything
CREATE POLICY "Admins and brokers manage portal client access"
ON portal_user_client_access FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role IN ('admin', 'broker_full')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role IN ('admin', 'broker_full')
  )
);

-- Portal users can view their own access records
CREATE POLICY "Portal users view own client access"
ON portal_user_client_access FOR SELECT
TO authenticated
USING (
  contact_id = auth.portal_user_contact_id()
);

-- ============================================================================
-- 2. SITE_SUBMIT_COMMENT TABLE RLS
-- ============================================================================

ALTER TABLE site_submit_comment ENABLE ROW LEVEL SECURITY;

-- Admins and brokers can see all comments
CREATE POLICY "Admins and brokers see all comments"
ON site_submit_comment FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role IN ('admin', 'broker_full', 'broker_limited', 'assistant')
  )
);

-- Portal users can see client-visible comments on their site submits
CREATE POLICY "Portal users see client-visible comments"
ON site_submit_comment FOR SELECT
TO authenticated
USING (
  auth.is_portal_user()
  AND visibility = 'client'
  AND site_submit_id IN (
    SELECT ss.id FROM site_submit ss
    WHERE ss.client_id = ANY(auth.portal_user_client_ids())
    AND is_portal_visible_stage(ss.submit_stage_id)
  )
);

-- Admins and brokers can create any comments
CREATE POLICY "Admins and brokers create comments"
ON site_submit_comment FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role IN ('admin', 'broker_full', 'broker_limited')
  )
);

-- Portal users can create client-visible comments on their site submits
CREATE POLICY "Portal users create client-visible comments"
ON site_submit_comment FOR INSERT
TO authenticated
WITH CHECK (
  auth.is_portal_user()
  AND visibility = 'client'
  AND site_submit_id IN (
    SELECT ss.id FROM site_submit ss
    WHERE ss.client_id = ANY(auth.portal_user_client_ids())
    AND is_portal_visible_stage(ss.submit_stage_id)
  )
);

-- Users can update their own comments
CREATE POLICY "Users update own comments"
ON site_submit_comment FOR UPDATE
TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

-- Only admins can delete comments
CREATE POLICY "Admins delete comments"
ON site_submit_comment FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role = 'admin'
  )
);

-- ============================================================================
-- 3. PORTAL_SITE_SUBMIT_VIEW TABLE RLS
-- ============================================================================

ALTER TABLE portal_site_submit_view ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own view records
CREATE POLICY "Users manage own view records"
ON portal_site_submit_view FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Admins can see all view records (for analytics)
CREATE POLICY "Admins see all view records"
ON portal_site_submit_view FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role = 'admin'
  )
);

-- ============================================================================
-- 4. PORTAL_INVITE_LOG TABLE RLS
-- ============================================================================

ALTER TABLE portal_invite_log ENABLE ROW LEVEL SECURITY;

-- Admins and full brokers can see all invites
CREATE POLICY "Admins and brokers see invite logs"
ON portal_invite_log FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role IN ('admin', 'broker_full')
  )
);

-- Admins and full brokers can create invites
CREATE POLICY "Admins and brokers create invites"
ON portal_invite_log FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role IN ('admin', 'broker_full')
  )
);

-- Admins can update invite status
CREATE POLICY "Admins update invites"
ON portal_invite_log FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role = 'admin'
  )
);

-- ============================================================================
-- 5. SITE_SUBMIT TABLE - ADD PORTAL POLICIES
-- ============================================================================

-- Portal users can view site submits for their clients with visible stages
CREATE POLICY "Portal users view their site submits"
ON site_submit FOR SELECT
TO authenticated
USING (
  -- Existing access for internal users is handled by other policies
  -- This adds access for portal users
  auth.is_portal_user()
  AND client_id = ANY(auth.portal_user_client_ids())
  AND is_portal_visible_stage(submit_stage_id)
);

-- ============================================================================
-- 6. PROPERTY TABLE - ADD PORTAL POLICIES
-- ============================================================================

-- Portal users can view properties linked to their site submits
CREATE POLICY "Portal users view properties via site submits"
ON property FOR SELECT
TO authenticated
USING (
  auth.is_portal_user()
  AND id IN (
    SELECT ss.property_id FROM site_submit ss
    WHERE ss.client_id = ANY(auth.portal_user_client_ids())
    AND is_portal_visible_stage(ss.submit_stage_id)
    AND ss.property_id IS NOT NULL
  )
);

-- ============================================================================
-- 7. CLIENT TABLE - ADD PORTAL POLICIES
-- ============================================================================

-- Portal users can view their associated clients
CREATE POLICY "Portal users view their clients"
ON client FOR SELECT
TO authenticated
USING (
  auth.is_portal_user()
  AND id = ANY(auth.portal_user_client_ids())
);

-- ============================================================================
-- 8. SUBMIT_STAGE TABLE - PORTAL ACCESS
-- ============================================================================

-- Portal users can view submit stages (needed for filtering UI)
CREATE POLICY "Portal users view submit stages"
ON submit_stage FOR SELECT
TO authenticated
USING (
  auth.is_portal_user()
);

-- ============================================================================
-- GRANT EXECUTE ON NEW FUNCTIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION auth.is_portal_user TO authenticated;
GRANT EXECUTE ON FUNCTION auth.portal_user_contact_id TO authenticated;
GRANT EXECUTE ON FUNCTION auth.portal_user_client_ids TO authenticated;
GRANT EXECUTE ON FUNCTION is_portal_visible_stage TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
