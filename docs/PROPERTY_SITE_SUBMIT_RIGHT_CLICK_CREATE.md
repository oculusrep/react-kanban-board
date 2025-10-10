# Property Site Submit - Right-Click Create Feature

## Session Date: 2025-10-10

### Feature Implementation

Added ability to create a site submit directly from a property pin via right-click context menu.

#### 1. Added "Create Site Submit" to Property Context Menu

**Files Modified:**
- `src/components/mapping/PropertyContextMenu.tsx`
  - Added `onCreateSiteSubmit` prop to interface
  - Added "Create Site Submit" menu item with blue styling
  - Positioned between "Copy Coordinates" and "Delete Property"

#### 2. Implemented Context Menu Handler in MappingPageNew

**Files Modified:**
- `src/pages/MappingPageNew.tsx`
  - Created `handleCreateSiteSubmitFromContextMenu` function
  - Fetches property data and opens property slideout
  - Sets `pinDetailsInitialTab` state to 'submits' (note: not fully working yet)
  - Triggers `handleCreateSiteSubmitForProperty` after 150ms delay
  - Connected handler to PropertyContextMenu component

**Added State:**
```typescript
const [pinDetailsInitialTab, setPinDetailsInitialTab] = useState<'property' | 'submit' | 'location' | 'files' | 'contacts' | 'submits' | undefined>(undefined);
```

#### 3. Fixed Foreign Key Syntax in Site Submit Save

**Problem:** When creating a new site submit, the property name would disappear after saving.

**Root Cause:** Foreign key relationships in the post-save fetch query used incorrect syntax.

**Solution:** Updated the fetch query in `PinDetailsSlideout.tsx` (lines ~1000-1010) to use explicit foreign key constraint names:
```typescript
.select(`
  *,
  properties!site_submit_property_id_fkey(*),
  clients!site_submit_client_id_fkey(client_name),
  property_unit:property_unit_id (property_unit_name),
  stages!site_submit_stage_id_fkey(id, name)
`)
```

**Data Normalization:** Added mapping to normalize the fetched data structure:
```typescript
finalData = {
  ...completeSiteSubmit,
  property: completeSiteSubmit.properties,
  client: completeSiteSubmit.clients,
  submit_stage: completeSiteSubmit.stages
};
```

#### 4. Fixed Stage Dropdown Not Editable for New Submits

**Problem:** When creating a new site submit, the stage dropdown was locked to "Pursuing Ownership" and wouldn't change.

**Root Cause:** `handleStageChange` was returning early for new submits (no ID yet), preventing local state updates.

**Solution:** Modified `handleStageChange` in `PinDetailsSlideout.tsx` (lines ~795-840) to:
- Check if site submit is new (`!siteSubmit?.id || siteSubmit._isNew`)
- For new submits: only update local state (`setCurrentStageId`)
- For existing submits: update database immediately and then update local state

#### 5. Fixed Stage Reverting After Database Operations

**Problem:** After saving or updating a site submit, the stage would revert back to "Pursuing Ownership".

**Root Cause:** A `useEffect` that initializes form data was running on every data prop change, resetting the stage.

**Solution:** Added tracking state to prevent re-initialization of the same site submit:
```typescript
const [lastLoadedSiteSubmitId, setLastLoadedSiteSubmitId] = useState<string | null>(null);
```

Modified the useEffect (lines ~662-680) to only reinitialize when:
- It's a new site submit (`_isNew` flag), OR
- It's a different site submit (different ID)

#### 6. Fixed Client/Assignment Persisting Between New Submits

**Problem:** When creating a new site submit after creating a previous one, the client and assignment fields would still show data from the last submit.

**Root Cause:** The initialization logic wasn't clearing state when no client/assignment was present on the incoming data.

**Solution:** Added explicit state clearing in the initialization useEffect:
```typescript
// If no client
setSelectedClient(null);

// If no assignment
setSelectedAssignment(null);
```

#### 7. Fixed Submits List Not Refreshing After Create

**Files Modified:**
- `src/pages/MappingPageNew.tsx`
  - Added `submitsRefreshTrigger` prop to main PinDetailsSlideout
  - Modified `handlePinDataUpdate` to increment refresh trigger when site submit is updated
  - Trigger increments on any update where `selectedPinType === 'site_submit'` or `updatedData.property_id` exists

#### 8. Fixed ClientSelector Not Showing Selected Client Name

**Problem:** When opening an existing site submit, the client dropdown was empty even though the client data was loaded.

**Root Cause:** ClientSelector component manages internal `query` state for the input, but wasn't syncing it with the external `selectedClient` prop.

**Solution:** Added useEffect in `ClientSelector.tsx` to sync query with selectedClient:
```typescript
useEffect(() => {
  if (selectedClient) {
    setQuery(selectedClient.client_name);
  } else if (query && !selectedClient) {
    setQuery('');
  }
}, [selectedClient]);
```

**Also:** Removed the non-functional submit counter badge that displayed next to the client field.

### Current State

✅ Right-click context menu shows "Create Site Submit" option
✅ Clicking option opens property slideout
✅ Create site submit slideout opens automatically on top
✅ Property name persists after saving new submit
✅ Stage dropdown is editable for new submits
✅ Stage persists correctly after save/update operations
✅ Client and assignment fields clear properly for new submits
✅ Submits list refreshes after creating new submit
✅ Client name displays correctly in dropdown for existing submits

⚠️ Property slideout does NOT open to Submits tab (opens to Property tab instead)
  - Implementation attempted with `initialTab` prop and useEffect sync
  - State is being set correctly but tab doesn't switch
  - Needs further investigation - likely timing issue with React state batching

### Known Issues

1. **Initial Tab Not Switching to Submits**
   - When creating site submit from right-click, property slideout opens on Property tab instead of Submits tab
   - `initialTab` prop is passed correctly
   - useEffect monitors both `initialTab` and `isOpen` but doesn't trigger tab switch
   - Workaround: User can manually click Submits tab
   - **Investigation needed:** May need to force tab switch after component fully mounts

### Technical Notes

**Foreign Key Constraint Names:**
When using Supabase PostgREST, if a table has multiple foreign keys to the same table, you must use explicit constraint names:
- Pattern: `{target_table}!{source_table}_{column}_fkey`
- Example: `properties!site_submit_property_id_fkey`

**React State Batching:**
Multiple `setState` calls in the same function are batched by React, which can cause issues with useEffect dependencies. Setting `initialTab` before `isOpen` in separate statements doesn't guarantee they execute in separate render cycles.

**Site Submit Create Flow:**
1. User right-clicks property pin
2. `handleCreateSiteSubmitFromContextMenu` fetches property data
3. Sets `pinDetailsInitialTab` to 'submits'
4. Opens property slideout with property data
5. After 150ms delay, calls `handleCreateSiteSubmitForProperty`
6. That function creates blank site submit object with `_isNew: true` flag
7. Opens site submit details slideout with blank data
8. User fills in fields and saves
9. Database insert happens with proper foreign key relationships
10. Fresh data is fetched with normalized structure
11. Parent component is notified via `onDataUpdate`
12. Submits list refreshes via `submitsRefreshTrigger` increment

### Files Modified Summary

1. `src/components/mapping/PropertyContextMenu.tsx` - Added menu option and handler prop
2. `src/pages/MappingPageNew.tsx` - Added state, handler, and wiring
3. `src/components/mapping/slideouts/PinDetailsSlideout.tsx` - Multiple fixes for data sync, stage handling, and initialization
4. `src/components/mapping/ClientSelector.tsx` - Added query sync and removed counter badge

### Future Improvements

1. **Fix Initial Tab Issue**
   - Consider using `useLayoutEffect` instead of `useEffect` for synchronous DOM updates
   - Or trigger tab change in `onOpen` callback after component mounts
   - Or add a ref-based imperative method to change tabs

2. **Reduce setTimeout Delay**
   - Currently using 150ms delay before opening create submit slideout
   - Could use callback-based approach instead of setTimeout
   - Or use state synchronization to detect when property slideout is fully rendered

3. **Optimize Re-renders**
   - Many useEffect dependencies could be optimized
   - Consider using `useCallback` and `useMemo` for derived values
   - Could reduce unnecessary re-initializations

4. **Better Error Handling**
   - Add user-friendly error messages for database failures
   - Add loading states during foreign key data fetches
   - Handle network errors gracefully
