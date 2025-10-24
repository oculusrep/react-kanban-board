# Deal Changes Auto-Sync Fix

## Problem Discovered

**Date:** October 24, 2025
**Reported By:** Mike Minihan

When changing deal-level percentages (referral fee %, house %, category splits), the payment AGCI and broker commission splits were not updating automatically.

### Example Scenario

1. Deal has 50% referral fee
2. Payment 1: $26,048.16 with AGCI calculated based on 50% referral
3. User removes referral fee (changes from 50% → 0%)
4. **Expected:** AGCI increases (no referral fee deducted), broker splits increase
5. **Actual:** Nothing changed - AGCI and splits stayed the same

## Root Cause

The `calculate_payment_agci_trigger` on the `payment` table only fires when these columns change:
- `payment_amount`
- `amount_override`

It does **NOT** fire when the `deal` table changes. So when `deal.referral_fee_percent` changes, the payment trigger never knows about it.

## Solution

Created a new trigger on the `deal` table that cascades changes to all associated payments.

### Migration: `20251024000004_fix_deal_changes_update_payments.sql`

**Trigger:** `recalculate_payments_on_deal_change_trigger`

**Fires When:** Any of these deal columns change:
- `referral_fee_percent`
- `house_percent`
- `origination_percent`
- `site_percent`
- `deal_percent`

**What It Does:**
```sql
UPDATE payment
SET payment_amount = payment_amount  -- Dummy update to trigger recalculation
WHERE deal_id = NEW.id;
```

This dummy update forces the payment trigger to fire, which recalculates:
1. `payment.agci` (affected by referral_fee_percent and house_percent)
2. `payment.referral_fee_usd` (affected by referral_fee_percent)
3. All `payment_split` records (affected by AGCI and category percentages)

## The Full Chain Reaction

When you change a deal percentage, here's what happens automatically:

```
1. User changes deal.referral_fee_percent (50% → 0%)
   ↓
2. recalculate_payments_on_deal_change_trigger fires (AFTER UPDATE on deal)
   ↓
3. Updates all payment records for that deal (dummy update)
   ↓
4. calculate_payment_agci_trigger fires (BEFORE UPDATE on payment)
   ↓
5. Recalculates payment.agci and payment.referral_fee_usd
   ↓
6. update_broker_splits_trigger fires (AFTER UPDATE on payment)
   ↓
7. Updates all payment_split records with new dollar amounts
   ↓
8. UI automatically shows updated values ✅
```

## What Deal Changes Now Auto-Sync

### 1. Referral Fee Percentage Changes
**Affects:** `payment.agci`, `payment.referral_fee_usd`, all broker splits

**Example:**
- Change referral fee from 50% → 0%
- AGCI increases by the referral fee amount
- All broker commission splits increase proportionally

### 2. House Percentage Changes
**Affects:** `payment.agci`, all broker splits

**Example:**
- Change house split from 10% → 5%
- AGCI increases (less house split)
- All broker commission splits increase proportionally

### 3. Category Percentage Changes (Origination, Site, Deal)
**Affects:** All broker splits in those categories

**Example:**
- Change deal from 80% origination / 20% site → 50% origination / 50% site
- Broker splits recalculate to match new category distribution
- Brokers with 100% origination see their commissions decrease
- Brokers with 100% site see their commissions increase

## Testing Results

✅ **Test 1: Remove Referral Fee**
- Started: 50% referral fee on deal 099463d8-c6be-42b6-8659-daf154730383
- Changed: 50% → 0%
- Result: AGCI increased, broker splits increased automatically

✅ **Test 2: Add Referral Fee**
- Started: 0% referral fee
- Changed: 0% → 25%
- Result: AGCI decreased, broker splits decreased automatically

✅ **Test 3: Change Category Splits**
- Started: 80% origination / 20% site
- Changed: 50% origination / 50% site
- Result: Broker splits redistributed correctly

✅ **Test 4: Payment Override Preserved**
- Overridden payment with custom amount
- Changed deal referral fee percentage
- Result: Override preserved, splits updated based on overridden AGCI

## Important Notes

### Dummy Update Pattern

The trigger uses a "dummy update" pattern:
```sql
SET payment_amount = payment_amount
```

This is a common PostgreSQL pattern to force a trigger to fire without actually changing data. The `payment_amount` stays the same, but the BEFORE UPDATE trigger runs and recalculates AGCI.

### Performance Considerations

When you change a deal percentage, ALL payments for that deal are updated. For deals with many payments, this could take a moment.

**Example:**
- Deal with 12 payments
- Change referral fee percentage
- All 12 payments update → All 12 × N broker splits update

For typical deals (1-12 payments), this is instant. For deals with 50+ payments, there may be a brief delay.

### Multiple Field Changes

If you change multiple deal percentages at once (e.g., referral fee AND house percent), the trigger only fires once thanks to the `WHEN` clause that checks `IS DISTINCT FROM`.

## Trigger Summary

After this migration, here's the complete trigger architecture:

### On `deal` Table (New!)
1. `recalculate_payments_on_deal_change_trigger` (AFTER UPDATE)
   - Fires when: referral_fee_percent, house_percent, or category percents change
   - Action: Updates all payments for the deal (dummy update)

### On `payment` Table (From Oct 23-24)
1. `calculate_payment_agci_trigger` (BEFORE INSERT/UPDATE)
   - Fires when: payment_amount or amount_override changes
   - Action: Calculates payment.agci and referral_fee_usd

2. `update_broker_splits_trigger` (AFTER UPDATE)
   - Fires when: agci, payment_amount, or amount_override changes
   - Action: Updates all payment_split records

### On `commission_split` Table (From Oct 24)
1. `create_payment_splits_for_new_broker_trigger` (AFTER INSERT)
   - Fires when: Broker added to deal
   - Action: Creates payment_splits for all payments

2. `update_payment_splits_for_broker_trigger` (AFTER UPDATE)
   - Fires when: Broker percentages change
   - Action: Updates payment_splits for that broker

3. `delete_payment_splits_for_broker_trigger` (AFTER DELETE)
   - Fires when: Broker removed from deal
   - Action: Deletes payment_splits for that broker

### On `payment_split` Table
- **NONE!** (No triggers to prevent conflicts)

## Common Scenarios

### Scenario 1: Testing Different Referral Fee Amounts

You're negotiating with a client about referral fees:

```
1. Enter deal with 50% referral fee → payments and splits calculate
2. Client pushes back, you try 25% → payments and splits update automatically
3. Client agrees to 30% → payments and splits update automatically
```

No need to click "Regenerate" or refresh the page!

### Scenario 2: Correcting Data Entry Mistakes

You entered the wrong house percentage:

```
1. Realize house percent should be 5%, not 15%
2. Change deal.house_percent from 15% → 5%
3. All payments and broker splits update automatically
4. Brokers see their commissions increase (less house split)
```

### Scenario 3: Renegotiating Category Splits Mid-Deal

Deal structure changes after some payments already made:

```
1. Deal originally: 80% origination / 20% site
2. Three payments already paid out based on 80/20 split
3. Renegotiate to 50% origination / 50% site
4. Change deal percentages
5. ALL payments (including already-paid ones) recalculate
6. Future payments use new 50/50 split
```

**Note:** If payments are already paid, you may need to manually adjust. The system will show the "should have been" amounts, not the "were actually paid" amounts.

## Troubleshooting

### Issue: Deal Percentage Changed But Splits Didn't Update

**Possible Causes:**
1. Trigger not applied - Check if migration was run
2. Browser cache - Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
3. RLS policy issue - Check browser console for errors

**Verify Trigger Exists:**
```sql
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'deal'
  AND trigger_name = 'recalculate_payments_on_deal_change_trigger';
```

Should return one row.

### Issue: Performance Slow When Changing Deal Percentages

**Cause:** Deal has many payments (50+)

**Solution:** This is expected. The system is recalculating all payments and their splits. For deals with 100+ payments, consider doing this during off-hours.

**Check Payment Count:**
```sql
SELECT deal_name, COUNT(*) as payment_count
FROM deal d
JOIN payment p ON p.deal_id = d.id
WHERE d.id = 'your-deal-id'
GROUP BY d.deal_name;
```

## Summary

✅ **Problem Solved:** Deal percentage changes now automatically update all payments and broker splits
✅ **User Experience:** No manual "Regenerate" needed when changing deal percentages
✅ **Preserves Overrides:** Payment overrides still work correctly
✅ **Performance:** Instant for typical deals (1-12 payments)
✅ **Complete Auto-Sync:** Everything now syncs automatically!

---

**Migration:** `20251024000004_fix_deal_changes_update_payments.sql`
**Date Applied:** October 24, 2025
**Status:** ✅ Tested and Working in Production
