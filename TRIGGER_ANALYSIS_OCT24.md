# Trigger Analysis - Payment Override vs Auto-Creation Conflict

## What Happened Yesterday (Oct 23)

### The Core Problem
Payment overrides weren't working because there was a **trigger on payment_split table** that kept recalculating splits from commission_split templates, overwriting the values set by the payment table trigger.

### The Solution
1. **Dropped ALL triggers on payment_split table** (migration: `20251023_drop_payment_split_triggers.sql`)
2. Created two triggers on **payment table only**:
   - `calculate_payment_agci_trigger` (BEFORE INSERT/UPDATE) - Calculates AGCI
   - `update_broker_splits_trigger` (AFTER INSERT/UPDATE) - Updates existing payment_split records

### Critical Decision from Yesterday
**NO triggers on payment_split table** - Everything is managed from payment table triggers

## Current State (What EXISTS in production from Oct 23)

### On `payment` table:
1. ✅ `calculate_payment_agci_trigger` (BEFORE INSERT OR UPDATE OF payment_amount, amount_override)
   - Function: `calculate_payment_agci()`
   - Calculates `payment.agci` and `payment.referral_fee_usd`

2. ✅ `update_broker_splits_trigger` (AFTER INSERT OR UPDATE OF agci, payment_amount, amount_override)
   - Function: `update_broker_splits_on_agci_change()`
   - **UPDATES existing payment_split records** (doesn't create new ones)

### On `payment_split` table:
- ❌ NO TRIGGERS (intentionally removed to prevent conflicts)

## The Problem Today

When payment is **INSERTED** (new deal creation):
1. ✅ `calculate_payment_agci_trigger` fires → calculates AGCI
2. ✅ Payment record is inserted with correct AGCI
3. ✅ `update_broker_splits_trigger` fires → tries to UPDATE payment_split records
4. ❌ **But payment_split records don't exist yet!**
5. ❌ UPDATE does nothing (0 rows affected)
6. ❌ User sees "No Broker Split"

## Trigger Execution Order Analysis

### Scenario 1: New Payment INSERT (Deal Creation)
```
User creates deal → Payments auto-generated
  ↓
INSERT INTO payment (payment_amount = 50000, deal_id = 'xyz')
  ↓
BEFORE trigger: calculate_payment_agci_trigger
  → Sets NEW.agci = calculated value
  ↓
Payment record inserted with agci = calculated value
  ↓
AFTER trigger: update_broker_splits_trigger
  → UPDATE payment_split WHERE payment_id = NEW.id
  → ❌ 0 rows updated (records don't exist yet!)
  ↓
❌ No payment_split records exist
```

### Scenario 2: Payment Override (UPDATE)
```
User overrides payment amount
  ↓
UPDATE payment SET payment_amount = 9812, amount_override = true WHERE id = 'abc'
  ↓
BEFORE trigger: calculate_payment_agci_trigger
  → Sets NEW.agci = new calculated value
  ↓
Payment record updated with new agci
  ↓
AFTER trigger: update_broker_splits_trigger
  → UPDATE payment_split WHERE payment_id = NEW.id
  → ✅ Rows updated successfully (records already exist)
  ↓
✅ Payment splits updated with new values
```

## The Missing Piece

We need a way to **CREATE** payment_split records on payment INSERT, but **UPDATE** them on payment UPDATE.

## Proposed Solutions

### Option A: Separate INSERT and UPDATE triggers on payment table
```sql
-- Trigger 1: BEFORE INSERT/UPDATE - Calculate AGCI (KEEP AS-IS)
CREATE TRIGGER calculate_payment_agci_trigger
    BEFORE INSERT OR UPDATE OF payment_amount, amount_override
    ON payment FOR EACH ROW
    EXECUTE FUNCTION calculate_payment_agci();

-- Trigger 2: AFTER INSERT ONLY - Create payment splits
CREATE TRIGGER create_broker_splits_trigger
    AFTER INSERT
    ON payment FOR EACH ROW
    EXECUTE FUNCTION auto_create_payment_splits_on_payment_insert();

-- Trigger 3: AFTER UPDATE ONLY - Update existing payment splits
CREATE TRIGGER update_broker_splits_trigger
    AFTER UPDATE OF agci, payment_amount, amount_override
    ON payment FOR EACH ROW
    EXECUTE FUNCTION update_broker_splits_on_agci_change();
```

**Pros:**
- Clear separation: INSERT creates, UPDATE updates
- No conflict with override functionality
- Each trigger has single responsibility

**Cons:**
- 3 triggers instead of 2
- Need to maintain two functions

### Option B: Single smart AFTER trigger that handles both
```sql
CREATE OR REPLACE FUNCTION handle_broker_splits()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if this is an INSERT or if payment_split records don't exist
    IF (TG_OP = 'INSERT') THEN
        -- Create new payment_split records
        INSERT INTO payment_split (...)
        SELECT ... FROM commission_split WHERE deal_id = NEW.deal_id;
    ELSE
        -- UPDATE existing payment_split records
        UPDATE payment_split SET ... WHERE payment_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_broker_splits_trigger
    AFTER INSERT OR UPDATE
    ON payment FOR EACH ROW
    EXECUTE FUNCTION handle_broker_splits();
```

**Pros:**
- Single trigger to maintain
- Handles both INSERT and UPDATE intelligently

**Cons:**
- More complex logic in one function
- Harder to debug if issues arise

### Option C: Keep current triggers + Add auto-creation on commission_split INSERT
Instead of creating payment_split when payment is inserted, create them when **commission_split** is inserted.

**This is what `automatic_payment_management.sql` was trying to do**

**Pros:**
- Payment splits exist before payments are even created
- No modification to payment triggers needed

**Cons:**
- More complex trigger chain (commission_split → payment → payment_split)
- Harder to understand flow

## The Critical Question

**Yesterday's work intentionally removed triggers to prevent conflicts. Which approach preserves that fix while solving the auto-creation problem?**

My recommendation: **Option A** - Separate INSERT and UPDATE triggers

Why:
1. Preserves yesterday's fix (no triggers on payment_split table)
2. Clear separation of concerns
3. INSERT trigger only creates, never updates (no conflict)
4. UPDATE trigger only updates existing records (yesterday's fix)
5. Both use the same calculation formulas
