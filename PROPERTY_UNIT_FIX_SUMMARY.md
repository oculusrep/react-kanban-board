# Property Unit Display Fix Summary

## Issue Description

Site submits were displaying UUIDs (like "ajyVn00000hCU9iAM") instead of human-readable property unit names (like "Suite 320 - Anytime fitness") in the map pin details slideout.

## Root Cause

The issue occurred when:
1. A site submit had `sf_property_unit` (Salesforce UUID) populated
2. But `property_unit_id` (foreign key to property_unit table) was NULL
3. The UI code had a fallback that displayed the `sf_property_unit` UUID when `property_unit.property_unit_name` wasn't available

## Files Modified

### 1. `/src/components/mapping/slideouts/PinDetailsSlideout.tsx`
**Change**: Removed the fallback to `sf_property_unit` field

**Before**:
```typescript
{(siteSubmit?.property_unit?.property_unit_name || siteSubmit?.sf_property_unit) && (
  <p className="text-sm text-gray-600">
    <span className="font-medium">Unit:</span> {siteSubmit?.property_unit?.property_unit_name || siteSubmit?.sf_property_unit}
  </p>
)}
```

**After**:
```typescript
{siteSubmit?.property_unit?.property_unit_name && (
  <p className="text-sm text-gray-600">
    <span className="font-medium">Unit:</span> {siteSubmit?.property_unit?.property_unit_name}
  </p>
)}
```

**Result**: Now only displays unit name if the proper relation exists. Won't show confusing UUIDs.

## Data Fix Applied

### Script: `fix-missing-property-unit-ids.js`

Created an automated script to fix site submits with missing `property_unit_id` foreign keys.

**What it does**:
1. Finds site submits where `sf_property_unit` is set but `property_unit_id` is null
2. Looks up the correct `property_unit_id` by finding other site submits with the same `sf_property_unit` value
3. Applies the fix to set the correct foreign key
4. Provides detailed logging and summary

**Usage**:
```bash
node fix-missing-property-unit-ids.js
```

### Results

**Database Scan**:
- Total site submits: 2,453
- Site submits with property units: 372
- Site submits with broken references: 2

**Fixed**:
- ✅ "Village Walk - Jeff's Bagel Run - Tarak & Krishna"
  - Set `property_unit_id` to `b781e5a6-9403-4980-96e9-b2755924512a`
  - Now correctly displays: "Suite 320 - Anytime fitness"

**Requires Manual Review**:
- ⚠️ "Southern Post - Jeff's Bagel Run - Tarak & Krishna"
  - Has `sf_property_unit`: `a1yVn0000016WvtIAE`
  - No other site submits reference this SF ID
  - Property has one unit: "Jewel Box" (may not be correct)
  - Needs manual assignment of correct property unit

## Commits

1. `05a9c96` - fix: remove sf_property_unit UUID fallback in site submit display
2. `1135e5c` - feat: add script to fix missing property_unit_id foreign keys

## Prevention

To prevent this issue in the future:

1. **When creating site submits**, ensure `property_unit_id` is set if the site submit is for a specific unit
2. **Salesforce sync**: Update the sync process to properly map `sf_property_unit` to the local `property_unit_id` foreign key
3. **Data validation**: Consider adding a database constraint or validation that warns when `sf_property_unit` is set but `property_unit_id` is null

## Testing

After applying the fix, test by:
1. Opening the "Village Walk - Jeff's Bagel Run" site submit on the map
2. Verify it now shows "Suite 320 - Anytime fitness" instead of the UUID
3. Check other site submits with units to ensure they still display correctly
