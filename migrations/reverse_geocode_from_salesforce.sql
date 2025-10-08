-- Reverse geocode by copying addresses from Salesforce for properties that have lat/long but no address

-- First, check how many properties need this
SELECT
  'Properties with lat/long but no address:' as description,
  COUNT(*) as count
FROM property p
WHERE p.latitude IS NOT NULL
  AND p.longitude IS NOT NULL
  AND p.address IS NULL;

-- Check how many of those have Salesforce data available
SELECT
  'Properties that can be fixed from Salesforce:' as description,
  COUNT(*) as count
FROM property p
INNER JOIN public."salesforce_Property__c" sf ON p.sf_id = sf."Id"
WHERE p.latitude IS NOT NULL
  AND p.longitude IS NOT NULL
  AND p.address IS NULL
  AND sf."Site_Address__c" IS NOT NULL;

-- Update properties with missing address from Salesforce (if they have lat/long)
UPDATE property p
SET
  address = sf."Site_Address__c",
  city = COALESCE(p.city, sf."Site_City__c"),
  state = COALESCE(p.state, sf."Site_State__c"),
  zip = COALESCE(p.zip, sf."Site_Zip__c"),
  updated_at = NOW()
FROM public."salesforce_Property__c" sf
WHERE p.sf_id = sf."Id"
  AND p.latitude IS NOT NULL
  AND p.longitude IS NOT NULL
  AND p.address IS NULL
  AND sf."Site_Address__c" IS NOT NULL;

-- Show summary
SELECT
  'Properties still missing address (after Salesforce sync):' as description,
  COUNT(*) as count
FROM property
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND address IS NULL;

-- Show properties that still need reverse geocoding (no Salesforce data available)
SELECT
  p.id,
  p.property_name,
  p.latitude,
  p.longitude,
  p.sf_id,
  CASE
    WHEN p.sf_id IS NULL THEN 'No Salesforce ID'
    ELSE 'Salesforce has no address'
  END as reason
FROM property p
WHERE p.latitude IS NOT NULL
  AND p.longitude IS NOT NULL
  AND p.address IS NULL
ORDER BY p.property_name
LIMIT 50;
