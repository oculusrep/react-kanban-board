# Commission Data Diagnosis: HM - Nilay - Jefferson ECDT

## Problem Summary
Commission percentages (House %, Origination %, Site %, Deal %) are not displaying correctly for the deal "HM - Nilay - Jefferson ECDT". This was working previously but has stopped functioning.

## Data Flow Architecture

### 1. **Source: Salesforce Commission_Split__c**
The data originates from Salesforce custom object `Commission_Split__c` with these fields:
- `Origination_Percent__c` → Percent broker gets from origination work
- `Site_Percent__c` → Percent broker gets from site work
- `Deal_Percent__c` → Percent broker gets from deal work
- `House_Percent__c` → Percent that goes to the house
- `Origination_Dollars__c`, `Site_Dollars__c`, `Deal_Dollars__c` → USD amounts

### 2. **Migration Step 1: commission_split table**
Located in `_master_migration_script.sql` lines 1056-1131

**Data Transformation:**
```sql
-- Handles bad Salesforce data where percentages might be stored as 50 instead of 0.50
CASE
    WHEN cs."Origination_Percent__c" > 100 THEN cs."Origination_Percent__c" / 100
    ELSE cs."Origination_Percent__c"
END as split_origination_percent
```

**Target Fields:**
- `split_origination_percent` (NUMERIC(5,2))
- `split_site_percent` (NUMERIC(5,2))
- `split_deal_percent` (NUMERIC(5,2))
- `sf_house_percent` (NUMERIC(5,2))
- Plus USD amounts in `sf_origination_usd`, `sf_site_usd`, `sf_deal_usd`

### 3. **Migration Step 2: Aggregation to deal table**
Located in `_master_migration_script.sql` lines 1147-1169

**Critical Logic:**
```sql
UPDATE deal d
SET
    house_percent = COALESCE((
        SELECT AVG(COALESCE(sf_house_percent, 0))  -- AVERAGE of house percent
        FROM commission_split cs
        WHERE cs.deal_id = d.id
    ), 40),  -- Default to 40% if no commission splits

    origination_percent = COALESCE((
        SELECT SUM(COALESCE(split_origination_percent, 0))  -- SUM of origination
        FROM commission_split cs
        WHERE cs.deal_id = d.id
    ), 50),  -- Default to 50% if no commission splits

    site_percent = COALESCE((
        SELECT SUM(COALESCE(split_site_percent, 0))  -- SUM of site
        FROM commission_split cs
        WHERE cs.deal_id = d.id
    ), 25),

    deal_percent = COALESCE((
        SELECT SUM(COALESCE(split_deal_percent, 0))  -- SUM of deal
        FROM commission_split cs
        WHERE cs.deal_id = d.id
    ), 25)
WHERE d.sf_id IS NOT NULL;  -- Only update deals from Salesforce
```

**Key Points:**
- House % uses AVERAGE (one deal can have multiple brokers, house % is usually same for all)
- Origination/Site/Deal % use SUM (adds up all broker splits)
- Falls back to defaults (40%, 50%, 25%, 25%) if no commission_split records exist
- Only runs for deals with `sf_id` (Salesforce-migrated deals)

### 4. **UI Display: CommissionTab.tsx**
The commission percentages are displayed in two places:

**A. Deal-level fields** (read from `deal` table):
- `deal.house_percent`
- `deal.origination_percent`
- `deal.site_percent`
- `deal.deal_percent`

**B. Broker-level commission_split records** (read from `commission_split` table):
- `split_origination_percent`
- `split_site_percent`
- `split_deal_percent`
- `sf_house_percent`

## Diagnostic Steps

### Step 1: Check Salesforce Source Data
Run this query to see what's in Salesforce:

```sql
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
```

**Expected:** You should see 1+ rows with valid percentage data

### Step 2: Check commission_split Migration
Run this query to see if data migrated correctly:

```sql
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
    b.name as broker_name
FROM commission_split cs
JOIN deal d ON cs.deal_id = d.id
LEFT JOIN broker b ON cs.broker_id = b.id
WHERE d.deal_name ILIKE '%HM - Nilay - Jefferson ECDT%';
```

**Expected:** You should see matching data from Salesforce, with percentages properly cleaned

### Step 3: Check deal Table Aggregation
Run this query to see if deal-level percentages are calculated:

```sql
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
```

**Expected Values:**
- `house_percent`: Should be 40 (or the average of all broker house %s)
- `origination_percent`: Should be SUM of all broker origination %s (e.g., 50)
- `site_percent`: Should be SUM of all broker site %s (e.g., 25)
- `deal_percent`: Should be SUM of all broker deal %s (e.g., 25)

**Problem Indicators:**
- All NULLs → Migration step 2 didn't run or deal has no `sf_id`
- Default values (40, 50, 25, 25) → No commission_split records found for this deal
- Wrong values → commission_split has incorrect data OR aggregation logic is wrong

### Step 4: Compare Salesforce vs. Migrated Data
Run this query to see both side-by-side:

```sql
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
```

**Expected:** Both rows should have identical or very similar values (accounting for >100 cleanup)

## Common Failure Modes

### 1. **Airbyte Sync Failed** ⚠️
**Symptom:** "ActivityFieldHistory" sync errors (as shown in your log)
**Problem:** `salesforce_Commission_Split__c` table might not have latest data
**Solution:**
1. Disable `ActivityFieldHistory` stream in Airbyte (per earlier recommendation)
2. Re-run full sync
3. Verify `salesforce_Commission_Split__c` has data for this deal

### 2. **commission_split Table Empty**
**Symptom:** Deal shows default values (40%, 50%, 25%, 25%)
**Problem:** Migration INSERT didn't find matching records
**Possible Causes:**
- Salesforce has no Commission_Split__c records for this Opportunity
- Broker name mismatch (broker doesn't exist in `broker` table)
- Deal sf_id doesn't match Opportunity__c

### 3. **deal Table Not Updated**
**Symptom:** commission_split has data but deal.house_percent is NULL
**Problem:** UPDATE query didn't run or was blocked
**Possible Causes:**
- deal.sf_id is NULL (not a Salesforce deal)
- Migration ran before commission_split was populated
- Database permissions issue

### 4. **Percentage Values Over 100**
**Symptom:** Percentages show as 5000% instead of 50%
**Problem:** Salesforce stored as decimal (50.0) but migration expects percent (0.50)
**Solution:** The CASE statement at line 1091-1101 should handle this, but verify

### 5. **Recent Data Changes**
**Symptom:** It "was working before" but now isn't
**Problem:** Something changed in Salesforce or during migration
**Check:**
- Was the deal recently updated in Salesforce?
- Did you run a fresh migration?
- Did Salesforce field names change? (e.g., `Origination_Percent__c` → `Origination_Split__c`)

## Recommended Fix Workflow

### Quick Fix (If You Just Need This One Deal)
```sql
-- Manually set the commission percentages for this specific deal
UPDATE deal
SET
    house_percent = 40,
    origination_percent = 50,
    site_percent = 25,
    deal_percent = 25
WHERE deal_name ILIKE '%HM - Nilay - Jefferson ECDT%';
```

### Proper Fix (Root Cause Resolution)

1. **Run the diagnostic SQL** (`debug_hm_nilay_deal.sql`)
2. **Identify which step is failing** (Salesforce → commission_split → deal)
3. **Fix the source issue:**
   - If Salesforce is missing data: Add Commission_Split__c records in Salesforce
   - If Airbyte is failing: Fix the sync (disable ActivityFieldHistory)
   - If migration is failing: Check for SQL errors, verify deal.sf_id exists
4. **Re-run the affected migration section:**

```sql
-- Re-populate commission_split for this deal only
DELETE FROM commission_split
WHERE deal_id IN (SELECT id FROM deal WHERE deal_name ILIKE '%HM - Nilay - Jefferson ECDT%');

INSERT INTO commission_split (...)
SELECT ...
FROM "salesforce_Commission_Split__c" cs
WHERE cs."Opportunity__c" IN (
    SELECT sf_id FROM deal WHERE deal_name ILIKE '%HM - Nilay - Jefferson ECDT%'
);

-- Re-aggregate to deal table
UPDATE deal d
SET
    house_percent = COALESCE((SELECT AVG(COALESCE(sf_house_percent, 0)) FROM commission_split cs WHERE cs.deal_id = d.id), 40),
    origination_percent = COALESCE((SELECT SUM(COALESCE(split_origination_percent, 0)) FROM commission_split cs WHERE cs.deal_id = d.id), 50),
    site_percent = COALESCE((SELECT SUM(COALESCE(split_site_percent, 0)) FROM commission_split cs WHERE cs.deal_id = d.id), 25),
    deal_percent = COALESCE((SELECT SUM(COALESCE(split_deal_percent, 0)) FROM commission_split cs WHERE cs.deal_id = d.id), 25)
WHERE d.deal_name ILIKE '%HM - Nilay - Jefferson ECDT%';
```

## Files to Review

1. **Migration Script**: `/_master_migration_script.sql` (lines 1050-1169)
2. **UI Display**: `/src/components/CommissionTab.tsx`
3. **UI Details**: `/src/components/CommissionDetailsSection.tsx`
4. **Calculations Hook**: `/src/hooks/useCommissionCalculations.ts`
5. **Diagnostic Script**: `/debug_hm_nilay_deal.sql` (created for you)

## Next Steps

1. Connect to your database and run `/debug_hm_nilay_deal.sql`
2. Share the output with me
3. Based on the results, we'll identify which step is failing
4. Apply the appropriate fix

---

**Note:** The most likely culprit given your Airbyte sync issues is that the `salesforce_Commission_Split__c` table doesn't have fresh data for this deal, causing the migration to either skip it or use default values.
