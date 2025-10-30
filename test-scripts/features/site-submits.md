# Site Submits - Feature Test Suite

## Overview

Site submits represent property submissions from clients. This test suite covers the core functionality of creating, viewing, editing, and managing site submits across the application.

## Test Cases

### Creating Site Submits

#### TC-SS-001: Create Site Submit from Property
**Prerequisites**: Access to a property page

**Steps**:
1. Navigate to a property page
2. Click "+ New" in the Site Submits sidebar section
3. Fill out required fields:
   - Site Submit Name
   - Client
   - Submit Stage
4. Click "Save Site Submit"

**Expected Result**:
- Site submit is created successfully
- Appears in the sidebar list
- Stage name displays correctly

---

#### TC-SS-002: Create Site Submit from Client
**Prerequisites**: Access to a client page

**Steps**:
1. Navigate to a client page
2. Click "+ New" in the Site Submits sidebar section
3. Fill out required fields
4. Click "Save Site Submit"

**Expected Result**:
- Site submit is created successfully
- Appears in the sidebar list

---

### Viewing Site Submits

#### TC-SS-003: View Site Submit Details
**Prerequisites**: Existing site submit

**Steps**:
1. Navigate to a property or client with site submits
2. Click on a site submit in the sidebar
3. Review the detailed information displayed

**Expected Result**:
- Site submit details open in a slideout/modal
- All fields are visible and correctly populated
- Can navigate back to the sidebar

---

### Editing Site Submits

#### TC-SS-004: Update Site Submit Stage
**Prerequisites**: Existing site submit

**Steps**:
1. Open a site submit's details
2. Change the Submit Stage field
3. Save the changes
4. Return to the sidebar

**Expected Result**:
- Stage updates successfully
- New stage name displays in the sidebar
- Changes persist after page refresh

---

### Site Submit Stages

#### TC-SS-005: Verify All Stage Options
**Prerequisites**: Access to create/edit site submits

**Steps**:
1. Open the Submit Stage dropdown
2. Review available options

**Expected Result**:
Available stages should include:
- Ready to Submit
- Submitted-Reviewing
- Pursuing Ownership
- Pass
- Use Conflict
- Not Available

---

### Integration Tests

#### TC-SS-006: Site Submit to Deal Conversion
**Prerequisites**: Site submit with complete information

**Steps**:
1. Open site submit details
2. Find "Convert to Deal" option
3. Complete conversion process

**Expected Result**:
- Deal is created from site submit
- Deal retains site submit information
- Link between deal and site submit is maintained

---

## Notes

- Site submits can be associated with properties, clients, and assignments
- Stage names should always display the actual stage, not generic "Site Submit" text
- Site submits may originate from Salesforce sync or be created locally in OVIS
