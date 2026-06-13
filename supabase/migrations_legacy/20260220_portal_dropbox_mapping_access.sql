-- Portal Dropbox Mapping Access Fix
-- Created: February 20, 2026
-- Description: Ensure portal users can access dropbox_mapping table for viewing files
--
-- Issue: Portal users (clients) cannot see property files in the Files tab
-- Root cause: The dropbox_mapping table RLS policy may not be properly allowing portal users

-- ============================================================================
-- 1. VERIFY RLS IS ENABLED (should already be)
-- ============================================================================

ALTER TABLE dropbox_mapping ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. DROP AND RECREATE POLICIES TO ENSURE PROPER ACCESS
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view dropbox mappings" ON dropbox_mapping;
DROP POLICY IF EXISTS "Users can insert dropbox mappings" ON dropbox_mapping;
DROP POLICY IF EXISTS "Users can update dropbox mappings" ON dropbox_mapping;
DROP POLICY IF EXISTS "Users can delete dropbox mappings" ON dropbox_mapping;
DROP POLICY IF EXISTS "dropbox_mapping_select_all" ON dropbox_mapping;
DROP POLICY IF EXISTS "dropbox_mapping_insert_internal" ON dropbox_mapping;
DROP POLICY IF EXISTS "dropbox_mapping_update_internal" ON dropbox_mapping;
DROP POLICY IF EXISTS "dropbox_mapping_delete_internal" ON dropbox_mapping;

-- SELECT: All authenticated users can view dropbox mappings
-- This is needed for portal users to see property files
CREATE POLICY "dropbox_mapping_select_all"
ON dropbox_mapping
FOR SELECT
TO authenticated
USING (true);

-- INSERT: Only internal users can create mappings
CREATE POLICY "dropbox_mapping_insert_internal"
ON dropbox_mapping
FOR INSERT
TO authenticated
WITH CHECK (public.is_internal_user());

-- UPDATE: Only internal users can update mappings
CREATE POLICY "dropbox_mapping_update_internal"
ON dropbox_mapping
FOR UPDATE
TO authenticated
USING (public.is_internal_user());

-- DELETE: Only internal users can delete mappings
CREATE POLICY "dropbox_mapping_delete_internal"
ON dropbox_mapping
FOR DELETE
TO authenticated
USING (public.is_internal_user());

-- ============================================================================
-- 3. CREATE SECURITY DEFINER FUNCTION FOR GETTING DROPBOX PATH
-- This bypasses RLS entirely for retrieving the path
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_dropbox_folder_path(
  p_entity_type TEXT,
  p_entity_id UUID
) RETURNS TEXT AS $$
  SELECT dropbox_folder_path
  FROM dropbox_mapping
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_dropbox_folder_path TO authenticated;

-- ============================================================================
-- 4. ENSURE portal_file_visibility IS ACCESSIBLE
-- ============================================================================

-- Enable RLS on portal_file_visibility if not already
ALTER TABLE portal_file_visibility ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "portal_file_visibility_select_all" ON portal_file_visibility;
DROP POLICY IF EXISTS "portal_file_visibility_internal_all" ON portal_file_visibility;

-- SELECT: All authenticated users can view visibility settings
-- This allows portal users to know which files are visible to them
CREATE POLICY "portal_file_visibility_select_all"
ON portal_file_visibility
FOR SELECT
TO authenticated
USING (true);

-- INSERT/UPDATE/DELETE: Only internal users can modify visibility
CREATE POLICY "portal_file_visibility_internal_all"
ON portal_file_visibility
FOR ALL
TO authenticated
USING (public.is_internal_user())
WITH CHECK (public.is_internal_user());

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
