-- Cleanup Orphaned Auth Identities
-- Created: February 5, 2026
-- Problem: Orphaned records in auth.identities (without matching auth.users)
--          block new user signups with 422 errors.
-- Solution: Create a function to clean up orphaned identities for an email.

-- Function to clean up orphaned auth identities for a given email
-- This should be called before attempting signup to prevent 422 errors
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_auth_identity(p_email TEXT)
RETURNS JSONB AS $$
DECLARE
  v_identity_count INT;
  v_user_exists BOOLEAN;
  v_deleted_count INT := 0;
BEGIN
  -- Validate input
  IF p_email IS NULL OR p_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email is required');
  END IF;

  -- Normalize email to lowercase
  p_email := LOWER(TRIM(p_email));

  -- Check if a full user exists for this email
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE LOWER(email) = p_email
  ) INTO v_user_exists;

  -- If user exists, don't touch anything
  IF v_user_exists THEN
    RETURN jsonb_build_object(
      'success', true,
      'cleaned', false,
      'message', 'User exists, no cleanup needed'
    );
  END IF;

  -- Count orphaned identities (identities without matching users)
  SELECT COUNT(*) INTO v_identity_count
  FROM auth.identities i
  WHERE LOWER(i.email) = p_email
    AND NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = i.user_id
    );

  -- Delete orphaned identities
  IF v_identity_count > 0 THEN
    DELETE FROM auth.identities i
    WHERE LOWER(i.email) = p_email
      AND NOT EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = i.user_id
      );

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
      'success', true,
      'cleaned', true,
      'deleted_count', v_deleted_count,
      'message', format('Cleaned up %s orphaned identity record(s)', v_deleted_count)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cleaned', false,
    'message', 'No orphaned identities found'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon (needed before signup) and authenticated
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_auth_identity TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_auth_identity TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.cleanup_orphaned_auth_identity IS
'Cleans up orphaned auth.identities records that have no matching auth.users record.
These orphans can block new user signups with 422 errors.
Call this before attempting supabase.auth.signUp() to prevent issues.';


-- Also update validate_portal_invite_token to automatically clean up orphaned identities
CREATE OR REPLACE FUNCTION public.validate_portal_invite_token(p_token TEXT)
RETURNS JSONB AS $$
DECLARE
  v_contact RECORD;
  v_log_entry RECORD;
  v_cleanup_result JSONB;
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

  -- IMPORTANT: Clean up any orphaned auth identities for this email
  -- This prevents 422 errors when the user tries to sign up
  v_cleanup_result := public.cleanup_orphaned_auth_identity(v_contact.email);

  -- Token is valid! Return contact info
  RETURN jsonb_build_object(
    'valid', true,
    'contact', jsonb_build_object(
      'id', v_contact.id,
      'email', v_contact.email,
      'first_name', v_contact.first_name,
      'last_name', v_contact.last_name
    ),
    'cleanup', v_cleanup_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-grant permissions (in case they were lost during CREATE OR REPLACE)
GRANT EXECUTE ON FUNCTION public.validate_portal_invite_token TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_portal_invite_token TO anon;
