# Property Delete Enhancements

## Summary
Enhanced the property deletion flow to prevent errors and provide clear warnings about related records before deletion.

## Changes Made

### 1. Database Migration - CASCADE DELETE Constraints
**File:** [supabase/migrations/20251103220000_add_property_cascade_deletes.sql](supabase/migrations/20251103220000_add_property_cascade_deletes.sql)

Added CASCADE DELETE and SET NULL constraints to property-related foreign keys:

**CASCADE DELETE (auto-delete when property is deleted):**
- `property_contact.property_id` → Deletes property contact links
- `property_unit.property_id` → Deletes property units
- `activity.property_id` → Deletes related activities
- `note_object_link.property_id` → Deletes related note links

**SET NULL (keep record, remove property reference):**
- `site_submit.property_id` → Sets property_id to NULL (site submits exist independently)

**Status:** Migration file created, needs to be applied to production.

### 2. Property Details Page Delete Flow
**File:** [src/pages/PropertyDetailsPage.tsx](src/pages/PropertyDetailsPage.tsx)

Enhanced `handleDelete` function to:
1. Check for related deals and show warning with deal names
2. Check for related site submits and show warning with site submit info
3. Require confirmation for each type of relationship
4. Show final confirmation dialog explaining what will be deleted
5. Execute the deletion only after all confirmations

**Delete Flow:**
```
User clicks Delete
    ↓
Check for related deals
    ↓ (if found)
Show warning: "This property is attached to X deal(s): [names]"
    ↓ (user confirms)
Check for related site submits
    ↓ (if found)
Show warning: "This property is attached to X site submit(s): [info]"
    ↓ (user confirms)
Show final confirmation dialog
    ↓ (user confirms)
Delete property and CASCADE related records
```

### 3. Mapping Page Delete Flow
**File:** [src/pages/MappingPageNew.tsx](src/pages/MappingPageNew.tsx)

Applied the same enhanced delete logic to the property context menu delete function.

Both the property details page and mapping page now have consistent delete behavior with warnings.

### 4. Updated Confirmation Messages

**Before:**
- "Are you sure you want to delete this property? This action cannot be undone."

**After:**
- "Are you sure you want to permanently delete this property? This will also delete all associated property contacts, property units, activities, and notes. This action cannot be undone."

## How to Apply

### Step 1: Apply the Database Migration

See [APPLY_PROPERTY_CASCADE_DELETES.md](APPLY_PROPERTY_CASCADE_DELETES.md) for detailed instructions.

**Quick Steps:**
1. Go to Supabase SQL Editor: https://supabase.com/dashboard/project/rqbvcvwbziilnycqtmnc/sql/new
2. Copy the contents of `supabase/migrations/20251103220000_add_property_cascade_deletes.sql`
3. Paste and run in the SQL Editor
4. Verify with the verification query in the migration file

### Step 2: Deploy Application Changes

The application changes are already in the code. Just build and deploy:

```bash
npm run build
# Deploy to production
```

## Testing Checklist

- [ ] Apply CASCADE DELETE migration to production
- [ ] Verify foreign key constraints are set correctly
- [ ] Test deleting a property with no related records
- [ ] Test deleting a property with related deals (should show warning)
- [ ] Test deleting a property with related site submits (should show warning)
- [ ] Test deleting a property with both deals and site submits
- [ ] Verify that related records are handled correctly:
  - Property contacts are deleted
  - Property units are deleted
  - Activities are deleted
  - Notes are deleted
  - Site submits keep property_id set to NULL
  - Deals keep property_id set to NULL (based on migration)
- [ ] Test deletion from Property Details Page
- [ ] Test deletion from Mapping Page context menu

## Error Resolution

The original error was a **409 Conflict** from Supabase when trying to delete a property:

```
rqbvcvwbziilnycqtmnc.supabase.co/rest/v1/property?id=eq.9c157061-d619-432d-9976-fcc5702d5391:1
Failed to load resource: the server responded with a status of 409 ()
```

**Root Cause:** Foreign key constraints without CASCADE DELETE rules prevented deletion of properties that had related records.

**Solution:** Added CASCADE DELETE constraints via migration + enhanced UI with warnings.

## Benefits

1. **No More 409 Errors:** Properties can now be deleted even with related records
2. **User Awareness:** Users see exactly which deals/site submits are affected before deletion
3. **Data Integrity:** CASCADE deletes ensure no orphaned records
4. **Consistent Behavior:** Same delete flow in both Property Details and Mapping pages
5. **Clear Messaging:** Users know exactly what will happen when they delete a property
