-- Migration: Prospecting System Phase 1
-- Description: Activity tracking, notes, time tracking, and metrics for lead prospecting
-- Date: 2026-02-12

-- ============================================================================
-- Update hunter_lead status to support new funnel stages
-- ============================================================================

-- Drop the existing check constraint
ALTER TABLE hunter_lead DROP CONSTRAINT IF EXISTS hunter_lead_status_check;

-- Add the new check constraint with expanded status values
ALTER TABLE hunter_lead ADD CONSTRAINT hunter_lead_status_check
  CHECK (status IN (
    -- Original statuses
    'new', 'enriching', 'ready', 'outreach_drafted', 'contacted', 'converted', 'dismissed', 'watching',
    -- New prospecting funnel statuses
    'researching', 'active', 'engaged', 'meeting_scheduled',
    -- Terminal statuses
    'already_represented', 'not_interested', 'dead', 'nurture'
  ));

-- Add last_contacted_at column for tracking outreach timing
ALTER TABLE hunter_lead ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

-- Create index for stale lead queries
CREATE INDEX IF NOT EXISTS idx_hunter_lead_last_contacted ON hunter_lead(last_contacted_at);

-- ============================================================================
-- prospecting_activity: Tracks outreach touchpoints (emails, calls, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prospecting_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to lead OR contact (one must be set)
  hunter_lead_id UUID REFERENCES hunter_lead(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contact(id) ON DELETE CASCADE,

  -- Activity details
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'email',      -- Email sent
    'linkedin',   -- LinkedIn message sent
    'sms',        -- SMS text message sent
    'voicemail',  -- Left voicemail
    'call',       -- Call completed (reached them)
    'meeting'     -- Meeting held
  )),

  -- Optional details
  notes TEXT,                              -- Brief notes about the activity
  email_subject TEXT,                      -- For email activities

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Ensure at least one link is set
  CONSTRAINT activity_has_target CHECK (
    hunter_lead_id IS NOT NULL OR contact_id IS NOT NULL
  )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_prospecting_activity_lead ON prospecting_activity(hunter_lead_id);
CREATE INDEX IF NOT EXISTS idx_prospecting_activity_contact ON prospecting_activity(contact_id);
CREATE INDEX IF NOT EXISTS idx_prospecting_activity_type ON prospecting_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_prospecting_activity_created ON prospecting_activity(created_at);
CREATE INDEX IF NOT EXISTS idx_prospecting_activity_created_by ON prospecting_activity(created_by);

-- ============================================================================
-- prospecting_note: Slack-like running notes on leads
-- ============================================================================

CREATE TABLE IF NOT EXISTS prospecting_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to lead OR contact (one must be set)
  hunter_lead_id UUID REFERENCES hunter_lead(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contact(id) ON DELETE CASCADE,

  -- Note content
  content TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Ensure at least one link is set
  CONSTRAINT note_has_target CHECK (
    hunter_lead_id IS NOT NULL OR contact_id IS NOT NULL
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prospecting_note_lead ON prospecting_note(hunter_lead_id);
CREATE INDEX IF NOT EXISTS idx_prospecting_note_contact ON prospecting_note(contact_id);
CREATE INDEX IF NOT EXISTS idx_prospecting_note_created ON prospecting_note(created_at);

-- ============================================================================
-- prospecting_time_entry: Daily time tracking for prospecting
-- ============================================================================

CREATE TABLE IF NOT EXISTS prospecting_time_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The date this entry is for
  entry_date DATE NOT NULL,

  -- Time in minutes (easier for calculations)
  minutes INTEGER NOT NULL CHECK (minutes >= 0),

  -- Optional notes about what was done
  notes TEXT,

  -- User and timestamps
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One entry per user per day
  UNIQUE(entry_date, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prospecting_time_entry_date ON prospecting_time_entry(entry_date);
CREATE INDEX IF NOT EXISTS idx_prospecting_time_entry_user ON prospecting_time_entry(user_id);
CREATE INDEX IF NOT EXISTS idx_prospecting_time_entry_user_date ON prospecting_time_entry(user_id, entry_date);

-- ============================================================================
-- prospecting_vacation_day: Days that don't count against streak
-- ============================================================================

CREATE TABLE IF NOT EXISTS prospecting_vacation_day (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The vacation date
  vacation_date DATE NOT NULL,

  -- Optional reason
  reason TEXT,

  -- User and timestamps
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One entry per user per day
  UNIQUE(vacation_date, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prospecting_vacation_date ON prospecting_vacation_day(vacation_date);
CREATE INDEX IF NOT EXISTS idx_prospecting_vacation_user ON prospecting_vacation_day(user_id);

-- ============================================================================
-- prospecting_settings: User-specific settings for prospecting
-- ============================================================================

CREATE TABLE IF NOT EXISTS prospecting_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User this setting belongs to
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,

  -- Time tracking goal (in minutes)
  daily_time_goal_minutes INTEGER DEFAULT 120,  -- Default: 2 hours

  -- Stale lead threshold (days since last contact)
  stale_lead_days INTEGER DEFAULT 45,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- email_template: Reusable email templates for outreach (Phase 2 prep)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template info
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,

  -- Categorization
  category TEXT CHECK (category IN (
    'cold_outreach',
    'follow_up',
    'voicemail_follow_up',
    're_engagement',
    'meeting_request',
    'custom'
  )),

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps and ownership
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_template_category ON email_template(category);
CREATE INDEX IF NOT EXISTS idx_email_template_active ON email_template(is_active);

-- ============================================================================
-- Trigger: Auto-update last_contacted_at on hunter_lead when activity logged
-- ============================================================================

CREATE OR REPLACE FUNCTION update_lead_last_contacted()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if this activity is linked to a lead
  IF NEW.hunter_lead_id IS NOT NULL THEN
    UPDATE hunter_lead
    SET last_contacted_at = NEW.created_at
    WHERE id = NEW.hunter_lead_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger will be replaced by the rename migration (20260212100000)
-- which renames hunter_lead to target
DROP TRIGGER IF EXISTS trigger_activity_update_lead_contacted ON prospecting_activity;
CREATE TRIGGER trigger_activity_update_lead_contacted
  AFTER INSERT ON prospecting_activity
  FOR EACH ROW EXECUTE FUNCTION update_lead_last_contacted();

-- ============================================================================
-- Trigger: Auto-update updated_at timestamps
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_prospecting_time_entry_updated_at ON prospecting_time_entry;
CREATE TRIGGER trigger_prospecting_time_entry_updated_at
  BEFORE UPDATE ON prospecting_time_entry
  FOR EACH ROW EXECUTE FUNCTION update_hunter_updated_at();

DROP TRIGGER IF EXISTS trigger_prospecting_settings_updated_at ON prospecting_settings;
CREATE TRIGGER trigger_prospecting_settings_updated_at
  BEFORE UPDATE ON prospecting_settings
  FOR EACH ROW EXECUTE FUNCTION update_hunter_updated_at();

DROP TRIGGER IF EXISTS trigger_email_template_updated_at ON email_template;
CREATE TRIGGER trigger_email_template_updated_at
  BEFORE UPDATE ON email_template
  FOR EACH ROW EXECUTE FUNCTION update_hunter_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- prospecting_activity
ALTER TABLE prospecting_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prospecting_activity_select" ON prospecting_activity;
CREATE POLICY "prospecting_activity_select"
  ON prospecting_activity FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "prospecting_activity_insert" ON prospecting_activity;
CREATE POLICY "prospecting_activity_insert"
  ON prospecting_activity FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "prospecting_activity_update" ON prospecting_activity;
CREATE POLICY "prospecting_activity_update"
  ON prospecting_activity FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "prospecting_activity_delete" ON prospecting_activity;
CREATE POLICY "prospecting_activity_delete"
  ON prospecting_activity FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- prospecting_note
ALTER TABLE prospecting_note ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prospecting_note_select" ON prospecting_note;
CREATE POLICY "prospecting_note_select"
  ON prospecting_note FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "prospecting_note_insert" ON prospecting_note;
CREATE POLICY "prospecting_note_insert"
  ON prospecting_note FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "prospecting_note_update" ON prospecting_note;
CREATE POLICY "prospecting_note_update"
  ON prospecting_note FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "prospecting_note_delete" ON prospecting_note;
CREATE POLICY "prospecting_note_delete"
  ON prospecting_note FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- prospecting_time_entry
ALTER TABLE prospecting_time_entry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prospecting_time_entry_select" ON prospecting_time_entry;
CREATE POLICY "prospecting_time_entry_select"
  ON prospecting_time_entry FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "prospecting_time_entry_insert" ON prospecting_time_entry;
CREATE POLICY "prospecting_time_entry_insert"
  ON prospecting_time_entry FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "prospecting_time_entry_update" ON prospecting_time_entry;
CREATE POLICY "prospecting_time_entry_update"
  ON prospecting_time_entry FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "prospecting_time_entry_delete" ON prospecting_time_entry;
CREATE POLICY "prospecting_time_entry_delete"
  ON prospecting_time_entry FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- prospecting_vacation_day
ALTER TABLE prospecting_vacation_day ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prospecting_vacation_day_all" ON prospecting_vacation_day;
CREATE POLICY "prospecting_vacation_day_all"
  ON prospecting_vacation_day FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- prospecting_settings
ALTER TABLE prospecting_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prospecting_settings_all" ON prospecting_settings;
CREATE POLICY "prospecting_settings_all"
  ON prospecting_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- email_template
ALTER TABLE email_template ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_template_select" ON email_template;
CREATE POLICY "email_template_select"
  ON email_template FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "email_template_insert" ON email_template;
CREATE POLICY "email_template_insert"
  ON email_template FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "email_template_update" ON email_template;
CREATE POLICY "email_template_update"
  ON email_template FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "email_template_delete" ON email_template;
CREATE POLICY "email_template_delete"
  ON email_template FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- ============================================================================
-- Views for metrics and reporting
-- ============================================================================

-- Weekly outreach metrics view
CREATE OR REPLACE VIEW v_prospecting_weekly_metrics AS
WITH week_bounds AS (
  SELECT
    date_trunc('week', CURRENT_DATE)::date AS week_start,
    (date_trunc('week', CURRENT_DATE) + interval '6 days')::date AS week_end
),
activity_counts AS (
  SELECT
    activity_type,
    COUNT(*) as count
  FROM prospecting_activity pa, week_bounds wb
  WHERE pa.created_at >= wb.week_start
    AND pa.created_at < wb.week_end + interval '1 day'
  GROUP BY activity_type
),
total_time AS (
  SELECT
    COALESCE(SUM(minutes), 0) as total_minutes
  FROM prospecting_time_entry pte, week_bounds wb
  WHERE pte.entry_date >= wb.week_start
    AND pte.entry_date <= wb.week_end
),
funnel_counts AS (
  SELECT
    status,
    COUNT(*) as count
  FROM hunter_lead
  WHERE status NOT IN ('dismissed', 'dead', 'not_interested', 'already_represented')
  GROUP BY status
)
SELECT
  wb.week_start,
  wb.week_end,

  -- Activity counts
  COALESCE((SELECT count FROM activity_counts WHERE activity_type = 'email'), 0) as emails_sent,
  COALESCE((SELECT count FROM activity_counts WHERE activity_type = 'linkedin'), 0) as linkedin_messages,
  COALESCE((SELECT count FROM activity_counts WHERE activity_type = 'sms'), 0) as sms_sent,
  COALESCE((SELECT count FROM activity_counts WHERE activity_type = 'voicemail'), 0) as voicemails_left,
  COALESCE((SELECT count FROM activity_counts WHERE activity_type = 'call'), 0) as calls_completed,
  COALESCE((SELECT count FROM activity_counts WHERE activity_type = 'meeting'), 0) as meetings_held,

  -- Total touches
  (SELECT COALESCE(SUM(count), 0) FROM activity_counts) as total_touches,

  -- Time tracking
  (SELECT total_minutes FROM total_time) as time_minutes,

  -- Funnel counts
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'new'), 0) as funnel_new,
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'researching'), 0) as funnel_researching,
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'active'), 0) as funnel_active,
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'engaged'), 0) as funnel_engaged,
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'meeting_scheduled'), 0) as funnel_meeting_scheduled,
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'converted'), 0) as funnel_converted,
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'nurture'), 0) as funnel_nurture

FROM week_bounds wb;

-- Stale leads view (not contacted in X days)
CREATE OR REPLACE VIEW v_prospecting_stale_leads AS
SELECT
  hl.*,
  COALESCE(hl.last_contacted_at, hl.created_at) as effective_last_contact,
  EXTRACT(DAY FROM NOW() - COALESCE(hl.last_contacted_at, hl.created_at))::integer as days_since_contact
FROM hunter_lead hl
WHERE hl.status IN ('new', 'researching', 'active', 'engaged', 'nurture')
  AND COALESCE(hl.last_contacted_at, hl.created_at) < NOW() - INTERVAL '45 days'
ORDER BY COALESCE(hl.last_contacted_at, hl.created_at) ASC;

-- Today's time entry helper view
CREATE OR REPLACE VIEW v_prospecting_today_time AS
SELECT
  pte.*,
  ps.daily_time_goal_minutes,
  ROUND((pte.minutes::numeric / NULLIF(ps.daily_time_goal_minutes, 0)) * 100) as percent_of_goal
FROM prospecting_time_entry pte
LEFT JOIN prospecting_settings ps ON ps.user_id = pte.user_id
WHERE pte.entry_date = CURRENT_DATE;

-- ============================================================================
-- Function: Calculate prospecting streak
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_prospecting_streak(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_streak INTEGER := 0;
  v_check_date DATE := CURRENT_DATE;
  v_has_entry BOOLEAN;
  v_is_vacation BOOLEAN;
BEGIN
  LOOP
    -- Check if this date is a vacation day
    SELECT EXISTS(
      SELECT 1 FROM prospecting_vacation_day
      WHERE user_id = p_user_id AND vacation_date = v_check_date
    ) INTO v_is_vacation;

    IF v_is_vacation THEN
      -- Skip vacation days - don't count for or against streak
      v_check_date := v_check_date - 1;
      CONTINUE;
    END IF;

    -- Check if there's a time entry for this date
    SELECT EXISTS(
      SELECT 1 FROM prospecting_time_entry
      WHERE user_id = p_user_id
        AND entry_date = v_check_date
        AND minutes > 0
    ) INTO v_has_entry;

    IF v_has_entry THEN
      v_streak := v_streak + 1;
      v_check_date := v_check_date - 1;
    ELSE
      -- Streak broken
      EXIT;
    END IF;

    -- Safety limit to prevent infinite loops
    IF v_check_date < CURRENT_DATE - 365 THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Add task category for prospecting tasks
-- ============================================================================

-- Insert prospecting task category if task_category table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_category') THEN
    INSERT INTO task_category (name, color, description)
    VALUES ('Prospecting', '#f97316', 'Prospecting and outreach tasks')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE prospecting_activity IS 'Tracks outreach activities (calls, emails, etc.) on leads and contacts';
COMMENT ON TABLE prospecting_note IS 'Running notes on leads and contacts for conversation tracking';
COMMENT ON TABLE prospecting_time_entry IS 'Daily time tracking for prospecting work';
COMMENT ON TABLE prospecting_vacation_day IS 'Vacation days that do not count against prospecting streak';
COMMENT ON TABLE prospecting_settings IS 'User-specific settings for prospecting goals and thresholds';
COMMENT ON TABLE email_template IS 'Reusable email templates for outreach';
COMMENT ON VIEW v_prospecting_weekly_metrics IS 'Aggregated prospecting metrics for the current week';
COMMENT ON VIEW v_prospecting_stale_leads IS 'Leads that have not been contacted in 45+ days';
COMMENT ON VIEW v_prospecting_today_time IS 'Today''s time entry with goal percentage';
COMMENT ON FUNCTION calculate_prospecting_streak IS 'Calculates consecutive days of prospecting, excluding vacation days';
