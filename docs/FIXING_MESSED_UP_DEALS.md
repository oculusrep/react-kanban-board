# Fixing Messed Up Deals - Reference Guide

## When to Use This Guide

Use this guide when you encounter deals that have incorrect or missing payment splits due to:
- Testing and manual data manipulation
- Salesforce migration issues
- Trigger conflicts during development
- Manual database edits that bypassed triggers

## Diagnostic Queries

### Check Payment Split Status for a Deal

```sql
-- Get deal ID first
SELECT id, deal_name, fee, number_of_payments
FROM deal
WHERE deal_name ILIKE '%search term%'
ORDER BY created_at DESC
LIMIT 5;

-- Check if payment splits exist and are calculated correctly
SELECT
    p.payment_sequence,
    b.name as broker_name,
    ps.split_origination_percent,
    ps.split_site_percent,
    ps.split_deal_percent,
    ps.split_origination_usd,
    ps.split_site_usd,
    ps.split_deal_usd,
    ps.split_broker_total
FROM payment p
LEFT JOIN payment_split ps ON ps.payment_id = p.id
LEFT JOIN broker b ON ps.broker_id = b.id
WHERE p.deal_id = 'your-deal-id'
ORDER BY p.payment_sequence, b.name;
```

### Common Issues You'll See

**Issue 1: Missing Payment Splits**
- Payments exist but no payment_split records
- Shows "No Broker Split" in UI

**Issue 2: $0.00 Dollar Amounts**
- Payment splits exist with percentages but all dollar amounts are $0.00
- Usually caused by conflicting triggers or NULL AGCI values

**Issue 3: Wrong Broker Count**
- Expected 3 brokers per payment, only seeing 2
- Usually caused by broker being added before triggers were in place

**Issue 4: Outdated Percentages**
- Payment split percentages don't match commission_split percentages
- Happens when commission splits were changed but payment splits didn't update

## The Fix: Regenerate Payment Splits Function

### What It Does

The `regenerate_payment_splits_for_deal()` function completely rebuilds all payment_split records for a deal from scratch using the current data in:
- `payment` table (AGCI values, payment amounts)
- `commission_split` table (broker percentages)
- `deal` table (category percentages)

### How to Use It

```sql
SELECT regenerate_payment_splits_for_deal('your-deal-id-here');
```

**Example:**
```sql
SELECT regenerate_payment_splits_for_deal('e8cdc938-48fc-4da7-8d1b-1b9791884587');
```

**Success Output:**
```
SUCCESS: Deleted 6 old payment_splits, created 6 new payment_splits
```

**Error Output:**
```
ERROR: Deal not found
```

### Step-by-Step Process

1. **Find the deal ID** using the deal name:
   ```sql
   SELECT id, deal_name
   FROM deal
   WHERE deal_name ILIKE '%Burnt Hickory%';
   ```

2. **Verify the current state** (optional but recommended):
   ```sql
   -- Check commission splits (should match expected brokers)
   SELECT b.name, cs.split_origination_percent, cs.split_site_percent, cs.split_deal_percent
   FROM commission_split cs
   JOIN broker b ON cs.broker_id = b.id
   WHERE cs.deal_id = 'your-deal-id';

   -- Check payments (should have correct AGCI)
   SELECT payment_sequence, payment_amount, agci, amount_override
   FROM payment
   WHERE deal_id = 'your-deal-id'
   ORDER BY payment_sequence;
   ```

3. **Run the regenerate function**:
   ```sql
   SELECT regenerate_payment_splits_for_deal('your-deal-id');
   ```

4. **Verify the fix** using the diagnostic query from above

5. **Check the UI** - Go to Payment tab and verify brokers show with correct amounts

## What NOT to Do

### Don't Delete Payments

**Bad Approach:**
```sql
-- DON'T DO THIS!
DELETE FROM payment WHERE deal_id = 'your-deal-id';
```

**Why:** Deleting payments will trigger CASCADE deletes on payment_splits, but then you'll have to manually recreate the payments. The regenerate function is much cleaner.

### Don't Manually Edit Payment Splits

**Bad Approach:**
```sql
-- DON'T DO THIS!
UPDATE payment_split
SET split_origination_usd = 1500.00
WHERE id = 'some-id';
```

**Why:** Any change to commission splits or payment amounts will overwrite your manual edits. Always use the regenerate function to ensure consistency.

### Don't Delete Commission Splits to "Reset"

**Bad Approach:**
```sql
-- DON'T DO THIS!
DELETE FROM commission_split WHERE deal_id = 'your-deal-id';
-- Then re-add them
```

**Why:** This will trigger DELETE on payment_splits, but it's unnecessarily destructive. If you need to change commission splits, just UPDATE them directly or use the UI.

## Recommended Workflow for Fixing Deals

### Scenario 1: Missing Payment Splits

**Problem:** Payments exist but no payment_split records

**Fix:**
1. Verify commission splits exist for the deal
2. Run regenerate function
3. Verify in UI

```sql
-- Step 1: Check commission splits
SELECT COUNT(*) as broker_count
FROM commission_split
WHERE deal_id = 'your-deal-id';
-- Should show the number of brokers on the deal

-- Step 2: Regenerate
SELECT regenerate_payment_splits_for_deal('your-deal-id');

-- Step 3: Verify count
SELECT COUNT(*) as payment_split_count
FROM payment_split ps
JOIN payment p ON ps.payment_id = p.id
WHERE p.deal_id = 'your-deal-id';
-- Should equal: number_of_payments × broker_count
```

### Scenario 2: Wrong Percentages

**Problem:** Payment split percentages don't match commission split percentages

**Fix:**
1. Update commission splits to correct values (in UI or SQL)
2. Run regenerate function
3. Verify in UI

```sql
-- Step 1: Update commission split percentages (if needed)
UPDATE commission_split
SET split_site_percent = 75
WHERE deal_id = 'your-deal-id'
  AND broker_id = (SELECT id FROM broker WHERE name = 'Arty Santos');

-- Step 2: Regenerate
SELECT regenerate_payment_splits_for_deal('your-deal-id');

-- Step 3: Verify new percentages
SELECT
    b.name,
    ps.split_site_percent,
    ps.split_site_usd
FROM payment_split ps
JOIN broker b ON ps.broker_id = b.id
JOIN payment p ON ps.payment_id = p.id
WHERE p.deal_id = 'your-deal-id'
  AND p.payment_sequence = 1;
```

### Scenario 3: $0.00 Dollar Amounts

**Problem:** Percentages correct but all dollar amounts are $0.00

**Fix:**
1. Check if payment.agci is NULL (if so, update payment to recalculate)
2. Run regenerate function
3. Verify in UI

```sql
-- Step 1: Check AGCI values
SELECT payment_sequence, payment_amount, agci
FROM payment
WHERE deal_id = 'your-deal-id';
-- If agci is NULL, that's the problem

-- If AGCI is NULL, recalculate by updating payment
UPDATE payment
SET payment_amount = payment_amount -- Triggers AGCI recalculation
WHERE deal_id = 'your-deal-id';

-- Step 2: Regenerate
SELECT regenerate_payment_splits_for_deal('your-deal-id');

-- Step 3: Verify dollar amounts
SELECT
    p.payment_sequence,
    b.name,
    ps.split_broker_total
FROM payment_split ps
JOIN payment p ON ps.payment_id = p.id
JOIN broker b ON ps.broker_id = b.id
WHERE p.deal_id = 'your-deal-id'
ORDER BY p.payment_sequence, b.name;
```

### Scenario 4: Salesforce Migration Issues

**Problem:** Deal migrated from Salesforce with incorrect or missing data

**Fix:**
1. Verify deal data (fee, percentages, number_of_payments)
2. Verify commission splits exist with correct brokers
3. Verify payments exist with correct amounts
4. Run regenerate function

```sql
-- Step 1: Check deal
SELECT
    deal_name,
    fee,
    number_of_payments,
    origination_percent,
    site_percent,
    deal_percent,
    house_percent,
    referral_fee_percent
FROM deal
WHERE id = 'your-deal-id';

-- Step 2: Check commission splits
SELECT
    b.name,
    cs.split_origination_percent,
    cs.split_site_percent,
    cs.split_deal_percent
FROM commission_split cs
JOIN broker b ON cs.broker_id = b.id
WHERE cs.deal_id = 'your-deal-id';

-- Step 3: Check payments
SELECT
    payment_sequence,
    payment_amount,
    agci,
    amount_override
FROM payment
WHERE deal_id = 'your-deal-id'
ORDER BY payment_sequence;

-- Step 4: If everything looks good, regenerate
SELECT regenerate_payment_splits_for_deal('your-deal-id');
```

## Bulk Fixes

### Fix Multiple Deals at Once

If you have a list of messed up deals from Salesforce migration:

```sql
-- Create a temp table with deal IDs
CREATE TEMP TABLE messed_up_deals (deal_id UUID);

INSERT INTO messed_up_deals VALUES
    ('deal-id-1'),
    ('deal-id-2'),
    ('deal-id-3');

-- Run regenerate on all of them
SELECT
    d.deal_name,
    regenerate_payment_splits_for_deal(m.deal_id) as result
FROM messed_up_deals m
JOIN deal d ON d.id = m.deal_id;

-- Clean up
DROP TABLE messed_up_deals;
```

### Find All Deals with Missing Payment Splits

```sql
-- Deals with payments but no payment splits
SELECT
    d.id,
    d.deal_name,
    COUNT(p.id) as payment_count,
    COUNT(ps.id) as payment_split_count
FROM deal d
JOIN payment p ON p.deal_id = d.id
LEFT JOIN payment_split ps ON ps.payment_id = p.id
GROUP BY d.id, d.deal_name
HAVING COUNT(ps.id) = 0
   AND COUNT(p.id) > 0;
```

### Find All Deals with $0.00 Payment Splits

```sql
-- Deals where all payment splits have $0 broker total
SELECT DISTINCT
    d.id,
    d.deal_name
FROM deal d
JOIN payment p ON p.deal_id = d.id
JOIN payment_split ps ON ps.payment_id = p.id
WHERE ps.split_broker_total = 0
  AND (ps.split_origination_percent > 0
       OR ps.split_site_percent > 0
       OR ps.split_deal_percent > 0);
```

## Safety Notes

### The Function is Safe

The regenerate function:
- ✅ Only affects payment_split records (never touches payments or commission_splits)
- ✅ Uses a transaction (all or nothing, no partial updates)
- ✅ Preserves payment overrides (uses payment.agci which respects overrides)
- ✅ Can be run multiple times safely (idempotent)
- ✅ Returns error message if deal doesn't exist

### When to Be Careful

**Before running on production deals:**
1. Verify commission_split data is correct (these are the source of truth)
2. Verify payment.agci values are correct (especially for overridden payments)
3. Test on a similar deal in dev first if unsure

**After running:**
1. Always verify the results in the UI
2. Check that totals add up correctly
3. If a payment was overridden, verify the override is still reflected in the splits

## Troubleshooting

### "ERROR: Deal not found"

**Cause:** Deal ID doesn't exist in database

**Fix:** Double-check the deal ID, copy it directly from the database query

### Function Runs but Payment Splits Still Wrong

**Possible Causes:**
1. Commission splits have wrong percentages → Fix commission splits first, then regenerate
2. Payment AGCI is NULL or wrong → Update payment to recalculate AGCI, then regenerate
3. Deal category percentages are wrong → Fix deal percentages, then regenerate

**Debug Query:**
```sql
-- Check all the source data the function uses
SELECT
    d.deal_name,
    d.origination_percent as deal_orig_pct,
    d.site_percent as deal_site_pct,
    d.deal_percent as deal_deal_pct,
    p.payment_sequence,
    p.agci,
    b.name as broker_name,
    cs.split_origination_percent as broker_orig_pct,
    cs.split_site_percent as broker_site_pct,
    cs.split_deal_percent as broker_deal_pct
FROM deal d
JOIN payment p ON p.deal_id = d.id
JOIN commission_split cs ON cs.deal_id = d.id
JOIN broker b ON b.id = cs.broker_id
WHERE d.id = 'your-deal-id'
ORDER BY p.payment_sequence, b.name;
```

### Payment Splits Created but UI Shows "No Broker Split"

**Cause:** Frontend cache issue or RLS policy problem

**Fix:**
1. Hard refresh the page (Cmd+Shift+R or Ctrl+Shift+R)
2. Check browser console for errors
3. Verify payment_split records exist in database

## Summary

**The Golden Rule:** When payment splits are messed up, use `regenerate_payment_splits_for_deal()`.

**Don't:**
- ❌ Delete payments
- ❌ Manually edit payment_split dollar amounts
- ❌ Delete and re-add commission splits

**Do:**
- ✅ Fix commission split percentages if needed
- ✅ Run regenerate function
- ✅ Verify in UI

The regenerate function is your best friend for fixing Salesforce migration issues and testing cleanup.

---

**Last Updated:** October 24, 2025
**Related Migration:** `20251024000003_add_regenerate_payment_splits_function.sql`
