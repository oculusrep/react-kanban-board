# How to Fix the Creator Tracking Foreign Key Issue

## The Problem

Users like Arty are getting **409 Conflict errors** when trying to create records (add contacts, create properties, etc.) even when they should have permission.

**Root Cause:** Foreign key mismatch
- Database defaults set `created_by_id = auth.uid()` (returns `auth.users.id`)
- But foreign keys reference `user.id` instead of `user.auth_user_id`
- For users where `auth.users.id ≠ user.id`, insertions fail with 409 errors

## The Solution

Run this migration: **`20251110_COMPLETE_FIX_creator_tracking.sql`**

### What It Does (in order):

1. ✅ **Adds unique constraint** on `user.auth_user_id` (required for foreign keys)
2. ✅ **Drops ALL existing FK constraints** (so we can modify the data)
3. ✅ **Cleans up existing data**:
   - Converts `user.id` references → `user.auth_user_id`
   - Sets orphaned IDs to NULL
4. ✅ **Recreates FK constraints** pointing to `user.auth_user_id`
5. ✅ **Verifies** the fix with a status report
6. ✅ **Cleans up** temporary functions

### Why Previous Attempts Failed:

1. **First attempt**: Missing unique constraint on `auth_user_id`
2. **Second attempt**: Tried to add FK constraints with dirty data
3. **Third attempt**: Tried to clean data while FK constraints were active

### This Version Works Because:

The order is correct:
1. Drop constraints FIRST
2. Clean data SECOND
3. Add constraints THIRD

## How to Run

```bash
# In Supabase SQL Editor:
1. Copy contents of: migrations/20251110_COMPLETE_FIX_creator_tracking.sql
2. Paste into SQL Editor
3. Click "Run"
4. Wait for completion (should take 10-30 seconds)
5. Check verification output - all should show ✓ CORRECT
```

## Expected Output

You should see:
- ✅ Notices: "Cleaned up creator IDs in table: [table_name]" for each table
- ✅ Final verification showing all foreign keys pointing to `auth_user_id`
- ✅ No errors

## After Running

1. **Test with Arty's account**: Have him try adding a contact to a property
2. **Should succeed** without 409 errors
3. **New records** will automatically have correct `created_by_id` values

## Verification Query

After migration, run this to verify:

```sql
-- Check that new insertions work
SELECT
  pc.id,
  pc.created_by_id,
  u.name as creator_name,
  u.email as creator_email
FROM property_contact pc
LEFT JOIN "user" u ON pc.created_by_id = u.auth_user_id
WHERE pc.created_at > NOW() - INTERVAL '1 hour'
ORDER BY pc.created_at DESC;

-- Should show creator names for all new records
```

## Rollback (if needed)

If something goes wrong:

```sql
-- This won't fully rollback, but will remove the new constraints
-- Run each DROP CONSTRAINT for the tables you want to revert
ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS fk_property_contact_created_by_id;
ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS fk_property_contact_updated_by_id;
-- ... repeat for other tables
```

## Files in This Directory

- ✅ **`20251110_COMPLETE_FIX_creator_tracking.sql`** ← USE THIS ONE
- ❌ `20251110_fix_all_created_updated_by_fkeys.sql` ← Don't use (missing data cleanup)
- ❌ `20251110_cleanup_orphaned_creator_ids.sql` ← Don't use (partial solution)
- ❌ `20251110_fix_property_contact_fk_to_auth_user_id.sql` ← Don't use (single table only)

## Documentation

See: `docs/BUGFIX_2025_11_10_FOREIGN_KEY_MISMATCH.md` for full details
