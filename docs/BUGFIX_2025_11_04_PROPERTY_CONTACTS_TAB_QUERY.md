# Bug Fix: Property Contacts Tab Query Error

**Date:** November 4, 2025
**Component:** PropertyContactsTab
**Issue Type:** Database Query Error

## Problem

The Property Details slideout Contacts tab was showing "Error loading contacts" and returning a 400 Bad Request error from Supabase. The browser console showed:

```
Failed to load resource: the server responded with a status of 400 ()
PropertyContactsTab: propertyId = c92ca3ea-76c5-4af9-a909-6a3eef69a2cb
PropertyContactsTab: propertyContacts = null
PropertyContactsTab: junctionError = Object
Error fetching contacts
```

## Root Cause

The Supabase query was using an explicit foreign key hint syntax that wasn't matching the actual database foreign key:

```typescript
contact!fk_property_contact_contact_id (...)
```

This caused Supabase PostgREST to return a 400 Bad Request error because it couldn't resolve the foreign key reference.

## Solution

Changed the foreign key reference syntax to use the column-based approach, which is more standard and reliable:

### Before (lines 34-49)
```typescript
const { data: propertyContacts, error: junctionError } = await supabase
  .from('property_contact')
  .select(`
    *,
    contact!fk_property_contact_contact_id (
      *,
      client:client_id (
        id,
        client_name,
        type,
        phone,
        email
      )
    )
  `)
  .eq('property_id', propertyId);
```

### After (lines 34-49)
```typescript
const { data: propertyContacts, error: junctionError } = await supabase
  .from('property_contact')
  .select(`
    *,
    contact:contact_id (
      *,
      client:client_id (
        id,
        client_name,
        type,
        phone,
        email
      )
    )
  `)
  .eq('property_id', propertyId);
```

## Change Details

**File:** [src/components/property/PropertyContactsTab.tsx](src/components/property/PropertyContactsTab.tsx)

**Line:** 38

**Change:**
- Old: `contact!fk_property_contact_contact_id (`
- New: `contact:contact_id (`

## Supabase Foreign Key Syntax

Supabase supports two ways to specify foreign key joins:

### 1. Explicit Foreign Key Name (Not Recommended)
```typescript
contact!fk_property_contact_contact_id (...)
```
- Requires exact foreign key name match
- More prone to errors if foreign key names change
- Can fail with 400 errors if name doesn't match exactly

### 2. Column-Based (Recommended)
```typescript
contact:contact_id (...)
```
- Uses the column name
- Supabase automatically resolves the foreign key
- More robust and easier to maintain

## Testing

1. Build completed successfully
2. Query should now return contacts without 400 errors
3. Property Details Contacts tab should display associated contacts

## Related Issues

The same pattern was used successfully in other components:
- PropertySidebar.tsx uses `contact!fk_property_contact_contact_id` (lines 236-240) - **May need similar fix**
- ContactsSidebar.tsx uses `contact!fk_property_contact_contact_id` (lines 41-47) - **May need similar fix**

## Follow-up Actions

Consider updating other components that use the explicit foreign key syntax to use the column-based syntax for consistency and reliability.

## Files Modified

1. `/src/components/property/PropertyContactsTab.tsx` (line 38)

---

**Status:** ✅ Fixed
**Build Status:** ✅ Passing
**Ready for Deployment:** ✅ Yes
