# Payment Auto-Sync Testing Plan

## Pre-Test Setup

### What to have ready:
- [ ] Create a test deal or use an existing one you don't mind modifying
- [ ] Have at least 2-3 broker names ready (can be real brokers or test names)
- [ ] Have the Payment tab and Commission tab open in separate windows (easy to switch)

---

## Test 1: Add First Broker to New Deal

**Purpose:** Verify that adding a broker creates payment_split records

### Steps:
1. Create a new deal (or use existing)
   - Deal Name: "Test Auto-Sync Deal"
   - Deal Value: $100,000
   - Number of Payments: 2
   - House %: 40
   - Origination %: 50, Site %: 25, Deal %: 25

2. Go to **Commission tab**

3. Add **Broker A**:
   - Origination %: 50
   - Site %: 50
   - Deal %: 50
   - (Field auto-saves when you leave it)

4. Go to **Payment tab**

### Expected Results:
- ✅ 2 payments exist (Payment 1: $50,000, Payment 2: $50,000)
- ✅ Each payment shows **Broker A's name** (not "No Broker Split")
- ✅ Broker A's commission amounts are calculated correctly on both payments

### If this fails:
- ❌ Trigger 3 (create_payment_splits_for_new_broker_trigger) is not working
- Check browser console for errors
- Check database for payment_split records: `SELECT * FROM payment_split WHERE payment_id IN (SELECT id FROM payment WHERE deal_id = 'your-deal-id')`

---

## Test 2: Add Second Broker to Existing Deal

**Purpose:** Verify that adding another broker creates splits for that broker too

### Steps:
1. Stay on the same test deal from Test 1

2. Go to **Commission tab**

3. Add **Broker B**:
   - Origination %: 50
   - Site %: 50
   - Deal %: 50

4. Go to **Payment tab**

### Expected Results:
- ✅ Payment 1 now shows **both Broker A and Broker B**
- ✅ Payment 2 now shows **both Broker A and Broker B**
- ✅ Each broker's commission amounts are correct
- ✅ Totals add up correctly

### If this fails:
- ❌ Trigger 3 is not handling multiple brokers
- Check if Broker B's payment_split records were created

---

## Test 3: Edit Broker Percentages (Your Real-World Example)

**Purpose:** Verify that changing broker percentages updates payment splits

### Steps:
1. Stay on the same test deal

2. Go to **Commission tab**

3. Change **Broker A's Site %** from 50% → 75%
   - Click in the field, change value, click out (auto-save)

4. Change **Broker B's Site %** from 50% → 25%
   - Click in the field, change value, click out (auto-save)

5. Go to **Payment tab**

### Expected Results:
- ✅ Broker A's site commission increased
- ✅ Broker B's site commission decreased
- ✅ Origination and Deal commissions unchanged for both brokers
- ✅ Both payments updated (Payment 1 and Payment 2)
- ✅ New totals are correct

### Math to verify:
```
Payment AGCI (example): $30,000 per payment
Site Total: $30,000 × 25% = $7,500

Broker A Site: $7,500 × 75% = $5,625 ✅
Broker B Site: $7,500 × 25% = $1,875 ✅
Total: $5,625 + $1,875 = $7,500 ✅
```

### If this fails:
- ❌ Trigger 4 (update_payment_splits_for_broker_trigger) is not working
- Check if the percentages saved to commission_split table
- Check browser console for errors

---

## Test 4: Remove a Broker

**Purpose:** Verify that removing a broker deletes their payment splits

### Steps:
1. Stay on the same test deal

2. Go to **Commission tab**

3. Delete **Broker B** from the commission splits
   - (Whatever your UI does - delete button, etc.)

4. Go to **Payment tab**

### Expected Results:
- ✅ Payment 1 now shows **only Broker A**
- ✅ Payment 2 now shows **only Broker A**
- ✅ Broker B is completely gone from both payments
- ✅ Broker A's amounts unchanged

### If this fails:
- ❌ Trigger 5 (delete_payment_splits_for_broker_trigger) is not working
- Check if Broker B's payment_split records still exist in database

---

## Test 5: Payment Override Still Works (Critical!)

**Purpose:** Verify we didn't break yesterday's payment override fix

### Steps:
1. Stay on the same test deal (should have Broker A only now)

2. Go to **Payment tab**

3. Find Payment 1, click the **override icon** (orange flag)

4. Change payment amount from $50,000 → $40,000

5. Click "Override Payment"

### Expected Results:
- ✅ Modal closes
- ✅ Payment 1 amount shows $40,000
- ✅ Payment 1 AGCI recalculated (should be lower)
- ✅ Payment 1 referral fee recalculated
- ✅ **Broker A's commission on Payment 1 recalculated** (lower amounts)
- ✅ Payment 2 unchanged (still $50,000)
- ✅ Broker A's commission on Payment 2 unchanged
- ✅ Orange flag shows on Payment 1

### If this fails:
- ❌ We broke the override system (Oct 23 triggers)
- ❌ **STOP IMMEDIATELY** - Don't proceed with other tests
- We need to fix the conflict

---

## Test 6: Edit Broker After Override (The Ultimate Test!)

**Purpose:** Verify that triggers work together - override + broker edit

### Steps:
1. Stay on same deal (Payment 1 is overridden to $40,000, Payment 2 is still $50,000)

2. Go to **Commission tab**

3. Change **Broker A's Origination %** from 50% → 60%

4. Go to **Payment tab**

### Expected Results:
- ✅ Payment 1: Broker A's origination increased (based on $40,000 AGCI) ✅
- ✅ Payment 2: Broker A's origination increased (based on $50,000 AGCI) ✅
- ✅ Override still shows on Payment 1
- ✅ Different dollar amounts on Payment 1 vs Payment 2 (because different AGCI)

### This proves:
- ✅ Override AGCI is preserved
- ✅ Commission split changes work on overridden payments
- ✅ No conflicts between triggers

### If this fails:
- ❌ Triggers are fighting over payment_split values
- Need to check trigger execution order

---

## Test 7: Add Broker to Deal with Overridden Payment

**Purpose:** Verify new brokers get created correctly even with overrides

### Steps:
1. Stay on same deal (Payment 1 overridden, Payment 2 normal)

2. Go to **Commission tab**

3. Add **Broker C**:
   - Origination %: 25
   - Site %: 25
   - Deal %: 25

4. Go to **Payment tab**

### Expected Results:
- ✅ Payment 1 shows Broker A and Broker C
- ✅ Payment 2 shows Broker A and Broker C
- ✅ Broker C's amounts on Payment 1 use $40,000 AGCI
- ✅ Broker C's amounts on Payment 2 use $50,000 AGCI
- ✅ Different dollar amounts for Broker C on each payment

### If this fails:
- ❌ New broker creation doesn't respect overrides
- Check if payment.agci is being used correctly

---

## Test 8: Deal Value Change (If you want to test this too)

**Purpose:** Verify what happens when you change the deal value after everything is set up

**This is optional - only test if you change deal values in production**

### Steps:
1. Go to deal details

2. Change deal value from $100,000 → $120,000

3. Go to **Payment tab**

### Expected Results:
- Payment amounts should update (if you have triggers for this)
- OR nothing happens (if you want deal value changes to be manual)

**Question for you:** Should changing the deal value automatically update payment amounts? Or do you want that to be manual?

---

## Success Criteria

All 7 core tests (1-7) must pass:
- [✅] Test 1: Add first broker → splits created
- [✅] Test 2: Add second broker → splits created
- [✅] Test 3: Edit broker % → splits updated
- [✅] Test 4: Remove broker → splits deleted
- [✅] Test 5: Payment override works
- [✅] Test 6: Edit broker after override works
- [✅] Test 7: Add broker to overridden payment works

If ALL pass → **System is working perfectly!**

If ANY fail → **Tell me which test failed and what you saw**

---

## Quick Rollback Plan (Just in Case)

If something goes wrong, we can quickly rollback:

```sql
-- Drop the 3 new commission_split triggers
DROP TRIGGER IF EXISTS create_payment_splits_for_new_broker_trigger ON commission_split;
DROP TRIGGER IF EXISTS update_payment_splits_for_broker_trigger ON commission_split;
DROP TRIGGER IF EXISTS delete_payment_splits_for_broker_trigger ON commission_split;

-- The 2 payment triggers from Oct 23 stay untouched
-- Your overrides will still work
```

---

## Ready to Apply?

Once you've reviewed this test plan and you're comfortable with it, I'll help you apply the migration to production.

**Next step:** Apply the migration via Supabase SQL Editor, then run through these tests.
