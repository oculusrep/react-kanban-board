-- Migration: Sync missing property data from Salesforce to OVIS property table
-- This updates properties that have sf_id but are missing lat/long or address data

-- Update properties with missing latitude/longitude from Salesforce
UPDATE property p
SET
  latitude = COALESCE(sf."Verified_Latitude__c", sf."Lat_Long__Latitude__s"),
  longitude = COALESCE(sf."Verified_Longitude__c", sf."Lat_Long__Longitude__s"),
  updated_at = NOW()
FROM public."salesforce_Property__c" sf
WHERE p.sf_id = sf."Id"
  AND (p.latitude IS NULL OR p.longitude IS NULL)
  AND (sf."Verified_Latitude__c" IS NOT NULL OR sf."Lat_Long__Latitude__s" IS NOT NULL);

-- Update properties with missing address data from Salesforce
UPDATE property p
SET
  address = sf."Site_Address__c",
  updated_at = NOW()
FROM public."salesforce_Property__c" sf
WHERE p.sf_id = sf."Id"
  AND p.address IS NULL
  AND sf."Site_Address__c" IS NOT NULL;

-- Update properties with missing city data from Salesforce
UPDATE property p
SET
  city = sf."Site_City__c",
  updated_at = NOW()
FROM public."salesforce_Property__c" sf
WHERE p.sf_id = sf."Id"
  AND p.city IS NULL
  AND sf."Site_City__c" IS NOT NULL;

-- Update properties with missing state data from Salesforce
UPDATE property p
SET
  state = sf."Site_State__c",
  updated_at = NOW()
FROM public."salesforce_Property__c" sf
WHERE p.sf_id = sf."Id"
  AND p.state IS NULL
  AND sf."Site_State__c" IS NOT NULL;

-- Update properties with missing zip data from Salesforce
UPDATE property p
SET
  zip = sf."Site_Zip__c",
  updated_at = NOW()
FROM public."salesforce_Property__c" sf
WHERE p.sf_id = sf."Id"
  AND p.zip IS NULL
  AND sf."Site_Zip__c" IS NOT NULL;

-- Show summary of what was updated
SELECT
  'Properties updated with lat/long' as update_type,
  COUNT(*) as count
FROM property p
INNER JOIN public."salesforce_Property__c" sf ON p.sf_id = sf."Id"
WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
  AND (sf."Verified_Latitude__c" IS NOT NULL OR sf."Lat_Long__Latitude__s" IS NOT NULL);

SELECT
  'Properties still missing lat/long' as update_type,
  COUNT(*) as count
FROM property
WHERE (latitude IS NULL OR longitude IS NULL);

SELECT
  'Properties still missing address' as update_type,
  COUNT(*) as count
FROM property
WHERE address IS NULL;
