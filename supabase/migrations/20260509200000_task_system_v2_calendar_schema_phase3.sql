-- Migration: Task System v2 — Phase 3 calendar schema
-- Date: 2026-05-09
-- Spec: docs/TASK_SYSTEM_V2_SPEC.md (§9)
-- Plan: docs/TASK_SYSTEM_V2_PHASE_3_PLAN.md
--
-- Three tables for Google Calendar pull-only sync:
--   google_calendar_connection      - per-user OAuth connection (mirrors gmail_connection)
--   google_calendar_subscription    - per-calendar opt-in within a connection
--   external_calendar_event         - pulled events; idempotent upsert
--
-- RLS: each user sees only their own connections / subscriptions / events.
-- Service role (used by edge functions) bypasses RLS so the cron sync can
-- read/write across users.
--
-- Field names mirror Google Calendar Events API where applicable:
--   google_event_id ← event.id
--   summary, description, location, html_link, status ← same names
--   start_at / end_at ← start.dateTime / end.dateTime
--   is_all_day = true ↔ event.start.date set instead of start.dateTime

-- ============================================================================
-- 1. google_calendar_connection — one row per OVIS user (single account in v1)
-- ============================================================================

CREATE TABLE IF NOT EXISTS google_calendar_connection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  google_email VARCHAR NOT NULL,

  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,

  last_sync_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,

  sync_error TEXT,
  sync_error_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- v1: one Google account per user. Lift if anyone needs multi-account.
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_gcal_connection_active
  ON google_calendar_connection(user_id) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_gcal_connection_updated_at ON google_calendar_connection;
CREATE TRIGGER trg_gcal_connection_updated_at
  BEFORE UPDATE ON google_calendar_connection
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 2. google_calendar_subscription — per-calendar opt-in within a connection
-- ============================================================================

CREATE TABLE IF NOT EXISTS google_calendar_subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  connection_id UUID NOT NULL REFERENCES google_calendar_connection(id) ON DELETE CASCADE,

  -- Google Calendar's calendar id, e.g. 'primary' or 'abc@group.calendar.google.com'
  google_calendar_id TEXT NOT NULL,
  display_name TEXT,                          -- pulled from CalendarList API
  color_hex TEXT,                              -- for visual tagging on the timeline
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (connection_id, google_calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_gcal_subscription_enabled
  ON google_calendar_subscription(connection_id) WHERE enabled = TRUE;


-- ============================================================================
-- 3. external_calendar_event — pulled events, idempotent upsert
-- ============================================================================

CREATE TABLE IF NOT EXISTS external_calendar_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  subscription_id UUID NOT NULL REFERENCES google_calendar_subscription(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,

  summary TEXT,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  location TEXT,
  html_link TEXT,                              -- direct deep-link to Google Calendar
  status TEXT,                                 -- 'confirmed' | 'tentative' | 'cancelled'

  pulled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (subscription_id, google_event_id),

  CONSTRAINT external_calendar_event_status_valid CHECK (
    status IS NULL OR status IN ('confirmed', 'tentative', 'cancelled')
  )
);

-- Timeline lookup: range scan on (subscription, start_at) for "events this day".
CREATE INDEX IF NOT EXISTS idx_external_event_subscription_start
  ON external_calendar_event(subscription_id, start_at);

-- Conflict check: range scan on (start_at, end_at) joined to instances.
CREATE INDEX IF NOT EXISTS idx_external_event_window
  ON external_calendar_event(start_at, end_at);


-- ============================================================================
-- 4. RLS — each user sees only their own data
-- ============================================================================

-- ----- google_calendar_connection -----

ALTER TABLE google_calendar_connection ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gcal_connection_owner_all ON google_calendar_connection;
CREATE POLICY gcal_connection_owner_all ON google_calendar_connection
  FOR ALL
  USING (public.task_current_user_id() = user_id)
  WITH CHECK (public.task_current_user_id() = user_id);

-- ----- google_calendar_subscription -----

ALTER TABLE google_calendar_subscription ENABLE ROW LEVEL SECURITY;

-- Subscriptions don't carry user_id; resolve via the connection.
DROP POLICY IF EXISTS gcal_subscription_owner_all ON google_calendar_subscription;
CREATE POLICY gcal_subscription_owner_all ON google_calendar_subscription
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM google_calendar_connection c
      WHERE c.id = google_calendar_subscription.connection_id
        AND c.user_id = public.task_current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM google_calendar_connection c
      WHERE c.id = google_calendar_subscription.connection_id
        AND c.user_id = public.task_current_user_id()
    )
  );

-- ----- external_calendar_event -----

ALTER TABLE external_calendar_event ENABLE ROW LEVEL SECURITY;

-- Events resolve to user via subscription → connection.
DROP POLICY IF EXISTS external_event_owner_all ON external_calendar_event;
CREATE POLICY external_event_owner_all ON external_calendar_event
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM google_calendar_subscription s
      JOIN google_calendar_connection c ON c.id = s.connection_id
      WHERE s.id = external_calendar_event.subscription_id
        AND c.user_id = public.task_current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM google_calendar_subscription s
      JOIN google_calendar_connection c ON c.id = s.connection_id
      WHERE s.id = external_calendar_event.subscription_id
        AND c.user_id = public.task_current_user_id()
    )
  );


-- ============================================================================
-- 5. Documentation comments
-- ============================================================================

COMMENT ON TABLE google_calendar_connection IS
  'Task System v2 Phase 3: per-user Google account connection for calendar pull-only sync (spec §9). One row per OVIS user in v1; UNIQUE on user_id. Mirrors gmail_connection except for webhook columns (deferred).';
COMMENT ON COLUMN google_calendar_connection.access_token IS
  'OAuth access token. Refreshed by gcal-sync edge function when token_expires_at is past.';

COMMENT ON TABLE google_calendar_subscription IS
  'Per-calendar opt-in within a connection (spec §9.2). User picks which calendars (primary + work + personal) to pull from on /settings/calendars.';

COMMENT ON TABLE external_calendar_event IS
  'Events pulled from subscribed calendars by gcal-sync. Idempotent upsert keyed on (subscription_id, google_event_id). Cancelled events kept (status=cancelled) so the timeline can show "this got cancelled".';
COMMENT ON COLUMN external_calendar_event.is_all_day IS
  'TRUE when the Google event used start.date (no time component) instead of start.dateTime. All-day events render as a banner above the timeline, not interleaved into the hour-based lane.';
