# Google Maps AdvancedMarkerElement Migration - Bug Fix Documentation

## Date: January 23, 2026

## Summary

After migrating from the deprecated `google.maps.Marker` to `google.maps.marker.AdvancedMarkerElement`, clicking on restaurant pins caused a `TypeError: X is not a constructor` error. This document explains the root causes and solutions.

---

## The Error

```
TypeError: _0 is not a constructor
    at Dl (index-abb7577a.js:757:5301)
```

This error occurred when:
1. User clicks a restaurant pin on the map
2. Restaurant popup opens
3. Restaurant sidebar (PinDetailsSlideout) attempts to render
4. **CRASH** - constructor error in minified bundle

---

## Root Causes

### 1. ReactQuill Bundling Conflict

**The Problem:** ReactQuill (rich text editor) and Google Maps AdvancedMarkerElement both define global constructors that conflict when bundled together by Vite. Even though ReactQuill was only used for email composition (not restaurants), the static import caused the module to be evaluated at bundle load time.

**Files Affected:**
- `src/components/EmailComposerModal.tsx` - imports ReactQuill
- `src/components/QuillWrapper.tsx` - imports ReactQuill
- `src/components/mapping/slideouts/PinDetailsSlideout.tsx` - imports EmailComposerModal

**The Chain:**
```
PinDetailsSlideout
  → imports EmailComposerModal
    → imports ReactQuill
      → CONFLICTS with google.maps.marker.AdvancedMarkerElement
```

### 2. mapId and styles Conflict

**The Problem:** Google Maps API doesn't support both `mapId` (for cloud-based styling, required for AdvancedMarkerElement) and `styles` (JSON styling) simultaneously. We were setting both.

**File:** `src/components/mapping/GoogleMapContainer.tsx`

```typescript
// BROKEN - can't use both mapId AND styles
const map = new google.maps.Map(mapRef.current, {
  mapId: mapId,
  styles: createMutedPlacesStyle() // This breaks when mapId is set
});
```

### 3. Marker Library Race Condition

**The Problem:** Code was accessing `google.maps.marker.AdvancedMarkerElement` directly instead of using the cached library from `importLibrary('marker')`. This caused race conditions where the marker library wasn't fully loaded yet.

**Files Affected:**
- `src/components/mapping/layers/PropertyLayer.tsx`
- `src/components/mapping/layers/SiteSubmitLayer.tsx`

```typescript
// BROKEN - accessing google.maps.marker directly
const { AdvancedMarkerElement } = google.maps.marker;

// FIXED - using cached library from importLibrary()
const markerLib = getMarkerLibrary();
const { AdvancedMarkerElement } = markerLib;
```

### 4. Heavy Imports for Simple Functionality

**The Problem:** `PinDetailsSlideout.tsx` handled properties, site submits, AND restaurants in one 2700+ line component with 30+ imports. Even for the simple restaurant view (just a chart and table), it loaded:
- Dropbox SDK
- ReactQuill (via EmailComposerModal)
- FileManager with react-dropzone
- Multiple form components
- Contact management components

---

## Solutions Implemented

### Solution 1: Lazy-Load ReactQuill

Changed ReactQuill from static import to dynamic import with React.lazy():

**EmailComposerModal.tsx:**
```typescript
// BEFORE
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

// AFTER
const ReactQuill = lazy(() => import('react-quill').then(module => {
  import('react-quill/dist/quill.snow.css');
  return module;
}));

// Wrap usage in Suspense
<Suspense fallback={<div>Loading editor...</div>}>
  <ReactQuill ... />
</Suspense>
```

**QuillWrapper.tsx:** Same pattern applied.

**Result:** ReactQuill is now code-split into a separate ~238KB chunk that only loads when the email composer is actually opened.

### Solution 2: Fix mapId/styles Conflict

**GoogleMapContainer.tsx:**
```typescript
// Build options object conditionally
const mapOptions: google.maps.MapOptions = {
  center: mapCenter,
  zoom: location ? 12 : 10,
  // ... other options
};

// Only use mapId OR styles, not both
if (mapId) {
  mapOptions.mapId = mapId; // Cloud-based styling
} else {
  mapOptions.styles = createMutedPlacesStyle(); // JSON styling fallback
}

const map = new google.maps.Map(mapRef.current, mapOptions);
```

### Solution 3: Fix Marker Library Race Condition

**advancedMarkers.ts** - Added helper functions:
```typescript
let markerLibrary: google.maps.MarkerLibrary | null = null;

export async function loadMarkerLibrary(): Promise<google.maps.MarkerLibrary> {
  if (markerLibrary) return markerLibrary;
  markerLibrary = await google.maps.importLibrary('marker');
  return markerLibrary;
}

export function getMarkerLibrary(): google.maps.MarkerLibrary {
  if (!markerLibrary) throw new Error('Marker library not loaded');
  return markerLibrary;
}

export function isMarkerLibraryLoaded(): boolean {
  return markerLibrary !== null;
}
```

**PropertyLayer.tsx & SiteSubmitLayer.tsx:**
```typescript
// Use cached library instead of google.maps.marker directly
if (useAdvanced && markerLibraryLoaded && isMarkerLibraryLoaded()) {
  const markerLib = getMarkerLibrary();
  const { AdvancedMarkerElement } = markerLib;
  // ... create marker
}
```

### Solution 4: Create Lightweight RestaurantSlideout

Created a new dedicated component for restaurant display:

**src/components/mapping/slideouts/RestaurantSlideout.tsx**

```typescript
// Only 3 imports needed!
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
```

This component:
- Only handles restaurant display (not properties/site submits)
- Uses Recharts directly for the sales chart
- Has no dependency on Dropbox, ReactQuill, or other heavy libraries
- Is completely isolated from Google Maps bundling conflicts

**MappingPageNew.tsx** - Conditional rendering:
```typescript
{/* Use lightweight RestaurantSlideout for restaurants */}
{selectedPinType === 'restaurant' && isPinDetailsOpen && selectedPinData && (
  <RestaurantSlideout
    restaurant={selectedPinData}
    onClose={handlePinDetailsClose}
  />
)}

{/* Use full PinDetailsSlideout for properties/site submits */}
{selectedPinType !== 'restaurant' && (
  <PinDetailsSlideout ... />
)}
```

### Solution 5: Debounce Restaurant Layer Fetching

Added debounce to prevent multiple API calls during map pan/zoom:

**RestaurantLayer.tsx:**
```typescript
const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
  if (!map || !isVisible) return;

  const boundsChangedListener = map.addListener('idle', () => {
    // Debounce to prevent multiple calls
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    idleTimeoutRef.current = setTimeout(() => {
      fetchRestaurants();
    }, 300);
  });

  return () => {
    google.maps.event.removeListener(boundsChangedListener);
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
  };
}, [map, isVisible, fetchRestaurants]);
```

### Solution 6: Remove Render Loop Causes

Removed inline IIFEs with console.log from component props that were causing unnecessary re-renders:

**MappingPageNew.tsx:**
```typescript
// BEFORE - inline IIFE creates new function reference every render
isVisible={(() => {
  const isVisible = layerState.properties?.isVisible || false;
  console.log('PropertyLayer isVisible:', isVisible);
  return isVisible;
})()}

// AFTER - simple expression
isVisible={layerState.properties?.isVisible || false}
```

---

## Build Output Comparison

**Before fixes:**
- Single chunk: ~4,065 KB
- ReactQuill bundled with main app
- Constructor error on restaurant click

**After fixes:**
- Main chunk: ~3,830 KB
- ReactQuill chunk: ~238 KB (lazy-loaded)
- Quill CSS: ~22 KB (separate)
- Restaurant slideout works without errors

---

## Files Modified

1. `src/components/EmailComposerModal.tsx` - Lazy-load ReactQuill
2. `src/components/QuillWrapper.tsx` - Lazy-load ReactQuill
3. `src/components/mapping/GoogleMapContainer.tsx` - Fix mapId/styles conflict
4. `src/components/mapping/layers/PropertyLayer.tsx` - Use cached marker library
5. `src/components/mapping/layers/SiteSubmitLayer.tsx` - Use cached marker library
6. `src/components/mapping/layers/RestaurantLayer.tsx` - Add fetch debouncing
7. `src/components/mapping/utils/advancedMarkers.ts` - Add library caching helpers
8. `src/pages/MappingPageNew.tsx` - Use RestaurantSlideout, remove render loops
9. **NEW:** `src/components/mapping/slideouts/RestaurantSlideout.tsx` - Lightweight restaurant display

---

## Key Lessons Learned

1. **Bundling conflicts are sneaky** - A library imported anywhere in the dependency chain gets bundled, even if it's not used in a particular code path.

2. **Google Maps AdvancedMarkerElement requires careful setup**:
   - Must use `mapId` for cloud-based styling (no JSON `styles`)
   - Must load marker library via `importLibrary('marker')` before use
   - Cannot access `google.maps.marker` until library is loaded

3. **Component isolation matters** - When one component handles too many concerns (properties + site submits + restaurants), it imports everything needed for all cases, causing bloat and potential conflicts.

4. **Lazy loading is powerful** - React.lazy() with Suspense can prevent problematic modules from being evaluated until actually needed.

5. **Minified errors are hard to debug** - The error `_0 is not a constructor` gave no indication that ReactQuill was the culprit. Testing with un-minified builds and systematic elimination was required.

---

## Testing Checklist

- [ ] Click restaurant pin → Sidebar opens with chart (no errors)
- [ ] Click property pin → Full PinDetailsSlideout opens
- [ ] Open email composer from property → ReactQuill loads
- [ ] Pan/zoom map → No excessive API calls
- [ ] Toggle restaurant layer visibility → Markers appear/disappear correctly
- [ ] Verify build has separate ReactQuill chunk (~238KB)
