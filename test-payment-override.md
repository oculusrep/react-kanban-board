# Payment Amount Override - Test Plan

## Overview
This feature allows manual override of payment amounts with protection against automatic recalculation. When an override is set, the payment amount will not change even when the deal fee or number_of_payments changes.

## Prerequisites
1. Run migrations in Supabase SQL Editor (in order):
   - `20251023_add_payment_amount_override.sql`
   - `20251023_update_triggers_respect_override.sql`

## Test Scenarios

### Test 1: Basic Override Functionality
**Objective**: Verify you can manually override a payment amount

**Steps**:
1. Navigate to Payment Dashboard → "Salesforce vs OVIS Comparison" tab
2. Find a payment row with an OVIS payment (has OVIS Deal name)
3. Click the 3-dot menu (⋮) in the Actions column
4. Click "🔧 Override Amount"
5. In the modal, enter a new amount (e.g., if current is $10,000, enter $10,500.50)
6. Click "Save Override"

**Expected Results**:
- Modal closes
- Report refreshes
- Payment row shows new amount ($10,500.50)
- 🔒 lock icon appears next to the 3-dot menu
- Menu now shows "📝 Edit Override" instead of "🔧 Override Amount"
- Menu shows new option: "🔓 Clear Override"

### Test 2: Override Persists Through Fee Changes
**Objective**: Verify override prevents auto-recalculation when deal fee changes

**Setup**: Use the deal from Test 1 (with overridden payment)

**Steps**:
1. Navigate to the deal detail page
2. Note the current payment amount (should be your override value)
3. Note the current fee (e.g., $30,000)
4. Edit the deal and change the fee (e.g., to $35,000)
5. Save the deal
6. Go back to the Payment tab

**Expected Results**:
- The overridden payment amount DID NOT change (still shows $10,500.50)
- Other non-overridden payments on the same deal WERE recalculated based on new fee
- The 🔒 lock icon is still present

### Test 3: Override Persists Through Number of Payments Changes
**Objective**: Verify override prevents auto-recalculation when number_of_payments changes

**Setup**: Use the deal from Test 1 (with overridden payment)

**Steps**:
1. Navigate to the deal detail page
2. Note current number_of_payments (e.g., 3)
3. Note the overridden payment amount (e.g., $10,500.50)
4. Edit the deal and change number_of_payments (e.g., to 4)
5. Save the deal
6. Go back to the Payment tab

**Expected Results**:
- A new 4th payment was created
- The overridden payment amount DID NOT change (still shows $10,500.50)
- Other non-overridden payments were recalculated based on new number_of_payments
- The 🔒 lock icon is still present on the overridden payment

### Test 4: Edit Override
**Objective**: Verify you can change an existing override

**Setup**: Use the deal from Test 1 (with overridden payment)

**Steps**:
1. Go to Payment Dashboard → Comparison report
2. Find the overridden payment (shows 🔒)
3. Click the 3-dot menu
4. Click "📝 Edit Override"
5. Change the amount to a new value (e.g., $11,000)
6. Click "Save Override"

**Expected Results**:
- Modal closes
- Report refreshes
- Payment amount shows new value ($11,000)
- 🔒 lock icon still present

### Test 5: Clear Override
**Objective**: Verify clearing override allows auto-recalculation

**Setup**: Use the deal from Test 1 (with overridden payment)

**Steps**:
1. Go to Payment Dashboard → Comparison report
2. Find the overridden payment (shows 🔒)
3. Note the deal's fee and number_of_payments
4. Calculate expected amount: fee / number_of_payments
5. Click the 3-dot menu
6. Click "🔓 Clear Override"
7. Confirm the action

**Expected Results**:
- Menu closes
- Report refreshes
- Payment amount reverts to calculated amount (fee / number_of_payments)
- 🔒 lock icon is gone
- Menu shows "🔧 Override Amount" again (not "Edit Override")

### Test 6: Override Affects Payment Splits
**Objective**: Verify payment splits calculate off overridden amount, not calculated amount

**Setup**: Use a deal with commission splits configured and override one payment

**Steps**:
1. Find a deal with broker commission splits set up
2. Navigate to Payment Dashboard → Comparison report
3. Override one of the payments (e.g., change $10,000 to $10,500)
4. Navigate to the deal's Payment tab
5. Expand the overridden payment to view payment splits

**Expected Results**:
- Payment splits show amounts calculated from overridden amount ($10,500)
- If broker has 50% split, their split amount should be $5,250 (not $5,000)
- Split percentages remain the same, but dollar amounts reflect override

### Test 7: Comparison Report Shows Correct Amounts
**Objective**: Verify comparison report uses stored amounts (not calculated)

**Steps**:
1. Go to Payment Dashboard → Comparison report
2. Find any payment with a discrepancy
3. Note the "OVIS Amount" shown
4. Navigate to that deal's detail page → Payment tab
5. Check the payment_amount shown there

**Expected Results**:
- OVIS Amount in comparison report matches payment_amount in deal detail
- If payment is overridden, shows override amount
- If not overridden, shows the stored calculated amount
- No longer shows "calculated amount" in the comparison report

### Test 8: Override Works After Number Decrease
**Objective**: Verify override works when reducing number_of_payments

**Setup**: Deal with 3 payments, override payment #2

**Steps**:
1. Create or find a deal with 3 payments
2. Override payment #2 (e.g., set to $7,500)
3. Note the override amount
4. Edit deal, change number_of_payments from 3 to 2
5. Save and check payments

**Expected Results**:
- Payment #3 is archived (soft deleted)
- Payment #1 amount recalculated
- Payment #2 still shows override amount ($7,500)
- 🔒 lock still present on payment #2

## SQL Verification Queries

After running tests, you can verify in Supabase SQL Editor:

### Check Override Flags
```sql
SELECT
  d.deal_name,
  p.payment_sequence,
  p.payment_amount,
  p.amount_override,
  p.override_at
FROM payment p
INNER JOIN deal d ON d.id = p.deal_id
WHERE p.amount_override = true
  AND p.is_active = true
ORDER BY d.deal_name, p.payment_sequence;
```

### Verify Splits Calculate From Overridden Amount
```sql
SELECT
  d.deal_name,
  p.payment_sequence,
  p.payment_amount,
  p.amount_override,
  ps.broker_id,
  ps.split_deal_percent,
  -- Split amount should be based on payment_amount (which is overridden)
  ROUND(p.payment_amount * ps.split_deal_percent / 100, 2) as expected_split_amount
FROM payment p
INNER JOIN deal d ON d.id = p.deal_id
INNER JOIN payment_split ps ON ps.payment_id = p.id
WHERE p.amount_override = true
  AND p.is_active = true
ORDER BY d.deal_name, p.payment_sequence;
```

### Check Trigger Respects Override
This test requires manual verification:
1. Note a payment with amount_override = true and its amount
2. Update the deal fee
3. Check if the overridden payment amount changed (it should NOT)

```sql
-- Before changing fee
SELECT id, payment_amount, amount_override
FROM payment
WHERE id = '<payment-id>';

-- Change fee on the deal in UI or:
-- UPDATE deal SET fee = <new-fee> WHERE id = '<deal-id>';

-- After changing fee
SELECT id, payment_amount, amount_override
FROM payment
WHERE id = '<payment-id>';
-- amount should be unchanged if amount_override = true
```

## Success Criteria

All tests should pass with expected results. The override system should:
- ✅ Allow manual override of payment amounts
- ✅ Prevent automatic recalculation when override is set
- ✅ Show visual indicator (🔒) for overridden payments
- ✅ Allow editing existing overrides
- ✅ Allow clearing overrides to re-enable auto-calculation
- ✅ Calculate payment splits from overridden amounts
- ✅ Use stored amounts (not calculated) in all reports
- ✅ Persist overrides through deal changes (fee, number_of_payments)

## Rollback Plan

If issues occur, you can disable the feature:

```sql
-- Remove override flag from all payments
UPDATE payment
SET amount_override = false,
    override_at = NULL,
    override_by = NULL
WHERE amount_override = true;

-- Recalculate all payments
UPDATE payment p
SET payment_amount = d.fee / d.number_of_payments
FROM deal d
WHERE p.deal_id = d.id
  AND p.is_active = true
  AND p.locked = false;
```
