# Assignment Field Integration - Feature Documentation

## Overview
This document details the complete implementation of assignment field functionality across the OVIS application, allowing users to associate site submits with client assignments throughout the platform.

**Date Implemented:** October 13, 2025
**Status:** ✅ Production Ready

---

## Table of Contents
1. [Features Implemented](#features-implemented)
2. [Components Created](#components-created)
3. [Files Modified](#files-modified)
4. [Database Integration](#database-integration)
5. [User Workflows](#user-workflows)
6. [Technical Details](#technical-details)
7. [Testing & Validation](#testing--validation)

---

## Features Implemented

### 1. Assignment Search & Selection
- **Auto-suggest search** with debounced queries (300ms)
- **Client-based filtering** - only shows assignments for selected client
- **Search by assignment name** - type to filter results
- **Keyboard navigation** - Arrow keys, Enter, Escape support
- **Shows up to 5 results** before displaying "Add New" option

### 2. Create New Assignment
- **Modal-based creation** with full assignment form
- **Pre-fills client** from context when available
- **Auto-closes on save** and selects the new assignment
- **Success notifications** via toast messages
- **Full validation** for required fields

### 3. Assignment Field Locations
Implemented in three key areas:

#### A. Map Pin Details Slideout
- **Path:** Map → Click property/site submit pin → Slideout panel
- **Features:**
  - Loads existing assignment from database
  - Filters by selected client
  - Shows "Select a client first" helper text
  - Manual save required via "UPDATE SITE SUBMIT" button
  - Hides "Submit Site" button when unsaved changes exist

#### B. Site Submit Details Page
- **Path:** `/site-submit/:id` (Edit Site Submit page)
- **Features:**
  - Assignment field in 2-column grid with Client field
  - Loads existing assignment on page load
  - Creates assignment modal integration
  - Saves assignment_id with form submission
  - Full CRUD operations

#### C. Assignments Report Page
- **Path:** `/reports/assignments`
- **Features:**
  - Comprehensive table view of all assignments
  - Filter by Client (auto-suggest search)
  - Filter by Trade Area (auto-suggest search)
  - Sortable columns (Name, Client, Value, Due Date, Priority)
  - CSV export functionality
  - Shows 50 records per page with pagination
  - Displays: Assignment details, client, value, priority, site submit count, trade areas

---

## Components Created

### 1. `AssignmentSelector.tsx`
**Location:** `src/components/mapping/AssignmentSelector.tsx`

**Purpose:** Reusable auto-suggest search component for selecting assignments

**Props:**
- `selectedAssignment` - Currently selected assignment
- `onAssignmentSelect` - Callback when assignment is selected/cleared
- `onCreateNew` - Callback for "+ Add New Assignment" button
- `placeholder` - Input placeholder text
- `className` - Additional CSS classes
- `limit` - Number of results to show (default: 5)
- `clientId` - Filter assignments by client ID

**Features:**
- Debounced search (300ms)
- Click-outside-to-close dropdown
- Keyboard navigation support
- Shows assignment name only (no subtext)
- Loads all assignments for client on focus

**Example Usage:**
```tsx
<AssignmentSelector
  selectedAssignment={selectedAssignment}
  onAssignmentSelect={(assignment) => {
    setSelectedAssignment(assignment);
    setFormData(prev => ({ ...prev, assignment_id: assignment?.id || null }));
  }}
  onCreateNew={() => setShowAddAssignmentModal(true)}
  placeholder="Search for assignment..."
  limit={5}
  clientId={selectedClient?.id || null}
/>
```

### 2. `AddAssignmentModal.tsx`
**Location:** `src/components/AddAssignmentModal.tsx`

**Purpose:** Modal dialog for creating new assignments

**Props:**
- `isOpen` - Controls modal visibility
- `onClose` - Callback to close modal
- `onSave` - Callback with created assignment data
- `preselectedClientId` - Pre-fills client if provided

**Form Fields:**
- **Required:** Assignment Name, Client
- **Optional:** Assignment Value, Priority, Due Date, Site Criteria

**Features:**
- Full form validation
- Client selector integration
- Pre-populates client from context
- Creates assignment in database
- Returns complete assignment object to caller
- Auto-closes on successful save

**Z-Index:** 70 (appears above slideouts)

### 3. `useAssignmentSearch.ts`
**Location:** `src/hooks/useAssignmentSearch.ts`

**Purpose:** Custom hook for assignment search operations

**Functions:**

#### `searchAssignments(query: string, clientId?: string | null)`
- Searches assignments by name (case-insensitive)
- Optionally filters by client ID
- Returns up to 10 results
- Includes: id, assignment_name, client_id, client_name, assignment_value, due_date, progress

#### `getAllAssignments(clientId?: string | null, limit: number = 50)`
- Fetches all assignments (or filtered by client)
- Returns up to specified limit
- Same return structure as searchAssignments

**State:**
- `loading` - Boolean indicating query in progress
- `error` - Error message string or null

**Database Approach:**
- Avoids nested joins (caused 400 errors)
- Fetches assignment data first
- Fetches client data separately
- Maps data together in JavaScript

---

## Files Modified

### Core Files

#### 1. `PinDetailsSlideout.tsx`
**Location:** `src/components/mapping/slideouts/PinDetailsSlideout.tsx`

**Changes:**
- Added `AssignmentSelector` component integration
- Added `AddAssignmentModal` integration
- Added `selectedAssignment` state variable
- Added `showAddAssignmentModal` state variable
- **Lines 762-807:** Assignment loading logic from database
- **Lines 1279-1296:** Assignment field UI in form
- **Lines 1076 & 1177:** Assignment ID included in save operations
- **Line 1378:** Hide "Submit Site" button when `hasChanges === true`
- **Lines 2091-2109:** AddAssignmentModal component

**Assignment Loading:**
```typescript
// Loads assignment when slideout opens
if (siteSubmitData.assignment_id) {
  // Fetch assignment without nested joins
  // Fetch client name separately if needed
  // Set selectedAssignment state
}
```

**Assignment Saving:**
```typescript
// Included in both create and update operations
assignment_id: selectedAssignment?.id || null
```

#### 2. `SiteSubmitDetailsPage.tsx`
**Location:** `src/pages/SiteSubmitDetailsPage.tsx`

**Changes:**
- Added imports for AssignmentSelector and AddAssignmentModal
- Added `selectedAssignment` state variable
- Added `showAddAssignmentModal` state variable
- **Lines 172-192:** Load assignment on page load
- **Lines 842-877:** 2-column grid layout with Assignment field
- **Lines 322 & 345:** Log assignment_id during save operations
- **Lines 1141-1161:** AddAssignmentModal component

**Layout Change:**
```tsx
// Client and Assignment in same row
<div className="grid grid-cols-2 gap-4">
  <div>{/* Client Field */}</div>
  <div>{/* Assignment Field */}</div>
</div>
```

#### 3. `AssignmentsReportPage.tsx`
**Location:** `src/pages/AssignmentsReportPage.tsx`

**New File - Full report page with:**
- Assignment table with sortable columns
- Client filter (auto-suggest search)
- Trade Area filter (auto-suggest search)
- CSV export functionality
- Pagination (50 per page)
- Trade area data from site submit properties

**Key Features:**
- Fetches assignments with related data
- Enriches with site submit count and trade areas
- Client and Trade Area filters with real-time search
- Click column headers to sort
- Export filtered results to CSV

### Routing & Navigation

#### 4. `App.tsx`
**Location:** `src/App.tsx`

**Changes:**
- Added import: `AssignmentsReportPage`
- Added route: `/reports/assignments`

#### 5. `ReportsPage.tsx`
**Location:** `src/pages/ReportsPage.tsx`

**Changes:**
- Added report card for "Assignments Report"
- Icon: 📋
- Description: "View and filter all assignments by client and trade area"

### Type Definitions

#### 6. `types.ts`
**Location:** `src/lib/types.ts`

**No changes required** - Assignment interface already existed with all necessary fields including `assignment_id` foreign key.

---

## Database Integration

### Table: `assignment`
**Foreign Key:** `assignment_id` in `site_submit` table

### Fields Used:
- `id` (UUID, primary key)
- `assignment_name` (text)
- `client_id` (UUID, foreign key to client)
- `assignment_value` (numeric)
- `due_date` (date)
- `progress` (text)
- `commission` (numeric) - not displayed in selector
- `priority_id` (UUID, foreign key to assignment_priority)
- `owner_id` (UUID, foreign key to user)
- `transaction_type_id` (UUID, foreign key to transaction_type)

### Query Strategy

**Problem:** Nested joins caused 400 errors
```sql
-- ❌ This caused errors:
SELECT *, client:client_id(client_name) FROM assignment
```

**Solution:** Fetch data separately
```sql
-- ✅ This works:
SELECT id, assignment_name, client_id, ... FROM assignment WHERE client_id = ?
SELECT id, client_name FROM client WHERE id IN (...)
```

### Related Tables:
- `client` - Assignment belongs to client
- `assignment_priority` - Priority levels (High, Medium, Low)
- `user` - Assignment owner
- `transaction_type` - Type of transaction
- `site_submit` - Can be associated with assignment
- `property` - Via site_submit, provides trade_area

---

## User Workflows

### Workflow 1: Add Assignment to Site Submit (Map Pin)

1. **Open Map** and click on a property or site submit pin
2. **Slideout opens** showing site submit details
3. **Select a Client** (if not already selected)
4. **Click Assignment field** - dropdown opens with assignments for that client
5. **Options:**
   - **Search:** Type to filter assignments
   - **Select:** Click an assignment from the list
   - **Create New:** Click "+ Add New Assignment" → Modal opens → Fill form → Save
6. **Save Changes:** Click "UPDATE SITE SUBMIT" button at bottom
7. **Assignment saved** to database with `assignment_id`
8. **"Submit Site" button** reappears after save

### Workflow 2: Add Assignment to Site Submit (Details Page)

1. **Navigate** to site submit details page (`/site-submit/:id`)
2. **Assignment field** appears in same row as Client field
3. **Select Client** first (if not already selected)
4. **Click Assignment field** - same functionality as map pin
5. **Options:** Search, Select, or Create New (same as map pin)
6. **Click "Save Site Submit"** button
7. **Assignment saved** to database
8. **Console logs** show: `💾 Saving site submit with assignment_id: [id]`

### Workflow 3: View Assignments Report

1. **Navigate** to Reports page (`/reports`)
2. **Click** "Assignments Report" card (📋 icon)
3. **View table** with all assignments
4. **Filter by Client:**
   - Click Client filter field
   - Type to search clients
   - Select from dropdown
5. **Filter by Trade Area:**
   - Click Trade Area filter field
   - Type to search trade areas
   - Select from dropdown
6. **Sort data:** Click column headers
7. **Export:** Click "Export CSV" button for filtered results
8. **Navigate:** Click "View Details" to go to assignment page

### Workflow 4: Create New Assignment from Context

1. **Start** from any assignment field (map pin or details page)
2. **Select Client** first
3. **Click** "+ Add New Assignment" in dropdown
4. **Modal opens** with client pre-filled
5. **Fill in:**
   - Assignment Name (required)
   - Assignment Value (optional)
   - Priority (optional)
   - Due Date (optional)
   - Site Criteria (optional)
6. **Click "Create Assignment"** button
7. **Modal closes** automatically
8. **Assignment selected** in the field
9. **Success toast** appears: "Assignment created successfully!"
10. **Save** site submit to persist the association

---

## Technical Details

### Component Architecture

```
PinDetailsSlideout (or SiteSubmitDetailsPage)
├── AssignmentSelector
│   ├── useAssignmentSearch hook
│   │   ├── searchAssignments()
│   │   └── getAllAssignments()
│   └── Dropdown with results
│       ├── Assignment list (limit: 5)
│       └── "+ Add New Assignment" button
└── AddAssignmentModal
    ├── ClientSelector
    ├── Form fields
    └── Save button
```

### State Management

**PinDetailsSlideout / SiteSubmitDetailsPage:**
```typescript
const [selectedAssignment, setSelectedAssignment] = useState<AssignmentSearchResult | null>(null);
const [showAddAssignmentModal, setShowAddAssignmentModal] = useState(false);
const [hasChanges, setHasChanges] = useState(false); // Triggers save button
```

**AssignmentSelector:**
```typescript
const [query, setQuery] = useState('');
const [results, setResults] = useState<AssignmentSearchResult[]>([]);
const [showDropdown, setShowDropdown] = useState(false);
const [selectedIndex, setSelectedIndex] = useState(-1); // For keyboard nav
```

### Data Flow

#### Loading Assignment:
```
Database (site_submit table)
  ↓ assignment_id
Fetch assignment data
  ↓ (separate queries)
Fetch client name
  ↓
Set selectedAssignment state
  ↓
Display in AssignmentSelector
```

#### Saving Assignment:
```
User selects assignment
  ↓
setSelectedAssignment(assignment)
  ↓
setFormData(prev => ({ ...prev, assignment_id: assignment.id }))
  ↓
setHasChanges(true) → Save button appears
  ↓
User clicks "UPDATE SITE SUBMIT"
  ↓
Database update with assignment_id
  ↓
setHasChanges(false) → "Submit Site" button reappears
```

### Error Handling

**400 Errors from Nested Joins:**
- **Problem:** `client:client_id(...)` syntax caused errors
- **Solution:** Fetch client data in separate query
- **Implementation:** All components now use this pattern

**Empty States:**
```typescript
// No client selected
{!selectedClient && (
  <p className="mt-1 text-xs text-gray-500">Select a client first</p>
)}

// No assignments found
<div className="p-2 text-sm text-gray-500">No assignments found</div>
```

**Loading States:**
```typescript
{loading ? (
  <div className="p-2 text-sm text-gray-500">Loading...</div>
) : (
  // Results
)}
```

### Performance Optimizations

1. **Debounced Search:** 300ms delay prevents excessive API calls
2. **Limited Results:** Shows only 5 assignments before "Add New"
3. **Conditional Loading:** Only fetches when client is selected
4. **Separate Queries:** Avoids expensive nested joins
5. **Pagination:** Report shows 50 records per page

### Console Logging

**Comprehensive logging for debugging:**

```typescript
// Loading
console.log('📋 Loading assignment for site submit:', id);
console.log('✅ Loaded assignment data:', data);

// Searching
console.log('🔍 Searching assignments for:', query, 'client:', clientId);
console.log('✅ Found N assignments matching query');

// Saving
console.log('💾 Saving site submit with assignment_id:', id);
console.log('✅ Site submit saved successfully with assignment:', id);

// Errors
console.error('❌ Error loading assignment:', error);
```

---

## Testing & Validation

### Manual Testing Checklist

#### ✅ Map Pin Slideout
- [x] Open existing site submit with assignment → Assignment loads
- [x] Open existing site submit without assignment → Field is empty
- [x] Select client → Assignment dropdown shows filtered results
- [x] Search assignments → Results filter by query
- [x] Select assignment → Field updates, hasChanges = true
- [x] Click "UPDATE SITE SUBMIT" → Assignment saves to DB
- [x] Reopen same pin → Assignment still there
- [x] Change assignment → Can select different one
- [x] Clear assignment → Can set to null
- [x] "Submit Site" button hides when hasChanges = true
- [x] "Submit Site" button shows after save

#### ✅ Site Submit Details Page
- [x] Open existing site submit → Assignment loads in field
- [x] Assignment in 2-column grid with Client
- [x] Select/change assignment → Updates formData
- [x] Click "Save Site Submit" → Assignment saves
- [x] Console logs show assignment_id being saved
- [x] Create new site submit → Assignment field works

#### ✅ Create New Assignment
- [x] Click "+ Add New Assignment" → Modal opens
- [x] Client is pre-filled from context
- [x] Fill form and save → Assignment created in DB
- [x] Modal auto-closes → New assignment selected
- [x] Success toast appears
- [x] Can create assignment with minimal fields (Name + Client)
- [x] Can create assignment with all optional fields

#### ✅ Assignments Report
- [x] Navigate to /reports/assignments → Table loads
- [x] Filter by client → Auto-suggest works
- [x] Filter by trade area → Auto-suggest works
- [x] Clear filters → Shows all assignments
- [x] Sort by columns → Data sorts correctly
- [x] Pagination → Shows 50 per page
- [x] Export CSV → Downloads with correct data
- [x] View Details button → Navigates to assignment page

#### ✅ Database Integration
- [x] Assignment_id saves to site_submit table
- [x] Assignment_id loads from site_submit table
- [x] Null assignment_id handled correctly
- [x] Foreign key relationship maintained
- [x] No 400 errors from queries
- [x] Client filtering works correctly

### Build Validation
```bash
npm run build
# ✓ 3277 modules transformed
# ✓ built in ~14s
# ✅ No TypeScript errors
# ✅ No linting errors
```

---

## Known Issues & Limitations

### None Currently Identified

All features tested and working as expected. No known bugs or limitations.

---

## Future Enhancements (Optional)

1. **Bulk Assignment Update** - Update multiple site submits at once
2. **Assignment Quick View** - Hover tooltip with assignment details
3. **Assignment Templates** - Pre-filled assignment creation
4. **Assignment Analytics** - Dashboard with assignment metrics
5. **Assignment Notifications** - Alerts for due dates/changes
6. **Assignment History** - Track changes over time

---

## Code Examples

### Example 1: Using AssignmentSelector

```tsx
import AssignmentSelector from './components/mapping/AssignmentSelector';
import { AssignmentSearchResult } from './hooks/useAssignmentSearch';

const MyComponent = () => {
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentSearchResult | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);

  return (
    <AssignmentSelector
      selectedAssignment={selectedAssignment}
      onAssignmentSelect={(assignment) => {
        setSelectedAssignment(assignment);
        // Update your form data
      }}
      onCreateNew={() => {
        // Open modal or navigate to create page
      }}
      clientId={selectedClient?.id || null}
      placeholder="Search assignments..."
      limit={5}
    />
  );
};
```

### Example 2: Using AddAssignmentModal

```tsx
import AddAssignmentModal from './components/AddAssignmentModal';

const MyComponent = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button onClick={() => setShowModal(true)}>
        Create Assignment
      </button>

      <AddAssignmentModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={(newAssignment) => {
          console.log('Created:', newAssignment);
          // Use the new assignment
          setShowModal(false);
        }}
        preselectedClientId={clientId}
      />
    </>
  );
};
```

### Example 3: Loading Assignment from Database

```typescript
// In useEffect or data loading function
if (siteSubmitData.assignment_id) {
  const { data: assignmentData, error } = await supabase
    .from('assignment')
    .select('id, assignment_name, client_id, assignment_value, due_date, progress')
    .eq('id', siteSubmitData.assignment_id)
    .single();

  if (assignmentData && !error) {
    // Optionally fetch client name
    const { data: clientData } = await supabase
      .from('client')
      .select('client_name')
      .eq('id', assignmentData.client_id)
      .single();

    setSelectedAssignment({
      ...assignmentData,
      client_name: clientData?.client_name || null
    });
  }
}
```

---

## Deployment Notes

### Files to Deploy:
- All modified files listed in "Files Modified" section
- Three new files:
  - `src/hooks/useAssignmentSearch.ts`
  - `src/components/mapping/AssignmentSelector.tsx`
  - `src/components/AddAssignmentModal.tsx`
  - `src/pages/AssignmentsReportPage.tsx`

### No Database Changes Required:
- `assignment` table already exists
- `assignment_id` foreign key already exists in `site_submit` table
- No migrations needed

### Environment Requirements:
- No new environment variables
- Existing Supabase connection sufficient

### Rollback Plan:
If issues arise, revert the following commits:
- Assignment field integration commit
- Can safely revert without data loss (assignment_id field is nullable)

---

## Support & Maintenance

### Debugging Tips:

**Assignment not loading?**
- Check console for logs starting with 📋, ✅, ❌
- Verify assignment_id exists in database
- Check Supabase query errors

**Search not working?**
- Verify clientId is being passed correctly
- Check console for search logs: 🔍
- Ensure client is selected first

**Save not working?**
- Check hasChanges state
- Verify assignment_id in formData
- Look for save logs: 💾

### Contact:
For questions or issues, check the implementation in the files listed above or review this documentation.

---

## Changelog

### Version 1.0.0 (October 13, 2025)
- ✅ Initial implementation
- ✅ AssignmentSelector component created
- ✅ AddAssignmentModal component created
- ✅ useAssignmentSearch hook created
- ✅ Integration with PinDetailsSlideout
- ✅ Integration with SiteSubmitDetailsPage
- ✅ AssignmentsReportPage created
- ✅ All features tested and validated
- ✅ Documentation completed

---

**End of Documentation**
