-- Migration: Property Activity Timeline
-- Description: Add activity logging and notes tables for properties,
-- replacing the property_notes and description fields with a Slack-like timeline.
-- Date: 2026-02-21

-- ============================================================================
-- property_activity: Activity logging for properties (calls, emails, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS property_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to property (required)
  property_id UUID NOT NULL REFERENCES property(id) ON DELETE CASCADE,

  -- Optional link to contact (for "Called John Smith about this property")
  contact_id UUID REFERENCES contact(id) ON DELETE SET NULL,

  -- Activity type
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'phone_call',   -- Phone call made
    'email',        -- Email sent (auto-logged or manual)
    'sms',          -- SMS text message
    'voicemail',    -- Left voicemail
    'linkedin'      -- LinkedIn message
  )),

  -- Activity details
  notes TEXT,                     -- Optional notes/details about the activity
  email_subject TEXT,             -- For email activities

  -- Timestamps and attribution
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_property_activity_property ON property_activity(property_id);
CREATE INDEX IF NOT EXISTS idx_property_activity_contact ON property_activity(contact_id);
CREATE INDEX IF NOT EXISTS idx_property_activity_type ON property_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_property_activity_created ON property_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_activity_created_by ON property_activity(created_by);

-- ============================================================================
-- property_note: Slack-like notes on properties
-- ============================================================================

CREATE TABLE IF NOT EXISTS property_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to property (required)
  property_id UUID NOT NULL REFERENCES property(id) ON DELETE CASCADE,

  -- Note content
  content TEXT NOT NULL,

  -- Migration tracking
  is_migrated BOOLEAN DEFAULT FALSE,  -- Flag for migrated notes from legacy fields
  migrated_from TEXT,                 -- 'property_notes' or 'description'

  -- Timestamps and attribution
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_property_note_property ON property_note(property_id);
CREATE INDEX IF NOT EXISTS idx_property_note_created ON property_note(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_note_created_by ON property_note(created_by);

-- ============================================================================
-- Data Migration: Move existing property_notes and description to property_note
-- ============================================================================

-- Migrate property_notes to property_note table
-- Using NOW() for created_at since we want to show migration date with [Migrated] label
INSERT INTO property_note (property_id, content, is_migrated, migrated_from, created_at)
SELECT
  id,
  property_notes,
  TRUE,
  'property_notes',
  NOW()
FROM property
WHERE property_notes IS NOT NULL AND TRIM(property_notes) != '';

-- Migrate description to property_note table
INSERT INTO property_note (property_id, content, is_migrated, migrated_from, created_at)
SELECT
  id,
  description,
  TRUE,
  'description',
  NOW()
FROM property
WHERE description IS NOT NULL AND TRIM(description) != '';

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on both tables
ALTER TABLE property_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_note ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view all activities
CREATE POLICY "Users can view property activities"
  ON property_activity
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert activities
CREATE POLICY "Users can insert property activities"
  ON property_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow users to update their own activities
CREATE POLICY "Users can update their own property activities"
  ON property_activity
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

-- Policy: Allow users to delete their own activities
CREATE POLICY "Users can delete their own property activities"
  ON property_activity
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Policy: Allow authenticated users to view all notes
CREATE POLICY "Users can view property notes"
  ON property_note
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert notes
CREATE POLICY "Users can insert property notes"
  ON property_note
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow users to update their own notes
CREATE POLICY "Users can update their own property notes"
  ON property_note
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

-- Policy: Allow users to delete their own notes
CREATE POLICY "Users can delete their own property notes"
  ON property_note
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE property_activity IS 'Activity logging for properties - tracks calls, emails, SMS, voicemails, and LinkedIn messages';
COMMENT ON TABLE property_note IS 'Slack-like notes on properties - replaces legacy property_notes and description fields';

COMMENT ON COLUMN property_activity.contact_id IS 'Optional link to contact for activity attribution (e.g., "Called John Smith")';
COMMENT ON COLUMN property_activity.activity_type IS 'Type of activity: phone_call, email, sms, voicemail, linkedin';

COMMENT ON COLUMN property_note.is_migrated IS 'TRUE if note was migrated from legacy property_notes or description field';
COMMENT ON COLUMN property_note.migrated_from IS 'Source field for migrated notes: property_notes or description';
