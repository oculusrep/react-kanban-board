-- validate_portal_invite_token becomes READ-ONLY.
--
-- It was performing two UPDATEs on the expiry path -- contact.portal_invite_status
-- and portal_invite_log.status -- from an endpoint anon can call. Anyone
-- replaying a known token drove state changes in the database.
--
-- The writes are DELETED rather than relocated, because they cached something
-- already derivable: portal_invite_expires_at < now() IS expiry. Worse, the
-- cache was only ever written when somebody clicked a lapsed link, so an invite
-- that expired unvisited still read 'pending'. The two readers
-- (ClientPortalUsersSection, PortalAnalyticsPage) now derive it from the
-- timestamp in the same commit, which also fixes the never-visited case.
--
-- A materialised status for reporting is deferred: one idempotent statement on
-- the daily cron, triggered by time rather than by a stranger's HTTP request.
--
-- The cleanup_orphaned_auth_identity call stays for now and moves to an edge
-- function in the next change; removing it here would break portal signup.
--
-- ROLLBACK: the previous definition is reproduced verbatim at the bottom of
-- this file. Re-run that CREATE OR REPLACE to restore the writes.
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

  -- Auto-cleanup orphaned identities to prevent 422 errors on signup
  v_cleanup_result := public.cleanup_orphaned_auth_identity(v_contact.email);

  RETURN jsonb_build_object(
    'valid', true,
    'contact', jsonb_build_object('id', v_contact.id, 'email', v_contact.email, 'first_name', v_contact.first_name, 'last_name', v_contact.last_name),
    'cleanup', v_cleanup_result
  );
END;
$function$



-- ============ ROLLBACK: previous definition, verbatim ============
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
--     UPDATE contact SET portal_invite_status = 'expired' WHERE id = v_contact.id;
--     UPDATE portal_invite_log SET status = 'expired' WHERE invite_token = p_token;
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
-- 
