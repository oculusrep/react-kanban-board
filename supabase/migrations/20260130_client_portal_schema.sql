-- Client Portal Schema Migration
-- Created: January 30, 2026
-- Description: Add tables and columns for the client portal feature

-- ============================================================================
-- 1. MODIFY CONTACT TABLE - Add portal access fields
-- ============================================================================

ALTER TABLE contact
ADD COLUMN IF NOT EXISTS portal_access_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE contact
ADD COLUMN IF NOT EXISTS portal_invite_status VARCHAR(20) DEFAULT 'not_sent'
CHECK (portal_invite_status IN ('not_sent', 'pending', 'accepted'));

ALTER TABLE contact
ADD COLUMN IF NOT EXISTS portal_invite_sent_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE contact
ADD COLUMN IF NOT EXISTS portal_invite_token VARCHAR(255);

ALTER TABLE contact
ADD COLUMN IF NOT EXISTS portal_invite_expires_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE contact
ADD COLUMN IF NOT EXISTS portal_last_login_at TIMESTAMP WITH TIME ZONE;

-- Index for finding portal-enabled contacts
CREATE INDEX IF NOT EXISTS idx_contact_portal_access
ON contact(portal_access_enabled) WHERE portal_access_enabled = TRUE;

-- Index for invite token lookup
CREATE INDEX IF NOT EXISTS idx_contact_portal_invite_token
ON contact(portal_invite_token) WHERE portal_invite_token IS NOT NULL;

-- ============================================================================
-- 2. MODIFY CLIENT TABLE - Add logo field
-- ============================================================================

ALTER TABLE client
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- ============================================================================
-- 3. CREATE PORTAL USER CLIENT ACCESS TABLE
-- ============================================================================
-- Explicit grants for which clients a portal user can access
-- This allows overriding the default contact_client_relation

CREATE TABLE IF NOT EXISTS portal_user_client_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  granted_by_id UUID REFERENCES auth.users(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(contact_id, client_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_portal_user_client_access_contact
ON portal_user_client_access(contact_id);

CREATE INDEX IF NOT EXISTS idx_portal_user_client_access_client
ON portal_user_client_access(client_id);

CREATE INDEX IF NOT EXISTS idx_portal_user_client_access_active
ON portal_user_client_access(contact_id, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- 4. CREATE SITE SUBMIT COMMENT TABLE
-- ============================================================================
-- Two-tier comment system: internal (broker-only) and client-visible

CREATE TABLE IF NOT EXISTS site_submit_comment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_submit_id UUID NOT NULL REFERENCES site_submit(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  visibility VARCHAR(20) NOT NULL DEFAULT 'client'
    CHECK (visibility IN ('internal', 'client')),
  is_edited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by_id UUID REFERENCES auth.users(id),
  CONSTRAINT content_not_empty CHECK (char_length(trim(content)) > 0)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_site_submit_comment_site_submit
ON site_submit_comment(site_submit_id);

CREATE INDEX IF NOT EXISTS idx_site_submit_comment_author
ON site_submit_comment(author_id);

CREATE INDEX IF NOT EXISTS idx_site_submit_comment_visibility
ON site_submit_comment(site_submit_id, visibility);

CREATE INDEX IF NOT EXISTS idx_site_submit_comment_created
ON site_submit_comment(site_submit_id, created_at DESC);

-- ============================================================================
-- 5. CREATE PORTAL SITE SUBMIT VIEW TRACKING TABLE
-- ============================================================================
-- Track when each user last viewed each site submit for read/unread status

CREATE TABLE IF NOT EXISTS portal_site_submit_view (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_submit_id UUID NOT NULL REFERENCES site_submit(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  view_count INTEGER DEFAULT 1,
  first_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, site_submit_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_portal_site_submit_view_user
ON portal_site_submit_view(user_id);

CREATE INDEX IF NOT EXISTS idx_portal_site_submit_view_site_submit
ON portal_site_submit_view(site_submit_id);

CREATE INDEX IF NOT EXISTS idx_portal_site_submit_view_last_viewed
ON portal_site_submit_view(user_id, last_viewed_at DESC);

-- ============================================================================
-- 6. CREATE PORTAL INVITE LOG TABLE (for audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_invite_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  invited_by_id UUID REFERENCES auth.users(id),
  invite_email TEXT NOT NULL,
  invite_token VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'sent'
    CHECK (status IN ('sent', 'accepted', 'expired', 'revoked')),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for finding invites by contact
CREATE INDEX IF NOT EXISTS idx_portal_invite_log_contact
ON portal_invite_log(contact_id);

-- Index for token lookup
CREATE INDEX IF NOT EXISTS idx_portal_invite_log_token
ON portal_invite_log(invite_token);

-- ============================================================================
-- 7. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for site_submit_comment
DROP TRIGGER IF EXISTS update_site_submit_comment_updated_at ON site_submit_comment;
CREATE TRIGGER update_site_submit_comment_updated_at
  BEFORE UPDATE ON site_submit_comment
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for portal_user_client_access
DROP TRIGGER IF EXISTS update_portal_user_client_access_updated_at ON portal_user_client_access;
CREATE TRIGGER update_portal_user_client_access_updated_at
  BEFORE UPDATE ON portal_user_client_access
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. FUNCTION TO CHECK IF USER HAS PORTAL ACCESS TO A CLIENT
-- ============================================================================

CREATE OR REPLACE FUNCTION user_has_portal_client_access(
  p_user_id UUID,
  p_client_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_contact_id UUID;
  v_has_access BOOLEAN;
BEGIN
  -- Get contact_id for this user (user email should match contact email)
  SELECT c.id INTO v_contact_id
  FROM contact c
  JOIN auth.users u ON LOWER(u.email) = LOWER(c.email)
  WHERE u.id = p_user_id
  AND c.portal_access_enabled = TRUE
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if contact has explicit access to this client
  SELECT EXISTS (
    SELECT 1 FROM portal_user_client_access
    WHERE contact_id = v_contact_id
    AND client_id = p_client_id
    AND is_active = TRUE
  ) INTO v_has_access;

  RETURN v_has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. FUNCTION TO GET ALL CLIENTS A PORTAL USER CAN ACCESS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_portal_user_clients(p_user_id UUID)
RETURNS TABLE (
  client_id UUID,
  client_name TEXT
) AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  -- Get contact_id for this user
  SELECT c.id INTO v_contact_id
  FROM contact c
  JOIN auth.users u ON LOWER(u.email) = LOWER(c.email)
  WHERE u.id = p_user_id
  AND c.portal_access_enabled = TRUE
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    RETURN;
  END IF;

  -- Return all clients this contact has access to
  RETURN QUERY
  SELECT cl.id, cl.client_name
  FROM client cl
  JOIN portal_user_client_access puca ON puca.client_id = cl.id
  WHERE puca.contact_id = v_contact_id
  AND puca.is_active = TRUE
  AND cl.is_active_client = TRUE
  ORDER BY cl.client_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. FUNCTION TO RECORD SITE SUBMIT VIEW
-- ============================================================================

CREATE OR REPLACE FUNCTION record_portal_site_submit_view(
  p_user_id UUID,
  p_site_submit_id UUID
) RETURNS VOID AS $$
BEGIN
  INSERT INTO portal_site_submit_view (user_id, site_submit_id, last_viewed_at, view_count)
  VALUES (p_user_id, p_site_submit_id, NOW(), 1)
  ON CONFLICT (user_id, site_submit_id)
  DO UPDATE SET
    last_viewed_at = NOW(),
    view_count = portal_site_submit_view.view_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 11. VIEW FOR PORTAL SITE SUBMITS WITH UNREAD STATUS
-- ============================================================================
-- This view helps determine which site submits have unread activity for a user

CREATE OR REPLACE VIEW portal_site_submit_status AS
SELECT
  ss.id AS site_submit_id,
  ss.client_id,
  ss.site_submit_name,
  ss.submit_stage_id,
  ss.updated_at AS site_submit_updated_at,
  pssv.user_id,
  pssv.last_viewed_at,
  CASE
    WHEN pssv.last_viewed_at IS NULL THEN TRUE
    WHEN ss.updated_at > pssv.last_viewed_at THEN TRUE
    ELSE FALSE
  END AS has_unread_updates,
  (
    SELECT MAX(ssc.created_at)
    FROM site_submit_comment ssc
    WHERE ssc.site_submit_id = ss.id
    AND ssc.visibility = 'client'
  ) AS latest_comment_at,
  CASE
    WHEN pssv.last_viewed_at IS NULL THEN TRUE
    WHEN (
      SELECT MAX(ssc.created_at)
      FROM site_submit_comment ssc
      WHERE ssc.site_submit_id = ss.id
      AND ssc.visibility = 'client'
    ) > pssv.last_viewed_at THEN TRUE
    ELSE FALSE
  END AS has_unread_comments
FROM site_submit ss
LEFT JOIN portal_site_submit_view pssv ON pssv.site_submit_id = ss.id;

-- ============================================================================
-- 12. CLIENT-VISIBLE SUBMIT STAGES
-- ============================================================================
-- Create a reference table or use a function to identify client-visible stages

CREATE OR REPLACE FUNCTION is_client_visible_stage(p_stage_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_stage_name IN (
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
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant usage on new tables to authenticated users
GRANT SELECT, INSERT, UPDATE ON portal_user_client_access TO authenticated;
GRANT SELECT, INSERT, UPDATE ON site_submit_comment TO authenticated;
GRANT SELECT, INSERT, UPDATE ON portal_site_submit_view TO authenticated;
GRANT SELECT ON portal_invite_log TO authenticated;
GRANT SELECT ON portal_site_submit_status TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION user_has_portal_client_access TO authenticated;
GRANT EXECUTE ON FUNCTION get_portal_user_clients TO authenticated;
GRANT EXECUTE ON FUNCTION record_portal_site_submit_view TO authenticated;
GRANT EXECUTE ON FUNCTION is_client_visible_stage TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
