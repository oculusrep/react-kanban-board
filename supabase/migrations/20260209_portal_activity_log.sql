-- Portal Activity Log
-- Created: February 9, 2026
-- Purpose: Track all portal user activity for analytics and auditing

-- Create the portal_activity_log table
CREATE TABLE IF NOT EXISTS public.portal_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User identification (at least one should be set)
  contact_id UUID REFERENCES public.contact(id) ON DELETE SET NULL,
  auth_user_id UUID, -- References auth.users but no FK constraint for flexibility

  -- Event details
  event_type TEXT NOT NULL, -- 'login', 'logout', 'page_view', 'view_property', 'download_document', etc.
  event_data JSONB DEFAULT '{}', -- Additional event-specific data

  -- Context
  page_path TEXT, -- URL path where event occurred
  client_id UUID REFERENCES public.client(id) ON DELETE SET NULL, -- Which client context (if applicable)

  -- Session/request info
  session_id TEXT, -- Browser session identifier
  ip_address INET,
  user_agent TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_portal_activity_contact_id ON public.portal_activity_log(contact_id);
CREATE INDEX idx_portal_activity_auth_user_id ON public.portal_activity_log(auth_user_id);
CREATE INDEX idx_portal_activity_event_type ON public.portal_activity_log(event_type);
CREATE INDEX idx_portal_activity_created_at ON public.portal_activity_log(created_at DESC);
CREATE INDEX idx_portal_activity_client_id ON public.portal_activity_log(client_id);

-- Composite index for user activity queries
CREATE INDEX idx_portal_activity_contact_created ON public.portal_activity_log(contact_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.portal_activity_log ENABLE ROW LEVEL SECURITY;

-- Policy: Admins and brokers can view all activity
CREATE POLICY "Admins can view all portal activity"
  ON public.portal_activity_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public."user" u
      WHERE u.auth_user_id = auth.uid()
      AND u.ovis_role IN ('admin', 'broker_full', 'broker_limited')
    )
  );

-- Policy: Portal users can only view their own activity
CREATE POLICY "Portal users can view own activity"
  ON public.portal_activity_log
  FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
  );

-- Policy: Allow inserts from authenticated users (for tracking)
CREATE POLICY "Allow activity log inserts"
  ON public.portal_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow anonymous inserts for login tracking
CREATE POLICY "Allow anonymous activity log inserts"
  ON public.portal_activity_log
  FOR INSERT
  TO anon
  WITH CHECK (event_type IN ('login_attempt', 'login_failed', 'invite_clicked'));

-- Function to log portal activity (convenience function)
CREATE OR REPLACE FUNCTION public.log_portal_activity(
  p_event_type TEXT,
  p_contact_id UUID DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}',
  p_page_path TEXT DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_activity_id UUID;
  v_auth_user_id UUID;
BEGIN
  -- Get current auth user if available
  v_auth_user_id := auth.uid();

  -- If no contact_id provided but we have auth user, try to find contact
  IF p_contact_id IS NULL AND v_auth_user_id IS NOT NULL THEN
    SELECT id INTO p_contact_id
    FROM public.contact
    WHERE portal_auth_user_id = v_auth_user_id
    LIMIT 1;
  END IF;

  -- Insert the activity log
  INSERT INTO public.portal_activity_log (
    contact_id,
    auth_user_id,
    event_type,
    event_data,
    page_path,
    client_id,
    session_id
  ) VALUES (
    p_contact_id,
    v_auth_user_id,
    p_event_type,
    p_event_data,
    p_page_path,
    p_client_id,
    p_session_id
  )
  RETURNING id INTO v_activity_id;

  -- Update contact's last login if this is a login event
  IF p_event_type = 'login' AND p_contact_id IS NOT NULL THEN
    UPDATE public.contact
    SET portal_last_login_at = NOW()
    WHERE id = p_contact_id;
  END IF;

  RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.log_portal_activity TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_portal_activity TO anon;

-- View for portal user analytics summary
CREATE OR REPLACE VIEW public.portal_user_analytics AS
SELECT
  c.id AS contact_id,
  c.first_name,
  c.last_name,
  c.email,
  c.portal_access_enabled,
  c.portal_invite_status,
  c.portal_invite_sent_at,
  c.portal_invite_expires_at,
  c.portal_last_login_at,
  c.portal_auth_user_id,

  -- Get associated clients
  (
    SELECT jsonb_agg(jsonb_build_object('id', cl.id, 'name', cl.client_name))
    FROM public.portal_user_client_access puca
    JOIN public.client cl ON cl.id = puca.client_id
    WHERE puca.contact_id = c.id AND puca.is_active = true
  ) AS clients,

  -- Activity stats
  (
    SELECT COUNT(*)
    FROM public.portal_activity_log pal
    WHERE pal.contact_id = c.id AND pal.event_type = 'login'
  ) AS total_logins,

  (
    SELECT COUNT(*)
    FROM public.portal_activity_log pal
    WHERE pal.contact_id = c.id AND pal.event_type = 'page_view'
  ) AS total_page_views,

  (
    SELECT MAX(created_at)
    FROM public.portal_activity_log pal
    WHERE pal.contact_id = c.id
  ) AS last_activity_at,

  -- Calculate status
  CASE
    WHEN c.portal_auth_user_id IS NOT NULL AND c.portal_last_login_at IS NOT NULL THEN 'active'
    WHEN c.portal_auth_user_id IS NOT NULL AND c.portal_last_login_at IS NULL THEN 'account_created'
    WHEN c.portal_invite_status = 'pending' AND c.portal_invite_expires_at > NOW() THEN 'invite_pending'
    WHEN c.portal_invite_status = 'pending' AND c.portal_invite_expires_at <= NOW() THEN 'invite_expired'
    WHEN c.portal_invite_status = 'expired' THEN 'invite_expired'
    WHEN c.portal_access_enabled = true THEN 'not_invited'
    ELSE 'no_access'
  END AS portal_status

FROM public.contact c
WHERE c.portal_access_enabled = true
   OR c.portal_invite_status IS NOT NULL
   OR c.portal_auth_user_id IS NOT NULL;

-- Grant access to the view
GRANT SELECT ON public.portal_user_analytics TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE public.portal_activity_log IS
'Tracks all portal user activity including logins, page views, and specific actions for analytics and auditing.';

COMMENT ON VIEW public.portal_user_analytics IS
'Aggregated view of portal user status and activity metrics for the admin dashboard.';
