# Migration Guide: Fix User ID Linking with auth_user_id

## Problem Summary

Previously, the app had two separate user ID systems that were linked only by email:
- `auth.users.id` - Supabase authentication UUID
- `user.id` - Business user table UUID (different from auth ID!)

This caused issues:
- User records could get out of sync
- Email changes would break the link
- Cache issues could cause wrong IDs to be used
- Properties showed "no creator" because user IDs didn't exist in the user table

## Solution Overview

We're adding a new `auth_user_id` column to the `user` table that directly links to `auth.users.id`, while keeping all historical Salesforce data intact. Going forward, `created_by_id` and `updated_by_id` will use `auth.uid()` automatically.

## Migration Steps

### Step 1: Run Database Migrations

You need to run **TWO** migration scripts in the Supabase SQL Editor:

#### Migration 1: Add auth_user_id column
File: `migrations/add_auth_user_id_to_user_table.sql`

This migration:
- Adds `auth_user_id` column to the `user` table
- Creates foreign key to `auth.users.id`
- Links existing users by matching email addresses
- Creates an index for performance

**To run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy the contents of `migrations/add_auth_user_id_to_user_table.sql`
3. Paste and click "Run"
4. Verify the output shows how many users were linked

#### Migration 2: Update created_by_id defaults
File: `migrations/update_created_by_defaults_to_auth_uid.sql`

This migration:
- Sets default value of `created_by_id` to `auth.uid()` on all tables
- Sets default value of `updated_by_id` to `auth.uid()` on all tables
- Adds documentation comments

**To run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy the contents of `migrations/update_created_by_defaults_to_auth_uid.sql`
3. Paste and click "Run"
4. Verify the output shows the updated column defaults

### Step 2: Verify the Migration

Run this query to verify everything is linked correctly:

```sql
-- Check user linking
SELECT
  COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL) as linked_users,
  COUNT(*) FILTER (WHERE auth_user_id IS NULL) as unlinked_users,
  COUNT(*) as total_users
FROM "user";

-- Check your specific user
SELECT
  id as user_table_id,
  auth_user_id,
  name,
  email
FROM "user"
WHERE email = 'mike@oculusrep.com';  -- Replace with your email

-- Verify property creators now show names
SELECT
  p.created_by_id,
  COALESCE(u.name, u.first_name || ' ' || u.last_name, u.email, 'Unknown') as user_name,
  COUNT(*) as property_count
FROM property p
LEFT JOIN "user" u ON p.created_by_id = u.auth_user_id  -- Note: joining on auth_user_id now!
GROUP BY p.created_by_id, u.name, u.first_name, u.last_name, u.email
ORDER BY property_count DESC;
```

### Step 3: Clear Browser Cache

After running the migrations, users should:
1. Clear their browser's localStorage for your app
2. Log out and log back in
3. This ensures the AuthContext picks up the new auth_user_id linking

**Or programmatically:**
```javascript
// In browser console
localStorage.clear();
location.reload();
```

### Step 4: Test User Creation

Create a test property or site submit to verify that:
1. `created_by_id` is automatically set to your `auth.users.id`
2. `updated_by_id` is automatically set when you update
3. The metadata shows your name correctly

## Code Changes Summary

### What Changed:

1. **AuthContext.tsx** - Now queries user table by `auth_user_id` instead of email
2. **PinDetailsSlideout.tsx** - Removed manual passing of `userTableId`
3. **useProperty.ts** - Removed `currentUserId` parameter from `updateProperty`
4. **database-schema.ts** - Added `auth_user_id` field to user table type

### What Stayed the Same:

1. Historical `created_by_id` values remain unchanged
2. Salesforce sync data (`sf_id`, `sf_created_by_id`) untouched
3. All existing foreign keys still work
4. User table structure otherwise unchanged

## How It Works Now

### For New Records:

```typescript
// Before (manual user ID passing):
await updateProperty(updates, userTableId);

// After (automatic from database):
await updateProperty(updates);  // auth.uid() sets created_by_id automatically!
```

### Database Defaults:

```sql
-- Property table now has:
created_by_id UUID DEFAULT auth.uid()
updated_by_id UUID DEFAULT auth.uid()

-- When you INSERT a property, created_by_id is automatically set to the logged-in user's auth.users.id
-- When you UPDATE a property, updated_by_id is automatically set to the logged-in user's auth.users.id
```

### User Lookup:

```typescript
// Before (lookup by email):
const user = await supabase
  .from('user')
  .select('id, ovis_role')
  .eq('email', email)
  .single();

// After (lookup by auth user ID):
const user = await supabase
  .from('user')
  .select('id, ovis_role')
  .eq('auth_user_id', authUser.id)
  .single();
```

## Troubleshooting

### Issue: User still shows as null after migration

**Solution:**
1. Check if user exists in user table: `SELECT * FROM "user" WHERE email = 'your@email.com'`
2. Check if auth_user_id is set: `SELECT auth_user_id FROM "user" WHERE email = 'your@email.com'`
3. If auth_user_id is NULL, manually link it:
   ```sql
   UPDATE "user" u
   SET auth_user_id = au.id
   FROM auth.users au
   WHERE u.email = au.email
   AND u.email = 'your@email.com';
   ```

### Issue: Properties still showing "no creator"

**Solution:**
- Old properties have `created_by_id` set to the old `user.id` (not auth.users.id)
- To display names for these, update the query to also check user.id:
  ```sql
  SELECT p.*, u.name as creator_name
  FROM property p
  LEFT JOIN "user" u ON (p.created_by_id = u.auth_user_id OR p.created_by_id = u.id)
  ```

### Issue: New properties not getting created_by_id

**Solution:**
1. Verify migrations ran successfully
2. Check column defaults: `SELECT column_default FROM information_schema.columns WHERE table_name = 'property' AND column_name = 'created_by_id'`
3. Ensure user is authenticated when creating property (auth.uid() returns null for anonymous users)

## Rollback Plan

If something goes wrong, you can rollback:

```sql
-- Remove the auth_user_id column
ALTER TABLE "user" DROP COLUMN auth_user_id;

-- Remove the defaults (if needed)
ALTER TABLE property
ALTER COLUMN created_by_id DROP DEFAULT,
ALTER COLUMN updated_by_id DROP DEFAULT;

-- Restore code to previous commit
git revert HEAD
```

## Benefits of This Approach

✅ **Preserves all historical data** - No changes to existing records
✅ **Fixes sync issues** - Direct ID linking instead of email matching
✅ **Simpler code** - No manual user ID passing needed
✅ **Automatic tracking** - Database handles created_by_id/updated_by_id
✅ **Maintains Salesforce integration** - All SF fields remain intact
✅ **Better performance** - Index on auth_user_id for fast lookups

## Questions?

If you encounter any issues during the migration, check:
1. Migration script output for errors
2. Browser console for AuthContext errors
3. Database logs in Supabase Dashboard
4. Network tab for failed API requests
