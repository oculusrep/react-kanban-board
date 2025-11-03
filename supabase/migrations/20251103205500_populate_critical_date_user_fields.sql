-- Migration to populate created_by_id and updated_by_id for critical dates
-- Maps Salesforce CreatedById and LastModifiedById to user table

-- Update created_by_id from Salesforce CreatedById
UPDATE critical_date cd
SET created_by_id = u.id
FROM "salesforce_Critical_Date__c" sf_cd
INNER JOIN "user" u ON u.sf_id = sf_cd."CreatedById"
WHERE cd.sf_id = sf_cd."Id"
  AND cd.created_by_id IS NULL;

-- Update updated_by_id from Salesforce LastModifiedById
UPDATE critical_date cd
SET updated_by_id = u.id
FROM "salesforce_Critical_Date__c" sf_cd
INNER JOIN "user" u ON u.sf_id = sf_cd."LastModifiedById"
WHERE cd.sf_id = sf_cd."Id"
  AND cd.updated_by_id IS NULL;

-- Report results
DO $$
DECLARE
  created_by_count INTEGER;
  updated_by_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO created_by_count FROM critical_date WHERE created_by_id IS NOT NULL;
  SELECT COUNT(*) INTO updated_by_count FROM critical_date WHERE updated_by_id IS NOT NULL;

  RAISE NOTICE '============================================';
  RAISE NOTICE 'Critical Date User Fields Population';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Records with created_by: %', created_by_count;
  RAISE NOTICE 'Records with updated_by: %', updated_by_count;
  RAISE NOTICE '============================================';
END $$;
