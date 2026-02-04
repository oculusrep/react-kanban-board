-- Portal Email Template Settings
-- Stores customizable email templates for portal invitations

-- Create app_settings table for storing various application settings
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES "user"(id)
);

-- Add RLS policies
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view and modify settings
CREATE POLICY "Admins can view settings"
    ON app_settings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "user"
            WHERE id = auth.uid()
            AND ovis_role = 'admin'
        )
    );

CREATE POLICY "Admins can modify settings"
    ON app_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "user"
            WHERE id = auth.uid()
            AND ovis_role = 'admin'
        )
    );

-- Insert default portal invite email template
INSERT INTO app_settings (key, value, description)
VALUES (
    'portal_invite_email_template',
    '{
        "subject": "You''re Invited to the Oculus Client Portal",
        "message": "Hi {{firstName}},\n\nYou''ve been invited to access the Oculus Client Portal. This portal gives you visibility into your real estate projects, including property details, documents, and direct communication with your broker team.\n\nClick the button below to set up your account.\n\nIf you have any questions, simply reply to this email or reach out to your broker representative.\n\nBest regards"
    }'::jsonb,
    'Default email template for portal invitations. Use {{firstName}} for contact''s first name.'
)
ON CONFLICT (key) DO NOTHING;

-- Grant access to service role for edge functions
GRANT SELECT ON app_settings TO service_role;
