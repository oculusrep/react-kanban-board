# Map Marker Improvements - January 9, 2026

## Overview

This document describes the comprehensive map marker and clustering improvements made in this session, building on the fixes from January 8, 2026.

---

## Changes Summary

| Feature | Files Modified | Description |
|---------|---------------|-------------|
| Restaurant Layer Cluster Config | RestaurantLayer.tsx, MappingPageNew.tsx | Added `clusterConfig` prop for consistent clustering control |
| PropertyLayer Performance | PropertyLayer.tsx | Optimized React effect dependencies for smooth zooming |
| Labels Toggle Always Visible | GoogleMapContainer.tsx | Removed map click handler that hid the labels toggle |
| Advanced Markers Utility | advancedMarkers.ts | New utility for creating teardrop/circle markers with Lucide icons |

---

## 1. Restaurant Layer Cluster Configuration

### Problem

The "No clustering" setting worked for Site Submits and All Properties layers, but Restaurant Sales pins continued to cluster even when "No clustering" was selected.

### Solution

Added `clusterConfig` prop to RestaurantLayer to accept the same clustering configuration as other layers.

### Changes in RestaurantLayer.tsx

```typescript
// Added to interface
interface RestaurantLayerProps {
  // ... existing props
  clusterConfig?: {
    minimumClusterSize: number;
    gridSize: number;
    maxZoom: number;
  };
}

// Check if clustering should be disabled
const clusteringDisabled = clusterConfig && clusterConfig.minimumClusterSize >= 100;

// When disabled, show markers directly instead of using clusterer
if (clusteringDisabled) {
  console.log('🍔 RestaurantLayer: Clustering disabled, showing markers directly');
  if (clusterer) {
    clusterer.clearMarkers();
    setClusterer(null);
  }
  if (isVisible) {
    newMarkers.forEach(marker => marker.setMap(map));
  }
}
```

### Changes in MappingPageNew.tsx

```typescript
<RestaurantLayer
  map={mapInstance}
  isVisible={layerState.restaurants?.isVisible || false}
  clusterConfig={clusterConfig}  // NEW: Pass cluster config
  // ... other props
/>
```

---

## 2. PropertyLayer Performance Optimization

### Problem

Zooming the map was slow and laggy, especially with many property markers visible.

### Root Causes

1. **Object reference comparison in useEffect**: Using `loadingConfig.clusterConfig` object as a dependency caused unnecessary re-renders on every render cycle
2. **Excessive console.log statements**: ~46 debug log statements, including logs that ran for every property

### Solution

#### Extract primitive values for dependencies

```typescript
// Extract cluster config values for dependency comparison (avoid object reference issues)
const clusterMinSize = loadingConfig.clusterConfig?.minimumClusterSize;
const clusterGridSize = loadingConfig.clusterConfig?.gridSize;
const clusterMaxZoom = loadingConfig.clusterConfig?.maxZoom;

// Set up clustering when map is ready or cluster config changes
useEffect(() => {
  if (map) {
    setupClustering();
    if (properties.length > 0) {
      createMarkers();
    }
  }
}, [map, clusterMinSize, clusterGridSize, clusterMaxZoom]);  // Primitives, not object
```

#### Convert to useCallback with proper dependencies

```typescript
const updateMarkerVisibility = React.useCallback(() => {
  if (!map || markers.length === 0) return;

  if (!clusterer) {
    // Handle non-clustered mode
    if (isVisible) {
      markers.forEach(marker => {
        if (marker.getMap() !== map) {
          marker.setMap(map);
        }
      });
    }
    // ...
  }
  // ...
}, [map, markers, clusterer, isVisible, selectedMarker]);
```

---

## 3. Labels Toggle Always Visible

### Problem

The "Labels" checkbox (for toggling Google Places business labels) disappeared when clicking on the map.

### Root Cause

There was a map click listener that called `mapTypeControl.hideLabelsControl()` to hide the labels checkbox when the user clicked on the map.

### Solution

Removed the map click listener that hid the labels control. The Labels toggle is now always visible.

```typescript
// Before: Map click handler hid the labels control
map.addListener('click', () => {
  mapTypeControl.hideLabelsControl();
});

// After: Labels toggle is always visible - no hide on map click
```

---

## 4. Advanced Markers Utility

### New File: `src/components/mapping/utils/advancedMarkers.ts`

A comprehensive utility for creating modern map markers using Google Maps AdvancedMarkerElement API.

### Features

- **Two marker shapes**: Teardrop and Circle (with tail)
- **Lucide icon rendering**: Stroke-based icons that match the React legend components
- **Stage configurations**: All 21 site submit stages with matching colors and icons
- **Property marker variants**: Verified (green), Recent (red), Geocoded (blue), Default (gray)
- **Hover effects**: Scale animation on mouse enter/leave
- **Verified badge**: Small green checkmark badge for verified locations

### Stage Configurations

```typescript
export const STAGE_CONFIGURATIONS: Record<string, StageConfig> = {
  'Pre-Submittal': { color: '#64748b', icon: { /* Edit icon */ }, category: 'pipeline' },
  'Ready to Submit': { color: '#3b82f6', icon: { /* Upload icon */ }, category: 'pipeline' },
  'Submitted-Reviewing': { color: '#2563eb', icon: { /* Eye icon */ }, category: 'pipeline' },
  'Mike to Review': { color: '#f97316', icon: { /* UserCheck icon */ }, category: 'review' },
  'LOI': { color: '#ca8a04', icon: { /* FileText icon */ }, category: 'review' },
  // ... all 21 stages
};
```

### Icon Rendering

Icons are rendered as SVG strokes (not fills) to match Lucide React icons:

```typescript
function renderLucideIcon(iconDef: LucideIconDef, iconSize: number, iconOffset: number): SVGGElement {
  const setStrokeAttrs = (el: SVGElement) => {
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'white');
    el.setAttribute('stroke-width', '2');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
  };
  // Render paths, circles, rects, lines, polygons...
}
```

### Usage Example

```typescript
import { createStageMarkerElement, createPropertyMarkerElement } from './utils/advancedMarkers';

// Create a site submit marker
const element = createStageMarkerElement('LOI', 'teardrop', { verified: true });

// Create a property marker
const propElement = createPropertyMarkerElement('verified', 'circle', 32);
```

---

## Testing Checklist

- [ ] **No Clustering - All Properties**: Select "No clustering", verify all property pins show individually
- [ ] **No Clustering - Restaurant Sales**: Select "No clustering", verify all restaurant pins show individually
- [ ] **No Clustering - Site Submits**: Select "No clustering", verify all site submit pins show individually
- [ ] **Labels Toggle Visible**: Verify the Labels checkbox is always visible (doesn't hide on map click)
- [ ] **Zooming Performance**: Pan and zoom with many markers, verify smooth performance
- [ ] **Cluster Toggle**: Switch between cluster settings, verify markers update correctly

---

## Files Modified

| File | Changes |
|------|---------|
| `src/components/mapping/layers/RestaurantLayer.tsx` | Added `clusterConfig` prop, clustering disable logic, visibility handling |
| `src/components/mapping/layers/PropertyLayer.tsx` | Dependency optimization, useCallback conversion, clustering fixes |
| `src/components/mapping/layers/SiteSubmitLayer.tsx` | Clustering and marker improvements |
| `src/components/mapping/GoogleMapContainer.tsx` | Labels toggle always visible |
| `src/pages/MappingPageNew.tsx` | Pass `clusterConfig` to RestaurantLayer |
| `src/components/mapping/utils/advancedMarkers.ts` | **NEW** - Advanced marker creation utility |

---

## Related Documentation

- [MAP_FIXES_2026_01_08.md](./MAP_FIXES_2026_01_08.md) - Previous session fixes (Site Submit clustering, labels toggle visible)
- [MAP_ID_POI_TOGGLE.md](./MAP_ID_POI_TOGGLE.md) - POI labels toggle with Map ID swapping
- [MARKER_STYLES_REFERENCE.md](./MARKER_STYLES_REFERENCE.md) - Map marker styling guide
