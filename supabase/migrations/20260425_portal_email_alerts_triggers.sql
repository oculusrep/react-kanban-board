-- Portal Chat Email Alerts — Activity Capture Triggers
-- Created: April 25, 2026
-- Plan: docs/FEATURE_2026_04_25_PORTAL_CHAT_EMAIL_ALERTS.md
--
-- Populates site_submit_activity (and site_submit_stage_history) from three sources:
--   1. site_submit_comment INSERT  -> activity row + (if portal user) debounce queue upsert
--   2. portal_file_visibility set to TRUE for a site_submit_id -> activity row
--   3. site_submit.submit_stage_id change -> stage history row + activity row

-- ============================================================================
-- HELPER: resolve_actor_kind
-- ============================================================================
-- Given an auth.users.id, determine whether the actor is a broker (in `user`
-- table via auth_user_id), a portal user (in `contact` via portal_auth_user_id),
-- or unknown (treated as 'system').

CREATE OR REPLACE FUNCTION resolve_actor_kind(p_auth_user_id UUID)
RETURNS VARCHAR(20) AS $$
DECLARE
  v_kind VARCHAR(20);
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN 'system';
  END IF;

  -- Broker check: row in `user` table linked via auth_user_id
  IF EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = p_auth_user_id
  ) THEN
    RETURN 'broker';
  END IF;

  -- Portal user check: row in `contact` linked via portal_auth_user_id
  IF EXISTS (
    SELECT 1 FROM contact c
    WHERE c.portal_auth_user_id = p_auth_user_id
  ) THEN
    RETURN 'portal_user';
  END IF;

  RETURN 'system';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 1. COMMENT CAPTURE
-- ============================================================================

CREATE OR REPLACE FUNCTION capture_comment_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_client_id UUID;
  v_actor_kind VARCHAR(20);
BEGIN
  -- Only client-visible comments produce activity rows
  IF NEW.visibility <> 'client' THEN
    RETURN NEW;
  END IF;

  -- Look up client_id via site_submit
  SELECT ss.client_id INTO v_client_id
  FROM site_submit ss
  WHERE ss.id = NEW.site_submit_id;

  IF v_client_id IS NULL THEN
    -- No client linked — can't route this anywhere meaningful
    RETURN NEW;
  END IF;

  v_actor_kind := resolve_actor_kind(NEW.author_id);

  INSERT INTO site_submit_activity (
    site_submit_id,
    client_id,
    activity_type,
    actor_user_id,
    actor_kind,
    payload,
    client_visible,
    created_at
  ) VALUES (
    NEW.site_submit_id,
    v_client_id,
    'comment',
    NEW.author_id,
    v_actor_kind,
    jsonb_build_object(
      'comment_id', NEW.id,
      'text', NEW.content,
      'visibility', NEW.visibility
    ),
    TRUE,
    NEW.created_at
  );

  -- If the comment is from a portal user (client-side), upsert the debounce queue
  -- so a cron job can send a digested broker alert after the quiet period.
  IF v_actor_kind = 'portal_user' THEN
    INSERT INTO pending_client_comment_email (
      client_id,
      site_submit_id,
      first_comment_at,
      last_comment_at,
      comment_count
    ) VALUES (
      v_client_id,
      NEW.site_submit_id,
      NEW.created_at,
      NEW.created_at,
      1
    )
    ON CONFLICT (client_id, site_submit_id)
    DO UPDATE SET
      last_comment_at = EXCLUDED.last_comment_at,
      comment_count = pending_client_comment_email.comment_count + 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_capture_comment_activity ON site_submit_comment;
CREATE TRIGGER trg_capture_comment_activity
  AFTER INSERT ON site_submit_comment
  FOR EACH ROW
  EXECUTE FUNCTION capture_comment_activity();

COMMENT ON FUNCTION capture_comment_activity() IS
'Writes a site_submit_activity row for each client-visible comment. Upserts the debounce queue when the author is a portal user.';

-- ============================================================================
-- 2. FILE-SHARED CAPTURE (portal_file_visibility)
-- ============================================================================
-- A "file shared with client" event = portal_file_visibility row that flips to
-- (or is inserted as) is_visible = TRUE with a non-null site_submit_id.
-- We don't capture file uploads themselves (those happen in Dropbox); only the
-- visibility-toggle moment that exposes a file/folder to the portal.

CREATE OR REPLACE FUNCTION capture_file_shared_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_client_id UUID;
  v_actor_kind VARCHAR(20);
  v_actor_auth_id UUID;
  v_file_name TEXT;
BEGIN
  -- Only fire when the file is being made visible AND scoped to a site submit.
  IF NEW.is_visible IS NOT TRUE OR NEW.site_submit_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- For UPDATE: only fire on transitions into is_visible = TRUE
  IF TG_OP = 'UPDATE' AND OLD.is_visible IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT ss.client_id INTO v_client_id
  FROM site_submit ss
  WHERE ss.id = NEW.site_submit_id;

  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Prefer the row's recorded actor; fall back to auth.uid()
  v_actor_auth_id := COALESCE(NEW.changed_by_id, auth.uid());
  v_actor_kind := resolve_actor_kind(v_actor_auth_id);

  -- File name = last path segment
  v_file_name := regexp_replace(NEW.dropbox_path, '^.*/', '');

  INSERT INTO site_submit_activity (
    site_submit_id,
    client_id,
    activity_type,
    actor_user_id,
    actor_kind,
    payload,
    client_visible,
    created_at
  ) VALUES (
    NEW.site_submit_id,
    v_client_id,
    'file_shared',
    v_actor_auth_id,
    v_actor_kind,
    jsonb_build_object(
      'dropbox_path', NEW.dropbox_path,
      'file_name', v_file_name,
      'entity_type', NEW.entity_type,
      'entity_id', NEW.entity_id
    ),
    TRUE,
    COALESCE(NEW.updated_at, NEW.created_at, NOW())
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_capture_file_shared_activity ON portal_file_visibility;
CREATE TRIGGER trg_capture_file_shared_activity
  AFTER INSERT OR UPDATE ON portal_file_visibility
  FOR EACH ROW
  EXECUTE FUNCTION capture_file_shared_activity();

COMMENT ON FUNCTION capture_file_shared_activity() IS
'Writes a site_submit_activity row when a Dropbox file/folder becomes visible to the portal for a specific site submit.';

-- ============================================================================
-- 3. STAGE-CHANGE CAPTURE (site_submit.submit_stage_id)
-- ============================================================================
-- Two writes per change:
--   - site_submit_stage_history (audit trail, mirrors deal_stage_history)
--   - site_submit_activity (feeds the digest + Recent Changes tab)

CREATE OR REPLACE FUNCTION capture_stage_change_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_auth_id UUID;
  v_actor_kind VARCHAR(20);
  v_from_label TEXT;
  v_to_label TEXT;
  v_duration INTEGER;
  v_history_id UUID;
BEGIN
  -- Only fire when stage actually changes
  IF NEW.submit_stage_id IS NOT DISTINCT FROM OLD.submit_stage_id THEN
    RETURN NEW;
  END IF;

  v_actor_auth_id := auth.uid();
  v_actor_kind := resolve_actor_kind(v_actor_auth_id);

  -- Resolve labels for the activity payload
  SELECT name INTO v_from_label FROM submit_stage WHERE id = OLD.submit_stage_id;
  SELECT name INTO v_to_label FROM submit_stage WHERE id = NEW.submit_stage_id;

  -- Backfill duration on the most recent history row whose to_stage matches OLD
  UPDATE site_submit_stage_history
  SET duration_seconds = EXTRACT(EPOCH FROM (NOW() - changed_at))::INTEGER
  WHERE site_submit_id = NEW.id
    AND to_stage_id = OLD.submit_stage_id
    AND duration_seconds IS NULL;

  -- Insert new history row (the to_stage row; duration filled by next change)
  INSERT INTO site_submit_stage_history (
    site_submit_id,
    from_stage_id,
    to_stage_id,
    changed_at,
    changed_by_id,
    client_id
  ) VALUES (
    NEW.id,
    OLD.submit_stage_id,
    NEW.submit_stage_id,
    NOW(),
    v_actor_auth_id,
    NEW.client_id
  )
  RETURNING id INTO v_history_id;

  -- Activity row (only if we know the client; otherwise nowhere to route)
  IF NEW.client_id IS NOT NULL AND NEW.submit_stage_id IS NOT NULL THEN
    INSERT INTO site_submit_activity (
      site_submit_id,
      client_id,
      activity_type,
      actor_user_id,
      actor_kind,
      payload,
      client_visible,
      created_at
    ) VALUES (
      NEW.id,
      NEW.client_id,
      'status_change',
      v_actor_auth_id,
      v_actor_kind,
      jsonb_build_object(
        'from_stage_id', OLD.submit_stage_id,
        'to_stage_id', NEW.submit_stage_id,
        'from_stage_label', v_from_label,
        'to_stage_label', v_to_label,
        'history_id', v_history_id
      ),
      TRUE,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_capture_stage_change_activity ON site_submit;
CREATE TRIGGER trg_capture_stage_change_activity
  AFTER UPDATE OF submit_stage_id ON site_submit
  FOR EACH ROW
  WHEN (NEW.submit_stage_id IS DISTINCT FROM OLD.submit_stage_id)
  EXECUTE FUNCTION capture_stage_change_activity();

COMMENT ON FUNCTION capture_stage_change_activity() IS
'Writes both a site_submit_stage_history row (audit) and a site_submit_activity row (digest feed) on each submit_stage_id change.';

-- ============================================================================
-- 4. GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION resolve_actor_kind TO authenticated;
GRANT EXECUTE ON FUNCTION capture_comment_activity TO authenticated;
GRANT EXECUTE ON FUNCTION capture_file_shared_activity TO authenticated;
GRANT EXECUTE ON FUNCTION capture_stage_change_activity TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Portal Email Alerts Triggers Installed';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Triggers active:';
  RAISE NOTICE '  - trg_capture_comment_activity ON site_submit_comment';
  RAISE NOTICE '  - trg_capture_file_shared_activity ON portal_file_visibility';
  RAISE NOTICE '  - trg_capture_stage_change_activity ON site_submit';
  RAISE NOTICE '==========================================';
END $$;
