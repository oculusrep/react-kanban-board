-- Take the DELETE off the public endpoint.
--
-- validate_portal_invite_token called cleanup_orphaned_auth_identity(email) on
-- its success path, so an anon-callable READ endpoint reached a delete against
-- auth.identities, with the email chosen by the caller.
--
-- The cleanup now lives in the portal-invite-precheck edge function, called by
-- PortalInviteAcceptPage immediately BEFORE signUp. It has to run before
-- signUp: by the time accept_portal_invite runs, the auth user exists, the
-- cleanup's own guard short-circuits, and the 422 it prevents has already
-- happened. The edge function takes the TOKEN and resolves the email itself, so
-- identities for arbitrary addresses can no longer be probed or deleted.
--
-- anon also loses EXECUTE on cleanup_orphaned_auth_identity by BOTH routes --
-- the PUBLIC grant and the explicit anon grant that ALTER DEFAULT PRIVILEGES
-- adds to every new function in this database. Closing one says nothing about
-- the other.
--
-- ROLLBACK: the previous definition is reproduced verbatim at the end of this
-- file; re-run it, then
--   GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_auth_identity(text) TO PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.validate_portal_invite_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_contact RECORD;
  v_log_entry RECORD;
  v_cleanup_result JSONB;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'invalid_token', 'message', 'Invalid invite link. Please check your email and try again.');
  END IF;

  SELECT id, email, first_name, last_name, portal_invite_status, portal_invite_expires_at, portal_access_enabled, portal_auth_user_id
  INTO v_contact
  FROM contact
  WHERE portal_invite_token = p_token;

  IF v_contact IS NULL THEN
    SELECT status, sent_at, contact_id INTO v_log_entry
    FROM portal_invite_log WHERE invite_token = p_token ORDER BY sent_at DESC LIMIT 1;

    IF v_log_entry IS NOT NULL THEN
      IF v_log_entry.status = 'accepted' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'already_accepted', 'message', 'This invite link has already been used to create an account. Please sign in instead.');
      ELSIF v_log_entry.status = 'expired' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'expired', 'message', 'This invite link has expired. Please contact your broker for a new invite.');
      ELSIF v_log_entry.status = 'revoked' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'revoked', 'message', 'This invite link has been revoked. Please contact your broker for a new invite.');
      ELSE
        RETURN jsonb_build_object('valid', false, 'error', 'superseded', 'message', 'This invite link is no longer valid. A newer invite has been sent - please check your email for the most recent invite, or contact your broker.');
      END IF;
    END IF;
    RETURN jsonb_build_object('valid', false, 'error', 'not_found', 'message', 'This invite link is not valid. Please check your email for the correct link, or contact your broker for a new invite.');
  END IF;

  IF v_contact.portal_invite_status = 'accepted' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'already_accepted', 'message', 'This invite link has already been used to create an account. Please sign in instead.');
  END IF;

  IF v_contact.portal_auth_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'already_has_account', 'message', 'An account already exists for this contact. Please sign in instead.');
  END IF;

  IF v_contact.portal_invite_expires_at IS NOT NULL AND v_contact.portal_invite_expires_at < NOW() THEN
    -- No write here: this function is read-only. Expiry is derived from
    -- portal_invite_expires_at by every reader.
    RETURN jsonb_build_object('valid', false, 'error', 'expired', 'message', 'This invite link has expired. Please contact your broker for a new invite.');
  END IF;

  IF v_contact.email IS NULL OR v_contact.email = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'no_email', 'message', 'No email address found for this contact. Please contact your broker.');
  END IF;

  -- No cleanup here. This function is read-only and anon-callable; the
  -- orphaned-identity cleanup runs in the portal-invite-precheck edge function
  -- with the service key, keyed on the token rather than a caller-supplied
  -- email. 'cleanup' stays in the response shape so the invite page's existing
  -- handling is unaffected.
  v_cleanup_result := jsonb_build_object('success', true, 'cleaned', false,
                                         'message', 'handled by portal-invite-precheck');

  RETURN jsonb_build_object(
    'valid', true,
    'contact', jsonb_build_object('id', v_contact.id, 'email', v_contact.email, 'first_name', v_contact.first_name, 'last_name', v_contact.last_name),
    'cleanup', v_cleanup_result
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cleanup_orphaned_auth_identity(p_email text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_orphaned_auth_identity(p_email text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_auth_identity(p_email text) TO service_role;

-- ======== ROLLBACK: previous definition, verbatim ========
-- CREATE OR REPLACE FUNCTION public.validate_portal_invite_token(p_token text)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
-- AS $function$
-- DECLARE
--   v_contact RECORD;
--   v_log_entry RECORD;
--   v_cleanup_result JSONB;
-- BEGIN
--   IF p_token IS NULL OR p_token = '' THEN
--     RETURN jsonb_build_object('valid', false, 'error', 'invalid_token', 'message', 'Invalid invite link. Please check your email and try again.');
--   END IF;
-- 
--   SELECT id, email, first_name, last_name, portal_invite_status, portal_invite_expires_at, portal_access_enabled, portal_auth_user_id
--   INTO v_contact
--   FROM contact
--   WHERE portal_invite_token = p_token;
-- 
--   IF v_contact IS NULL THEN
--     SELECT status, sent_at, contact_id INTO v_log_entry
--     FROM portal_invite_log WHERE invite_token = p_token ORDER BY sent_at DESC LIMIT 1;
-- 
--     IF v_log_entry IS NOT NULL THEN
--       IF v_log_entry.status = 'accepted' THEN
--         RETURN jsonb_build_object('valid', false, 'error', 'already_accepted', 'message', 'This invite link has already been used to create an account. Please sign in instead.');
--       ELSIF v_log_entry.status = 'expired' THEN
--         RETURN jsonb_build_object('valid', false, 'error', 'expired', 'message', 'This invite link has expired. Please contact your broker for a new invite.');
--       ELSIF v_log_entry.status = 'revoked' THEN
--         RETURN jsonb_build_object('valid', false, 'error', 'revoked', 'message', 'This invite link has been revoked. Please contact your broker for a new invite.');
--       ELSE
--         RETURN jsonb_build_object('valid', false, 'error', 'superseded', 'message', 'This invite link is no longer valid. A newer invite has been sent - please check your email for the most recent invite, or contact your broker.');
--       END IF;
--     END IF;
--     RETURN jsonb_build_object('valid', false, 'error', 'not_found', 'message', 'This invite link is not valid. Please check your email for the correct link, or contact your broker for a new invite.');
--   END IF;
-- 
--   IF v_contact.portal_invite_status = 'accepted' THEN
--     RETURN jsonb_build_object('valid', false, 'error', 'already_accepted', 'message', 'This invite link has already been used to create an account. Please sign in instead.');
--   END IF;
-- 
--   IF v_contact.portal_auth_user_id IS NOT NULL THEN
--     RETURN jsonb_build_object('valid', false, 'error', 'already_has_account', 'message', 'An account already exists for this contact. Please sign in instead.');
--   END IF;
-- 
--   IF v_contact.portal_invite_expires_at IS NOT NULL AND v_contact.portal_invite_expires_at < NOW() THEN
--     -- No write here: this function is read-only. Expiry is derived from
--     -- portal_invite_expires_at by every reader.
--     RETURN jsonb_build_object('valid', false, 'error', 'expired', 'message', 'This invite link has expired. Please contact your broker for a new invite.');
--   END IF;
-- 
--   IF v_contact.email IS NULL OR v_contact.email = '' THEN
--     RETURN jsonb_build_object('valid', false, 'error', 'no_email', 'message', 'No email address found for this contact. Please contact your broker.');
--   END IF;
-- 
--   -- Auto-cleanup orphaned identities to prevent 422 errors on signup
--   v_cleanup_result := public.cleanup_orphaned_auth_identity(v_contact.email);
-- 
--   RETURN jsonb_build_object(
--     'valid', true,
--     'contact', jsonb_build_object('id', v_contact.id, 'email', v_contact.email, 'first_name', v_contact.first_name, 'last_name', v_contact.last_name),
--     'cleanup', v_cleanup_result
--   );
-- END;
-- $function$
