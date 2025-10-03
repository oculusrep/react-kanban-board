-- Debug Commission Data for HM - Nilay - Jefferson ECDT deal
-- Run this to diagnose commission percentage issues

-- 1. Find the deal and check its commission percentages
SELECT
    d.deal_name,
    d.sf_id as deal_sf_id,
    d.house_percent,
    d.origination_percent,
    d.site_percent,
    d.deal_percent,
    d.fee,
    d.commission_percent,
    d.deal_value
FROM deal d
WHERE d.deal_name ILIKE '%HM - Nilay - Jefferson ECDT%';

-- 2. Check the commission_split records for this deal
SELECT
    cs.split_name,
    cs.sf_id as commission_split_sf_id,
    cs.split_origination_percent,
    cs.split_site_percent,
    cs.split_deal_percent,
    cs.sf_house_percent,
    cs.split_origination_usd,
    cs.split_site_usd,
    cs.split_deal_usd,
    cs.split_broker_total,
    cs.sf_origination_usd,
    cs.sf_site_usd,
    cs.sf_deal_usd,
    b.name as broker_name
FROM commission_split cs
JOIN deal d ON cs.deal_id = d.id
LEFT JOIN broker b ON cs.broker_id = b.id
WHERE d.deal_name ILIKE '%HM - Nilay - Jefferson ECDT%';

-- 3. Check the raw Salesforce data for Commission_Split__c
SELECT
    cs."Id" as sf_id,
    cs."Name" as split_name,
    cs."Opportunity__c" as opportunity_id,
    cs."Broker__c" as broker_name,
    cs."Origination_Percent__c" as orig_pct,
    cs."Site_Percent__c" as site_pct,
    cs."Deal_Percent__c" as deal_pct,
    cs."House_Percent__c" as house_pct,
    cs."Origination_Dollars__c" as orig_usd,
    cs."Site_Dollars__c" as site_usd,
    cs."Deal_Dollars__c" as deal_usd
FROM "salesforce_Commission_Split__c" cs
WHERE cs."Opportunity__c" IN (
    SELECT sf_id FROM deal WHERE deal_name ILIKE '%HM - Nilay - Jefferson ECDT%'
);

-- 4. Check if there's a mismatch between Salesforce data and migrated data
WITH deal_info AS (
    SELECT id, sf_id, deal_name
    FROM deal
    WHERE deal_name ILIKE '%HM - Nilay - Jefferson ECDT%'
)
SELECT
    'Salesforce Raw' as source,
    cs."Broker__c" as broker,
    cs."Origination_Percent__c" as orig_pct,
    cs."Site_Percent__c" as site_pct,
    cs."Deal_Percent__c" as deal_pct,
    cs."House_Percent__c" as house_pct
FROM "salesforce_Commission_Split__c" cs
JOIN deal_info d ON cs."Opportunity__c" = d.sf_id

UNION ALL

SELECT
    'Migrated Data' as source,
    b.name as broker,
    cs.split_origination_percent,
    cs.split_site_percent,
    cs.split_deal_percent,
    cs.sf_house_percent
FROM commission_split cs
JOIN deal_info d ON cs.deal_id = d.id
LEFT JOIN broker b ON cs.broker_id = b.id;

-- 5. Check if the percentages are being properly summed for the deal table
WITH deal_info AS (
    SELECT id FROM deal WHERE deal_name ILIKE '%HM - Nilay - Jefferson ECDT%'
)
SELECT
    'Expected from commission_split' as source,
    AVG(COALESCE(cs.sf_house_percent, 0)) as house_pct,
    SUM(COALESCE(cs.split_origination_percent, 0)) as orig_pct,
    SUM(COALESCE(cs.split_site_percent, 0)) as site_pct,
    SUM(COALESCE(cs.split_deal_percent, 0)) as deal_pct
FROM commission_split cs
WHERE cs.deal_id IN (SELECT id FROM deal_info)

UNION ALL

SELECT
    'Actual in deal table' as source,
    d.house_percent,
    d.origination_percent,
    d.site_percent,
    d.deal_percent
FROM deal d
WHERE d.id IN (SELECT id FROM deal_info);
