-- Portal Chat Email Alerts & Daily Digest — Schema
-- Created: April 25, 2026
-- Plan: docs/FEATURE_2026_04_25_PORTAL_CHAT_EMAIL_ALERTS.md
--
-- This migration adds the data model only. Triggers that populate
-- site_submit_activity live in a follow-up migration.
--
-- What's added:
--   1. client_broker          — junction table mapping clients to brokers (recipients of client→broker alerts)
--   2. contact.email_alerts_opt_in — portal user opt-in toggle (default on)
--   3. site_submit_stage_history    — Salesforce-style stage transition log for site submits
--   4. site_submit_activity         — single source of truth for "what changed" (comments, files, status changes)
--   5. portal_email_send            — audit log of sent emails + powers "since last send" computation
--   6. pending_client_comment_email — debounce queue for client→broker alerts (drained by cron)

-- ============================================================================
-- 1. CLIENT_BROKER — junction table for "which brokers get emails for this client"
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_broker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  added_by_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, user_id)
);

COMMENT ON TABLE client_broker IS
'Brokers explicitly associated with a client. Recipients of client→broker portal comment alerts.';

CREATE INDEX IF NOT EXISTS idx_client_broker_client
  ON client_broker(client_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_client_broker_user
  ON client_broker(user_id) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS update_client_broker_updated_at ON client_broker;
CREATE TRIGGER update_client_broker_updated_at
  BEFORE UPDATE ON client_broker
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. CONTACT.EMAIL_ALERTS_OPT_IN — portal user opt-in
-- ============================================================================

ALTER TABLE contact
  ADD COLUMN IF NOT EXISTS email_alerts_opt_in BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN contact.email_alerts_opt_in IS
'Whether this portal user receives broker→client digest emails. Defaults on; opt-out via portal profile or unsubscribe link.';

-- ============================================================================
-- 3. SITE_SUBMIT_STAGE_HISTORY — Salesforce-style stage transition log
-- ============================================================================
-- Mirrors the deal_stage_history pattern. Records every submit_stage_id change.

CREATE TABLE IF NOT EXISTS site_submit_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_submit_id UUID NOT NULL REFERENCES site_submit(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES submit_stage(id),  -- NULL for initial entry
  to_stage_id UUID NOT NULL REFERENCES submit_stage(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by_id UUID REFERENCES auth.users(id),

  -- Denormalized for efficient queries
  client_id UUID REFERENCES client(id),

  -- Time spent in the from_stage (seconds). Populated when next transition occurs.
  duration_seconds INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE site_submit_stage_history IS
'Tracks all site_submit stage transitions. Mirrors deal_stage_history. Powers the portal Recent Changes feed.';

CREATE INDEX IF NOT EXISTS idx_ssh_site_submit ON site_submit_stage_history(site_submit_id);
CREATE INDEX IF NOT EXISTS idx_ssh_to_stage ON site_submit_stage_history(to_stage_id);
CREATE INDEX IF NOT EXISTS idx_ssh_changed_at ON site_submit_stage_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssh_client_changed ON site_submit_stage_history(client_id, changed_at DESC);

-- ============================================================================
-- 4. SITE_SUBMIT_ACTIVITY — unified feed of what changed
-- ============================================================================
-- Single source of truth for the digest email AND the Recent Changes pipeline tab.
-- Populated by triggers on site_submit_comment, portal_file_visibility, and site_submit.

CREATE TABLE IF NOT EXISTS site_submit_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_submit_id UUID NOT NULL REFERENCES site_submit(id) ON DELETE CASCADE,

  -- Denormalized for fast queries (avoids join through site_submit on hot read paths)
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,

  activity_type VARCHAR(20) NOT NULL CHECK (activity_type IN ('comment', 'file_shared', 'status_change')),

  -- Who triggered the activity
  actor_user_id UUID REFERENCES auth.users(id),
  actor_kind VARCHAR(20) NOT NULL CHECK (actor_kind IN ('broker', 'portal_user', 'system')),

  -- Type-specific payload:
  --   comment       -> { comment_id, text, visibility }
  --   file_shared   -> { dropbox_path, file_name, entity_type, entity_id }
  --   status_change -> { from_stage_id, to_stage_id, from_stage_label, to_stage_label }
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Mirrors the underlying record's client visibility flag
  -- (e.g. comment.visibility = 'client' -> TRUE; portal_file_visibility.is_visible -> mirrors that)
  client_visible BOOLEAN NOT NULL DEFAULT TRUE,

  -- Digest tracking: which broker→client send included this row (NULL = not yet sent)
  included_in_send_id UUID,  -- FK added below after portal_email_send is created

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE site_submit_activity IS
'Unified activity feed for portal site submits. Feeds the Recent Changes tab and the broker→client digest.';

CREATE INDEX IF NOT EXISTS idx_ssa_site_submit_created
  ON site_submit_activity(site_submit_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ssa_client_created
  ON site_submit_activity(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ssa_unsent_client_visible
  ON site_submit_activity(client_id, created_at DESC)
  WHERE included_in_send_id IS NULL AND client_visible = TRUE;

CREATE INDEX IF NOT EXISTS idx_ssa_actor_kind_created
  ON site_submit_activity(actor_kind, created_at DESC);

-- ============================================================================
-- 5. PORTAL_EMAIL_SEND — audit + powers "since last send"
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_email_send (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  triggered_by_id UUID REFERENCES auth.users(id),  -- NULL for system-sent debounce alerts
  direction VARCHAR(30) NOT NULL CHECK (direction IN ('broker_to_client', 'client_to_broker')),

  -- Only meaningful when direction = 'broker_to_client'
  scope VARCHAR(20) CHECK (scope IN ('site_submit', 'client_all')),
  site_submit_id UUID REFERENCES site_submit(id) ON DELETE SET NULL,

  recipients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  cc TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  subject TEXT NOT NULL,
  body_html TEXT,

  -- Which activity rows were included in this send
  activity_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],

  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('gmail', 'resend')),
  provider_message_id TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE portal_email_send IS
'Audit log of every portal-related email sent (both directions). Powers "since last send" computation and admin audit views.';

CREATE INDEX IF NOT EXISTS idx_pes_client_sent
  ON portal_email_send(client_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_pes_site_submit_sent
  ON portal_email_send(site_submit_id, sent_at DESC) WHERE site_submit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pes_direction_sent
  ON portal_email_send(direction, sent_at DESC);

-- Now add the FK on site_submit_activity that needed portal_email_send to exist
ALTER TABLE site_submit_activity
  ADD CONSTRAINT site_submit_activity_included_in_send_id_fkey
  FOREIGN KEY (included_in_send_id) REFERENCES portal_email_send(id) ON DELETE SET NULL;

-- ============================================================================
-- 6. PENDING_CLIENT_COMMENT_EMAIL — debounce queue
-- ============================================================================
-- One row per (client_id, site_submit_id) pair with comments awaiting alert.
-- Each new client comment upserts last_comment_at = NOW().
-- A cron edge function runs every ~5 min, finds rows where
-- last_comment_at < NOW() - INTERVAL '20 minutes', sends the alert,
-- and deletes the row.

CREATE TABLE IF NOT EXISTS pending_client_comment_email (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  site_submit_id UUID NOT NULL REFERENCES site_submit(id) ON DELETE CASCADE,
  first_comment_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_comment_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comment_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, site_submit_id)
);

COMMENT ON TABLE pending_client_comment_email IS
'Debounce queue for client→broker alerts. Drained by a cron edge function after 20-min quiet period.';

CREATE INDEX IF NOT EXISTS idx_pcce_last_comment_at
  ON pending_client_comment_email(last_comment_at);

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

ALTER TABLE client_broker ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_submit_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_submit_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_email_send ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_client_comment_email ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read everything (portal access scoping happens at the
-- API/view layer, not at the row level for these admin-style tables).
CREATE POLICY "Authenticated read client_broker"
  ON client_broker FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated write client_broker"
  ON client_broker FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read site_submit_stage_history"
  ON site_submit_stage_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated write site_submit_stage_history"
  ON site_submit_stage_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read site_submit_activity"
  ON site_submit_activity FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated write site_submit_activity"
  ON site_submit_activity FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read portal_email_send"
  ON portal_email_send FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated write portal_email_send"
  ON portal_email_send FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read pending_client_comment_email"
  ON pending_client_comment_email FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated write pending_client_comment_email"
  ON pending_client_comment_email FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- 8. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON client_broker TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON site_submit_stage_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON site_submit_activity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON portal_email_send TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pending_client_comment_email TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Portal Email Alerts Schema Setup Complete';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - client_broker';
  RAISE NOTICE '  - site_submit_stage_history';
  RAISE NOTICE '  - site_submit_activity';
  RAISE NOTICE '  - portal_email_send';
  RAISE NOTICE '  - pending_client_comment_email';
  RAISE NOTICE 'Columns added:';
  RAISE NOTICE '  - contact.email_alerts_opt_in';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: run the activity-capture trigger migration.';
  RAISE NOTICE '==========================================';
END $$;
