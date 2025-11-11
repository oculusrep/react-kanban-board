-- Migration: Map Property Creator IDs from Salesforce
-- Date: November 10, 2025
-- Purpose: Update created_by_id and updated_by_id in property table
--          by mapping Salesforce CreatedById and LastModifiedById to user.auth_user_id

-- =====================================================================
-- STEP 1: Verify Salesforce table exists
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'salesforce_Property__c'
  ) THEN
    RAISE EXCEPTION 'Salesforce Property table (salesforce_Property__c) does not exist. Cannot map creator IDs.';
  END IF;
END $$;

-- =====================================================================
-- STEP 2: Check if users have sf_id column
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user'
    AND column_name = 'sf_id'
  ) THEN
    RAISE NOTICE 'User table does not have sf_id column. Will try to map by email or other fields.';
  END IF;
END $$;

-- =====================================================================
-- STEP 3: Update created_by_id from Salesforce CreatedById
-- =====================================================================

-- Map via user.sf_id if it exists
UPDATE property p
SET created_by_id = u.auth_user_id
FROM public."salesforce_Property__c" sf
JOIN "user" u ON u.sf_id = sf."CreatedById"
WHERE p.sf_id = sf."Id"
  AND p.created_by_id IS NULL
  AND sf."CreatedById" IS NOT NULL
  AND u.auth_user_id IS NOT NULL;

-- =====================================================================
-- STEP 4: Update updated_by_id from Salesforce LastModifiedById
-- =====================================================================

-- Map via user.sf_id if it exists
UPDATE property p
SET updated_by_id = u.auth_user_id
FROM public."salesforce_Property__c" sf
JOIN "user" u ON u.sf_id = sf."LastModifiedById"
WHERE p.sf_id = sf."Id"
  AND p.updated_by_id IS NULL
  AND sf."LastModifiedById" IS NOT NULL
  AND u.auth_user_id IS NOT NULL;

-- =====================================================================
-- STEP 5: Store Salesforce IDs for records that couldn't be mapped
-- =====================================================================

-- Add SF creator columns if they don't exist (from previous migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property'
    AND column_name = 'created_by_sf_id'
  ) THEN
    ALTER TABLE property ADD COLUMN created_by_sf_id VARCHAR(18);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property'
    AND column_name = 'updated_by_sf_id'
  ) THEN
    ALTER TABLE property ADD COLUMN updated_by_sf_id VARCHAR(18);
  END IF;
END $$;

-- Store SF IDs for properties that still don't have mapped creators
UPDATE property p
SET created_by_sf_id = sf."CreatedById"
FROM public."salesforce_Property__c" sf
WHERE p.sf_id = sf."Id"
  AND p.created_by_id IS NULL
  AND p.created_by_sf_id IS NULL
  AND sf."CreatedById" IS NOT NULL;

UPDATE property p
SET updated_by_sf_id = sf."LastModifiedById"
FROM public."salesforce_Property__c" sf
WHERE p.sf_id = sf."Id"
  AND p.updated_by_id IS NULL
  AND p.updated_by_sf_id IS NULL
  AND sf."LastModifiedById" IS NOT NULL;

-- =====================================================================
-- STEP 6: Verification and Summary
-- =====================================================================

-- Show mapping results
SELECT
  'Properties with mapped created_by_id' as metric,
  COUNT(*) as count
FROM property
WHERE created_by_id IS NOT NULL;

SELECT
  'Properties with unmapped SF created_by_sf_id' as metric,
  COUNT(*) as count
FROM property
WHERE created_by_id IS NULL
  AND created_by_sf_id IS NOT NULL;

SELECT
  'Properties with no creator info' as metric,
  COUNT(*) as count
FROM property
WHERE created_by_id IS NULL
  AND created_by_sf_id IS NULL;

-- Show sample of mapped properties
SELECT
  p.id,
  p.property_name,
  p.created_by_id,
  u.name as creator_name,
  p.updated_by_id,
  u2.name as updater_name
FROM property p
LEFT JOIN "user" u ON p.created_by_id = u.auth_user_id
LEFT JOIN "user" u2 ON p.updated_by_id = u2.auth_user_id
WHERE p.created_by_id IS NOT NULL
LIMIT 10;

-- Show properties that couldn't be mapped
SELECT
  p.id,
  p.property_name,
  p.created_by_sf_id,
  p.updated_by_sf_id,
  'Creator not in user table' as reason
FROM property p
WHERE p.created_by_id IS NULL
  AND p.created_by_sf_id IS NOT NULL
LIMIT 10;

RAISE NOTICE '=== Property Creator Mapping Complete ===';
RAISE NOTICE 'Check the verification queries above to see mapping results';
RAISE NOTICE 'Properties with created_by_id will show creator names in the UI';
RAISE NOTICE 'Properties with only created_by_sf_id will show "by SF User (ID)"';
