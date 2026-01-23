# PropertyLayer Performance Improvements - January 23, 2026

## Overview

This document describes the comprehensive performance improvements made to the PropertyLayer component, addressing issues with slow loading, map flickering, and overall user experience when viewing property pins on the map.

---

## Problem Statement

After migrating to Google Maps AdvancedMarkerElement API, the "All Properties" layer experienced several performance issues:

1. **Slow initial loading** - Property pins took 10+ seconds to appear when toggling the layer on
2. **Map flickering** - When a property was open in the sidebar, panning the map caused constant refreshing and re-centering
3. **Excessive API calls** - Every map pan triggered a new Supabase fetch
4. **Marker recreation overhead** - All markers were destroyed and recreated on every viewport change
5. **Inconsistent pin colors** - Verified locations showed green pins while others were blue, causing visual confusion

---

## Changes Summary

| Feature | Commits | Description |
|---------|---------|-------------|
| AdvancedMarkerElement Migration | `37e4208` | Full rewrite to support new marker API with viewport-based loading |
| Marker Flickering Fix | `61fd755` | Incremental marker updates instead of full recreation |
| IndexedDB Caching | `d71d9ce` | Geographic tile-based caching with 1-hour TTL |
| Pin Size Reduction | `53f9677` | Reduced from 44px to 32px for better visual density |
| Unified Pin Colors | `bb1f416`, `a615701` | All regular pins are blue; removed green for verified |
| Fast Marker Loading | `c65387d` | Pre-load marker library; trigger fetch on visibility |

---

## 1. AdvancedMarkerElement Migration

### What Changed

Completely rewrote PropertyLayer.tsx to:
- Support Google Maps AdvancedMarkerElement API (replacing legacy `google.maps.Marker`)
- Implement viewport-based loading (virtualization) instead of loading all properties at once
- Add fallback to legacy markers if AdvancedMarkerElement isn't available

### Key Code Changes

```typescript
// Type union to support both Marker and AdvancedMarkerElement
type MarkerType = google.maps.Marker | google.maps.marker.AdvancedMarkerElement;

// Marker creation with AdvancedMarkerElement
if (useAdvanced && markerLibraryLoaded) {
  const { AdvancedMarkerElement } = google.maps.marker;
  const content = createPropertyMarkerElement(
    markerType,
    markerStyle.shape,
    isSelected ? 40 : 32,
    coords.verified  // Pass verified status to show checkmark badge
  );

  marker = new AdvancedMarkerElement({
    map: null,
    position: { lat: coords.lat, lng: coords.lng },
    content,
    title: property.property_name || property.address,
    zIndex: isSelected ? 3000 : (isBeingVerified ? 2000 : 100),
    gmpDraggable: isBeingVerified
  });
}
```

### Loading Config

The layer now accepts a `loadingConfig` prop:

```typescript
interface PropertyLoadingConfig {
  mode: 'static-1000' | 'static-2000' | 'static-all' | 'viewport-based';
  clusterConfig?: {
    minimumClusterSize: number;
    gridSize: number;
    maxZoom: number;
  };
  markerStyle?: {
    shape: MarkerShape;  // 'teardrop' | 'circle'
    useAdvancedMarkers: boolean;
  };
}
```

Default configuration in MappingPageNew.tsx:
```typescript
const propertyLoadingConfig: PropertyLoadingConfig = {
  mode: 'viewport-based',  // Changed from 'static-all'
  clusterConfig: clusterConfig,
  markerStyle: {
    shape: 'teardrop',
    useAdvancedMarkers: true
  }
};
```

---

## 2. Marker Flickering Fix

### Problem

When a property was open in the sidebar and the user panned the map:
- All markers were destroyed and recreated on every viewport change
- The selected marker's position was recalculated, causing the map to re-center
- This created a jarring "flickering" effect

### Solution

Implemented **incremental marker updates**:
- Track existing markers by property ID in a Map: `markersByPropertyId`
- Reuse markers that already exist when viewport changes
- Only create new markers for properties entering the viewport
- Never remove the selected marker, even if it's outside the viewport
- Only recreate a marker if its selection state changes

### Key Code

```typescript
const markersByPropertyId = useRef<Map<string, MarkerType>>(new Map());

const createMarkers = async (forceRecreateAll: boolean = false) => {
  // Build set of current property IDs
  const currentPropertyIds = new Set(filteredProperties.map(p => p.id));

  // Check if selected property changed
  const selectionChanged = previousSelectedId.current !== selectedPropertyId;

  // Remove markers for properties no longer in viewport (but keep selected marker)
  markersByPropertyId.current.forEach((marker, propertyId) => {
    if (!currentPropertyIds.has(propertyId)) {
      // Don't remove the selected marker even if it's outside viewport
      if (propertyId !== selectedPropertyId) {
        setMarkerMap(marker, null);
        markersToRemove.push(propertyId);
      }
    }
  });

  // For each property, reuse existing marker or create new one
  for (const property of filteredProperties) {
    const existingMarker = markersByPropertyId.current.get(property.id);
    const needsRecreate = !existingMarker ||
      (isSelected && selectionChanged) ||
      verifyingPropertyId === property.id;

    if (existingMarker && !needsRecreate) {
      // Reuse existing marker
      allMarkers.push(existingMarker);
      reused++;
    } else {
      // Create new marker
      const marker = createPropertyMarker(property, useAdvanced);
      markersByPropertyId.current.set(property.id, marker);
      created++;
    }
  }
};
```

---

## 3. IndexedDB Caching

### New File: `src/utils/propertyCache.ts`

Implemented a geographic tile-based caching system using IndexedDB for persistent storage across browser sessions.

### Features

- **Geographic tiles**: Properties are cached by ~0.5 degree tiles (approximately 10-20 miles)
- **1-hour TTL**: Cached data expires after 1 hour
- **Incremental loading**: Only fetch tiles that aren't already cached
- **Cache invalidation**: Property updates automatically update the cache

### Cache Structure

```typescript
interface CachedProperty {
  id: string;
  data: any;
  tileKey: string;  // e.g., "-197,60" for lat/lng tile
  cachedAt: number;
}

interface TileMetadata {
  tileKey: string;
  fetchedAt: number;
  propertyCount: number;
}
```

### API

```typescript
export const propertyCache = {
  getTileKeysForBounds,      // Get tile keys for a bounding box
  isTileCached,              // Check if a tile is cached and not expired
  getPropertiesFromCache,    // Get cached properties for tiles
  cacheProperties,           // Store properties in cache
  updateCachedProperty,      // Update a single property (for real-time updates)
  removeCachedProperty,      // Remove a property from cache
  clearExpiredCache,         // Clear expired entries
  clearAllCache,             // Clear entire cache
  getCacheStats,             // Get cache statistics
  CACHE_TTL_MS,             // 1 hour
  TILE_SIZE                 // 0.5 degrees
};
```

### Viewport Padding

Expanded fetch bounds by 50% (up from 20%) to pre-fetch surrounding areas:

```typescript
// Expand bounds by 50% to pre-fetch surrounding area
const latPadding = (ne.lat() - sw.lat()) * 0.5;
const lngPadding = (ne.lng() - sw.lng()) * 0.5;
```

### Cache Invalidation in useProperty.ts

When a property is updated or created, the cache is automatically updated:

```typescript
const updateProperty = useCallback(async (updates: Partial<Property>) => {
  // ... update logic ...

  // Update the cache with the new property data
  if (data) {
    propertyCache.updateCachedProperty(data);
  }
}, [propertyId]);
```

---

## 4. Pin Size Reduction

### Change

Reduced marker sizes for better visual density:
- **Regular pins**: 44px → 32px
- **Selected pins**: 52px → 40px

### Code

```typescript
const content = createPropertyMarkerElement(
  markerType,
  markerStyle.shape,
  isSelected ? 40 : 32,  // Reduced sizes
  coords.verified
);
```

---

## 5. Unified Pin Colors

### Problem

Previously:
- Verified locations showed **green** pins
- Non-verified locations showed **blue** pins
- This caused confusion about what the colors meant

### Solution

All regular property pins now use **blue** (#007AFF). Color differentiation is reserved for:
- **Orange** (#FF9500): Selected or verifying location
- **Red** (#FF3B30): Recently created in this session
- **Blue** (#007AFF): All other properties (verified or not)

Verified locations still show a small **checkmark badge** to indicate verification status.

### Code in advancedMarkers.ts

```typescript
export function createPropertyMarkerElement(
  type: 'verified' | 'recent' | 'geocoded' | 'default' | 'selected' | 'verifying',
  shape: MarkerShape,
  size: number = 44,
  isVerifiedLocation: boolean = false  // Show checkmark badge if verified
): HTMLElement {
  const colors: Record<string, string> = {
    verified: '#007AFF',  // Blue (same as default)
    recent: '#FF3B30',    // Red for recently created
    geocoded: '#007AFF',  // Blue
    default: '#007AFF',   // Blue (consistent for all)
    selected: '#FF9500',  // Orange for selected
    verifying: '#FF9500'  // Orange for verifying
  };
  // ...
}
```

### Legacy Marker Fallback

Also updated to use blue for all regular pins:

```typescript
} else {
  // All regular pins use geocoded (blue) - no green for verified
  markerIcon = ModernMarkerStyles.property.geocoded();
}
```

---

## 6. Fast Marker Loading

### Problem

When toggling the property layer on:
- Pins took 10+ seconds to appear, OR
- User had to move the map to trigger loading

### Root Causes

1. Marker library wasn't pre-loaded - waited until first marker creation
2. Property fetch only triggered on map idle event, not on visibility change

### Solution

#### Pre-load Marker Library on Mount

```typescript
// Pre-load marker library on mount (don't wait until marker creation)
useEffect(() => {
  if (markerStyle.useAdvancedMarkers && !markerLibraryLoaded) {
    loadMarkerLibrary()
      .then(() => {
        console.log('✅ Marker library pre-loaded');
        setMarkerLibraryLoaded(true);
      })
      .catch(err => {
        console.error('Failed to pre-load marker library:', err);
      });
  }
}, [markerStyle.useAdvancedMarkers]);
```

#### Trigger Fetch on Visibility Change

```typescript
// Load properties based on mode - also trigger when isVisible becomes true
useEffect(() => {
  if (!map) return;

  // Only fetch when layer is visible (or on first mount to pre-load)
  if (!isVisible && properties.length > 0) return;

  if (loadingConfig.mode === 'viewport-based') {
    fetchPropertiesInViewport(true);
  } else {
    fetchAllProperties();
  }
}, [map, loadingConfig.mode, propertyRefreshTrigger, isVisible]);  // Added isVisible
```

---

## Files Modified

| File | Changes |
|------|---------|
| `src/components/mapping/layers/PropertyLayer.tsx` | Complete rewrite: AdvancedMarkerElement support, viewport-based loading, incremental updates, cache integration, visibility-triggered loading |
| `src/components/mapping/utils/advancedMarkers.ts` | Updated `createPropertyMarkerElement` to accept `isVerifiedLocation`, unified colors |
| `src/utils/propertyCache.ts` | **NEW** - IndexedDB caching system |
| `src/hooks/useProperty.ts` | Added cache invalidation on update/create |
| `src/pages/MappingPageNew.tsx` | Changed from `static-all` to `viewport-based` mode |

---

## Performance Results

| Metric | Before | After |
|--------|--------|-------|
| Initial layer toggle | 10+ seconds | < 1 second |
| Panning with property open | Flickering/re-centering | Smooth, no flicker |
| Repeat visits | Full API fetch | Cache hit (instant) |
| Marker creation on pan | All recreated | Only new ones created |

---

## Console Logging

The layer provides informative console logs:

```
✅ Marker library pre-loaded
💾 Cache hit: 847 properties from 12 cached tiles
🌐 Fetched: 203 properties from Supabase
💾 Cached 203 properties in 4 tiles
📍 Total: 1050 properties (12 tiles cached, 4 tiles fetched)
📍 Markers: +15 created, 835 reused, -3 removed
```

---

## Related Documentation

- [MAP_ID_POI_TOGGLE.md](./MAP_ID_POI_TOGGLE.md) - POI labels toggle with Map ID swapping
- [MAP_MARKER_IMPROVEMENTS_2026_01_09.md](./MAP_MARKER_IMPROVEMENTS_2026_01_09.md) - Previous marker improvements
- [MARKER_STYLES_REFERENCE.md](./MARKER_STYLES_REFERENCE.md) - Map marker styling guide
