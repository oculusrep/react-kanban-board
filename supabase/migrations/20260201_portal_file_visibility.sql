-- Portal File Visibility Schema Migration
-- Created: February 1, 2026
-- Description: Add table and functions for controlling file visibility in the client portal
--
-- Design Philosophy:
-- - Property files are VISIBLE by default (brokers can hide specific files/folders)
-- - Deal files are HIDDEN by default (brokers must explicitly share files/folders)

-- ============================================================================
-- 1. CREATE PORTAL FILE VISIBILITY TABLE
-- ============================================================================
-- Tracks visibility overrides for files/folders in the portal
-- If no record exists: property files = visible, deal files = hidden

CREATE TABLE IF NOT EXISTS portal_file_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The Dropbox path of the file or folder
  dropbox_path TEXT NOT NULL,

  -- Entity type and ID for the source (property or deal)
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('property', 'deal')),
  entity_id UUID NOT NULL,

  -- For deal files: which site_submit this is associated with (for portal access)
  site_submit_id UUID REFERENCES site_submit(id) ON DELETE CASCADE,

  -- Visibility override
  -- For property files: FALSE means hidden (override default visible)
  -- For deal files: TRUE means shared (override default hidden)
  is_visible BOOLEAN NOT NULL,

  -- Who made the visibility change
  changed_by_id UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique path per entity
  UNIQUE(entity_type, entity_id, dropbox_path)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_portal_file_visibility_entity
ON portal_file_visibility(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_portal_file_visibility_site_submit
ON portal_file_visibility(site_submit_id) WHERE site_submit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portal_file_visibility_path
ON portal_file_visibility(dropbox_path);

-- ============================================================================
-- 2. UPDATE TRIGGER FOR UPDATED_AT
-- ============================================================================

DROP TRIGGER IF EXISTS update_portal_file_visibility_updated_at ON portal_file_visibility;
CREATE TRIGGER update_portal_file_visibility_updated_at
  BEFORE UPDATE ON portal_file_visibility
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. FUNCTION TO CHECK FILE VISIBILITY FOR PORTAL
-- ============================================================================
-- Returns TRUE if file should be shown in portal, FALSE otherwise

CREATE OR REPLACE FUNCTION is_file_visible_in_portal(
  p_dropbox_path TEXT,
  p_entity_type VARCHAR(20),
  p_entity_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_override_visibility BOOLEAN;
  v_is_in_hidden_folder BOOLEAN := FALSE;
BEGIN
  -- First check if there's an explicit override for this exact path
  SELECT is_visible INTO v_override_visibility
  FROM portal_file_visibility
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND dropbox_path = p_dropbox_path;

  IF FOUND THEN
    RETURN v_override_visibility;
  END IF;

  -- Check if this file is inside a folder that has visibility set
  -- Find the most specific (longest path) parent folder with visibility set
  SELECT is_visible INTO v_override_visibility
  FROM portal_file_visibility
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND p_dropbox_path LIKE dropbox_path || '/%'
  ORDER BY LENGTH(dropbox_path) DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_override_visibility;
  END IF;

  -- No override found, use defaults:
  -- Property files: visible by default
  -- Deal files: hidden by default
  IF p_entity_type = 'property' THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 4. FUNCTION TO SET FILE VISIBILITY
-- ============================================================================

CREATE OR REPLACE FUNCTION set_portal_file_visibility(
  p_dropbox_path TEXT,
  p_entity_type VARCHAR(20),
  p_entity_id UUID,
  p_is_visible BOOLEAN,
  p_site_submit_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO portal_file_visibility (
    dropbox_path,
    entity_type,
    entity_id,
    site_submit_id,
    is_visible,
    changed_by_id
  )
  VALUES (
    p_dropbox_path,
    p_entity_type,
    p_entity_id,
    p_site_submit_id,
    p_is_visible,
    p_user_id
  )
  ON CONFLICT (entity_type, entity_id, dropbox_path)
  DO UPDATE SET
    is_visible = p_is_visible,
    site_submit_id = COALESCE(p_site_submit_id, portal_file_visibility.site_submit_id),
    changed_by_id = p_user_id,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. FUNCTION TO REMOVE VISIBILITY OVERRIDE (RESET TO DEFAULT)
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_portal_file_visibility(
  p_dropbox_path TEXT,
  p_entity_type VARCHAR(20),
  p_entity_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM portal_file_visibility
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND dropbox_path = p_dropbox_path;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. FUNCTION TO GET ALL VISIBILITY OVERRIDES FOR AN ENTITY
-- ============================================================================

CREATE OR REPLACE FUNCTION get_portal_file_visibility_overrides(
  p_entity_type VARCHAR(20),
  p_entity_id UUID
) RETURNS TABLE (
  dropbox_path TEXT,
  is_visible BOOLEAN,
  changed_by_id UUID,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pfv.dropbox_path,
    pfv.is_visible,
    pfv.changed_by_id,
    pfv.updated_at
  FROM portal_file_visibility pfv
  WHERE pfv.entity_type = p_entity_type
    AND pfv.entity_id = p_entity_id
  ORDER BY pfv.dropbox_path;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON portal_file_visibility TO authenticated;
GRANT EXECUTE ON FUNCTION is_file_visible_in_portal TO authenticated;
GRANT EXECUTE ON FUNCTION set_portal_file_visibility TO authenticated;
GRANT EXECUTE ON FUNCTION reset_portal_file_visibility TO authenticated;
GRANT EXECUTE ON FUNCTION get_portal_file_visibility_overrides TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
