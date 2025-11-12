# Property Tab Click Fix - November 12, 2025

## Issue Summary
Property tab in site submit sidebar had inconsistent behavior - sometimes opening the property sidebar, sometimes doing nothing.

## Root Cause
When a site submit was opened and autosaved (~1.5 seconds later), the autosave query used `.select()` without parameters, which returned only the `site_submit` table fields and **stripped out all relationship data** including the critical `property` relationship needed to open the property sidebar.

### Sequence of Failure
1. User clicks site submit pin → Opens with full data including `property` relationship ✅
2. Autosave triggers after 1.5 seconds → Returns data **without** relationships ❌
3. `onDataUpdate()` replaces good data with stripped data
4. User clicks Property tab → No property data available → Nothing happens ❌

## Solution

### Files Changed
1. **PinDetailsSlideout.tsx** - Fixed autosave query to preserve relationships
2. **MappingPageNew.tsx** - Added debug logging and validation

### Technical Fix

#### PinDetailsSlideout.tsx (Line 808-831)
**Before:**
```typescript
.select()  // Returns only site_submit table fields
.single();
```

**After:**
```typescript
.select(`
  *,
  property!site_submit_property_id_fkey (
    id,
    property_name,
    address,
    city,
    state,
    zip,
    latitude,
    longitude,
    verified_latitude,
    verified_longitude,
    property_record_type_id
  ),
  client!site_submit_client_id_fkey (
    id,
    client_name
  ),
  submit_stage!site_submit_submit_stage_id_fkey (
    id,
    name
  )
`)
.single();
```

#### MappingPageNew.tsx (Line 791-825)
Added validation and comprehensive debug logging:
```typescript
const handleViewPropertyDetails = async (property: any) => {
  // Validate property has an ID
  if (!property || !property.id) {
    console.error('❌ Cannot open property details: invalid property data', property);
    return;
  }

  // Only open sidebar after data is successfully fetched
  // (moved setIsPropertyDetailsOpen to after setSelectedPropertyData)
  ...
}
```

Added debug logging to handlePinClick:
```typescript
if (type === 'site_submit') {
  console.log('🔍 Site submit pin clicked, property data check:', {
    hasProperty: !!data?.property,
    propertyId: data?.property?.id,
    propertyName: data?.property?.property_name,
    directPropertyId: data?.property_id
  });
}
```

#### PinDetailsSlideout.tsx handleTabClick (Line 1834-1857)
Added comprehensive debug logging:
```typescript
console.log('🔘 Tab clicked:', { tabId, isProperty, type, hasCallback: !!onViewPropertyDetails });

if (!isProperty && tabId === 'location' && onViewPropertyDetails) {
  const property = siteSubmit?.property || (data as SiteSubmit)?.property;
  console.log('🏢 Property tab clicked, property data:', {
    fromSiteSubmit: !!siteSubmit?.property,
    fromData: !!(data as SiteSubmit)?.property,
    propertyId: property?.id,
    propertyName: property?.property_name
  });

  if (property) {
    console.log('✅ Opening property sidebar for:', property.id);
    onViewPropertyDetails(property);
    return;
  } else {
    console.error('❌ No property data available to open property sidebar');
  }
}
```

## Key Lessons

### 1. Supabase .select() Behavior
- `.select()` without parameters returns **only** the table's own columns
- Relationships must be **explicitly specified** in the select string
- This applies to both queries AND updates with `.select()`

### 2. Data Flow in Autosave
- Autosave updates can inadvertently strip relationship data
- Always fetch relationships after update operations
- Use the same relationship structure as initial data load

### 3. Debugging Race Conditions
- Race conditions can be caused by async operations that replace good data with incomplete data
- Debug logging helped identify the exact moment data was lost (after autosave)
- Time-based issues (working initially, failing after delay) suggest autosave/refresh problems

### 4. State Management Pattern
- When updating parent state via callbacks, ensure the updated data has the same structure as original data
- Consider the full data lifecycle: load → display → update → reload

## Testing Checklist

- [x] Click site submit pin → Sidebar opens
- [x] Wait for autosave (1.5 seconds)
- [x] Click Property tab → Property sidebar opens
- [x] Verify property details display correctly
- [x] Make changes to site submit → Autosave works
- [x] Click Property tab again → Still works

## Related Files
- `/src/components/mapping/slideouts/PinDetailsSlideout.tsx`
- `/src/pages/MappingPageNew.tsx`
- `/src/components/mapping/layers/SiteSubmitLayer.tsx`

## Commits
- `590f8fc` - Initial fix: Added validation and moved state updates
- `53d9a65` - Root cause fix: Include property relationship in autosave query

## Prevention
- **Always specify relationships explicitly** in `.select()` queries
- **Test autosave behavior** - don't just test initial load
- **Add debug logging** for relationship data in click handlers
- **Use consistent select strings** between initial load and update operations
