-- Fix commission percentages for HM - Nilay - Jefferson ECDT deal
-- This updates the deal to use values directly from Salesforce Opportunity

UPDATE deal d
SET
    house_percent = o."House_Percent__c",
    origination_percent = o."Origination_Percent__c",
    site_percent = o."Site_Percent__c",
    deal_percent = o."Deal_Percent__c",
    updated_at = NOW()
FROM "salesforce_Opportunity" o
WHERE d.sf_id = o."Id"
  AND d.deal_name ILIKE '%HM - Nilay - Jefferson ECDT%';

-- Verify the fix
SELECT
    d.deal_name,
    d.house_percent,
    d.origination_percent,
    d.site_percent,
    d.deal_percent,
    o."House_Percent__c" as sf_house,
    o."Origination_Percent__c" as sf_origination,
    o."Site_Percent__c" as sf_site,
    o."Deal_Percent__c" as sf_deal
FROM deal d
JOIN "salesforce_Opportunity" o ON d.sf_id = o."Id"
WHERE d.deal_name ILIKE '%HM - Nilay - Jefferson ECDT%';
