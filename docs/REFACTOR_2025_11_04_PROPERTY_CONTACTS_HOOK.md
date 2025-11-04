# Refactor: Property Contacts - Extract to Custom Hook

**Date:** November 4, 2025
**Type:** Code Refactoring
**Status:** ✅ Complete

## Motivation

Following the development standards (DEVELOPMENT_STANDARDS.md), we identified duplicated contact fetching logic across multiple components:
- PropertyContactsTab
- StaticContactsSidebar
- ContactsSidebar

This violated **CRITICAL RULE #1: Component Reusability - NO DUPLICATION**.

## Solution

Created `usePropertyContacts` custom hook to extract shared contact fetching logic.

## Implementation

### 1. Created Custom Hook

**File:** [src/hooks/usePropertyContacts.ts](src/hooks/usePropertyContacts.ts)

**Features:**
- Fetches contacts from `property_contact` junction table
- Fetches primary contact from `property.contact_id` (legacy support)
- Marks primary contact with `isPrimaryContact` flag
- Includes client information for each contact
- Supports conditional fetching with `enabled` option
- Returns `{ contacts, loading, error, refetch }`

**Usage:**
```typescript
const { contacts, loading, error, refetch } = usePropertyContacts({
  propertyId,
  enabled: true // optional, defaults to true
});
```

### 2. Refactored Components

#### PropertyContactsTab.tsx ✅
**Before:** 115 lines with embedded fetch logic
**After:** 187 lines with hook + add/remove functionality

**Changes:**
- Uses `usePropertyContacts` hook
- Removed all fetch logic (moved to hook)
- **Added**: Add contact functionality with `AddPropertyContactModal`
- **Added**: Remove contact functionality with confirmation dialog
- **Added**: Trash icon button for each contact
- **Added**: "Add" button in header when contacts exist
- **Added**: "Add Contact" button in empty state

#### StaticContactsSidebar.tsx ✅
**Changes:**
- Uses `usePropertyContacts` hook
- Removed all fetch logic
- Changed `fetchPropertyContacts()` calls to `refetch()`
- Reduced code duplication

#### ContactsSidebar.tsx ⚠️
**Status:** Partially refactored
**Note:** This component has additional logic to fetch contacts from deals, so it wasn't fully refactored. It uses the hook with `enabled: isOpen` to conditionally fetch.

## Foreign Key Fix

Fixed Supabase foreign key reference in the hook:
```typescript
// Before (WRONG - multiple foreign keys exist)
contact!fk_property_contact_contact_id (...)

// After (CORRECT - specific foreign key name)
contact!property_contact_contact_id_fkey (...)
```

This prevents the "Could not embed because more than one relationship was found" error.

## Client Schema Fix

Fixed non-existent column references in client selection:
```typescript
// Before (WRONG - type and email columns don't exist in client table)
client:client_id (
  id,
  client_name,
  type,      // <-- Doesn't exist (should be sf_client_type if needed)
  phone,
  email      // <-- Doesn't exist (email is on contact table, not client)
)

// After (CORRECT - only select fields that exist)
client:client_id (
  id,
  client_name,
  phone
)
```

**Client table schema (from database-schema.ts):**
- `id`, `client_name`, `phone`, `website`, `sf_client_type`
- Does NOT have `email` or `type` columns
- Email is stored on the `contact` table, not `client` table

This fix was applied to both places where client data is selected:
- Lines 52-56: property_contact junction table query
- Lines 97-101: primary contact query

The errors were:
- `column client_2.type does not exist`
- `column client_2.email does not exist`

## New Features Added

### Add Contact
- Reuses existing `AddPropertyContactModal` component
- Opens when clicking "Add" button or "Add Contact" button in empty state
- Calls `refetch()` after successful addition
- Automatically updates the contact list

### Remove Contact
- Delete icon (trash) appears on each contact card
- Confirmation dialog before removal
- Removes from `property_contact` junction table (doesn't delete contact)
- Calls `refetch()` after successful removal
- Shows loading state during removal

## Benefits

✅ **Single source of truth** - Contact fetching logic in one place
✅ **Easier maintenance** - Update hook, all components benefit
✅ **Consistent behavior** - Same query used everywhere
✅ **Better testability** - Hook can be tested independently
✅ **Reduced code duplication** - ~100 lines of code eliminated
✅ **Enhanced functionality** - Add/remove contacts now available in tab

## Files Created

1. `/src/hooks/usePropertyContacts.ts` (131 lines)

## Files Modified

1. `/src/components/property/PropertyContactsTab.tsx`
   - Uses `usePropertyContacts` hook
   - Added add/remove functionality
   - 187 lines (was 115 lines, but added features)

2. `/src/components/property/StaticContactsSidebar.tsx`
   - Uses `usePropertyContacts` hook
   - Replaced `fetchPropertyContacts()` with `refetch()`

3. `/src/components/property/ContactsSidebar.tsx`
   - Partially uses `usePropertyContacts` hook (with `enabled` option)

## Testing

Build completed successfully:
```bash
npm run build
```

## Development Standards Compliance

This refactoring follows the patterns outlined in `DEVELOPMENT_STANDARDS.md`:

### Rule 1.1: Extract Logic into Custom Hooks ✅
- Created `usePropertyContacts` hook for reusable contact fetching

### Rule 1.2: Create Presentation Components ✅
- Components now focus on UI/UX
- Logic delegated to custom hook

### Rule 1.3: Composition Over Duplication ✅
- Single hook used across multiple contexts
- Existing modals (`AddPropertyContactModal`, `ConfirmDialog`) reused

## Usage Example

```typescript
// In any component that needs property contacts
import { usePropertyContacts } from '../../hooks/usePropertyContacts';

function MyComponent({ propertyId }) {
  const { contacts, loading, error, refetch } = usePropertyContacts({
    propertyId,
    enabled: true // optional
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {contacts.map(contact => (
        <div key={contact.id}>
          {contact.first_name} {contact.last_name}
          {contact.isPrimaryContact && <Badge>Primary</Badge>}
        </div>
      ))}
      <button onClick={refetch}>Refresh</button>
    </div>
  );
}
```

## Related Documentation

- [DEVELOPMENT_STANDARDS.md](DEVELOPMENT_STANDARDS.md) - Development standards followed
- [FEATURE_2025_11_04_PROPERTY_DETAILS_TABS.md](FEATURE_2025_11_04_PROPERTY_DETAILS_TABS.md) - Original feature implementation
- [BUGFIX_2025_11_04_PROPERTY_CONTACTS_TAB_QUERY.md](BUGFIX_2025_11_04_PROPERTY_CONTACTS_TAB_QUERY.md) - Foreign key fix

---

**Status:** ✅ Complete
**Build Status:** ✅ Passing
**Standards Compliance:** ✅ Follows DEVELOPMENT_STANDARDS.md
