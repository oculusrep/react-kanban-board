# SQL Files Cleanup Guide

## Troubleshooting Files (Safe to Delete)

These files were created during debugging sessions and are no longer needed. The solutions have been incorporated into the migration files.

### Payment Override Troubleshooting (October 23, 2024)
- ❌ `APPLY_THIS_SQL.sql` - Ad-hoc fixes, not needed
- ❌ `CHECK_CURRENT_TRIGGERS.sql` - Diagnostic query only
- ❌ `CHECK_GENERATED_COLUMNS.sql` - Diagnostic query only
- ❌ `CHECK_PAYMENT_SPLIT_TRIGGERS.sql` - Diagnostic query only
- ❌ `DEBUG_TRIGGER.sql` - Debug code, not needed in production
- ❌ `FIND_THE_CULPRIT.sql` - Diagnostic query only
- ❌ `FIX_AFTER_TRIGGER.sql` - Superseded by migration files
- ❌ `FIX_BROKER_SPLITS_TRIGGER.sql` - Superseded by migration files
- ❌ `FIX_PAYMENT_SPLIT_TRIGGER.sql` - Superseded by migration files
- ❌ `FORCE_FIX_SPLITS.sql` - Ad-hoc fix, not needed
- ❌ `SHOW_PAYMENT_SPLIT_TRIGGER.sql` - Diagnostic query only

### Payment Trigger Restoration (October 24, 2024)
- ❌ `FIX_MISSING_PAYMENT_SPLIT_TRIGGER.sql` - Verbose version, superseded by cleaner migration
- ✅ `RESTORE_ALL_PAYMENT_TRIGGERS.sql` - Keep for reference (has detailed comments)
- ✅ `TEST_REFERRAL_FEE_CALCULATION.sql` - Useful test script, keep

### Clean Slate Files
- ✅ `CLEAN_SLATE_PAYMENT_TRIGGERS.sql` - Good reference for trigger architecture, keep for documentation

## Files to Keep

### Reference Documentation
- ✅ `RESTORE_ALL_PAYMENT_TRIGGERS.sql` - Detailed version with comments
- ✅ `CLEAN_SLATE_PAYMENT_TRIGGERS.sql` - Shows trigger architecture
- ✅ `TEST_REFERRAL_FEE_CALCULATION.sql` - Useful for testing

## Migration Files (Already Applied)

These are in `supabase/migrations/` and are the authoritative source:
- ✅ `20251024000000_restore_payment_triggers.sql` - **FINAL CLEAN VERSION**
- ✅ `20251023_*.sql` - All applied migrations from payment override work

## Recommended Action

```bash
# Move to archive folder instead of deleting (just in case)
mkdir -p supabase/archive
mv supabase/APPLY_THIS_SQL.sql supabase/archive/
mv supabase/CHECK_CURRENT_TRIGGERS.sql supabase/archive/
mv supabase/CHECK_GENERATED_COLUMNS.sql supabase/archive/
mv supabase/CHECK_PAYMENT_SPLIT_TRIGGERS.sql supabase/archive/
mv supabase/DEBUG_TRIGGER.sql supabase/archive/
mv supabase/FIND_THE_CULPRIT.sql supabase/archive/
mv supabase/FIX_AFTER_TRIGGER.sql supabase/archive/
mv supabase/FIX_BROKER_SPLITS_TRIGGER.sql supabase/archive/
mv supabase/FIX_PAYMENT_SPLIT_TRIGGER.sql supabase/archive/
mv supabase/FORCE_FIX_SPLITS.sql supabase/archive/
mv supabase/SHOW_PAYMENT_SPLIT_TRIGGER.sql supabase/archive/
mv supabase/FIX_MISSING_PAYMENT_SPLIT_TRIGGER.sql supabase/archive/

# Keep these for reference
# - RESTORE_ALL_PAYMENT_TRIGGERS.sql (detailed comments)
# - CLEAN_SLATE_PAYMENT_TRIGGERS.sql (architecture reference)
# - TEST_REFERRAL_FEE_CALCULATION.sql (testing tool)
```

## What's in Production

The actual triggers in production come from:
1. `supabase/migrations/20251024000000_restore_payment_triggers.sql` - **The clean version we just created**

All the other files in the root `supabase/` folder were intermediate debugging steps.
