-- Fix Portal Invite Token Lookup
-- Created: February 5, 2026
-- Problem: The invite accept page queries contact by portal_invite_token,
--          but RLS blocks this query for unauthenticated users.
-- Solution: Create a SECURITY DEFINER function to validate invite tokens.

-- Function to validate an invite token and return contact info
-- This runs with elevated privileges (SECURITY DEFINER) to bypass RLS
CREATE OR REPLACE FUNCTION public.validate_portal_invite_token(p_token TEXT)
RETURNS JSONB AS $$
DECLARE
  v_contact RECORD;
  v_log_entry RECORD;
BEGIN
  -- Validate input
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'invalid_token',
      'message', 'Invalid invite link. Please check your email and try again.'
    );
  END IF;

  -- Look up the contact by invite token
  SELECT
    id,
    email,
    first_name,
    last_name,
    portal_invite_status,
    portal_invite_expires_at,
    portal_access_enabled,
    portal_auth_user_id
  INTO v_contact
  FROM contact
  WHERE portal_invite_token = p_token;

  -- Token not found on any contact
  IF v_contact IS NULL THEN
    -- Check the invite log to provide a better error message
    SELECT status, sent_at, contact_id
    INTO v_log_entry
    FROM portal_invite_log
    WHERE invite_token = p_token
    ORDER BY sent_at DESC
    LIMIT 1;

    IF v_log_entry IS NOT NULL THEN
      -- Token was found in log but not on contact
      IF v_log_entry.status = 'accepted' THEN
        RETURN jsonb_build_object(
          'valid', false,
          'error', 'already_accepted',
          'message', 'This invite link has already been used to create an account. Please sign in instead.'
        );
      ELSIF v_log_entry.status = 'expired' THEN
        RETURN jsonb_build_object(
          'valid', false,
          'error', 'expired',
          'message', 'This invite link has expired. Please contact your broker for a new invite.'
        );
      ELSIF v_log_entry.status = 'revoked' THEN
        RETURN jsonb_build_object(
          'valid', false,
          'error', 'revoked',
          'message', 'This invite link has been revoked. Please contact your broker for a new invite.'
        );
      ELSE
        -- Token exists in log but was replaced on contact (new invite sent)
        RETURN jsonb_build_object(
          'valid', false,
          'error', 'superseded',
          'message', 'This invite link is no longer valid. A newer invite has been sent - please check your email for the most recent invite, or contact your broker.'
        );
      END IF;
    END IF;

    -- Token not found anywhere
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'not_found',
      'message', 'This invite link is not valid. Please check your email for the correct link, or contact your broker for a new invite.'
    );
  END IF;

  -- Check if invite has already been accepted
  IF v_contact.portal_invite_status = 'accepted' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'already_accepted',
      'message', 'This invite link has already been used to create an account. Please sign in instead.'
    );
  END IF;

  -- Check if user already has an auth account linked
  IF v_contact.portal_auth_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'already_has_account',
      'message', 'An account already exists for this contact. Please sign in instead.'
    );
  END IF;

  -- Check if invite is expired
  IF v_contact.portal_invite_expires_at IS NOT NULL
     AND v_contact.portal_invite_expires_at < NOW() THEN
    -- Mark as expired
    UPDATE contact
    SET portal_invite_status = 'expired'
    WHERE id = v_contact.id;

    -- Update log entry
    UPDATE portal_invite_log
    SET status = 'expired'
    WHERE invite_token = p_token;

    RETURN jsonb_build_object(
      'valid', false,
      'error', 'expired',
      'message', 'This invite link has expired. Please contact your broker for a new invite.'
    );
  END IF;

  -- Check if contact has an email
  IF v_contact.email IS NULL OR v_contact.email = '' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'no_email',
      'message', 'No email address found for this contact. Please contact your broker.'
    );
  END IF;

  -- Token is valid! Return contact info
  RETURN jsonb_build_object(
    'valid', true,
    'contact', jsonb_build_object(
      'id', v_contact.id,
      'email', v_contact.email,
      'first_name', v_contact.first_name,
      'last_name', v_contact.last_name
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to both authenticated AND anon (for pre-login validation)
GRANT EXECUTE ON FUNCTION public.validate_portal_invite_token TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_portal_invite_token TO anon;

-- Add comment for documentation
COMMENT ON FUNCTION public.validate_portal_invite_token IS
'Validates a portal invite token and returns contact info if valid.
Used by the invite acceptance page before user creates their account.
Returns JSON with valid=true/false and either contact info or error details.';
