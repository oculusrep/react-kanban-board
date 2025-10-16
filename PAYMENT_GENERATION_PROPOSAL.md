# Payment Generation Architecture Proposal

## Current Problem

The payment system requires manual user actions that create opportunities for inconsistency:
1. User creates commission splits
2. User must remember to click "Generate Payments"
3. User adds/removes brokers from commission splits
4. User must remember to click "Regenerate Payment Splits"

**Issue**: Steps 2 and 4 are error-prone and create "out of sync" states.

## Proposed Solution: Automatic Payment Generation

### Core Principle
**Payments and payment splits should automatically reflect the current state of commission splits.**

### Implementation Strategy

#### Option A: Database Triggers (Recommended for Production)
```sql
-- Trigger: Auto-create payments when deal is ready
CREATE OR REPLACE FUNCTION auto_generate_payments_for_deal()
RETURNS TRIGGER AS $$
BEGIN
    -- Only generate if all required fields are set
    IF NEW.fee IS NOT NULL
       AND NEW.number_of_payments IS NOT NULL
       AND NEW.number_of_payments > 0 THEN

        -- Check if payments already exist
        IF NOT EXISTS (SELECT 1 FROM payment WHERE deal_id = NEW.id) THEN
            -- Generate payment records
            FOR i IN 1..NEW.number_of_payments LOOP
                INSERT INTO payment (deal_id, payment_sequence, payment_amount)
                VALUES (NEW.id, i, NEW.fee / NEW.number_of_payments);
            END LOOP;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_generate_payments
    AFTER INSERT OR UPDATE OF fee, number_of_payments ON deal
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_payments_for_deal();
```

```sql
-- Trigger: Auto-sync payment splits when commission splits change
CREATE OR REPLACE FUNCTION auto_sync_payment_splits()
RETURNS TRIGGER AS $$
DECLARE
    payment_rec RECORD;
    deal_rec RECORD;
BEGIN
    -- Get deal information
    SELECT * INTO deal_rec FROM deal WHERE id = COALESCE(NEW.deal_id, OLD.deal_id);

    -- For each payment in this deal
    FOR payment_rec IN
        SELECT * FROM payment WHERE deal_id = deal_rec.id
    LOOP
        -- Delete old splits for this payment
        DELETE FROM payment_split WHERE payment_id = payment_rec.id;

        -- Recreate splits from current commission_split state
        INSERT INTO payment_split (
            payment_id,
            broker_id,
            commission_split_id,
            split_origination_percent,
            split_site_percent,
            split_deal_percent,
            split_origination_usd,
            split_site_usd,
            split_deal_usd,
            split_broker_total,
            paid
        )
        SELECT
            payment_rec.id,
            cs.broker_id,
            cs.id,
            cs.split_origination_percent,
            cs.split_site_percent,
            cs.split_deal_percent,
            -- Calculate USD amounts
            (COALESCE(cs.split_origination_percent, 0) / 100.0) *
                ((COALESCE(deal_rec.origination_percent, 0) / 100.0) *
                 (payment_rec.payment_amount -
                  (COALESCE(deal_rec.referral_fee_usd, 0) / deal_rec.number_of_payments) -
                  (COALESCE(deal_rec.house_usd, 0) / deal_rec.number_of_payments))),
            (COALESCE(cs.split_site_percent, 0) / 100.0) *
                ((COALESCE(deal_rec.site_percent, 0) / 100.0) *
                 (payment_rec.payment_amount -
                  (COALESCE(deal_rec.referral_fee_usd, 0) / deal_rec.number_of_payments) -
                  (COALESCE(deal_rec.house_usd, 0) / deal_rec.number_of_payments))),
            (COALESCE(cs.split_deal_percent, 0) / 100.0) *
                ((COALESCE(deal_rec.deal_percent, 0) / 100.0) *
                 (payment_rec.payment_amount -
                  (COALESCE(deal_rec.referral_fee_usd, 0) / deal_rec.number_of_payments) -
                  (COALESCE(deal_rec.house_usd, 0) / deal_rec.number_of_payments))),
            -- Total = sum of all three
            ((COALESCE(cs.split_origination_percent, 0) / 100.0) *
                ((COALESCE(deal_rec.origination_percent, 0) / 100.0) *
                 (payment_rec.payment_amount -
                  (COALESCE(deal_rec.referral_fee_usd, 0) / deal_rec.number_of_payments) -
                  (COALESCE(deal_rec.house_usd, 0) / deal_rec.number_of_payments)))) +
            ((COALESCE(cs.split_site_percent, 0) / 100.0) *
                ((COALESCE(deal_rec.site_percent, 0) / 100.0) *
                 (payment_rec.payment_amount -
                  (COALESCE(deal_rec.referral_fee_usd, 0) / deal_rec.number_of_payments) -
                  (COALESCE(deal_rec.house_usd, 0) / deal_rec.number_of_payments)))) +
            ((COALESCE(cs.split_deal_percent, 0) / 100.0) *
                ((COALESCE(deal_rec.deal_percent, 0) / 100.0) *
                 (payment_rec.payment_amount -
                  (COALESCE(deal_rec.referral_fee_usd, 0) / deal_rec.number_of_payments) -
                  (COALESCE(deal_rec.house_usd, 0) / deal_rec.number_of_payments)))),
            false
        FROM commission_split cs
        WHERE cs.deal_id = deal_rec.id;
    END LOOP;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_sync_payment_splits_insert
    AFTER INSERT ON commission_split
    FOR EACH ROW
    EXECUTE FUNCTION auto_sync_payment_splits();

CREATE TRIGGER trg_auto_sync_payment_splits_update
    AFTER UPDATE ON commission_split
    FOR EACH ROW
    WHEN (
        OLD.split_origination_percent IS DISTINCT FROM NEW.split_origination_percent OR
        OLD.split_site_percent IS DISTINCT FROM NEW.split_site_percent OR
        OLD.split_deal_percent IS DISTINCT FROM NEW.split_deal_percent OR
        OLD.broker_id IS DISTINCT FROM NEW.broker_id
    )
    EXECUTE FUNCTION auto_sync_payment_splits();

CREATE TRIGGER trg_auto_sync_payment_splits_delete
    AFTER DELETE ON commission_split
    FOR EACH ROW
    EXECUTE FUNCTION auto_sync_payment_splits();
```

**Pros:**
- ✅ Always consistent
- ✅ No user action required
- ✅ Handles all edge cases (insert, update, delete)
- ✅ Database-level guarantee

**Cons:**
- ⚠️ Complexity in trigger logic
- ⚠️ Harder to debug
- ⚠️ Performance impact on writes (mitigated by indexes)

---

#### Option B: Application-Level Auto-Sync (Simpler, Recommended for MVP)

**Remove the manual buttons entirely.** Instead:

1. **When commission split is created/updated/deleted:**
   ```typescript
   // In CommissionTab.tsx or wherever commission splits are managed
   const handleSaveCommissionSplit = async (splitData) => {
     // Save the commission split
     await supabase.from('commission_split').insert(splitData);

     // Automatically regenerate payment splits
     await autoSyncPaymentSplits(deal.id);
   };
   ```

2. **Create a utility function:**
   ```typescript
   // utils/paymentSync.ts
   export async function autoSyncPaymentSplits(dealId: string) {
     // Check if payments exist
     const { data: payments } = await supabase
       .from('payment')
       .select('*')
       .eq('deal_id', dealId);

     if (!payments || payments.length === 0) {
       // No payments yet - create them first
       await generatePaymentsForDeal(dealId);
       return;
     }

     // Get commission splits
     const { data: commissionSplits } = await supabase
       .from('commission_split')
       .select('*')
       .eq('deal_id', dealId);

     // Delete old payment splits
     const paymentIds = payments.map(p => p.id);
     await supabase
       .from('payment_split')
       .delete()
       .in('payment_id', paymentIds);

     // Recreate payment splits (use the logic we just fixed)
     // ... calculation logic here ...

     await supabase
       .from('payment_split')
       .insert(newPaymentSplits);
   }
   ```

3. **Call it everywhere commission splits change:**
   - After adding a broker to commission splits
   - After updating a broker's percentages
   - After removing a broker
   - After updating deal-level percentages

**Pros:**
- ✅ Simpler to implement (code we just wrote)
- ✅ Easier to debug (console logs visible)
- ✅ More transparent to developers
- ✅ Can add loading states and toast notifications

**Cons:**
- ⚠️ Requires calling from multiple places
- ⚠️ Could miss an edge case
- ⚠️ Not atomic (race conditions possible)

---

### UI Changes

#### Current UI (Manual):
```
Commission Tab:
  [Commission Splits Table]

Payment Tab:
  [ Generate Payments ] ← User must click
  [ Regenerate Payment Splits ] ← Only shows when out of sync
```

#### Proposed UI (Automatic):
```
Commission Tab:
  [Commission Splits Table]
  💡 "Payments will auto-update when you save changes"

Payment Tab:
  [Payments auto-generated, always in sync]
  ℹ️ "Payments automatically reflect commission splits"

  [ Advanced: Manual Override ] ← For special cases only
```

---

### Migration Path

1. **Phase 1: Keep both systems** (safest)
   - Keep current manual buttons
   - Add automatic sync as an **opt-in feature** (checkbox in settings)
   - Monitor for issues

2. **Phase 2: Default to automatic**
   - Automatic sync becomes default
   - Manual buttons available as "Advanced" fallback

3. **Phase 3: Remove manual buttons**
   - Once confident, remove manual UI entirely
   - System is always automatically in sync

---

### Edge Cases to Handle

1. **Payments with invoices sent**
   - Should payment splits be locked once invoice is sent?
   - Add `payment.invoice_sent` flag?
   - Show warning: "Cannot auto-update: invoices already sent"

2. **Partially paid payments**
   - If `payment_split.paid = true` for some brokers, should we preserve that?
   - Perhaps: Keep `paid` status, only update amounts for unpaid splits

3. **Manual adjustments**
   - Some deals might need custom split amounts
   - Add `payment_split.manual_override` flag?
   - If true, skip auto-sync for that split

---

## Recommendation

**Start with Option B (Application-Level) for these reasons:**

1. **Faster to implement** - Code is already written
2. **Easier to iterate** - Can add safeguards as you discover edge cases
3. **More transparent** - Users see loading states and success messages
4. **Reversible** - Can always go back to manual if needed

**Then migrate to Option A (Triggers) once proven** - for production robustness.

---

## Questions for You

1. **Are there cases where payment splits should NOT auto-sync?**
   - Example: Invoice already sent, broker already paid

2. **Should we allow manual overrides?**
   - Example: Special deal where broker gets flat $5000 regardless of percentages

3. **What happens if payments are partially disbursed?**
   - Should we preserve the `paid: true` status when regenerating?

4. **Timeline preference?**
   - Quick MVP (keep manual buttons, add auto-sync behind them)
   - Full rewrite (remove buttons, automatic everywhere)

---

*Let me know your thoughts and I can implement whichever approach you prefer!*
