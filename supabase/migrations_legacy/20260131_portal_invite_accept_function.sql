-- Portal Invite Accept Function
-- Created: January 31, 2026
-- Description: SECURITY DEFINER function to accept portal invites
-- This bypasses RLS so new portal users can complete their signup

-- Function to accept a portal invite and update contact record
CREATE OR REPLACE FUNCTION public.accept_portal_invite(
  p_contact_id UUID,
  p_auth_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_contact RECORD;
BEGIN
  -- Validate the contact exists and has portal access enabled
  SELECT id, email, portal_invite_status, portal_access_enabled
  INTO v_contact
  FROM contact
  WHERE id = p_contact_id;

  IF v_contact IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contact not found');
  END IF;

  -- Update the contact record
  UPDATE contact
  SET
    portal_invite_status = 'accepted',
    portal_invite_token = NULL, -- Clear token after use
    portal_auth_user_id = p_auth_user_id,
    portal_access_enabled = TRUE,
    updated_at = NOW()
  WHERE id = p_contact_id;

  -- Log the acceptance
  INSERT INTO portal_invite_log (contact_id, status, invite_email)
  VALUES (p_contact_id, 'accepted', v_contact.email);

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.accept_portal_invite TO authenticated;

-- NOTE: We're NOT adding RLS policies to the contact table here because:
-- 1. The contact table may already have RLS policies for internal users
-- 2. Adding new policies could break existing functionality
-- 3. The RPC function above uses SECURITY DEFINER which bypasses RLS anyway
--
-- If you need portal users to read their own contact (for navbar name display),
-- add the policy separately after verifying existing policies:
--
-- DROP POLICY IF EXISTS "contact_portal_self_select" ON contact;
-- CREATE POLICY "contact_portal_self_select"
-- ON contact FOR SELECT
-- TO authenticated
-- USING (
--   public.is_internal_user()  -- Internal users see all
--   OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))  -- Portal users see own
-- );
