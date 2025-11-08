-- Migration: Assign site submits based on client
-- Purpose: Assign site submits to the appropriate user based on client
-- Special handling for Huey Magoo's - Matt Parmer → Mike
-- All other NULL site submits → Arty

-- User IDs (using user.id since that's what the FK constraint expects):
-- Mike Minihan user.id: fe6e516f-11e1-4a3b-b914-910d59d9e8df
-- Arty Santos user.id: c0e5fde5-9412-4a62-8711-9a6bf74d6e99

-- =====================================================================
-- Step 1: Find the Huey Magoo's client ID
-- =====================================================================

SELECT
  id,
  client_name,
  created_by_id,
  updated_by_id
FROM client
WHERE client_name ILIKE '%Huey%Magoo%'
   OR client_name ILIKE '%Matt%Parmer%';

-- =====================================================================
-- Step 2: Check current state of site submits
-- =====================================================================

SELECT
  'Current state' as status,
  COUNT(*) FILTER (WHERE created_by_id IS NULL) as null_creator,
  COUNT(*) FILTER (WHERE created_by_id IS NOT NULL) as has_creator,
  COUNT(*) as total
FROM site_submit;

-- Show breakdown by client for NULL creators
SELECT
  c.client_name,
  COUNT(*) as null_site_submits
FROM site_submit s
LEFT JOIN client c ON s.client_id = c.id
WHERE s.created_by_id IS NULL
GROUP BY c.client_name
ORDER BY null_site_submits DESC
LIMIT 20;

-- =====================================================================
-- Step 3: Assign Huey Magoo's site submits to Mike
-- =====================================================================

-- First, update site submits for Huey Magoo's client(s)
UPDATE site_submit s
SET
  created_by_id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df',
  updated_by_id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df'
FROM client c
WHERE s.client_id = c.id
  AND s.created_by_id IS NULL
  AND (
    c.client_name ILIKE '%Huey%Magoo%'
    OR c.client_name ILIKE '%Matt%Parmer%'
  );

-- Show how many were assigned to Mike
SELECT
  'Huey Magoos assigned to Mike' as action,
  COUNT(*) as count
FROM site_submit s
JOIN client c ON s.client_id = c.id
WHERE s.created_by_id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df'
  AND (
    c.client_name ILIKE '%Huey%Magoo%'
    OR c.client_name ILIKE '%Matt%Parmer%'
  );

-- =====================================================================
-- Step 4: Assign remaining NULL site submits to Arty
-- =====================================================================

UPDATE site_submit
SET
  created_by_id = 'c0e5fde5-9412-4a62-8711-9a6bf74d6e99',
  updated_by_id = 'c0e5fde5-9412-4a62-8711-9a6bf74d6e99'
WHERE created_by_id IS NULL;

-- =====================================================================
-- Verification
-- =====================================================================

-- Check final state
SELECT
  'After assignment' as status,
  COUNT(*) FILTER (WHERE created_by_id IS NULL) as null_creator,
  COUNT(*) FILTER (WHERE created_by_id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df') as mike_site_submits,
  COUNT(*) FILTER (WHERE created_by_id = 'c0e5fde5-9412-4a62-8711-9a6bf74d6e99') as arty_site_submits,
  COUNT(*) as total
FROM site_submit;

-- Show breakdown by creator
SELECT
  s.created_by_id,
  u.name as creator_name,
  COUNT(*) as site_submit_count
FROM site_submit s
LEFT JOIN "user" u ON (s.created_by_id = u.id OR s.created_by_id = u.auth_user_id)
GROUP BY s.created_by_id, u.name
ORDER BY site_submit_count DESC;

-- Show Huey Magoo's site submits specifically
SELECT
  'Huey Magoos site submits' as description,
  u.name as assigned_to,
  COUNT(*) as count
FROM site_submit s
JOIN client c ON s.client_id = c.id
LEFT JOIN "user" u ON (s.created_by_id = u.id OR s.created_by_id = u.auth_user_id)
WHERE c.client_name ILIKE '%Huey%Magoo%'
   OR c.client_name ILIKE '%Matt%Parmer%'
GROUP BY u.name;

-- Summary
SELECT
  'Total site submits assigned' as summary,
  COUNT(*) FILTER (WHERE created_by_id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df') as to_mike,
  COUNT(*) FILTER (WHERE created_by_id = 'c0e5fde5-9412-4a62-8711-9a6bf74d6e99') as to_arty,
  COUNT(*) FILTER (WHERE created_by_id IS NULL) as still_null,
  COUNT(*) as total
FROM site_submit;
