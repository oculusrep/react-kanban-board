# Session Notes: Portal Live Updates & Tab Persistence - February 11, 2026

## Overview

This session focused on fixing several portal UX issues:
1. Live updates for pipeline table when editing in sidebar
2. Preventing portal page refresh when switching browser tabs
3. Stage name mismatch fix for "Under Contract / Contingent"
4. Default layer visibility change

## Features Implemented

### 1. Live Updates for Pipeline Table

Added real-time Supabase subscriptions so edits in the sidebar instantly reflect in the pipeline table without requiring a page refresh.

**Problem:** When editing `available_sqft` or other property fields in the sidebar, the pipeline table didn't update until the page was refreshed.

**Solution:** Added two new real-time subscriptions in `PortalPipelinePage.tsx`:

```typescript
// Real-time subscription for property updates (available_sqft, rent_psf, etc.)
useEffect(() => {
  const channel = supabase.channel('portal-property-changes');
  channel.on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'property',
  }, (payload) => {
    setSiteSubmits((prev) => prev.map((ss) => {
      if (ss.property?.id === payload.new.id) {
        return {
          ...ss,
          property: {
            ...ss.property,
            available_sqft: payload.new.available_sqft,
            building_sqft: payload.new.building_sqft,
            // ... other fields
          },
        };
      }
      return ss;
    }));
  }).subscribe();
  return () => supabase.removeChannel(channel);
}, [selectedClientId, accessibleClients]);
```

**Fields Updated Live:**
- Property: `available_sqft`, `building_sqft`, `acres`, `asking_lease_price`, `asking_purchase_price`, `rent_psf`, `nnn_psf`, `all_in_rent`
- Property Unit: `sqft`, `rent`, `nnn`

**File Modified:** `src/pages/portal/PortalPipelinePage.tsx`

### 2. Portal Tab Persistence (Prevent Page Refresh)

Fixed issue where switching browser tabs caused the portal to reload, losing map position, layer visibility, and other state.

**Problem:** When users switched away from the portal tab and came back, Supabase refreshed the auth token which triggered `onAuthStateChange`. This caused:
- `PortalContext` to re-run `refreshClients()` with `loading: true`
- `PortalRoute` to re-check portal access
- The visible "refresh" effect as components re-mounted

**Solution:** Added refs to track whether data has already been fetched for the current user, preventing unnecessary refetches on auth token refresh:

**PortalContext.tsx:**
```typescript
// Track if we've already done the initial fetch for this user
const hasFetchedRef = useRef<string | null>(null);

useEffect(() => {
  if (!user?.id) {
    hasFetchedRef.current = null;
    setAccessibleClients([]);
    setLoading(false);
    return;
  }

  // If we've already fetched for this user, don't refetch
  if (hasFetchedRef.current === user.id) {
    return;
  }

  hasFetchedRef.current = user.id;
  refreshClients();
}, [user?.id, userRole]);
```

**PortalRoute.tsx:**
```typescript
const hasCheckedRef = useRef<string | null>(null);

useEffect(() => {
  // ... inside checkPortalAccess()
  if (hasCheckedRef.current === user.id) {
    return; // Already checked, skip
  }
  // ... do the check
  hasCheckedRef.current = user.id;
}, [user?.id, userRole, loading]);
```

**Files Modified:**
- `src/contexts/PortalContext.tsx`
- `src/components/PortalRoute.tsx`

### 3. Stage Name Mismatch Fix (Previous Session)

Fixed "Under Contract / Contingent" sites not showing in portal pipeline view.

**Problem:** Code used `'Under Contract/Contingent'` but database had `'Under Contract / Contingent'` (with spaces around slash).

**Solution:** Updated all stage name references to use the correct spacing.

**Files Modified:**
- `src/pages/portal/PortalPipelinePage.tsx`
- `src/pages/portal/PortalMapPage.tsx`

### 4. Default Layer Visibility (Previous Session)

Changed default layer visibility from `true` to `false` in broker mode.

**Problem:** When opening a portal as a broker, all layers were toggled on by default, which was visually busy.

**Solution:** Changed the default value in the layer visibility initialization:

```typescript
useEffect(() => {
  const newVisibility: Record<string, boolean> = { ...layerVisibility };
  displayLayers.forEach(layer => {
    if (newVisibility[layer.id] === undefined) {
      newVisibility[layer.id] = false; // Changed from true
    }
  });
  setLayerVisibility(newVisibility);
}, [displayLayers]);
```

**File Modified:** `src/pages/portal/PortalMapPage.tsx`

### 5. Map Re-centering Fix (Previous Session)

Fixed map re-centering on selected site submit when switching tabs.

**Problem:** When switching between Map and Pipeline tabs, the map would zoom out to user location then zoom back in to the selected pin.

**Solution:** Changed from state-based to ref-based tracking of centered selection:

```typescript
// Track which selection we've already centered on (ref to avoid callback recreation)
const centeredOnSelectionRef = useRef<string | null>(null);

const handleSelectedSiteSubmitPosition = useCallback((lat: number, lng: number, siteSubmitId: string) => {
  if (!mapInstance) return;
  // Only center if we haven't already centered on this exact selection
  if (centeredOnSelectionRef.current === siteSubmitId) {
    return;
  }
  mapInstance.setCenter({ lat, lng });
  mapInstance.setZoom(15);
  centeredOnSelectionRef.current = siteSubmitId;
}, [mapInstance]);
```

**Files Modified:**
- `src/pages/portal/PortalMapPage.tsx`
- `src/components/mapping/layers/SiteSubmitLayer.tsx`

## Technical Details

### Why Refs Instead of State?

Using refs instead of state for tracking "already fetched/centered" status is important because:

1. **No re-renders:** Updating a ref doesn't trigger a re-render, while updating state does
2. **Stable callbacks:** When the tracking variable is in a useCallback dependency array, using state causes callback recreation which can trigger unwanted side effects
3. **Persist across renders:** Refs maintain their value across renders without causing new renders

### Real-time Subscription Architecture

The portal now has three real-time subscriptions:
1. `portal-site-submit-changes` - Status/stage changes
2. `portal-property-changes` - Property field updates
3. `portal-property-unit-changes` - Unit field updates

Each subscription updates the local `siteSubmits` state when changes occur, providing instant feedback in the UI.

## Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/pages/portal/PortalPipelinePage.tsx` | Modified | Added property/unit real-time subscriptions |
| `src/contexts/PortalContext.tsx` | Modified | Added ref to prevent refetch on tab switch |
| `src/components/PortalRoute.tsx` | Modified | Added ref to prevent recheck on tab switch |
| `src/pages/portal/PortalMapPage.tsx` | Modified | Stage name fix, layer default, centering fix |
| `src/components/mapping/layers/SiteSubmitLayer.tsx` | Modified | Centering callback with siteSubmitId |
| `src/pages/portal/PortalContentWrapper.tsx` | New | Keeps Map and Pipeline mounted with CSS display |
| `src/App.tsx` | Modified | Use PortalContentWrapper for portal routes |

## Commits

1. `4545ca00` - Fix map re-centering issue when switching portal tabs
2. `5149a3aa` - Add live updates for pipeline table and prevent portal page refresh on tab switch

## Testing Notes

1. **Live Updates:** Edit `available_sqft` in sidebar, verify pipeline table updates instantly
2. **Tab Switching:** Switch browser tabs, return to portal, verify no loading spinner or page refresh
3. **Map Persistence:** Open a site submit, toggle layers off, switch to Pipeline tab and back, verify layers stay off and map position is preserved
4. **Stage Filtering:** Verify "Under Contract / Contingent" sites appear in "Signed" tab
