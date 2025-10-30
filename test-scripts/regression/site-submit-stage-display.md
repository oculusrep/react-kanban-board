# Site Submit Stage Display - Regression Test

**Bug Fix**: Display actual submit stage names in sidebars instead of 'Site Submit'
**Commit**: 7fc411e
**Date**: 2025-10-30

## Issue

When site submits were created locally in OVIS (not synced from Salesforce), the sidebar would display "Site Submit" instead of the actual stage name (e.g., "Submitted-Reviewing").

## Root Cause

The code was displaying the `sf_submit_stage` field, which is only populated for Salesforce-synced records. New OVIS records need to use the `submit_stage_id` foreign key relationship to display the stage name.

## Fix

- Created shared `SiteSubmitItem` component to eliminate code duplication
- Updated database queries to join the `submit_stage` table
- Stage display now prioritizes: `submit_stage.name` > `sf_submit_stage` > 'No Stage'

---

## Test Cases

### Test Case 1: Client Sidebar - New Site Submit

**Prerequisites**: Access to a client with site submits

**Steps**:
1. Navigate to any client page (e.g., `/client/{clientId}`)
2. Click "+ New" in the "Site Submits" section
3. Fill out the form and select "Submitted-Reviewing" as the stage
4. Save the site submit
5. Expand the "Site Submits" section in the right sidebar

**Expected Result**:
- The new site submit should display "Submitted-Reviewing" in green text
- NOT "Site Submit"

**Status**: [ ] Pass / [ ] Fail

---

### Test Case 2: Property Sidebar - Existing Site Submits

**Prerequisites**: Access to a property with site submits

**Steps**:
1. Navigate to any property page (e.g., `/property/{propertyId}`)
2. Expand the "Site Submits" section in the right sidebar
3. Observe the stage names displayed for each site submit

**Expected Result**:
- Each site submit displays its actual stage name (e.g., "Pursuing Ownership", "Pass", "Not Available")
- Stage name is shown in green text below the site submit name
- No entries should show "Site Submit" unless they truly have no stage assigned

**Status**: [ ] Pass / [ ] Fail

---

### Test Case 3: Assignment Sidebar

**Prerequisites**: Access to an assignment with site submits

**Steps**:
1. Navigate to the assignments page
2. Open any assignment with site submits
3. View the site submits in the assignment sidebar
4. Expand the "Site Submits" section

**Expected Result**:
- Site submits display their actual stage names
- Consistent with Client and Property sidebars

**Status**: [ ] Pass / [ ] Fail

---

### Test Case 4: Salesforce-Synced Records (Backward Compatibility)

**Prerequisites**: Access to site submits that originated from Salesforce

**Steps**:
1. Find a site submit that was synced from Salesforce (has `sf_id` populated)
2. View it in any sidebar (Client, Property, or Assignment)

**Expected Result**:
- Stage name displays correctly using the `sf_submit_stage` field as fallback
- No regression in display of Salesforce-synced records

**Status**: [ ] Pass / [ ] Fail

---

### Test Case 5: Site Submit with No Stage

**Prerequisites**: Ability to create a site submit without selecting a stage (if allowed)

**Steps**:
1. Create or find a site submit with no stage assigned
2. View it in a sidebar

**Expected Result**:
- Displays "No Stage" instead of being blank or showing "Site Submit"

**Status**: [ ] Pass / [ ] Fail

---

### Test Case 6: Multiple Stage Types

**Prerequisites**: Access to site submits with various stages

**Steps**:
1. Navigate to a client or property with multiple site submits
2. Verify site submits with the following stages display correctly:
   - Submitted-Reviewing
   - Pursuing Ownership
   - Pass
   - Use Conflict
   - Not Available
   - Ready to Submit

**Expected Result**:
- All stage names display accurately
- Text is green and properly formatted

**Status**: [ ] Pass / [ ] Fail

---

## Browser Console Check

**Steps**:
1. Open browser developer tools (F12)
2. Navigate through the test cases above
3. Monitor console for errors

**Expected Result**:
- No console errors related to site submit stage display
- No undefined or null reference errors

**Status**: [ ] Pass / [ ] Fail

---

## Notes

- This fix affects three components: `ClientSidebar`, `PropertySidebar`, and `AssignmentSidebar`
- All three now use the shared `SiteSubmitItem` component
- Future changes to site submit display only need to be made in one place
- The stage display logic is consistent across the entire application

## Related Files

- `src/components/sidebar/SiteSubmitItem.tsx` (new shared component)
- `src/components/ClientSidebar.tsx`
- `src/components/property/PropertySidebar.tsx`
- `src/components/AssignmentSidebar.tsx`
