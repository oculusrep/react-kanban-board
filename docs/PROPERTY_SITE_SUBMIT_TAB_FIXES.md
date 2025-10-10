# Property Site Submit Tab - Recent Fixes

## Session Date: 2025-10-10

### Issues Fixed

#### 1. Site Submits Not Loading in Property Submits Tab
**Problem:** When clicking on the "Submits" tab in the property slideout, site submits were showing an error: "Error loading site submits: Object"

**Root Cause:** Foreign key relationships in Supabase query were ambiguous because the `site_submit` table has multiple foreign keys pointing to the same related tables (properties, clients, stages).

**Solution:** Updated the Supabase query to use explicit foreign key constraint names:
- Changed from implicit `.select('properties(*), clients(*), stages(*)')`
- To explicit `.select('*, properties!site_submit_property_id_fkey(*), clients!site_submit_client_id_fkey(*), stages!site_submit_stage_id_fkey(*)')`

**Files Modified:**
- `src/components/mapping/slideouts/PinDetailsSlideout.tsx` (lines ~370-404)
- `src/pages/MappingPageNew.tsx` (line ~570)

#### 2. Client Name Not Showing in Site Submit Slideout
**Problem:** When opening an existing site submit from the submits tab, the property name and stage showed correctly, but the client name field remained empty.

**Root Cause:** The `ClientSelector` component wasn't syncing its internal `query` state when the `selectedClient` prop changed from outside. The component only set the query when a user manually selected a client from the dropdown, not when initialized with an existing client.

**Solution:** Added a `useEffect` hook to the `ClientSelector` component to sync the input field query with the `selectedClient` prop:
```tsx
useEffect(() => {
  if (selectedClient) {
    setQuery(selectedClient.client_name);
  } else if (query && !selectedClient) {
    setQuery('');
  }
}, [selectedClient]);
```

**Files Modified:**
- `src/components/mapping/ClientSelector.tsx` (added lines 26-34)

#### 3. Non-functional Submit Counter Badge
**Problem:** A badge showing the number of submits for a client appeared next to the client input field, but the counter wasn't working correctly.

**Solution:** Removed the counter badge entirely as it wasn't needed. Simplified the ClientSelector layout by removing the flex container and submit count indicator.

**Files Modified:**
- `src/components/mapping/ClientSelector.tsx` (lines ~119-158)

### Current State

✅ Site submits load correctly in the Property Submits tab
✅ Property name displays correctly when viewing a site submit
✅ Client name displays correctly when viewing a site submit
✅ Stage displays correctly when viewing a site submit
✅ All fields are editable in the site submit slideout

### Technical Notes

**Supabase Foreign Key Syntax:**
When a table has multiple foreign keys to the same table, you must use the explicit foreign key constraint name syntax:
```typescript
// Instead of this (ambiguous):
.select('*, related_table(*)')

// Use this (explicit):
.select('*, related_table!foreign_key_constraint_name(*)')
```

The constraint names follow the pattern: `{table}_{column}_fkey`

**ClientSelector Component Pattern:**
The ClientSelector is a controlled component that manages both:
1. An internal `query` state for the search input
2. An external `selectedClient` prop passed by the parent

These need to stay in sync via a useEffect hook that watches the `selectedClient` prop.
