-- Migration: Fix v_prospecting_target view security
-- Description: Recreate the view with SECURITY INVOKER to use the querying user's permissions
-- This addresses the Supabase linter warning about SECURITY DEFINER views

-- Drop and recreate the view with explicit SECURITY INVOKER
DROP VIEW IF EXISTS v_prospecting_target;

CREATE VIEW v_prospecting_target
WITH (security_invoker = true)
AS
SELECT
  pt.id,
  pt.company_name,
  pt.website,
  pt.notes,
  pt.source,
  pt.status,
  pt.priority,
  pt.target_date,
  pt.assigned_to,
  assigned_user.first_name || ' ' || assigned_user.last_name AS assigned_to_name,
  pt.owner_id,
  owner_user.first_name || ' ' || owner_user.last_name AS owner_name,
  pt.research_notes,
  pt.contacts_found,
  pt.researched_at,
  pt.researched_by,
  researcher.first_name || ' ' || researcher.last_name AS researched_by_name,
  pt.converted_contact_id,
  pt.converted_client_id,
  pt.converted_at,
  pt.created_at,
  pt.updated_at
FROM prospecting_target pt
LEFT JOIN "user" assigned_user ON pt.assigned_to = assigned_user.id
LEFT JOIN "user" owner_user ON pt.owner_id = owner_user.id
LEFT JOIN "user" researcher ON pt.researched_by = researcher.id;

-- Grant access to authenticated users
GRANT SELECT ON v_prospecting_target TO authenticated;

-- Verify the fix
DO $$
BEGIN
  RAISE NOTICE 'v_prospecting_target view recreated with SECURITY INVOKER';
END $$;
