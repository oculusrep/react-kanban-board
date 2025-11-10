# Fix for UPDATE Operations Failing with 409 Errors

**Date:** November 10, 2025
**Issue:** Users can INSERT and DELETE but UPDATE operations fail with 409

## The Problem

After fixing the foreign key constraints to point to `user.auth_user_id`, UPDATE operations started failing with 409 errors.

### Root Cause

The `update_audit_fields()` trigger function was still using the OLD logic:

```sql
-- OLD (WRONG) - Trigger was doing this:
SELECT id INTO current_user_id
FROM "user"
WHERE auth_user_id = auth.uid();
NEW.updated_by_id = current_user_id;  -- Sets to user.id
```

But the foreign key constraint now expects:
```sql
FOREIGN KEY (updated_by_id) REFERENCES "user"(auth_user_id)
```

So the trigger was setting `updated_by_id = user.id` but the FK constraint wanted `user.auth_user_id`!

### Why This Happened

1. The original migration [20251110_COMPLETE_FIX_creator_tracking.sql](./20251110_COMPLETE_FIX_creator_tracking.sql) fixed the FK constraints
2. But we forgot to update the trigger functions that run on INSERT/UPDATE
3. The triggers were still setting `created_by_id` and `updated_by_id` to `user.id` instead of `auth.uid()`

## The Solution

Run this migration: **`20251110_FIX_update_triggers_to_use_auth_user_id.sql`**

This updates both trigger functions:

```sql
-- NEW (CORRECT) - Sets directly to auth.uid()
CREATE OR REPLACE FUNCTION update_audit_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();

  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by_id = auth.uid();  -- Now sets to auth_user_id directly!
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## How to Apply

1. **Run in Supabase SQL Editor:**
   ```
   Copy migrations/20251110_FIX_update_triggers_to_use_auth_user_id.sql
   Paste into Supabase Dashboard → SQL Editor
   Click "Run"
   ```

2. **Test the fix:**
   - Have Arty try to update a property unit name
   - Should now succeed without 409 error

## What This Fixes

- ✅ INSERT operations with triggers (created_by_id)
- ✅ UPDATE operations with triggers (updated_by_id)
- ✅ All 18 tables that use these trigger functions

## Affected Tables

The `update_audit_fields()` trigger is used on these tables:
- property
- property_unit ← This is what Arty was trying to update
- site_submit
- deal
- client
- contact
- payment
- assignment
- property_contact
- critical_date
- commission_split
- payment_split
- deal_contact
- contact_client_relation
- note
- activity
- contact_client_role (conditional)
- contact_deal_role (conditional)

## Timeline

1. **Initial issue:** Foreign key mismatch - FK pointed to `user.id`, defaults used `auth.uid()`
2. **First fix:** [20251110_COMPLETE_FIX_creator_tracking.sql](./20251110_COMPLETE_FIX_creator_tracking.sql) - Fixed FK constraints
3. **Remaining issue:** Triggers still using old logic
4. **Final fix:** [20251110_FIX_update_triggers_to_use_auth_user_id.sql](./20251110_FIX_update_triggers_to_use_auth_user_id.sql) - Updated triggers

## Verification

After running the migration, this should work:

```sql
-- Test update on property_unit (should succeed)
UPDATE property_unit
SET property_unit_name = 'Test Update'
WHERE id = '<some-unit-id>';

-- Verify the updated_by_id is correct
SELECT
  pu.id,
  pu.property_unit_name,
  pu.updated_by_id,
  u.name as updater_name
FROM property_unit pu
LEFT JOIN "user" u ON pu.updated_by_id = u.auth_user_id
WHERE pu.id = '<some-unit-id>';
```

Should show the updater's name (proving the FK constraint is satisfied).
