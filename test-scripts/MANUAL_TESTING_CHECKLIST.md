# Payment Lifecycle - Manual Testing Checklist

This checklist will help you manually test the payment lifecycle features through the UI.

## Prerequisites

1. ✅ Database migration has been applied (`20251022_add_payment_soft_delete.sql`)
2. ✅ Application is running (`npm run dev`)
3. ✅ You have at least one deal with payments in the system

---

## Test Case 1: Archive Unpaid Payments When Moving to "Lost"

### Setup
1. Navigate to a deal that has both paid and unpaid payments
2. Go to the **Payments** tab
3. Note the current payment status:
   - Total payments: ____
   - Paid payments: ____
   - Unpaid payments: ____

### Test Steps
1. Go to the **Details** tab
2. Change the **Deal Stage** dropdown to "Lost"
3. Click **Save**

### Expected Results
- ✅ **Loss Reason Modal** should appear asking for a loss reason
- ✅ After entering loss reason and saving, **Archive Payments Modal** should appear
- ✅ Modal should show: "Moving [Deal Name] to 'Lost' will archive [X] unpaid payment(s)"
- ✅ Modal should display: "Note: Paid payments will remain in the system..."
- ✅ Click **Continue**
- ✅ Deal should save successfully

### Verification
1. Go to the **Payments** tab
2. Verify that:
   - ✅ All **unpaid** payments are no longer visible
   - ✅ All **paid** payments are still visible
   - ✅ Payment count updated correctly

### Database Verification (Optional)
```sql
-- Check archived payments
SELECT id, payment_sequence, payment_amount, payment_received, is_active, deleted_at
FROM payment
WHERE deal_id = '[DEAL_ID]'
ORDER BY payment_sequence;
```

Expected:
- Unpaid payments should have `is_active = false` and `deleted_at` timestamp
- Paid payments should have `is_active = true` and `deleted_at = NULL`

---

## Test Case 2: No Confirmation When No Unpaid Payments

### Setup
1. Find or create a deal where ALL payments are marked as paid
2. Verify all payments are marked as "Received" in the Payments tab

### Test Steps
1. Go to the **Details** tab
2. Change the **Deal Stage** to "Lost"
3. Enter a loss reason
4. Click **Save**

### Expected Results
- ✅ **Loss Reason Modal** should appear
- ✅ **Archive Payments Modal** should NOT appear (no unpaid payments to archive)
- ✅ Deal should save successfully to "Lost" stage
- ✅ All paid payments should remain visible in Payments tab

---

## Test Case 3: Regenerate Payments When Moving From Lost to Active

### Setup
1. Use the deal from Test Case 1 (now in "Lost" stage with archived payments)
2. Note the deal's current commission settings:
   - Commission Fee: $____
   - Number of Payments: ____

### Test Steps
1. Go to the **Details** tab
2. Change the **Deal Stage** from "Lost" to an active stage (e.g., "Booked")
3. If prompted for Booked Date, enter a date
4. Click **Save**

### Expected Results
- ✅ Deal should save successfully
- ✅ System should automatically regenerate payments

### Verification
1. Go to the **Payments** tab
2. Verify that:
   - ✅ New payments have been generated based on current commission settings
   - ✅ Payment count matches "Number of Payments" in deal
   - ✅ Payment amounts are calculated correctly (Commission Fee ÷ Number of Payments)
   - ✅ All new payments are marked as "Pending" (unpaid)
   - ✅ Payment splits are regenerated for all brokers

### Database Verification (Optional)
```sql
-- Check regenerated payments
SELECT id, payment_sequence, payment_amount, payment_received, is_active, created_at
FROM payment
WHERE deal_id = '[DEAL_ID]'
AND is_active = true
ORDER BY payment_sequence;
```

Expected:
- All payments should have recent `created_at` timestamps
- All payments should have `is_active = true`
- Payment count should match deal's `number_of_payments`

---

## Test Case 4: No Broker Splits Display

### Setup
1. Find or create a deal with payments but NO broker commission splits
2. This simulates old Salesforce deals without broker splits

### Test Steps
1. Navigate to the deal
2. Go to the **Payments** tab
3. Expand a payment to view Commission Breakdown

### Expected Results
- ✅ "Commission Breakdown" section should display
- ✅ Should show: **"No Broker Split"** section (blue background)
- ✅ Should display: "Deal-level commission (AGCI)"
- ✅ Should show correct AGCI amount (based on calculated payment amount)
- ✅ Should NOT show broker split cards
- ✅ Should NOT show "Percentage Validation Errors"
- ✅ If referral fee exists, "Referral Fee" section should still display

---

## Test Case 5: Payment Amount Display

### Setup
1. Navigate to any deal with payments
2. The deal should have payments generated

### Test Steps
1. Go to the **Payments** tab
2. Review the Payment Schedule Preview
3. Review the Payment Management section

### Expected Results
- ✅ **Payment Schedule Preview** amounts should match **Payment [X] of [Y]** summary rows
- ✅ All USD amounts should display exactly **2 decimal places**
- ✅ Payment amounts should be calculated as: `deal.fee ÷ deal.number_of_payments`
- ✅ No amounts showing 3+ decimal places (e.g., no $2,614.985)

---

## Test Case 6: Edge Cases

### Test 6A: Deal With No Payments
1. Create or find a deal with NO payments
2. Change stage to "Lost"
3. Save deal

**Expected**: No archive modal, deal saves normally

### Test 6B: Deal Already in Lost Stage
1. Find a deal already in "Lost" stage
2. Keep it in "Lost" stage
3. Make other changes and save

**Expected**: No archive modal, changes save normally

### Test 6C: Cancel Archive Modal
1. Find deal with unpaid payments
2. Change stage to "Lost", enter loss reason
3. When Archive Payments Modal appears, click **Cancel**

**Expected**:
- Modal closes
- Deal is NOT saved
- Stage remains unchanged
- Payments remain unchanged

---

## Console Log Verification

While testing, open the browser DevTools Console and verify you see these logs:

### When Moving to Lost:
```
🗄️ Deal moved to Lost - archiving unpaid payments...
✅ Archived [X] unpaid payment(s)
```

### When Moving from Lost to Active:
```
📦 Deal moved from Lost to active stage - regenerating payments...
✅ Payments regenerated successfully
```

---

## Regression Testing

After completing the above tests, verify these existing features still work:

- ✅ Creating new payments works normally
- ✅ Editing payment amounts works
- ✅ Marking payments as received/paid works
- ✅ Payment splits calculate correctly
- ✅ Referral fees display correctly
- ✅ Invoice numbers can be entered
- ✅ Payment dates can be set

---

## Quick Reference: Active Deal Stages

Payments will be regenerated when moving FROM "Lost" TO any of these stages:
- Negotiating LOI
- At Lease/PSA
- Under Contract / Contingent
- Booked
- Executed Payable
- Closed Paid

---

## Troubleshooting

### Issue: Archive Payments Modal doesn't appear
**Check**:
- Deal has unpaid payments (`payment_received = false`)
- Stage is actually changing (not already "Lost")
- Browser console for errors

### Issue: Payments not regenerating when moving from Lost
**Check**:
- Deal has commission fee set (`fee` > 0)
- Deal has number of payments set (`number_of_payments` > 0)
- Browser console for errors
- Database function `generate_payments_for_deal` exists

### Issue: Paid payments disappeared
**Check**:
- Database: `SELECT * FROM payment WHERE deal_id = '...' AND is_active = false AND payment_received = true`
- This should return NO results (paid payments should never be archived)
- If results found, this is a BUG - report immediately

---

## Success Criteria

All tests should pass with ✅ marks. If any test fails:
1. Note the specific failure
2. Check browser console for errors
3. Check database for unexpected state
4. Review the implementation code
5. Report the issue with detailed reproduction steps
