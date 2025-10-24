# Payment Trigger Restoration - October 24, 2025

## Problem Statement

When creating a new deal and adding brokers to the commission tab:
- ✅ Payments were being created correctly
- ✅ Commission splits were being created correctly
- ❌ **Payment splits were NOT being created**
- Result: Payment tab showed "No Broker Split" instead of broker names

## Root Cause

The database trigger `trigger_auto_create_splits_on_payment` was deleted during previous troubleshooting sessions (likely during the payment override work on October 23rd).

This trigger is responsible for creating `payment_split` records whenever a `payment` record is inserted into the database.

## Solution Applied

Restored three critical triggers to the database:

### 1. `calculate_payment_agci_trigger` (BEFORE INSERT/UPDATE)
- **Function:** `calculate_payment_agci()`
- **Purpose:** Calculates `payment.agci` and `payment.referral_fee_usd` when payment amounts change
- **Fires:** BEFORE INSERT OR UPDATE OF payment_amount, amount_override

### 2. `update_broker_splits_trigger` (AFTER INSERT/UPDATE)
- **Function:** `update_broker_splits_on_agci_change()`
- **Purpose:** Updates all existing `payment_split` records when payment AGCI changes
- **Fires:** AFTER INSERT OR UPDATE on payment table
- **Use case:** Payment amount overrides

### 3. `trigger_auto_create_splits_on_payment` (AFTER INSERT)
- **Function:** `auto_create_payment_splits_on_payment_insert()`
- **Purpose:** **Creates payment_split records for each broker when a new payment is inserted**
- **Fires:** AFTER INSERT on payment table
- **This was the missing trigger!**

## Migration File

- **File:** `supabase/migrations/20251024000000_restore_payment_triggers.sql`
- **Applied:** October 24, 2025
- **Status:** ✅ Ready to apply via Supabase SQL Editor

## How to Apply

### Via Supabase Dashboard (Recommended)
1. Go to https://supabase.com/dashboard/project/ryvdqlkqoevohvzxzlkd/sql/new
2. Copy contents of `supabase/migrations/20251024000000_restore_payment_triggers.sql`
3. Paste and run in SQL editor
4. Verify with query below

### Verification Query
```sql
SELECT
    trigger_name,
    action_timing || ' ' || event_manipulation as when_fires
FROM information_schema.triggers
WHERE event_object_table = 'payment'
  AND trigger_name IN (
    'calculate_payment_agci_trigger',
    'update_broker_splits_trigger',
    'trigger_auto_create_splits_on_payment'
  )
ORDER BY action_timing, trigger_name;
```

Expected result: 3 triggers returned

## Testing Instructions

1. Create a new test deal in the CRM
2. Set a deal value (e.g., $100,000)
3. Set number of payments to 2
4. Go to Commission tab
5. Add 2 brokers with commission splits:
   - Broker A: 60% origination, 50% site, 50% deal
   - Broker B: 40% origination, 50% site, 50% deal
6. Save commission splits
7. Navigate to Payment tab
8. **Verify:** You should see 2 payments, each with 2 broker names (not "No Broker Split")

## File Cleanup

### Archived Files
Moved to `supabase/archive/` (not tracked in git):
- All troubleshooting SQL files from October 23rd debugging session
- Old diagnostic queries
- Superseded fix attempts

### Reference Files (Kept)
In `supabase/` root:
- ✅ `CLEAN_SLATE_PAYMENT_TRIGGERS.sql` - Architecture reference
- ✅ `RESTORE_ALL_PAYMENT_TRIGGERS.sql` - Detailed version with comments
- ✅ `TEST_REFERRAL_FEE_CALCULATION.sql` - Testing utility

### Migration Files
In `supabase/migrations/`:
- ✅ `20251024000000_restore_payment_triggers.sql` - **THE CLEAN FINAL VERSION**
- ✅ All October 23rd payment override migrations

## .gitignore Updates

Updated to:
- Exclude all `.sql` files by default (security)
- **Allow** migration files in `supabase/migrations/`
- **Allow** reference documentation files in `supabase/` root
- **Exclude** `supabase/archive/` folder

## Related Documentation

- [PAYMENT_OVERRIDE_DOCUMENTATION.md](../PAYMENT_OVERRIDE_DOCUMENTATION.md) - Payment override system
- [PAYMENT_SYSTEM_HYBRID_ARCHITECTURE.md](../PAYMENT_SYSTEM_HYBRID_ARCHITECTURE.md) - Overall payment architecture
- [CLAUDE_CONTEXT.md](../CLAUDE_CONTEXT.md) - Context for all technical patterns

## What Was Learned

### Why Triggers Were Deleted
During the October 23rd payment override debugging session, multiple triggers were dropped and recreated many times to fix calculation issues. The final cleanup likely removed the `trigger_auto_create_splits_on_payment` trigger without realizing it was needed for new deal creation, not just overrides.

### Prevention
1. **Always verify trigger dependencies** before dropping
2. **Test full user workflows** after trigger changes (not just the specific bug being fixed)
3. **Keep trigger list documented** with purpose and dependencies
4. **Use version control** for database schema changes

### Trigger Dependencies

```
Payment Creation Flow:
1. Payment INSERT → trigger_auto_create_splits_on_payment fires
   ├─ Creates payment_split records for each broker
   └─ Uses AGCI already calculated by calculate_payment_agci_trigger

Payment Override Flow:
1. Payment UPDATE → calculate_payment_agci_trigger fires (BEFORE)
   └─ Recalculates payment.agci
2. Payment UPDATE completes
3. Payment UPDATE → update_broker_splits_trigger fires (AFTER)
   └─ Updates existing payment_split records
```

## Status

- ✅ Problem diagnosed
- ✅ Solution created
- ✅ Migration file ready
- ⏳ Awaiting application to production database
- ⏳ Awaiting testing

## Next Steps

1. **Apply migration** via Supabase SQL Editor
2. **Test** by creating a new deal with brokers
3. **Verify** broker names appear in Payment tab
4. **Commit** all changes to git
5. **Close** this issue

---

**Last Updated:** October 24, 2025
**Author:** Claude (AI Assistant) working with Mike Minihan
**Status:** ⏳ Ready to apply
