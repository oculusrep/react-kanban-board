# Site Submit Dashboard and Map Fixes - November 14, 2025

## Summary
This session addressed multiple critical issues with the Site Submit Dashboard and Map functionality, including slideout positioning, data fetching, assignment creation errors, and client filtering behavior.

## Issues Fixed

### 1. Assignment Creation Foreign Key Error

**Problem**: When Arty Santos tried to create a new assignment from the site submit pin details on the map, he received a foreign key constraint violation error:
```
insert or update on table "assignment" violates foreign key constraint "assignment_owner_id_fkey"
```

**Root Cause**:
- The `assignment.owner_id` field has a foreign key constraint referencing `user.id` (the primary key in the user table)
- The code was setting `owner_id` to `user?.id` from `supabase.auth.getUser()`, which returns the **auth.users** ID
- These are different IDs - the auth user ID vs the user table ID

**Solution**: [src/components/AddAssignmentModal.tsx:107-124](../src/components/AddAssignmentModal.tsx#L107-L124)
```typescript
// Get current user for owner_id
const { data: { user: authUser } } = await supabase.auth.getUser();

// Look up the user table record by auth_user_id to get the user.id
let userId: string | null = null;
if (authUser?.id) {
  const { data: userRecord } = await supabase
    .from('user')
    .select('id')
    .eq('auth_user_id', authUser.id)
    .single();

  userId = userRecord?.id || null;
}

const insertData: any = {
  // ...
  owner_id: userId,  // Correct - uses user table ID
  // ...
};
```

### 2. Undefined User ID Errors (400 Bad Request)

**Problem**: Multiple 400 Bad Request errors when querying the user table with undefined IDs:
```
id=eq.undefined
```

**Root Cause**:
- The `UserByIdDisplay` component didn't validate the `userId` before making queries
- New site submits or assignments might not have `created_by_id` or `updated_by_id` populated immediately
- Some code was passing undefined values as strings ("undefined") to database queries

**Solutions**:

1. **UserByIdDisplay Component** - [src/components/shared/UserByIdDisplay.tsx:17-21](../src/components/shared/UserByIdDisplay.tsx#L17-L21)
```typescript
// Don't fetch if userId is null, undefined, or invalid
if (!userId || userId === 'undefined' || userId === 'null') {
  setUserName(null);
  return;
}
```

2. **PinDetailsSlideout User Queries** - [src/components/mapping/slideouts/PinDetailsSlideout.tsx:683](../src/components/mapping/slideouts/PinDetailsSlideout.tsx#L683)
```typescript
if (record.created_by_id && record.created_by_id !== 'undefined' && record.created_by_id !== 'null') {
  // Make query...
}
```

### 3. Dropbox Mapping 406 Errors

**Problem**: 406 Not Acceptable errors when querying the `dropbox_mapping` table due to missing RLS policies.

**Solutions**:

1. **Improved Error Handling** - [src/hooks/useDropboxFiles.ts:95-108](../src/hooks/useDropboxFiles.ts#L95-L108)
```typescript
// Suppress 406 errors (RLS policy issues) and PGRST116 (not found) errors
if (mappingError) {
  const is406Error = mappingError.message?.includes('406') ||
                    mappingError.code === '406' ||
                    mappingError.hint?.includes('Row-level security');
  const is404Error = mappingError.code === 'PGRST116';

  if (!is406Error && !is404Error) {
    console.log('🔍 Dropbox mapping error:', mappingError);
  } else {
    console.log('🔍 No mapping found or access denied (suppressing error)');
  }
}
```

2. **RLS Policies Migration** - [supabase/migrations/20251114_add_dropbox_mapping_rls.sql](../supabase/migrations/20251114_add_dropbox_mapping_rls.sql)
   - **Status**: Created but needs manual application via Supabase SQL Editor
   - Enables RLS and creates policies for authenticated users to SELECT, INSERT, UPDATE, DELETE

### 4. Site Submit Markers Not Clearing When Client Filter Cleared

**Problem**: When clearing the client filter (either by deleting text or clicking X), random site submit markers remained on the map instead of being cleared.

**Root Causes**:
1. When `selectedClient` became null, the loading config switched from `'client-filtered'` to `'static-100'` mode, loading 100 site submits
2. In `client-filtered` mode with null `clientId`, the query had no filter applied, returning ALL site submits
3. The `createMarkers` function returned early when there were 0 site submits, before clearing existing markers

**Solutions**:

1. **Always Use Client-Filtered Mode** - [src/pages/MappingPageNew.tsx:1350-1355](../src/pages/MappingPageNew.tsx#L1350-L1355)
```typescript
const siteSubmitLoadingConfig: SiteSubmitLoadingConfig = useMemo(() => ({
  mode: 'client-filtered',  // Always use client-filtered, not static-100
  clientId: selectedClient?.id || null,
  visibleStages: visibleStages,
  clusterConfig: clusterConfig
}), [selectedClient, visibleStages, clusterConfig]);
```

2. **Return Empty Results for Null Client** - [src/components/mapping/layers/SiteSubmitLayer.tsx:258-271](../src/components/mapping/layers/SiteSubmitLayer.tsx#L258-L271)
```typescript
case 'client-filtered':
  if (loadingConfig.clientId) {
    console.log(`🔍 Filtering by client: ${loadingConfig.clientId}`);
    query = query.eq('client_id', loadingConfig.clientId);
  } else {
    // No client selected - return empty results instead of all site submits
    console.log('🚫 No client selected, skipping site submit fetch (will return 0 results)');
    setSiteSubmits([]);
    onSiteSubmitsLoaded?.(0);
    onStageCountsUpdate?.({});
    setIsLoading(false);
    return; // Exit early
  }
  break;
```

3. **Always Call createMarkers** - [src/components/mapping/layers/SiteSubmitLayer.tsx:712-718](../src/components/mapping/layers/SiteSubmitLayer.tsx#L712-L718)
```typescript
useEffect(() => {
  // Always call createMarkers, even when siteSubmits is empty
  // This ensures markers are cleared when filtering results in 0 site submits
  if (map) {
    createMarkers();
  }
}, [siteSubmits, map, loadingConfig.visibleStages, verifyingSiteSubmitId, verifyingSiteSubmit]);
```

4. **Clear Markers Before Early Return** - [src/components/mapping/layers/SiteSubmitLayer.tsx:449-462](../src/components/mapping/layers/SiteSubmitLayer.tsx#L449-L462)
```typescript
console.log('🗺️ Creating markers for site submits...');
console.log('📊 Site submits to render:', siteSubmitsToRender.length);

// Clear existing markers (always, even if there are no new markers to create)
markers.forEach(marker => marker.setMap(null));

// If no site submits to render, set empty markers array and return
if (!siteSubmitsToRender.length) {
  console.log('🧹 No site submits to render, clearing all markers');
  setMarkers([]);
  return;
}
```

5. **Don't Toggle Layer Off When Client Cleared** - [src/pages/MappingPageNew.tsx:1426-1432](../src/pages/MappingPageNew.tsx#L1426-L1432)
```typescript
} else {
  // When client is cleared, keep layer visible but it will show 0 results
  // The SiteSubmitLayer will handle showing no markers when clientId is null
  console.log('🎯 Client cleared, layer will show 0 site submits');
  setIsLegendExpanded(false);
  console.log('📊 Client cleared, collapsing legend');
}
```

### 5. Added Clear Button (X) to Client Search

**Problem**: No easy way to clear the client filter - users had to manually delete all text.

**Solution**: [src/components/mapping/ClientSelector.tsx:158-170](../src/components/mapping/ClientSelector.tsx#L158-L170)
```typescript
{/* Clear button - only show when there's a selected client or query */}
{(selectedClient || query) && (
  <button
    type="button"
    onClick={handleClearSelection}
    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
    aria-label="Clear selection"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
)}
```

### 6. Assignment Deletion 409 Conflict Error

**Problem**: HTTP 409 Conflict when deleting assignments due to foreign key constraints from `site_submit` table.

**Solution**: [src/pages/AssignmentDetailsPage.tsx](../src/pages/AssignmentDetailsPage.tsx)
```typescript
const confirmDelete = async () => {
  // First, set assignment_id to NULL for all related site_submits
  const { error: siteSubmitError } = await supabase
    .from('site_submit')
    .update({ assignment_id: null })
    .eq('assignment_id', actualAssignmentId);

  if (siteSubmitError) {
    console.error('Error updating site submits:', siteSubmitError);
    throw siteSubmitError;
  }

  // Then delete the assignment
  const { error } = await supabase
    .from('assignment')
    .delete()
    .eq('id', actualAssignmentId);
};
```

## Files Modified

### Components
- `src/components/AddAssignmentModal.tsx` - Fixed assignment owner_id mapping
- `src/components/shared/UserByIdDisplay.tsx` - Added undefined user ID validation
- `src/components/mapping/ClientSelector.tsx` - Added clear button, logging
- `src/components/mapping/layers/SiteSubmitLayer.tsx` - Fixed marker clearing logic
- `src/components/mapping/slideouts/PinDetailsSlideout.tsx` - Enhanced user query validation

### Pages
- `src/pages/MappingPageNew.tsx` - Fixed client filter behavior, loading config
- `src/pages/AssignmentDetailsPage.tsx` - Fixed assignment deletion

### Hooks
- `src/hooks/useDropboxFiles.ts` - Improved 406 error handling

### Database Migrations
- `supabase/migrations/20251114_add_dropbox_mapping_rls.sql` - RLS policies for dropbox_mapping
- `supabase/migrations/20251114_add_email_tracking_to_site_submit.sql` - Email tracking fields

## Testing Instructions

### Test 1: Assignment Creation
1. Navigate to map with site submit pin details
2. Create a new assignment from the site submit
3. **Expected**: Assignment creates successfully without foreign key errors
4. **Verify**: Console shows user lookup and correct user.id is used

### Test 2: Client Filter Clearing
1. Navigate to map
2. Search and select a client (e.g., "FS8 - Nisreen")
3. **Verify**: Site submit markers appear for that client
4. Click the X button to clear the client
5. **Expected**: All site submit markers disappear from map
6. **Verify Console Logs**:
   ```
   🧹 ClientSelector: Clearing client selection
   🔄 Client selection changed: null
   🎯 Client cleared, layer will show 0 site submits
   🚫 No client selected, skipping site submit fetch (will return 0 results)
   🗺️ Creating markers for site submits...
   📊 Site submits to render: 0
   🧹 No site submits to render, clearing all markers
   ```

### Test 3: Manual Text Deletion
1. Navigate to map
2. Search and select a client
3. Manually delete all text from the search box
4. **Expected**: All site submit markers disappear
5. **Verify Console Logs**: Same as Test 2

### Test 4: Assignment Deletion
1. Navigate to an assignment details page with linked site submits
2. Delete the assignment
3. **Expected**: Assignment deletes successfully
4. **Verify**: Related site submits have assignment_id set to null

## Manual Steps Required

### Apply Dropbox Mapping RLS Policies
1. Open Supabase SQL Editor
2. Execute the SQL from `supabase/migrations/20251114_add_dropbox_mapping_rls.sql`
3. Verify policies are created with:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'dropbox_mapping';
   ```

## Console Logging Added

For debugging and verification, the following console logs were added:

- `🧹 ClientSelector: Clearing client selection` - Clear button clicked
- `🧹 ClientSelector: Input cleared, deselecting client` - Text manually deleted
- `🔄 Client selection changed: {client_name}` - Client selection changed
- `🎯 Client cleared, layer will show 0 site submits` - Client cleared
- `🚫 No client selected, skipping site submit fetch (will return 0 results)` - Empty fetch
- `🗺️ Creating markers for site submits...` - Marker creation started
- `📊 Site submits to render: {count}` - Number of markers to create
- `🧹 No site submits to render, clearing all markers` - Clearing all markers

## Related Documentation

- [Site Submit Email Notification Documentation](./site-submit-email-notifications.md)
- Database schema: [database-schema.ts](../database-schema.ts)

## Commits

All changes were committed across multiple commits:
1. `afea867` - fix: resolve assignment creation and user query errors
2. `12b54f4` - fix: clear site submit markers when client filter returns 0 results
3. `944be74` - fix: prevent showing site submits when no client is selected
4. `73ea9b4` - feat: add clear button (X) to client search box
5. `e5a7a22` - fix: keep site submit layer visible when clearing client filter
