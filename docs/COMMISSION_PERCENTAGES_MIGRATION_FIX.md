# Commission Percentages Migration Fix - CRITICAL

## Date: 2025-10-03
## Status: ✅ RESOLVED - DO NOT REVERT

---

## ⚠️ CRITICAL WARNING ⚠️

**DO NOT change the deal table commission percentage mapping back to calculating from commission_split!**

The deal table commission percentages (`house_percent`, `origination_percent`, `site_percent`, `deal_percent`) **MUST come directly from Salesforce Opportunity fields**, not from aggregating commission_split records.

---

## The Problem

### What Was Broken
Deal commission percentages were showing **100%, 100%, 100%** instead of the correct values like **50%, 25%, 25%**.

**Example:**
- Deal: "HM - Nilay - Jefferson ECDT"
- Expected: Origination 50%, Site 25%, Deal 25%
- Actual (broken): Origination 100%, Site 100%, Deal 100%

### Root Cause
The migration script was **ignoring** the commission percentage fields that exist directly on Salesforce Opportunity and instead trying to **calculate** them from the `commission_split` table using this broken logic:

```sql
-- BROKEN LOGIC (lines 1147-1169 in old script)
UPDATE deal d
SET
    origination_percent = SUM(commission_split.split_origination_percent),
    site_percent = SUM(commission_split.split_site_percent),
    deal_percent = SUM(commission_split.split_deal_percent)
```

**Why this was wrong:**
1. Salesforce Opportunity **already has** these fields: `House_Percent__c`, `Origination_Percent__c`, `Site_Percent__c`, `Deal_Percent__c`
2. The commission_split table stores **broker-level** percentages (how each broker splits the work)
3. The deal table needs **deal-level** percentages (total percentages for the entire deal)
4. Summing broker percentages gives wrong results when percentages are stored as whole numbers

---

## The Solution

### What Was Changed

**Lines 362-435 of `_master_migration_script.sql`**

#### BEFORE (Broken):
```sql
INSERT INTO deal (
  deal_name,
  commission_percent,
  fee,
  -- Missing: house_percent, origination_percent, site_percent, deal_percent
  sf_id
)
SELECT
  o."Name",
  o."Commission__c",
  COALESCE(o."Amount", ...),
  -- Missing Salesforce percentage mappings
  o."Id"
FROM "salesforce_Opportunity" o
```

Then later (lines 1147-1169):
```sql
-- BROKEN: Tried to calculate from commission_split
UPDATE deal SET
    origination_percent = SUM(commission_split.split_origination_percent)
    -- This was WRONG!
```

#### AFTER (Fixed):
```sql
INSERT INTO deal (
  deal_name,
  commission_percent,
  fee,
  house_percent,          -- ✅ ADDED
  origination_percent,    -- ✅ ADDED
  site_percent,           -- ✅ ADDED
  deal_percent,           -- ✅ ADDED
  sf_id
)
SELECT
  o."Name",
  o."Commission__c",
  COALESCE(o."Amount", ...),
  o."House_Percent__c" AS house_percent,              -- ✅ MAPPED DIRECTLY
  o."Origination_Percent__c" AS origination_percent,  -- ✅ MAPPED DIRECTLY
  o."Site_Percent__c" AS site_percent,                -- ✅ MAPPED DIRECTLY
  o."Deal_Percent__c" AS deal_percent,                -- ✅ MAPPED DIRECTLY
  o."Id"
FROM "salesforce_Opportunity" o
```

And updated the ON CONFLICT clause to include these fields:
```sql
ON CONFLICT (sf_id) DO UPDATE SET
  house_percent = EXCLUDED.house_percent,
  origination_percent = EXCLUDED.origination_percent,
  site_percent = EXCLUDED.site_percent,
  deal_percent = EXCLUDED.deal_percent;
```

### Lines 1145-1159: Removed Broken Calculation Logic

**BEFORE (Broken):**
```sql
-- Update deal-level percentages by averaging from commission splits
-- This gives a reasonable approximation for the UI
UPDATE deal d
SET
    house_percent = AVG(commission_split.sf_house_percent),
    origination_percent = SUM(commission_split.split_origination_percent),
    site_percent = SUM(commission_split.split_site_percent),
    deal_percent = SUM(commission_split.split_deal_percent)
WHERE d.sf_id IS NOT NULL;
```

**AFTER (Fixed):**
```sql
-- Deal-Level Commission Percentages (Now from Salesforce Opportunity)
-- UPDATED: These percentages now come directly from Salesforce Opportunity fields
-- (House_Percent__c, Origination_Percent__c, Site_Percent__c, Deal_Percent__c)
-- The old logic that calculated them from commission_split has been removed.

-- NOTE: The percentages are now populated directly in the deal INSERT above (lines 404-407)
-- No additional UPDATE needed since they come from Salesforce Opportunity
```

---

## Data Flow Architecture

### ✅ CORRECT Flow (After Fix)

```
Salesforce Opportunity
├── House_Percent__c (40)
├── Origination_Percent__c (50)
├── Site_Percent__c (25)
└── Deal_Percent__c (25)
         ↓
    [Direct Mapping]
         ↓
Deal Table
├── house_percent (40)
├── origination_percent (50)
├── site_percent (25)
└── deal_percent (25)
```

### ❌ BROKEN Flow (Before Fix)

```
Salesforce Commission_Split__c
├── Mike: Origination 100%, Site 50%, Deal 75%
└── Arty: Origination 0%, Site 50%, Deal 25%
         ↓
    commission_split table
         ↓
    [SUM aggregation - WRONG!]
         ↓
Deal Table
├── origination_percent = 100 + 0 = 100 ❌
├── site_percent = 50 + 50 = 100 ❌
└── deal_percent = 75 + 25 = 100 ❌
```

---

## Why commission_split Exists

The `commission_split` table serves a **different purpose** than the deal table percentages:

### Deal Table Percentages (Deal-Level)
- **Source:** Salesforce `Opportunity.House_Percent__c`, etc.
- **Purpose:** Show total commission breakdown for the entire deal
- **Example:** Origination: 50%, Site: 25%, Deal: 25%
- **Used by:** Commission Tab UI, calculations

### commission_split Percentages (Broker-Level)
- **Source:** Salesforce `Commission_Split__c.Origination_Percent__c`, etc.
- **Purpose:** Show how each broker splits their portion of the work
- **Example:**
  - Mike gets 100% of origination, 50% of site, 75% of deal
  - Arty gets 0% of origination, 50% of site, 25% of deal
- **Used by:** Broker commission splits, payment generation

**They are NOT interchangeable!**

---

## Verification

### SQL to Verify Fix
```sql
-- Check that deal percentages match Salesforce
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
```

**Expected Result:**
All deal columns should **exactly match** the corresponding Salesforce columns.

### Test Case: HM - Nilay - Jefferson ECDT

**Salesforce Opportunity values:**
- `House_Percent__c`: 40.00
- `Origination_Percent__c`: 50.00
- `Site_Percent__c`: 25.00
- `Deal_Percent__c`: 25.00

**Deal table values (after fix):**
- `house_percent`: 40.00 ✅
- `origination_percent`: 50.00 ✅
- `site_percent`: 25.00 ✅
- `deal_percent`: 25.00 ✅

---

## For New Deals (Created in CRM)

New deals created directly in the CRM (not migrated from Salesforce) use hardcoded defaults:

**File:** `src/pages/DealDetailsPage.tsx` (lines 48-51)
```typescript
const blankDeal = {
  house_percent: 40,           // 40% default
  origination_percent: 50,      // 50% default
  site_percent: 25,             // 25% default
  deal_percent: 25,             // 25% default
  number_of_payments: 2,
  // ...
};
```

These defaults are fine because:
1. New deals have no `sf_id` (not from Salesforce)
2. User can edit them in the Commission Tab
3. They don't go through the migration script

---

## Related Files

### Migration Script
- **File:** `/_master_migration_script.sql`
- **Lines Changed:** 362-435 (deal INSERT), 1145-1159 (removed calculation)

### UI Components
- `src/components/CommissionTab.tsx` - Displays and calculates USD amounts
- `src/components/CommissionDetailsSection.tsx` - Shows percentage inputs
- `src/hooks/useCommissionCalculations.ts` - Calculation logic

### Documentation
- `/COMMISSION_DIAGNOSIS.md` - Troubleshooting guide (can be deleted after reading)
- `/fix_hm_nilay_commission.sql` - One-time fix script (can be deleted)

---

## Checklist for Future Changes

Before modifying commission percentage migration logic, verify:

- [ ] Salesforce Opportunity has `House_Percent__c`, `Origination_Percent__c`, `Site_Percent__c`, `Deal_Percent__c` fields
- [ ] Deal INSERT statement maps these fields directly from Salesforce
- [ ] ON CONFLICT clause includes these fields in the update
- [ ] No UPDATE statement tries to calculate percentages from commission_split
- [ ] Test with "HM - Nilay - Jefferson ECDT" deal to verify values match Salesforce
- [ ] Document WHY you're changing it if you absolutely must

---

## Summary

**DO:**
✅ Map commission percentages directly from Salesforce Opportunity fields
✅ Use commission_split for broker-level percentage breakdowns
✅ Keep deal table percentages separate from commission_split logic

**DON'T:**
❌ Calculate deal percentages by aggregating commission_split records
❌ Use SUM/AVG on commission_split to populate deal table
❌ Assume commission_split percentages and deal percentages are the same thing

---

## Git Commit Reference

The fix was implemented in commit: `[To be filled in after commit]`

**Key changes:**
1. Added commission percentage fields to deal INSERT statement
2. Mapped directly from Salesforce Opportunity fields
3. Removed broken AVG/SUM calculation logic
4. Added fields to ON CONFLICT update clause

---

**Last Updated:** 2025-10-03
**Author:** Claude (AI Assistant) working with Mike Minihan
**Status:** ✅ Production Fix Applied
