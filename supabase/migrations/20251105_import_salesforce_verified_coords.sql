-- Import Verified Coordinates from Salesforce
-- Updates restaurant_location with verified lat/long from salesforce_Restaurant_Trends__c
-- Run this AFTER initial ETL data load to enrich location data with verified coordinates

-- ============================================================================
-- SALESFORCE VERIFIED COORDINATES IMPORT
-- ============================================================================

DO $$
DECLARE
  updated_count INTEGER := 0;
  sf_total_count INTEGER := 0;
  sf_valid_count INTEGER := 0;
BEGIN
  -- Check if Salesforce table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'salesforce_Restaurant_Trends__c'
  ) THEN
    RAISE NOTICE 'Salesforce Restaurant Trends table found, importing verified coordinates...';

    -- Get total count of Salesforce records with verified coordinates
    SELECT COUNT(*) INTO sf_total_count
    FROM "salesforce_Restaurant_Trends__c"
    WHERE "Verified_Latitude__c" IS NOT NULL
      AND "Verified_Longitude__c" IS NOT NULL;

    -- Get count of valid Salesforce records (within coordinate ranges)
    SELECT COUNT(*) INTO sf_valid_count
    FROM "salesforce_Restaurant_Trends__c"
    WHERE "Verified_Latitude__c" BETWEEN -90 AND 90
      AND "Verified_Longitude__c" BETWEEN -180 AND 180
      AND "Verified_Latitude__c" IS NOT NULL
      AND "Verified_Longitude__c" IS NOT NULL;

    -- Update restaurant_location with verified coordinates from Salesforce
    UPDATE restaurant_location rl
    SET
      verified_latitude  = sf."Verified_Latitude__c",
      verified_longitude = sf."Verified_Longitude__c",
      verified_source    = 'Salesforce',
      verified_at        = NOW()
    FROM "salesforce_Restaurant_Trends__c" sf
    WHERE rl.store_no = sf."Store_Number__c"
      AND sf."Verified_Latitude__c" BETWEEN -90 AND 90
      AND sf."Verified_Longitude__c" BETWEEN -180 AND 180
      AND sf."Verified_Latitude__c" IS NOT NULL
      AND sf."Verified_Longitude__c" IS NOT NULL;

    -- Get count of updated records
    GET DIAGNOSTICS updated_count = ROW_COUNT;

    -- Report results
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Salesforce Verified Coordinates Import';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Total Salesforce records with coordinates: %', sf_total_count;
    RAISE NOTICE 'Valid Salesforce records (within ranges): %', sf_valid_count;
    RAISE NOTICE 'Restaurant locations updated: %', updated_count;
    RAISE NOTICE '============================================';

  ELSE
    RAISE NOTICE 'Salesforce Restaurant Trends table not found, skipping verified coordinates import';
    RAISE NOTICE 'Note: Run this migration after Salesforce data sync is complete';
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error importing verified coordinates: %', SQLERRM;
    RAISE NOTICE 'This is not critical - ETL data is still usable without verified coordinates';
END $$;

-- ============================================================================
-- VALIDATION QUERY
-- ============================================================================
-- Run this query after migration to verify results:
--
-- SELECT
--   COUNT(*) as total_locations,
--   COUNT(verified_latitude) as with_verified_coords,
--   COUNT(latitude) as with_excel_coords,
--   ROUND(100.0 * COUNT(verified_latitude) / NULLIF(COUNT(*), 0), 2) as verified_percent
-- FROM restaurant_location;
