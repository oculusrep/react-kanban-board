# Bug Fix: Property Unit Persistence in New Site Submits

**Date:** October 13, 2025
**Status:** Fixed

## Problem

When creating a new site submit after previously creating one with a property unit selected:

1. User creates site submit and selects a property unit (e.g., "Next to J Christophers")
2. User saves the site submit
3. User clicks "New Site Submit" button
4. **Bug:** The new site submit slideout shows the PREVIOUS property unit instead of being blank
5. When saving, the old property unit ID was being saved to the database

## Root Cause

The issue had multiple contributing factors:

1. **State Persistence:** The `selectedPropertyUnit` React state in `PinDetailsSlideout.tsx` was retaining the value from the previous site submit
2. **Async State Updates:** When creating a new site submit with `property_unit_id: null`, the useEffect that called `setSelectedPropertyUnit(null)` would run, but React's asynchronous state updates meant the component rendered with the old state value before the update completed
3. **Component Caching:** The `PropertyUnitSelector` component was being reused between different site submits, maintaining its internal state

## Solution

Applied a multi-layered fix:

### 1. Explicitly Set property_unit_id to null for New Site Submits

**File:** `src/pages/MappingPageNew.tsx:459`

```typescript
const newSiteSubmit: any = {
  property_id: propertyId,
  property: property,
  property_unit_id: null,  // ✅ Explicitly set to null
  submit_stage_id: stage?.id || null,
  submit_stage: stage || null,
  site_submit_name: '',
  client_id: null,
  year_1_rent: null,
  ti: null,
  notes: '',
  date_submitted: null,
  _isNew: true
};
```

### 2. Use Nullish Coalescing for State Reset

**File:** `src/components/mapping/slideouts/PinDetailsSlideout.tsx:755`

```typescript
// Initialize property unit if present (explicitly check for undefined/null)
setSelectedPropertyUnit(siteSubmitData.property_unit_id ?? null);
```

Changed from `||` to `??` operator to properly handle undefined vs null values.

### 3. Force Component Remount with Key Prop

**File:** `src/components/mapping/slideouts/PinDetailsSlideout.tsx:1242`

```typescript
<PropertyUnitSelector
  key={`property-unit-${siteSubmit?.id || 'new'}-${selectedPropertyUnit}`}
  value={selectedPropertyUnit}
  onChange={(value) => {
    setSelectedPropertyUnit(value);
    setHasChanges(true);
  }}
  propertyId={submitProperty.id}
  label=""
/>
```

The `key` prop forces React to completely remount the component when:
- The site submit ID changes (existing → new)
- The selectedPropertyUnit value changes

This ensures a fresh component instance with no cached state.

### 4. Prioritize Data Over State in Save Logic

**File:** `src/components/mapping/slideouts/PinDetailsSlideout.tsx:1047`

```typescript
// For new site submits, use the property_unit_id from the data (which should be null for fresh creates)
// For existing, use the selectedPropertyUnit state
const propertyUnitForInsert = siteSubmit.property_unit_id ?? selectedPropertyUnit ?? null;

const insertData = {
  site_submit_name: siteSubmitName,
  property_id: siteSubmit.property_id,
  client_id: selectedClient.id,
  assignment_id: selectedAssignment?.id || null,
  property_unit_id: propertyUnitForInsert,  // ✅ Use computed value
  submit_stage_id: currentStageId || null,
  // ...
};
```

## Testing

### Test Case 1: Create New Site Submit After One With Property Unit
1. Open property "Newnan - Ashley Park Phase III"
2. Go to UNITS tab, select "Next to J Christophers"
3. Click "New Site Submit"
4. Select client "Jimmy Johns - Hans"
5. Select property unit "Next to J Christophers"
6. Save site submit
7. Click "New Site Submit" again
8. **Expected:** Property unit field is blank ✅
9. **Actual:** Property unit field is blank ✅

### Test Case 2: Edit Existing Site Submit With Property Unit
1. Click on existing site submit with a property unit
2. Property unit displays correctly
3. Can change the property unit
4. Save changes
5. **Expected:** Property unit is updated ✅
6. **Actual:** Property unit is updated ✅

### Test Case 3: Create New Site Submit Without Property Unit
1. Open any property
2. Click "New Site Submit"
3. Select client
4. DO NOT select property unit
5. Save
6. **Expected:** property_unit_id is null in database ✅
7. **Actual:** property_unit_id is null in database ✅

## Related Issues Fixed

This fix also addressed a related issue where the site submit date was not displaying properly. See [BUGFIX_2025_10_13_SITE_SUBMIT_DATE.md](./BUGFIX_2025_10_13_SITE_SUBMIT_DATE.md) for details.

## Files Modified

1. `src/pages/MappingPageNew.tsx` - Explicitly set property_unit_id to null
2. `src/components/mapping/slideouts/PinDetailsSlideout.tsx` - Multiple fixes for state management
3. `src/components/mapping/layers/SiteSubmitLayer.tsx` - Added date_submitted to query

## Lessons Learned

1. **Always explicitly initialize optional fields** - Don't rely on undefined, use null
2. **React state is asynchronous** - State updates don't happen immediately, use keys to force remounts when needed
3. **Component reuse can cause state persistence** - Use key props to force fresh instances
4. **Nullish coalescing (??) vs OR (||)** - Use ?? when you want to preserve falsy values like 0 or empty strings

## Prevention

To prevent similar issues in the future:

1. Always use `key` props on complex form components that should reset between different data items
2. Explicitly initialize all optional fields to null instead of leaving them undefined
3. Use nullish coalescing (??) instead of OR (||) when handling optional values
4. Add logging to track state values during development

---

**Fixed by:** Claude Code Assistant
**Verified by:** User testing
**Commit:** See git history
