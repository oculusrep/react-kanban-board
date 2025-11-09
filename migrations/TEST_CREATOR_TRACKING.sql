-- =====================================================================
-- CREATOR TRACKING SYSTEM - COMPREHENSIVE TEST SCRIPT
-- =====================================================================
-- Purpose: Verify that creator/updater tracking works correctly
-- Run this script AFTER logging into the application as a test user
-- Expected: All operations should automatically capture user IDs
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
-- PART 2: Check Historical Data - Verify No NULLs Remain
-- =====================================================================

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
-- PART 3: Test INSERT Operations (Run from Application)
-- =====================================================================
-- Instructions: Create new records through the UI and then verify
-- Expected: created_by_id should be set to current user's auth.uid()
-- =====================================================================

-- After creating a NEW CONTACT through the UI, run this:
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

-- After creating a NEW SITE SUBMIT through the UI, run this:
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

-- After creating a NEW NOTE through the UI, run this:
SELECT
  'Recent Notes (Last 5)' as test_section,
  n.id,
  LEFT(n.body, 50) as note_preview,
  n.created_by_id,
  u.name as created_by_name,
  n.created_at,
  CASE
    WHEN n.created_by_id IS NOT NULL THEN '✓ PASS - Creator tracked'
    ELSE '✗ FAIL - Creator NULL'
  END as status
FROM note n
LEFT JOIN "user" u ON (n.created_by_id = u.id OR n.created_by_id = u.auth_user_id)
ORDER BY n.created_at DESC NULLS LAST
LIMIT 5;

-- After creating a NEW ACTIVITY through the UI, run this:
SELECT
  'Recent Activities (Last 5)' as test_section,
  a.id,
  a.title,
  a.created_by_id,
  u.name as created_by_name,
  a.created_at,
  CASE
    WHEN a.created_by_id IS NOT NULL THEN '✓ PASS - Creator tracked'
    ELSE '✗ FAIL - Creator NULL'
  END as status
FROM activity a
LEFT JOIN "user" u ON (a.created_by_id = u.id OR a.created_by_id = u.auth_user_id)
ORDER BY a.created_at DESC NULLS LAST
LIMIT 5;

-- =====================================================================
-- PART 4: Test UPDATE Operations (Trigger Test)
-- =====================================================================
-- Instructions: Update existing records through the UI and verify
-- Expected: updated_by_id should be set to current user's auth.uid()
-- =====================================================================

-- Create a test contact for update testing
INSERT INTO contact (first_name, last_name, email)
VALUES ('Test', 'UpdateTracking', 'test.update@example.com')
RETURNING
  id,
  first_name,
  last_name,
  created_by_id,
  created_at,
  'Test contact created - Note the ID and update it through the UI' as next_step;

-- After UPDATING the test contact through the UI, verify the trigger worked:
-- Replace 'TEST_CONTACT_ID' with the actual ID from above
/*
SELECT
  'Update Trigger Test' as test_section,
  id,
  first_name,
  last_name,
  created_by_id,
  updated_by_id,
  created_at,
  updated_at,
  CASE
    WHEN updated_by_id IS NOT NULL AND updated_by_id != created_by_id THEN '✓ PASS - Updater tracked differently'
    WHEN updated_by_id IS NOT NULL THEN '✓ PASS - Updater tracked'
    ELSE '✗ FAIL - Updater NULL'
  END as status,
  CASE
    WHEN updated_at > created_at THEN '✓ PASS - Timestamp updated'
    ELSE '✗ FAIL - Timestamp not updated'
  END as timestamp_status
FROM contact
WHERE id = 'TEST_CONTACT_ID';
*/

-- =====================================================================
-- PART 5: User Attribution Test
-- =====================================================================
-- Verify that records are correctly attributed to different users
-- =====================================================================

-- Show distribution of creators across contacts
SELECT
  'Contact Creators Distribution' as test_section,
  u.name as creator_name,
  u.email as creator_email,
  COUNT(*) as contacts_created,
  MIN(c.created_at) as first_contact,
  MAX(c.created_at) as latest_contact
FROM contact c
LEFT JOIN "user" u ON (c.created_by_id = u.id OR c.created_by_id = u.auth_user_id)
GROUP BY u.name, u.email
ORDER BY contacts_created DESC;

-- Show distribution of creators across site submits
SELECT
  'Site Submit Creators Distribution' as test_section,
  u.name as creator_name,
  u.email as creator_email,
  COUNT(*) as site_submits_created,
  MIN(s.created_at) as first_submit,
  MAX(s.created_at) as latest_submit
FROM site_submit s
LEFT JOIN "user" u ON (s.created_by_id = u.id OR s.created_by_id = u.auth_user_id)
GROUP BY u.name, u.email
ORDER BY site_submits_created DESC;

-- Show distribution of creators across activities
SELECT
  'Activity Creators Distribution' as test_section,
  u.name as creator_name,
  u.email as creator_email,
  COUNT(*) as activities_created,
  MIN(a.created_at) as first_activity,
  MAX(a.created_at) as latest_activity
FROM activity a
LEFT JOIN "user" u ON (a.created_by_id = u.id OR a.created_by_id = u.auth_user_id)
GROUP BY u.name, u.email
ORDER BY activities_created DESC
LIMIT 10;

-- =====================================================================
-- PART 6: Special Case Verification - Huey Magoo's
-- =====================================================================
-- Verify that Huey Magoo's site submits are assigned to Mike
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
-- PART 7: Auth Context Integration Test
-- =====================================================================
-- Verify that auth_user_id linking is working correctly
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
  END as auth_status,
  COUNT(DISTINCT c.id) as contacts_created,
  COUNT(DISTINCT s.id) as site_submits_created,
  COUNT(DISTINCT a.id) as activities_created
FROM "user" u
LEFT JOIN contact c ON (c.created_by_id = u.id OR c.created_by_id = u.auth_user_id)
LEFT JOIN site_submit s ON (s.created_by_id = u.id OR s.created_by_id = u.auth_user_id)
LEFT JOIN activity a ON (a.created_by_id = u.id OR a.created_by_id = u.auth_user_id)
WHERE u.active = true
GROUP BY u.id, u.auth_user_id, u.name, u.email
ORDER BY u.name;

-- =====================================================================
-- PART 8: Summary Report
-- =====================================================================

SELECT
  '=== CREATOR TRACKING SYSTEM TEST SUMMARY ===' as section;

-- Overall NULL count across all tables
SELECT
  'Overall Status' as metric,
  SUM(CASE WHEN created_by_id IS NULL THEN 1 ELSE 0 END) as total_null_creators,
  SUM(CASE WHEN updated_by_id IS NULL THEN 1 ELSE 0 END) as total_null_updaters,
  COUNT(*) as total_records,
  CASE
    WHEN SUM(CASE WHEN created_by_id IS NULL THEN 1 ELSE 0 END) = 0
      THEN '✓ ALL PASS - No NULL creators'
    ELSE '✗ FAIL - NULL creators found'
  END as final_status
FROM (
  SELECT created_by_id, updated_by_id FROM property
  UNION ALL
  SELECT created_by_id, updated_by_id FROM site_submit
  UNION ALL
  SELECT created_by_id, updated_by_id FROM deal
  UNION ALL
  SELECT created_by_id, updated_by_id FROM client
  UNION ALL
  SELECT created_by_id, updated_by_id FROM contact
  UNION ALL
  SELECT created_by_id, updated_by_id FROM note
  UNION ALL
  SELECT created_by_id, updated_by_id FROM activity
) all_records;

-- =====================================================================
-- CLEANUP (Optional - Run this after testing)
-- =====================================================================
-- Uncomment to delete the test contact created in Part 4
-- DELETE FROM contact WHERE email = 'test.update@example.com';

-- =====================================================================
-- TEST COMPLETION
-- =====================================================================
SELECT
  'Test script completed' as status,
  NOW() as completed_at,
  'Review results above for any ✗ FAIL statuses' as next_action;
