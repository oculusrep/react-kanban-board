-- =====================================================================
-- CREATOR TRACKING SYSTEM - SIMPLIFIED TEST SCRIPT
-- =====================================================================
-- Purpose: Verify that creator/updater tracking works correctly
-- This is a simplified version that avoids disk space issues
-- Run queries individually rather than all at once
-- =====================================================================

-- =====================================================================
-- PART 1: Verify Current State
-- =====================================================================

-- Check that all triggers are active
SELECT
  'Active Triggers' as test_section,
  trigger_name,
  event_object_table as table_name,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_name LIKE '%audit_fields%'
ORDER BY event_object_table;

-- Check that defaults are set
SELECT
  'Column Defaults' as test_section,
  table_name,
  column_name,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('created_by_id', 'updated_by_id')
  AND table_name IN ('property', 'site_submit', 'deal', 'client', 'contact', 'note', 'activity')
ORDER BY table_name, column_name;

-- =====================================================================
-- PART 2: Quick NULL Check (Individual Tables)
-- =====================================================================

-- Run these queries ONE AT A TIME to avoid disk space issues

-- Property table
SELECT
  'property' as table_name,
  COUNT(*) FILTER (WHERE created_by_id IS NULL) as null_created_by,
  COUNT(*) FILTER (WHERE updated_by_id IS NULL) as null_updated_by,
  COUNT(*) as total_records,
  CASE
    WHEN COUNT(*) FILTER (WHERE created_by_id IS NULL) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL'
  END as status
FROM property;

-- Site submit table
SELECT
  'site_submit' as table_name,
  COUNT(*) FILTER (WHERE created_by_id IS NULL) as null_created_by,
  COUNT(*) FILTER (WHERE updated_by_id IS NULL) as null_updated_by,
  COUNT(*) as total_records,
  CASE
    WHEN COUNT(*) FILTER (WHERE created_by_id IS NULL) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL'
  END as status
FROM site_submit;

-- Deal table
SELECT
  'deal' as table_name,
  COUNT(*) FILTER (WHERE created_by_id IS NULL) as null_created_by,
  COUNT(*) FILTER (WHERE updated_by_id IS NULL) as null_updated_by,
  COUNT(*) as total_records,
  CASE
    WHEN COUNT(*) FILTER (WHERE created_by_id IS NULL) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL'
  END as status
FROM deal;

-- Client table
SELECT
  'client' as table_name,
  COUNT(*) FILTER (WHERE created_by_id IS NULL) as null_created_by,
  COUNT(*) FILTER (WHERE updated_by_id IS NULL) as null_updated_by,
  COUNT(*) as total_records,
  CASE
    WHEN COUNT(*) FILTER (WHERE created_by_id IS NULL) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL'
  END as status
FROM client;

-- Contact table
SELECT
  'contact' as table_name,
  COUNT(*) FILTER (WHERE created_by_id IS NULL) as null_created_by,
  COUNT(*) FILTER (WHERE updated_by_id IS NULL) as null_updated_by,
  COUNT(*) as total_records,
  CASE
    WHEN COUNT(*) FILTER (WHERE created_by_id IS NULL) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL'
  END as status
FROM contact;

-- Note table
SELECT
  'note' as table_name,
  COUNT(*) FILTER (WHERE created_by_id IS NULL) as null_created_by,
  COUNT(*) FILTER (WHERE updated_by_id IS NULL) as null_updated_by,
  COUNT(*) as total_records,
  CASE
    WHEN COUNT(*) FILTER (WHERE created_by_id IS NULL) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL'
  END as status
FROM note;

-- Activity table
SELECT
  'activity' as table_name,
  COUNT(*) FILTER (WHERE created_by_id IS NULL) as null_created_by,
  COUNT(*) FILTER (WHERE updated_by_id IS NULL) as null_updated_by,
  COUNT(*) as total_records,
  CASE
    WHEN COUNT(*) FILTER (WHERE created_by_id IS NULL) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL'
  END as status
FROM activity;

-- =====================================================================
-- PART 3: Recent Record Verification
-- =====================================================================

-- Recent Contacts
SELECT
  'Recent Contacts (Last 5)' as test_section,
  c.id,
  c.first_name,
  c.last_name,
  c.created_by_id,
  u.name as created_by_name,
  c.created_at,
  CASE
    WHEN c.created_by_id IS NOT NULL THEN '✓ PASS - Creator tracked'
    ELSE '✗ FAIL - Creator NULL'
  END as status
FROM contact c
LEFT JOIN "user" u ON (c.created_by_id = u.id OR c.created_by_id = u.auth_user_id)
ORDER BY c.created_at DESC NULLS LAST
LIMIT 5;

-- Recent Site Submits
SELECT
  'Recent Site Submits (Last 5)' as test_section,
  s.id,
  s.site_submit_name,
  s.created_by_id,
  u.name as created_by_name,
  s.created_at,
  CASE
    WHEN s.created_by_id IS NOT NULL THEN '✓ PASS - Creator tracked'
    ELSE '✗ FAIL - Creator NULL'
  END as status
FROM site_submit s
LEFT JOIN "user" u ON (s.created_by_id = u.id OR s.created_by_id = u.auth_user_id)
ORDER BY s.created_at DESC NULLS LAST
LIMIT 5;

-- =====================================================================
-- PART 4: User Attribution
-- =====================================================================

-- Contact creators
SELECT
  'Contact Creators' as test_section,
  u.name as creator_name,
  u.email as creator_email,
  COUNT(*) as contacts_created
FROM contact c
LEFT JOIN "user" u ON (c.created_by_id = u.id OR c.created_by_id = u.auth_user_id)
GROUP BY u.name, u.email
ORDER BY contacts_created DESC
LIMIT 10;

-- Site submit creators
SELECT
  'Site Submit Creators' as test_section,
  u.name as creator_name,
  u.email as creator_email,
  COUNT(*) as site_submits_created
FROM site_submit s
LEFT JOIN "user" u ON (s.created_by_id = u.id OR s.created_by_id = u.auth_user_id)
GROUP BY u.name, u.email
ORDER BY site_submits_created DESC
LIMIT 10;

-- =====================================================================
-- PART 5: Huey Magoo's Verification
-- =====================================================================

SELECT
  'Huey Magoos Verification' as test_section,
  c.client_name,
  u.name as creator_name,
  u.email as creator_email,
  COUNT(*) as site_submit_count,
  CASE
    WHEN u.name = 'Mike Minihan' THEN '✓ PASS - Assigned to Mike'
    ELSE '✗ FAIL - Not assigned to Mike'
  END as status
FROM site_submit s
JOIN client c ON s.client_id = c.id
LEFT JOIN "user" u ON (s.created_by_id = u.id OR s.created_by_id = u.auth_user_id)
WHERE c.client_name ILIKE '%Huey%Magoo%'
   OR c.client_name ILIKE '%Matt%Parmer%'
GROUP BY c.client_name, u.name, u.email;

-- =====================================================================
-- PART 6: Auth Linking Status
-- =====================================================================

SELECT
  'User Auth Linking' as test_section,
  u.id as user_table_id,
  u.auth_user_id,
  u.name,
  u.email,
  CASE
    WHEN u.auth_user_id IS NOT NULL THEN '✓ PASS - Auth linked'
    ELSE '✗ FAIL - Auth not linked'
  END as auth_status
FROM "user" u
WHERE u.active = true
ORDER BY u.name
LIMIT 20;

-- =====================================================================
-- SUMMARY
-- =====================================================================

SELECT
  '=== TEST COMPLETE ===' as message,
  'Review results above for any ✗ FAIL statuses' as next_action;
