# Property Creator/Updater Tracking Fix - November 10, 2025

## Problem
Property creation was failing with error: `"Could not find the '0' column of 'property' in the schema cache"` (HTTP 400). Additionally, creator/updater metadata was not displaying on property detail pages.

## Root Causes

### 1. Array Wrapper in prepareInsert
**Issue:** The `prepareInsert` function was being called with an array instead of a single object.

**Location:** `src/hooks/useProperty.ts:133`

**Code:**
```typescript
// BEFORE (BROKEN)
.insert(prepareInsert([{
  ...propertyData,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}]))

// AFTER (FIXED)
.insert(prepareInsert({
  ...propertyData,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}))
```

**Why it failed:**
1. `prepareInsert` expected a single object but received an array `[{...}]`
2. When iterating over the "object", it actually iterated over array indices: `0`, `1`, etc.
3. PostgreSQL tried to find a column named `'0'` in the property table
4. Error: `"Could not find the '0' column of 'property' in the schema cache"`

### 2. Missing RecordMetadata Component
**Issue:** Properties had no UI to display creator/updater information, despite the database fields and triggers being in place.

**Files affected:**
- `src/components/property/PropertyDetailsSection.tsx` - Lacked RecordMetadata integration

## Solution

### Fix 1: Remove Array Wrapper from prepareInsert
**File:** `src/hooks/useProperty.ts`

Changed line 133 from:
```typescript
.insert(prepareInsert([{...}]))
```

To:
```typescript
.insert(prepareInsert({...}))
```

**Impact:** Properties can now be created successfully without the PostgreSQL column error.

### Fix 2: Enhanced prepareInsert to Support Both Objects and Arrays
**File:** `src/lib/supabaseHelpers.ts`

Added function overloads to handle both single objects and arrays:

```typescript
export function prepareInsert<T extends Record<string, any>>(data: T): Partial<T>;
export function prepareInsert<T extends Record<string, any>>(data: T[]): Partial<T>[];
export function prepareInsert<T extends Record<string, any>>(data: T | T[]): Partial<T> | Partial<T>[] {
  if (Array.isArray(data)) {
    return data.map(item => removeUndefinedFields(item));
  }
  return removeUndefinedFields(data);
}
```

**Benefit:** This makes `prepareInsert` more flexible and prevents future array-related bugs. It now correctly handles:
- Single object inserts: `prepareInsert({...})`
- Array inserts: `prepareInsert([{...}, {...}])`

### Fix 3: Add RecordMetadata Component to Property Details
**File:** `src/components/property/PropertyDetailsSection.tsx`

Added import:
```typescript
import RecordMetadata from '../RecordMetadata';
```

Added metadata display at bottom of property details:
```typescript
{/* Record Metadata */}
{property.id && (
  <RecordMetadata
    createdAt={property.created_at}
    createdById={property.created_by_id}
    updatedAt={property.updated_at}
    updatedById={property.updated_by_id}
  />
)}
```

## How the System Works

### Database Triggers (Already Installed)
**File:** `migrations/add_update_triggers_for_audit_fields.sql`

**INSERT Trigger (lines 183-187):**
```sql
CREATE TRIGGER set_property_creator
  BEFORE INSERT ON property
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();
```

This trigger:
- Runs on INSERT operations
- Calls `auth.uid()` to get the authenticated user's auth ID
- Looks up `user.id` from the `user` table where `auth_user_id = auth.uid()`
- Sets `NEW.created_by_id = user.id`

**UPDATE Trigger (lines 67-71):**
```sql
CREATE TRIGGER update_property_audit_fields
  BEFORE UPDATE ON property
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();
```

This trigger:
- Runs on UPDATE operations
- Sets `NEW.updated_at = NOW()`
- Sets `NEW.updated_by_id = user.id` (via auth.uid() lookup)

### Application Code Pattern

**For INSERT operations:**
```typescript
const insertPayload = {
  ...propertyData,
  created_at: new Date().toISOString(),  // ✅ Must set explicitly
  updated_at: new Date().toISOString()
  // created_by_id is set by trigger
};

await supabase
  .from('property')
  .insert(prepareInsert(insertPayload))  // ⚠️ Pass object, NOT array
  .select()
  .single();
```

**For UPDATE operations:**
```typescript
const updatePayload = {
  ...propertyData
  // updated_at and updated_by_id are set by trigger
};

await supabase
  .from('property')
  .update(prepareUpdate(updatePayload))
  .eq('id', propertyId)
  .select()
  .single();
```

## Testing the Fix

1. **Create a new property:**
   - Navigate to `/property/new`
   - Fill in property name, address, city, state
   - Select a property record type
   - Click "Create Property"
   - ✅ Property should be created without errors

2. **Verify metadata displays:**
   - Open the property details page
   - Scroll to "Property Details" section
   - Look for "Record Metadata" at bottom
   - Should show: "Created: [timestamp] by [Your Name]"

3. **Test updates:**
   - Edit any field (e.g., property name) and it auto-saves
   - Should show: "Updated: [timestamp] by [Your Name]"

## Key Learnings

### 1. Array vs Object in Supabase Insert
- Supabase `.insert()` accepts BOTH arrays and single objects
- Helper functions like `prepareInsert` must match the data structure
- Passing an array `[{...}]` to a function expecting an object `{...}` causes PostgreSQL to interpret array indices as column names

### 2. Function Overloads for Flexibility
- TypeScript function overloads allow a single function to handle multiple input types
- This prevents bugs and makes the API more intuitive
- Example: `prepareInsert` now correctly handles both `prepareInsert(obj)` and `prepareInsert([obj1, obj2])`

### 3. Reuse RecordMetadata Component
- Always use the shared `RecordMetadata` component for displaying audit fields
- Don't duplicate timestamp formatting and user fetching logic
- Consistent UI across all entities (deals, properties, contacts, etc.)

### 4. Database Triggers Are Already In Place
- The property table already had INSERT and UPDATE triggers configured
- No database changes were needed - only application code fixes
- Always check existing infrastructure before implementing new solutions

## Files Modified

### Updated Files
- `src/hooks/useProperty.ts` - Fixed array wrapper in INSERT statement
- `src/lib/supabaseHelpers.ts` - Enhanced `prepareInsert` to support arrays and objects
- `src/components/property/PropertyDetailsSection.tsx` - Integrated RecordMetadata component

### Existing Infrastructure (No Changes)
- `migrations/add_update_triggers_for_audit_fields.sql` - Triggers already installed
- `database-schema.ts` - Property table already has audit fields (created_at, created_by_id, updated_at, updated_by_id)
- `src/components/RecordMetadata.tsx` - Reusable component for displaying metadata
- `src/components/shared/UserByIdDisplay.tsx` - Displays user name by ID

## Comparison to Deal Implementation

This fix follows the exact same pattern documented in `CREATOR_TRACKING_FIX_NOV_2025.md` for deals:

| Aspect | Deal | Property |
|--------|------|----------|
| Database triggers | ✅ Installed | ✅ Installed |
| Insert sets `created_at` | ✅ Yes | ✅ Yes |
| Uses `prepareInsert()` | ✅ Yes | ✅ Yes |
| RecordMetadata component | ✅ In DealDetailsForm | ✅ In PropertyDetailsSection |
| Database fields | ✅ All 4 audit fields | ✅ All 4 audit fields |

## Related Documentation
- `CREATOR_TRACKING_FIX_NOV_2025.md` - Deal creator tracking fix (November 10, 2025)
- `CREATOR_TRACKING_IMPLEMENTATION.md` - Original implementation guide (November 8, 2025)
- `migrations/add_update_triggers_for_audit_fields.sql` - Database trigger definitions

## Time Investment
- Initial issue reported: Property creation failing
- Root cause identified: 5 minutes (array wrapper in prepareInsert)
- Fix implemented: 10 minutes
- Documentation: 20 minutes

**Total time:** ~35 minutes

This was much faster than the initial deal implementation thanks to existing documentation and reusable components!
