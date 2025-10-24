# Payment Override System Documentation

## Overview

The payment override system allows users to manually adjust a payment amount in the Payment Dashboard. When a payment is overridden, the system automatically recalculates:
1. **Payment AGCI** (Agent Gross Commission Income)
2. **Referral Fee** (based on new payment amount)
3. **All broker splits** (Origination, Site, and Deal splits)

This happens in real-time without page refresh or tab switching.

## Architecture

### Database Schema

#### Payment Table Fields
- `payment_amount`: The actual payment amount (can be overridden)
- `agci`: Agent Gross Commission Income (calculated automatically)
- `referral_fee_usd`: Referral fee in USD (calculated automatically)
- `amount_override`: Boolean flag indicating if payment was manually overridden
- `override_at`: Timestamp of when override occurred

#### Payment Split Table Fields
- `split_origination_usd`: Broker's origination split amount
- `split_site_usd`: Broker's site split amount
- `split_deal_usd`: Broker's deal split amount
- `split_broker_total`: Total split amount for broker (sum of above three)
- `split_origination_percent`: Broker's origination percentage
- `split_site_percent`: Broker's site percentage
- `split_deal_percent`: Broker's deal percentage

### Calculation Logic

#### Payment AGCI and Referral Fee Calculation
```
Referral Fee = Payment Amount × Referral Fee %
Payment GCI = Payment Amount - Referral Fee
House Split = House Percent × Payment GCI
Payment AGCI = Payment GCI - House Split
```

**Note:** Both `referral_fee_usd` and `agci` are calculated by the `calculate_payment_agci()` trigger whenever `payment_amount` changes.

#### Broker Split Calculation (Per Payment)
When a payment is overridden:
```
Category Total (Origination) = Payment AGCI × Deal Origination %
Category Total (Site) = Payment AGCI × Deal Site %
Category Total (Deal) = Payment AGCI × Deal Deal %

Broker Split (Origination) = Category Total (Origination) × Broker Split Origination %
Broker Split (Site) = Category Total (Site) × Broker Split Site %
Broker Split (Deal) = Category Total (Deal) × Broker Split Deal %

Broker Total = Broker Split (Origination) + Broker Split (Site) + Broker Split (Deal)
```

When a payment is NOT overridden:
```
Template amounts from commission_split table are divided by number_of_payments
Broker Split (Origination) = Template Origination ÷ Number of Payments
Broker Split (Site) = Template Site ÷ Number of Payments
Broker Split (Deal) = Template Deal ÷ Number of Payments
```

### Database Triggers

The system uses three triggers working in sequence:

#### 1. `calculate_payment_agci_trigger` (BEFORE UPDATE/INSERT on `payment`)
**Function:** `calculate_payment_agci()`

**Purpose:** Calculates Payment AGCI and referral fee whenever payment amount changes.

**Timing:** BEFORE INSERT OR UPDATE OF payment_amount, amount_override

**Logic:**
1. Retrieves deal's `referral_fee_percent` and `house_percent`
2. Calculates Payment GCI = Payment Amount - (Payment Amount × Referral Fee %)
3. Calculates House Split = House Percent × Payment GCI
4. Sets `NEW.agci` = Payment GCI - House Split
5. Sets `NEW.referral_fee_usd` = Payment Amount × Referral Fee %

#### 2. `update_broker_splits_trigger` (AFTER UPDATE/INSERT on `payment`)
**Function:** `update_broker_splits_on_agci_change()`

**Purpose:** Updates all broker splits for a payment when AGCI changes.

**Timing:** AFTER INSERT OR UPDATE

**Logic:**
1. Retrieves deal's category percentages (origination_percent, site_percent, deal_percent)
2. Calculates category totals from Payment AGCI
3. Updates ALL payment_split records for this payment:
   - split_origination_usd = Origination Total × Broker's split_origination_percent
   - split_site_usd = Site Total × Broker's split_site_percent
   - split_deal_usd = Deal Total × Broker's split_deal_percent
   - split_broker_total = sum of the three splits

#### 3. `trigger_calculate_payment_split` (BEFORE UPDATE/INSERT on `payment_split`)
**Function:** `calculate_payment_split()`

**Purpose:** Normally calculates splits from commission_split template, but SKIPS recalculation when payment is overridden.

**Timing:** BEFORE INSERT OR UPDATE

**Critical Logic:**
```sql
-- Check if payment has been overridden
SELECT p.amount_override INTO payment_override
FROM payment p
WHERE p.id = NEW.payment_id;

-- If overridden, return NEW as-is (don't recalculate)
IF COALESCE(payment_override, false) = true THEN
    RETURN NEW;
END IF;

-- Otherwise, calculate from template
NEW.split_origination_usd := template_origination / payment_count;
NEW.split_site_usd := template_site / payment_count;
NEW.split_deal_usd := template_deal / payment_count;
```

**Why This Matters:**
This was the KEY fix. Without this conditional logic, this trigger would ALWAYS recalculate splits from the commission_split template, overwriting the values set by `update_broker_splits_on_agci_change()`. By checking `amount_override`, we allow override-based calculations to take precedence.

### Trigger Execution Flow

When a payment amount is overridden:

```
1. User sets payment_amount via PaymentAmountOverrideModal
   └─> UPDATE payment SET payment_amount = X, amount_override = true

2. BEFORE trigger on payment fires: calculate_payment_agci_trigger
   └─> Calculates NEW.agci based on new payment_amount
   └─> Updates NEW.referral_fee_usd

3. Payment record is updated with new values

4. AFTER trigger on payment fires: update_broker_splits_trigger
   └─> Calculates category totals from NEW.agci
   └─> UPDATE payment_split SET split_origination_usd = ..., split_site_usd = ..., etc.

5. BEFORE trigger on payment_split fires: trigger_calculate_payment_split
   └─> Checks if payment.amount_override = true
   └─> Since it's true, returns NEW as-is (doesn't recalculate)
   └─> Allows the values from step 4 to persist

6. Payment split records are updated with override-based values

7. UI receives updated data and re-renders
```

## Frontend Implementation

### Components

#### PaymentAmountOverrideModal.tsx
**Purpose:** UI modal for overriding payment amounts

**Key Features:**
- Input field for new payment amount
- Validation to prevent negative or zero amounts
- Success callback to refresh parent component
- No page reload (uses callback pattern)

**Code:**
```typescript
const { error: updateError } = await supabase
  .from('payment')
  .update({
    payment_amount: newAmount,
    amount_override: true,
    override_at: new Date().toISOString(),
  })
  .eq('id', paymentId);

if (onSuccess) {
  onSuccess(); // Triggers parent to refetch data
}
```

#### PaymentDetailPanel.tsx
**Purpose:** Displays payment details including AGCI and referral fees

**Key Changes:** Uses database values instead of calculating

**AGCI Display:**
```typescript
// BEFORE (WRONG): Calculated AGCI client-side
const paymentAGCI = calculatePaymentAGCI();

// AFTER (CORRECT): Uses database value
const paymentAGCI = payment.agci || 0;
```

**Referral Fee Display:**
```typescript
// BEFORE (WRONG): Divided deal total by number of payments
${((deal.referral_fee_usd || 0) / (deal.number_of_payments || 1)).toLocaleString(...)}

// AFTER (CORRECT): Uses database value for this specific payment
${(payment.referral_fee_usd || 0).toLocaleString(...)}
```

**Why This Matters:**
- When a payment is overridden, the `calculate_payment_agci()` trigger recalculates `payment.referral_fee_usd` based on the new payment amount
- Using `deal.referral_fee_usd / number_of_payments` doesn't account for overrides
- Using `payment.referral_fee_usd` ensures the correct amount is displayed

#### usePaymentSplitCalculations.ts
**Purpose:** Hook to get broker split data

**Key Change:** Simplified to use database values only
```typescript
// Returns splits directly from database without recalculation
return splits.map(split => ({
  ...split,
  split_origination_usd: split.split_origination_usd || 0,
  split_site_usd: split.split_site_usd || 0,
  split_deal_usd: split.split_deal_usd || 0,
  split_broker_total: split.split_broker_total || 0
}));
```

#### PaymentTab.tsx
**Purpose:** Container for payment dashboard

**Key Feature:** Force refresh capability
```typescript
const fetchPaymentData = async (forceFresh = false) => {
  // If forceFresh, bypass cache
  if (forceFresh) {
    // Force new query
  }
};

const onRefresh = () => fetchPaymentData(true);
```

### TypeScript Types

#### Payment Interface (lib/types.ts)
Added fields:
```typescript
export interface Payment {
  // ... existing fields ...

  // Commission calculation fields
  agci?: number | null;
  referral_fee_usd?: number | null;
  amount_override?: boolean | null;
  override_at?: string | null;
}
```

## Troubleshooting History

### Problem 1: AGCI Not Updating in UI
**Symptom:** AGCI showed $3,597.00 in UI but $2,698.03 in database

**Root Cause:** PaymentDetailPanel was CALCULATING AGCI client-side instead of using database value

**Solution:** Changed to use `payment.agci` directly

### Problem 2: Page Refreshing After Override
**Symptom:** Entire page reloaded and switched tabs after override

**Root Cause:** `window.location.reload()` in PaymentAmountOverrideModal

**Solution:** Removed reload, added onSuccess callback pattern

### Problem 3: Broker Splits Not Updating
**Symptom:** Broker splits showed old values (6540, 3270, 3270) even after AGCI updated correctly

**Root Cause:** The `trigger_calculate_payment_split` BEFORE trigger on payment_split table was ALWAYS recalculating splits from commission_split template, overwriting the values set by `update_broker_splits_on_agci_change`

**Investigation Steps:**
1. Verified BEFORE trigger on payment was working (AGCI calculated correctly)
2. Confirmed AFTER trigger on payment was firing (via RAISE NOTICE logging)
3. Tested manual UPDATE statements - they failed to persist
4. Discovered conflicting BEFORE trigger on payment_split table
5. Found trigger was dividing template amounts by payment count on EVERY update

**Solution:** Modified `calculate_payment_split()` function to check `payment.amount_override` flag:
- If TRUE: Return NEW as-is (don't recalculate, allow override values)
- If FALSE: Use normal template-based calculation

This was the critical fix that made everything work.

### Problem 4: Referral Fee Not Updating in UI
**Symptom:** When payment was overridden, AGCI and broker splits updated correctly, but referral fee still showed old amount

**Root Cause:** PaymentDetailPanel was calculating referral fee by dividing the deal's total referral_fee_usd by number_of_payments, which doesn't account for payment overrides

**Investigation Steps:**
1. Verified database trigger WAS calculating `payment.referral_fee_usd` correctly
2. Tested with SQL - confirmed trigger updates the field when payment_amount changes
3. Found UI was using `(deal.referral_fee_usd / number_of_payments)` instead of `payment.referral_fee_usd`

**Solution:** Changed PaymentDetailPanel to use `payment.referral_fee_usd` directly:
```typescript
// Before: ${((deal.referral_fee_usd || 0) / (deal.number_of_payments || 1)).toLocaleString(...)}
// After:  ${(payment.referral_fee_usd || 0).toLocaleString(...)}
```

**Example:**
- Payment overridden to $9,812
- Referral fee percent: 50%
- Database correctly calculated: $4,906 (50% of $9,812)
- UI was showing: incorrect value from deal total ÷ payments
- After fix: $4,906 ✓

## Testing

### Database Testing
Test payment override in SQL:
```sql
-- Set payment amount and override flag
UPDATE payment
SET payment_amount = 9812,
    amount_override = true,
    override_at = NOW()
WHERE id = 'payment-uuid';

-- Verify AGCI and splits updated correctly
SELECT
    p.payment_amount,
    p.agci,
    ps.split_origination_usd,
    ps.split_site_usd,
    ps.split_deal_usd,
    ps.split_broker_total
FROM payment p
JOIN payment_split ps ON ps.payment_id = p.id
WHERE p.id = 'payment-uuid';
```

### UI Testing
1. Navigate to Payment Dashboard
2. Click override icon on any payment
3. Enter new payment amount (e.g., $9,811)
4. Click "Override Payment"
5. Verify:
   - Modal closes
   - Payment amount updates immediately
   - AGCI recalculates (should be lower than original)
   - Referral fee recalculates based on new payment amount
   - All broker splits recalculate proportionally
   - Total broker splits sum to new AGCI
   - No page refresh occurs
   - Orange flag icon appears on overridden payment

## Key Insights

### Why Triggers Fire in This Order
1. **BEFORE triggers on the table being modified fire first**
   - `calculate_payment_agci_trigger` on payment fires when we UPDATE payment

2. **The actual UPDATE happens**
   - Payment record updated with new values including calculated AGCI

3. **AFTER triggers on the table being modified fire**
   - `update_broker_splits_trigger` on payment fires after payment UPDATE completes

4. **Cascading UPDATEs trigger their own BEFORE triggers**
   - When `update_broker_splits_trigger` does UPDATE on payment_split
   - `trigger_calculate_payment_split` BEFORE trigger on payment_split fires
   - This is where we needed the conditional logic!

### Critical Design Pattern
When you have triggers that UPDATE related tables, you must consider:
1. Will the related table have its own BEFORE triggers?
2. Will those triggers conflict with your cascade logic?
3. How can you signal intent (like `amount_override` flag) to control behavior?

### The Importance of amount_override Flag
The `amount_override` boolean flag serves as a **mode switch**:
- **FALSE (default)**: Use template-based calculation (commission_split ÷ payments)
- **TRUE (overridden)**: Use payment-AGCI-based calculation

This single flag coordinates behavior across multiple triggers without them needing to communicate directly.

## Files Modified

### Database
- `supabase/FIX_PAYMENT_SPLIT_TRIGGER.sql` - Modified calculate_payment_split() function
- `supabase/CLEAN_SLATE_PAYMENT_TRIGGERS.sql` - Created clean trigger set for payment table

### Frontend
- `src/components/payments/PaymentAmountOverrideModal.tsx` - Removed reload, added callback
- `src/components/payments/PaymentDetailPanel.tsx` - Use database AGCI and referral_fee_usd instead of calculation
- `src/hooks/usePaymentSplitCalculations.ts` - Simplified to use database values
- `src/lib/types.ts` - Added agci, referral_fee_usd, amount_override, override_at fields
- `src/components/PaymentTab.tsx` - Added force refresh capability

## Maintenance Notes

### When Adding New Payment-Related Triggers
1. Check if trigger modifies payment_split table
2. If yes, ensure it respects `payment.amount_override` flag
3. Test with overridden and non-overridden payments

### When Modifying Commission Calculation Logic
1. Update BOTH paths in triggers:
   - Normal calculation (template-based)
   - Override calculation (AGCI-based)
2. Ensure calculations produce same results when payment isn't overridden
3. Test edge cases (zero amounts, null percentages, etc.)

### Common Pitfalls
1. **Don't calculate AGCI client-side** - Always use `payment.agci` from database
2. **Don't calculate referral fees client-side** - Always use `payment.referral_fee_usd` from database
3. **Don't calculate splits client-side** - Always use payment_split table values
4. **Don't add BEFORE triggers to payment_split without considering overrides**
5. **Don't clear amount_override flag** - It needs to persist for trigger logic
6. **Don't divide deal totals by number of payments** - Use payment-specific values for overridden payments

## Future Enhancements

### Potential Improvements
1. **Audit trail**: Log all override changes with user_id and reason
2. **Undo capability**: Store previous values to allow reverting overrides
3. **Batch override**: Allow overriding multiple payments at once
4. **Override templates**: Save common override patterns
5. **Notification system**: Alert stakeholders when payments are overridden
6. **Permission control**: Restrict who can override payments based on role

### Performance Considerations
- Current implementation recalculates all splits for a payment on override
- For deals with many brokers (>10), consider async processing
- Add indexes on `amount_override` if querying overridden payments frequently
- Consider materialized views for complex split aggregations

## Conclusion

The payment override system works through a carefully orchestrated sequence of database triggers that:
1. Calculate Payment AGCI from overridden amount
2. Update broker splits based on new AGCI
3. Respect override mode by skipping template-based recalculation

The key breakthrough was understanding that the payment_split table's BEFORE trigger was conflicting with our cascade UPDATE, and adding conditional logic based on the `amount_override` flag to coordinate behavior.
