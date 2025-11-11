# Missing Salesforce Creator Tracking on Property Table

**Date:** November 10, 2025
**Issue:** Properties imported from Salesforce don't show creator information

## Problem

When viewing properties in the application, the "Created by" and "Updated by" information is not displayed, showing only timestamps.

### Root Cause

The `property` table is missing the Salesforce creator tracking columns (`created_by_sf_id`, `updated_by_sf_id`) that exist in other tables like `property_unit`.

When properties were imported from Salesforce:
- Salesforce `CreatedById` field was NOT preserved
- Salesforce `LastModifiedById` field was NOT preserved
- Only `created_at` and `updated_at` timestamps were imported

## Comparison with Other Tables

Tables that HAVE Salesforce creator tracking:
- ✅ `property_unit` - has `created_by_sf_id` and `updated_by_sf_id`
- ✅ `site_submit` - has `created_by_sf_id` and `updated_by_sf_id`
- ✅ `activity` - has `sf_created_by_id` and `sf_updated_by`

Tables that are MISSING Salesforce creator tracking:
- ❌ `property` - missing these columns

## Impact

For properties imported from Salesforce:
- "Created: [timestamp]" displays but no user name
- "Updated: [timestamp]" displays but no user name
- Cannot see who originally created the property in Salesforce
- Cannot see who last modified the property in Salesforce

For NEW properties created in the application:
- ✅ "Created by" will work (uses `created_by_id` with new creator tracking system)
- ✅ "Updated by" will work (uses `updated_by_id` with trigger functions)

## Solution

### Part 1: Add Missing Columns to Property Table

**Migration:** `migrations/20251110_add_salesforce_creator_tracking_to_property.sql`

This migration adds:
- `created_by_sf_id VARCHAR(18)` - Salesforce CreatedById
- `updated_by_sf_id VARCHAR(18)` - Salesforce LastModifiedById
- Indexes for performance

### Part 2: Update UI to Display Salesforce Creator Info

**Updated Components:**
- `src/components/RecordMetadata.tsx` - Now accepts `createdBySfId` and `updatedBySfId` props
- `src/components/property/PropertyDetailsSection.tsx` - Passes Salesforce IDs to RecordMetadata

**Display Logic:**
1. If `created_by_id` exists → show user name via `UserByIdDisplay`
2. Else if `created_by_sf_id` exists → show "by SF User (ID)"
3. Else → show only timestamp

### Part 3: Populate Historical Data (Optional)

If you have access to the original Salesforce data, you can populate these fields:

```sql
-- Example: Update from Salesforce export table
UPDATE property p
SET
  created_by_sf_id = sf."CreatedById",
  updated_by_sf_id = sf."LastModifiedById"
FROM salesforce_property_export sf
WHERE p.sf_id = sf."Id"
  AND sf."CreatedById" IS NOT NULL;
```

**Note:** This is optional and only needed if you want to show historical creator information for Salesforce-imported properties.

## Timeline

### Legacy Properties (Imported from Salesforce)
Before fix:
- ❌ No creator information displayed
- Only timestamp shown

After Part 1 & 2:
- ⚠️ Still no creator info (columns exist but are NULL)
- Still only timestamp shown

After Part 3 (if Salesforce data available):
- ✅ Shows "by SF User (ID)"
- Can potentially map SF User ID to actual user names

### New Properties (Created in Application)
Before creator tracking system:
- ❌ No creator information
- Only timestamp

After creator tracking system (current):
- ✅ Shows "by [User Name]"
- Full creator tracking works

## Future Improvements

### Option 1: Map Salesforce User IDs to Application Users

Create a mapping table:
```sql
CREATE TABLE salesforce_user_mapping (
  sf_user_id VARCHAR(18) PRIMARY KEY,
  user_id UUID REFERENCES "user"(id),
  sf_user_name VARCHAR(255),
  sf_user_email VARCHAR(255)
);
```

Then update `UserByIdDisplay` component to also look up Salesforce user IDs.

### Option 2: Import Salesforce User Data

Import Salesforce users into the `user` table with their SF IDs:
```sql
-- Add sf_id column to user table if not exists
ALTER TABLE "user" ADD COLUMN sf_id VARCHAR(18);

-- Import Salesforce users
INSERT INTO "user" (sf_id, name, email, ...)
SELECT "Id", "Name", "Email", ...
FROM salesforce_user_export;
```

Then convert `created_by_sf_id` to `created_by_id`:
```sql
UPDATE property p
SET created_by_id = u.auth_user_id
FROM "user" u
WHERE p.created_by_sf_id = u.sf_id
  AND p.created_by_id IS NULL;
```

## Deployment

### Step 1: Run Migration
```bash
# In Supabase SQL Editor:
# Copy contents of migrations/20251110_add_salesforce_creator_tracking_to_property.sql
# Paste and run
```

### Step 2: Deploy Code
```bash
git pull origin main
# Build and deploy application
```

### Step 3: (Optional) Populate Historical Data
```sql
-- If you have Salesforce export data available
-- Run the UPDATE query from Part 3 above
```

## Verification

### Check Columns Were Added
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'property'
  AND column_name IN ('created_by_sf_id', 'updated_by_sf_id');
```

Expected: 2 rows returned

### Check Current Property Creator Info
```sql
SELECT
  id,
  property_name,
  created_at,
  created_by_id,
  created_by_sf_id,
  updated_at,
  updated_by_id,
  updated_by_sf_id
FROM property
LIMIT 10;
```

Expected:
- `created_by_id` and `updated_by_id` will be NULL for old properties
- `created_by_sf_id` and `updated_by_sf_id` will be NULL until populated
- New properties will have `created_by_id` and `updated_by_id` populated

## Related Documentation

- [BUGFIX_2025_11_10_FOREIGN_KEY_MISMATCH.md](./BUGFIX_2025_11_10_FOREIGN_KEY_MISMATCH.md) - Creator tracking FK fix
- [BUGFIX_2025_11_10_COMPLETE_TIMELINE.md](./BUGFIX_2025_11_10_COMPLETE_TIMELINE.md) - Full timeline
- [SALESFORCE_MAPPING_REFERENCE.md](../SALESFORCE_MAPPING_REFERENCE.md) - SF field mappings

## Status

- ✅ Identified missing columns
- ✅ Created migration to add columns
- ✅ Updated UI components to display SF creator info
- ⏳ Migration pending deployment
- ⏳ Optional: Populate historical data from SF export
