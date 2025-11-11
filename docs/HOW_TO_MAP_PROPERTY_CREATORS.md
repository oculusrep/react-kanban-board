# How to Map Property Creators from Salesforce

**Date:** November 10, 2025
**Issue:** Properties show timestamps but no creator names

## Background

When properties were imported from Salesforce, the `CreatedById` and `LastModifiedById` fields were not mapped to the `created_by_id` and `updated_by_id` columns in the property table. This migration fixes that.

## Prerequisites

Before running this migration, you need:

1. ✅ The `salesforce_Property__c` table (Salesforce property export)
2. ✅ Users from Salesforce imported into the `user` table
3. ✅ A way to link Salesforce users to OVIS users (e.g., `user.sf_id` column)

## Check If User Table Has SF Mapping

Run this query to check if users have Salesforce IDs:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user'
  AND column_name IN ('sf_id', 'salesforce_id', 'sf_user_id');
```

**If you see a column:** Great! Users are already mapped. Proceed to "Option 1: Map via user.sf_id"

**If no columns found:** You'll need to use "Option 2: Map via email" or import Salesforce users first.

## Option 1: Map via user.sf_id (Recommended)

If the `user` table has an `sf_id` column linking to Salesforce User IDs:

### Run the Migration

```bash
# In Supabase SQL Editor:
# Copy contents of migrations/20251110_map_property_creators_from_salesforce.sql
# Paste and run
```

This will:
1. Map `created_by_id` from Salesforce `CreatedById` → `user.sf_id` → `user.auth_user_id`
2. Map `updated_by_id` from Salesforce `LastModifiedById` → `user.sf_id` → `user.auth_user_id`
3. Store unmappable SF IDs in `created_by_sf_id` and `updated_by_sf_id` for reference

### Expected Results

```sql
-- Properties with successfully mapped creators
SELECT COUNT(*) FROM property WHERE created_by_id IS NOT NULL;
-- Should show a large number

-- Properties that couldn't be mapped (creator not in user table)
SELECT COUNT(*) FROM property WHERE created_by_id IS NULL AND created_by_sf_id IS NOT NULL;
-- Should be small or zero

-- Sample of mapped properties
SELECT
  p.property_name,
  u.name as creator_name
FROM property p
JOIN "user" u ON p.created_by_id = u.auth_user_id
LIMIT 10;
-- Should show property names with creator names
```

## Option 2: Map via Email

If users don't have `sf_id` but you can match by email:

```sql
-- Update created_by_id by matching email
UPDATE property p
SET created_by_id = u.auth_user_id
FROM public."salesforce_Property__c" sf
JOIN public."salesforce_User" sfu ON sfu."Id" = sf."CreatedById"
JOIN "user" u ON LOWER(u.email) = LOWER(sfu."Email")
WHERE p.sf_id = sf."Id"
  AND p.created_by_id IS NULL
  AND sf."CreatedById" IS NOT NULL
  AND u.auth_user_id IS NOT NULL;

-- Update updated_by_id by matching email
UPDATE property p
SET updated_by_id = u.auth_user_id
FROM public."salesforce_Property__c" sf
JOIN public."salesforce_User" sfu ON sfu."Id" = sf."LastModifiedById"
JOIN "user" u ON LOWER(u.email) = LOWER(sfu."Email")
WHERE p.sf_id = sf."Id"
  AND p.updated_by_id IS NULL
  AND sf."LastModifiedById" IS NOT NULL
  AND u.auth_user_id IS NOT NULL;
```

## Option 3: Import Salesforce Users First

If you haven't imported Salesforce users yet, you need to:

### Step 1: Add sf_id column to user table

```sql
ALTER TABLE "user" ADD COLUMN sf_id VARCHAR(18);
CREATE INDEX idx_user_sf_id ON "user"(sf_id);
```

### Step 2: Import Salesforce users

```sql
INSERT INTO "user" (sf_id, name, email, ...)
SELECT
  "Id",
  "Name",
  "Email",
  ...
FROM public."salesforce_User"
WHERE "IsActive" = true
  AND "Email" IS NOT NULL
ON CONFLICT (email) DO UPDATE
SET sf_id = EXCLUDED.sf_id;
```

### Step 3: Run the creator mapping migration

Now you can run the migration from Option 1.

## Verification

After running the migration, verify it worked:

### 1. Check Mapping Stats

```sql
SELECT
  COUNT(*) FILTER (WHERE created_by_id IS NOT NULL) as mapped_creators,
  COUNT(*) FILTER (WHERE created_by_id IS NULL AND created_by_sf_id IS NOT NULL) as unmapped_with_sf_id,
  COUNT(*) FILTER (WHERE created_by_id IS NULL AND created_by_sf_id IS NULL) as no_creator_info,
  COUNT(*) as total_properties
FROM property;
```

### 2. Test in UI

1. Open any property in the application
2. Scroll to the "Record Metadata" section at the bottom
3. Should see:
   - **If mapped:** "Created: [timestamp] by [Name]"
   - **If unmapped:** "Created: [timestamp] by SF User (ID)"
   - **If no info:** "Created: [timestamp]"

### 3. Check Specific Properties

```sql
SELECT
  p.id,
  p.property_name,
  p.created_at,
  p.created_by_id,
  p.created_by_sf_id,
  u.name as creator_name,
  CASE
    WHEN p.created_by_id IS NOT NULL THEN 'Mapped to user'
    WHEN p.created_by_sf_id IS NOT NULL THEN 'Has SF ID but no user match'
    ELSE 'No creator info'
  END as status
FROM property p
LEFT JOIN "user" u ON p.created_by_id = u.auth_user_id
ORDER BY p.created_at DESC
LIMIT 20;
```

## Troubleshooting

### Issue: "Salesforce Property table does not exist"

**Cause:** The `salesforce_Property__c` table is missing.

**Solution:**
1. Export properties from Salesforce
2. Import into Supabase as `salesforce_Property__c` table
3. Re-run the migration

### Issue: "User table does not have sf_id column"

**Cause:** Users aren't linked to Salesforce User IDs.

**Solution:** Use Option 2 (map via email) or Option 3 (import SF users first)

### Issue: All properties show "by SF User (ID)" instead of names

**Cause:** The mapping worked but users don't have matching Salesforce IDs.

**Solution:**
1. Check if user table has the right linking column
2. Verify users were imported from Salesforce with proper IDs
3. Check the mapping query is using the correct column name

```sql
-- Find what linking columns exist
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'user'
  AND column_name LIKE '%sf%'
  OR column_name LIKE '%salesforce%';
```

### Issue: Some properties mapped, others didn't

**Cause:** Some Salesforce users are in the user table, others aren't.

**Solution:** Import missing Salesforce users or accept that some will show SF User ID.

```sql
-- Find which SF user IDs couldn't be mapped
SELECT DISTINCT
  p.created_by_sf_id,
  COUNT(*) as property_count
FROM property p
WHERE p.created_by_id IS NULL
  AND p.created_by_sf_id IS NOT NULL
GROUP BY p.created_by_sf_id
ORDER BY property_count DESC;

-- Check if these users exist in Salesforce export
SELECT
  "Id",
  "Name",
  "Email",
  "IsActive"
FROM public."salesforce_User"
WHERE "Id" IN (
  SELECT DISTINCT created_by_sf_id
  FROM property
  WHERE created_by_id IS NULL
    AND created_by_sf_id IS NOT NULL
);
```

## Next Steps

After successfully mapping property creators:

1. ✅ New properties created in the app will automatically have creator tracking
2. ✅ Updated properties will automatically have updater tracking (via triggers)
3. ✅ Historical Salesforce properties now show original creators
4. ✅ UI displays creator names or "SF User (ID)" as fallback

## Related Migrations

Run these in order:
1. `20251110_COMPLETE_FIX_creator_tracking.sql` - Fix foreign key constraints
2. `20251110_FIX_update_triggers_to_use_auth_user_id.sql` - Fix trigger functions
3. `20251110_add_salesforce_creator_tracking_to_property.sql` - Add SF columns
4. **`20251110_map_property_creators_from_salesforce.sql`** - Map creators ← YOU ARE HERE

## Related Documentation

- [BUGFIX_2025_11_10_COMPLETE_TIMELINE.md](./BUGFIX_2025_11_10_COMPLETE_TIMELINE.md) - Full fix timeline
- [SALESFORCE_CREATOR_TRACKING_MISSING.md](./SALESFORCE_CREATOR_TRACKING_MISSING.md) - Missing SF fields issue
- [SALESFORCE_MAPPING_REFERENCE.md](../SALESFORCE_MAPPING_REFERENCE.md) - SF field mappings
