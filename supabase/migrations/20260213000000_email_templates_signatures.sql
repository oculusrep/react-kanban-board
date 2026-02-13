-- Email Templates and Signatures for Hunter
-- Migration: 20260213000000_email_templates_signatures.sql

-- ============================================================================
-- Email Templates Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL, -- HTML content
  category TEXT, -- e.g., 'Cold Outreach', 'Follow-up', 'Meeting Request'
  created_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
  is_shared BOOLEAN DEFAULT false, -- If true, visible to all users
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_template_created_by ON email_template(created_by);
CREATE INDEX IF NOT EXISTS idx_email_template_category ON email_template(category);
CREATE INDEX IF NOT EXISTS idx_email_template_is_shared ON email_template(is_shared);

-- ============================================================================
-- User Email Signatures Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_email_signature (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default Signature',
  signature_html TEXT NOT NULL, -- HTML content with images
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name) -- Each user can have multiple named signatures
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_email_signature_user_id ON user_email_signature(user_id);
CREATE INDEX IF NOT EXISTS idx_user_email_signature_is_default ON user_email_signature(is_default);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE email_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_email_signature ENABLE ROW LEVEL SECURITY;

-- Email Template Policies
-- Users can view their own templates and shared templates
CREATE POLICY "Users can view own and shared templates"
  ON email_template FOR SELECT
  USING (
    created_by = auth.uid() OR
    is_shared = true OR
    EXISTS (
      SELECT 1 FROM "user" u
      WHERE u.id = auth.uid()
      AND u.ovis_role IN ('admin', 'super_admin')
    )
  );

-- Users can insert their own templates
CREATE POLICY "Users can create templates"
  ON email_template FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Users can update their own templates (admins can update any)
CREATE POLICY "Users can update own templates"
  ON email_template FOR UPDATE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM "user" u
      WHERE u.id = auth.uid()
      AND u.ovis_role IN ('admin', 'super_admin')
    )
  );

-- Users can delete their own templates (admins can delete any)
CREATE POLICY "Users can delete own templates"
  ON email_template FOR DELETE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM "user" u
      WHERE u.id = auth.uid()
      AND u.ovis_role IN ('admin', 'super_admin')
    )
  );

-- User Email Signature Policies
-- Users can only see their own signatures
CREATE POLICY "Users can view own signatures"
  ON user_email_signature FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own signatures
CREATE POLICY "Users can create signatures"
  ON user_email_signature FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own signatures
CREATE POLICY "Users can update own signatures"
  ON user_email_signature FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own signatures
CREATE POLICY "Users can delete own signatures"
  ON user_email_signature FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- Trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_email_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_template_updated_at
  BEFORE UPDATE ON email_template
  FOR EACH ROW
  EXECUTE FUNCTION update_email_template_updated_at();

CREATE TRIGGER user_email_signature_updated_at
  BEFORE UPDATE ON user_email_signature
  FOR EACH ROW
  EXECUTE FUNCTION update_email_template_updated_at();

-- ============================================================================
-- Seed some default template categories
-- ============================================================================

COMMENT ON TABLE email_template IS 'Email templates for Hunter prospecting with variable substitution support. Variables: {{first_name}}, {{last_name}}, {{company}}, {{full_name}}';
COMMENT ON TABLE user_email_signature IS 'Per-user email signatures with rich HTML and image support';
