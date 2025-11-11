# Bug Fix: Site Submit Dashboard Infinite Refresh Loop

**Date:** November 11, 2025
**Status:** ✅ FIXED
**Issue:** Continuous screen refreshing/twitching when opening site submit slideout from dashboard

## Problem Description

When clicking a site submit from the Site Submit Dashboard report page, the entire screen would continuously refresh in an infinite loop, making the application unusable.

### Symptoms
- Click site submit → slideout opens
- Screen flickers and refreshes continuously
- Console shows repeating cycle of:
  ```
  ✅ Site submit autosaved successfully
  📥 Updated site submit data with metadata
  🔍 Fetching site submits data...
  🔄 Refreshing layer: site_submits
  ✅ Fetched 1000 site submits
  🗺️ LayerManager initializing with layers
  [cycle repeats]
  ```

## Root Cause Analysis

### The Infinite Loop Chain

1. **SiteSubmitDashboardPage** was wrapped in `<LayerManagerProvider>`
2. User opens site submit → **PinDetailsSlideout** renders
3. Autosave triggers after form changes
4. Autosave callback calls **`refreshLayer('site_submits')`** (line 811 in PinDetailsSlideout.tsx)
5. LayerManager state updates → causes provider to re-render
6. Provider re-render causes **entire dashboard page to unmount/remount**
7. Page remount triggers **`useEffect(() => { fetchReportData(); }, [])`** again
8. `fetchReportData()` fetches all 1000 site submits from database
9. New data array → React sees "new" data → passes to slideout
10. Slideout re-initializes with "new" data → autosave triggers
11. Back to step 4 → **infinite loop**

### Key Insight

The **LayerManagerProvider was unnecessary** on the dashboard page. It's only needed on map pages where the layers (PropertyLayer, SiteSubmitLayer, etc.) need to respond to refresh events. The dashboard is a **table view**, not a map view, so it doesn't need layer management.

## Solution

### 1. Remove LayerManagerProvider from Dashboard

**File:** `src/pages/SiteSubmitDashboardPage.tsx`

**Before:**
```typescript
import { LayerManagerProvider } from "../components/mapping/layers/LayerManager";

export default function SiteSubmitDashboardPage() {
  return (
    <LayerManagerProvider>
      <div className="min-h-screen bg-gray-50 p-8">
        {/* dashboard content */}
      </div>
    </LayerManagerProvider>
  );
}
```

**After:**
```typescript
// Removed import - dashboard doesn't need layer management

export default function SiteSubmitDashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* dashboard content */}
    </div>
  );
}
```

### 2. Make PinDetailsSlideout Work Without LayerManager

**File:** `src/components/mapping/slideouts/PinDetailsSlideout.tsx`

**Added safe wrapper for refreshLayer:**

```typescript
// Try to get refreshLayer, but handle cases where LayerManager isn't provided (like dashboard pages)
let refreshLayer: ((layerId: string) => void) | undefined;
try {
  const layerManager = useLayerManager();
  refreshLayer = layerManager?.refreshLayer;
} catch (e) {
  // LayerManager not provided - that's ok for non-map pages
  console.log('📝 LayerManager not available (not on map page)');
}

// Safe wrapper that only calls refreshLayer if it exists
const safeRefreshLayer = (layerId: string) => {
  if (refreshLayer) {
    refreshLayer(layerId);
  }
};
```

**Replaced all refreshLayer calls:**

```typescript
// Before
refreshLayer('site_submits');
refreshLayer('properties');

// After
safeRefreshLayer('site_submits');
safeRefreshLayer('properties');
```

### 3. Neutered onDataUpdate Callbacks (Additional Fix)

While fixing the main issue, we also improved the `onDataUpdate` callbacks to not refetch all data:

```typescript
const handleDataUpdate = useCallback(async () => {
  // Don't refetch all data on every autosave - causes infinite loop
  // The slideout manages its own state. Only refetch if user explicitly requests it.
  console.log('📝 Data updated in slideout (not refetching dashboard data)');
}, []);
```

## Files Modified

1. **src/pages/SiteSubmitDashboardPage.tsx**
   - Removed `LayerManagerProvider` import
   - Removed `<LayerManagerProvider>` wrapper
   - Updated `handleDataUpdate` and `handleSiteSubmitDataUpdate` to not refetch data

2. **src/components/mapping/slideouts/PinDetailsSlideout.tsx**
   - Added safe `refreshLayer` wrapper that handles missing LayerManager
   - Created `safeRefreshLayer()` function
   - Replaced all `refreshLayer()` calls with `safeRefreshLayer()`

## Why This Works

### PinDetailsSlideout Now Works in Two Contexts:

1. **Map Pages (MappingPageNew.tsx)**
   - Has `<LayerManagerProvider>`
   - `useLayerManager()` returns valid context
   - `safeRefreshLayer()` calls actual `refreshLayer()`
   - Map layers update when site submits/properties change

2. **Dashboard Pages (SiteSubmitDashboardPage.tsx)**
   - No `<LayerManagerProvider>`
   - `useLayerManager()` throws or returns undefined
   - `safeRefreshLayer()` safely does nothing
   - Dashboard continues working without infinite loop

## Related Documentation

- [REFACTOR_2025_11_04_TWITCHING_FIX.md](./REFACTOR_2025_11_04_TWITCHING_FIX.md) - Original twitching fix for property slideout
- [DEBUGGING_RULES.md](./DEBUGGING_RULES.md) - Debugging best practices

## Key Learnings

### 1. Context Providers Should Match Component Responsibilities

**Mistake:** Adding `<LayerManagerProvider>` to a non-map page because a child component uses it.

**Better:** Make the child component handle missing context gracefully so it works in multiple contexts.

### 2. Identify Unnecessary Re-renders

When debugging infinite loops:
- Look for parent components wrapping in providers
- Check if provider state changes trigger full remounts
- Verify if the provider is actually needed for the page's functionality

### 3. Console Logs Reveal the Pattern

The repeating pattern in console logs was the key:
```
🗺️ LayerManager initializing with layers
```

This showed the **entire provider was being recreated**, not just re-rendering. That was the smoking gun that led to the solution.

### 4. Safe Wrappers for Optional Dependencies

When a component might be used in different contexts:

```typescript
// ❌ BAD - assumes context always exists
const { someFunction } = useContext();
someFunction();

// ✅ GOOD - handles missing context
let someFunction: Function | undefined;
try {
  const context = useContext();
  someFunction = context?.someFunction;
} catch (e) {
  // Context not provided
}

const safeSomeFunction = () => {
  if (someFunction) {
    someFunction();
  }
};
```

## Testing Checklist

- [x] Open Site Submit Dashboard
- [x] Click on any site submit
- [x] Slideout opens without flickering
- [x] Can edit fields without continuous refreshing
- [x] Autosave works correctly
- [x] Map page still works (with layer refresh)
- [x] Dashboard page works (without layer refresh)
- [x] No console errors
- [x] No infinite render loops

## Deployment

### Git Commits
1. `7edd9d8` - Initial useCallback wrappers (partial fix)
2. `3b37d75` - Neutered onDataUpdate callbacks (additional improvement)
3. `2ae3198` - **Removed LayerManagerProvider from dashboard (actual fix)**

### Build
```bash
npm run build
# ✓ 4030 modules transformed
# dist/assets/index-5dd892aa.js   2,855.91 kB
```

### Deploy
```bash
git push origin main
```

## Success Criteria - ALL MET ✅

- [x] No infinite refresh loop on dashboard
- [x] Site submit slideout opens cleanly
- [x] Autosave works without triggering page refresh
- [x] Map page still refreshes layers correctly
- [x] Dashboard doesn't need layer management
- [x] PinDetailsSlideout works in both contexts
- [x] No console errors
- [x] Performance improved (no unnecessary 1000-row fetches)

## Conclusion

The infinite refresh loop was caused by using `<LayerManagerProvider>` on a non-map page. When the slideout triggered layer refreshes, it caused the entire dashboard to unmount/remount, refetching all data and restarting the cycle.

The solution was to remove the unnecessary provider and make the slideout component handle missing layer management gracefully. This allows the component to work correctly on both map pages (with layer refresh) and dashboard pages (without layer refresh).

**Status: PRODUCTION READY** ✅

**Date Fixed:** November 11, 2025
