# Final Trigger Design - Auto-Sync Payment Splits

## User Workflow Requirements

1. Add brokers one at a time to commission_split table
2. When broker is added → automatically create payment_split records for that broker across all payments
3. When broker split percentages are edited → automatically update payment_split records for that broker
4. When broker is removed → automatically delete payment_split records for that broker
5. Payment overrides must continue to work (yesterday's fix)

## Trigger Architecture

### On `payment` table (from Oct 23 - KEEP AS-IS):
1. ✅ `calculate_payment_agci_trigger` (BEFORE INSERT/UPDATE)
   - Calculates AGCI and referral_fee_usd when payment_amount changes
   - Needed for overrides

2. ✅ `update_broker_splits_trigger` (AFTER UPDATE)
   - Updates existing payment_split records when AGCI changes
   - Needed for overrides

### On `commission_split` table (NEW - THIS IS WHAT'S MISSING):

#### Trigger 1: When broker is ADDED to a deal
```sql
CREATE TRIGGER auto_create_payment_splits_for_new_broker
    AFTER INSERT ON commission_split
    FOR EACH ROW
    EXECUTE FUNCTION create_payment_splits_for_broker();
```

**What it does:**
- When you add a broker to commission_split
- For each payment on that deal
- Create a payment_split record for that broker

**Example:**
```
You add Broker A to deal (50% orig, 25% site, 25% deal)
  ↓
Deal has 2 payments already
  ↓
Creates:
  - payment_split for Broker A on Payment 1
  - payment_split for Broker A on Payment 2
```

#### Trigger 2: When broker percentages are CHANGED
```sql
CREATE TRIGGER auto_update_payment_splits_for_broker
    AFTER UPDATE ON commission_split
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_splits_for_broker();
```

**What it does:**
- When you change a broker's commission percentages
- Find all payment_split records for that broker on that deal
- Update the dollar amounts based on new percentages

**Example:**
```
You change Broker A from (50%, 25%, 25%) to (60%, 20%, 20%)
  ↓
Updates:
  - payment_split for Broker A on Payment 1 → recalculates $
  - payment_split for Broker A on Payment 2 → recalculates $
```

#### Trigger 3: When broker is REMOVED from a deal
```sql
CREATE TRIGGER auto_delete_payment_splits_for_removed_broker
    AFTER DELETE ON commission_split
    FOR EACH ROW
    EXECUTE FUNCTION delete_payment_splits_for_broker();
```

**What it does:**
- When you delete a broker from commission_split
- Delete all payment_split records for that broker on that deal

**Example:**
```
You remove Broker B from the deal
  ↓
Deletes:
  - payment_split for Broker B on Payment 1
  - payment_split for Broker B on Payment 2
```

## Interaction with Payment Override System

### Scenario: Payment Override with Auto-Sync Triggers

**Initial State:**
- Deal has 2 brokers: Broker A (50/25/25), Broker B (50/25/25)
- Payment 1: $50,000
- Payment 2: $50,000

**Step 1: User overrides Payment 1 to $40,000**
```
UPDATE payment SET payment_amount = 40000, amount_override = true WHERE id = 'payment-1'
  ↓
BEFORE trigger (payment): calculate_payment_agci_trigger
  → Recalculates payment.agci based on new amount
  ↓
AFTER trigger (payment): update_broker_splits_trigger
  → Updates Broker A's payment_split on Payment 1
  → Updates Broker B's payment_split on Payment 1
  ↓
✅ Override works correctly
```

**Step 2: User changes Broker A percentages to (60/20/20)**
```
UPDATE commission_split SET split_origination_percent = 60, ... WHERE broker_id = 'broker-a'
  ↓
AFTER trigger (commission_split): auto_update_payment_splits_for_broker
  → Finds payment_splits for Broker A
  → Recalculates based on new percentages
  → Updates Broker A on Payment 1 (uses overridden AGCI ✅)
  → Updates Broker A on Payment 2 (uses normal AGCI ✅)
  ↓
✅ Works correctly because it uses payment.agci (which is already calculated)
```

**Key Insight:** All payment_split calculations should use `payment.agci` (not recalculate it). This way, overridden payments keep their overridden AGCI, and commission_split changes just redistribute that AGCI among brokers.

## Potential Conflict Check

### ❌ Conflict: payment UPDATE trigger + commission_split UPDATE trigger
**Could they fight over payment_split values?**

**Answer: NO** - They update in different scenarios:
- Payment trigger: Fires when **payment amount changes** → updates all brokers' splits
- Commission_split trigger: Fires when **broker percentages change** → updates only that broker's splits

**Edge case:** What if user overrides payment AND changes broker % at the same time?
- Payment override happens first → payment.agci changes → all splits updated
- User then changes broker % → commission_split trigger fires → only that broker's splits updated
- ✅ Final state is correct

## Implementation Plan

### Step 1: Create the three functions
```sql
create_payment_splits_for_broker()  -- For INSERT
update_payment_splits_for_broker()  -- For UPDATE
delete_payment_splits_for_broker()  -- For DELETE
```

### Step 2: Create the three triggers on commission_split
```sql
AFTER INSERT → create_payment_splits_for_broker()
AFTER UPDATE → update_payment_splits_for_broker()
AFTER DELETE → delete_payment_splits_for_broker()
```

### Step 3: Keep existing payment triggers untouched
- Don't modify yesterday's override triggers
- They continue to work for overrides

## The Critical Formula (Must be consistent everywhere)

**When creating OR updating payment_split:**
```
For each payment:
  1. Get payment.agci (already calculated by payment trigger)
  2. Calculate category totals:
     - origination_total = payment.agci × deal.origination_percent / 100
     - site_total = payment.agci × deal.site_percent / 100
     - deal_total = payment.agci × deal.deal_percent / 100
  3. Calculate broker's share:
     - split_origination_usd = origination_total × broker.split_origination_percent / 100
     - split_site_usd = site_total × broker.split_site_percent / 100
     - split_deal_usd = deal_total × broker.split_deal_percent / 100
     - split_broker_total = sum of the three
```

**This formula is used by:**
- ✅ commission_split INSERT trigger (create splits for new broker)
- ✅ commission_split UPDATE trigger (update splits for existing broker)
- ✅ payment UPDATE trigger (update all splits when AGCI changes) ← Already exists from Oct 23

All three triggers use the same formula → consistent results

## Testing Scenarios

### Test 1: Add broker to existing deal with payments
1. Create deal with 2 payments
2. Add Broker A → Should create 2 payment_split records
3. Add Broker B → Should create 2 payment_split records
4. Total: 4 payment_split records (2 brokers × 2 payments)

### Test 2: Edit broker percentages
1. Change Broker A from 50/25/25 to 60/20/20
2. Should update Broker A's splits on all payments
3. Should NOT touch Broker B's splits

### Test 3: Remove broker
1. Delete Broker B from commission_split
2. Should delete Broker B's payment_splits on all payments
3. Should NOT touch Broker A's splits

### Test 4: Override payment + edit broker
1. Override Payment 1 to $40,000
2. Change Broker A percentages
3. Payment 1 should use $40,000 AGCI
4. Payment 2 should use normal AGCI
5. Both should reflect new broker percentages

### Test 5: Add broker to deal with overridden payment
1. Override Payment 1 to $40,000
2. Add Broker C
3. Broker C's split on Payment 1 should use $40,000 AGCI
4. Broker C's split on Payment 2 should use normal AGCI

## Does This Match Your Workflow?

✅ Add brokers one at a time → auto-creates splits
✅ Edit broker percentages → auto-updates splits
✅ Remove brokers → auto-deletes splits
✅ Payment overrides continue to work
✅ All changes happen automatically (no buttons)

## Next Question

Should I proceed with implementing these three triggers on commission_split table?
