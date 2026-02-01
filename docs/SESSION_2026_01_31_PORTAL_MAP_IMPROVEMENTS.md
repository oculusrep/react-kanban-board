# Portal Map Page Improvements - Session Documentation
## January 31, 2026

## Table of Contents
1. [Overview](#overview)
2. [Features Implemented](#features-implemented)
3. [Architecture](#architecture)
4. [Technical Implementation](#technical-implementation)
5. [Files Modified](#files-modified)
6. [Bug Fixes](#bug-fixes)
7. [Z-Index Hierarchy](#z-index-hierarchy)
8. [Testing Guide](#testing-guide)
9. [Related Features](#related-features)

---

## Overview

Implemented comprehensive improvements to the Portal Map Page including proper layout of map controls, working address search with geocoding, and z-index fixes for overlapping UI elements. This session also included fixes from previous sessions for the "View on Map" feature and selected marker visual enhancement.

**Status:** Complete and Production-Ready
**Build:** Successful
**Platform Support:** Desktop, iPad, Mobile

---

## Features Implemented

### 1. Map Controls Layout
- Search bar positioned at top of map (not in nav bar)
- Map/Satellite toggle + GPS + Ruler buttons below search
- Labels checkbox integrated
- Zoom and StreetView controls properly positioned
- Consistent with OVIS Map page layout

### 2. Address Search Functionality
- Working geocoding with pin drop on search results
- Support for addresses, cities, states, and property names
- Google Places autocomplete integration
- Blue circular marker for search results
- Automatic map pan and zoom to result

### 3. View on Map Feature
- "View on Map" button in Pipeline table
- Map automatically centers on selected property
- Selected property gets orange, larger marker
- URL parameter support for deep linking

### 4. Selected Marker Visual Enhancement
- Orange color (#f97316) for selected markers
- 52px size (larger than standard 30px)
- Teardrop shape maintained
- Clear visual distinction from other markers

### 5. Portal Chat Improvements
- Auto-expand threaded replies
- Color-coded user messages
- Activity entries integrated
- Correct initials display

---

## Architecture

### Component Hierarchy
```
PortalMapPage
├── GoogleMapContainer
│   ├── controlsTopOffset prop (pushes controls down)
│   ├── Map/Satellite toggle control
│   ├── GPSControls (GPS + Auto-center + Ruler)
│   └── Native zoom/streetview controls
├── AddressSearchBox
│   ├── Property search (Supabase)
│   ├── Address autocomplete (Google Places)
│   ├── Place/Business search (Google Places)
│   └── Suggestion dropdown
├── SiteSubmitLayer
│   ├── Clustered markers
│   ├── Selected marker highlighting
│   └── Position callbacks
├── SiteSubmitLegend
│   └── Stage toggle controls
└── PortalDetailSidebar
    └── Property details panel
```

### Control Positioning Strategy
```
┌─────────────────────────────────────────────────┐
│ [Search Box]                          z: 10002 │
├─────────────────────────────────────────────────┤
│ [Map/Sat] [GPS] [Ruler]               z: 10000 │
├─────────────────────────────────────────────────┤
│                                                 │
│                                                 │
│                   MAP                           │
│                                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│ [Legend]                                  z: 10│
└─────────────────────────────────────────────────┘
```

---

## Technical Implementation

### 1. controlsTopOffset Prop Pattern

**Purpose:** Push Google Maps controls down when overlay elements (like search box) exist at the top of the map.

**Implementation in GoogleMapContainer:**
```typescript
interface GoogleMapContainerProps {
  height?: string;
  width?: string;
  className?: string;
  onMapLoad?: (map: google.maps.Map) => void;
  onCenterOnLocationReady?: (centerFunction: () => void) => void;
  controlsTopOffset?: number; // Offset in pixels to push map controls down
}

// Applied to custom Map/Satellite control
const createCustomMapTypeControl = (map: google.maps.Map, topOffset: number = 0) => {
  const controlDiv = document.createElement('div');
  controlDiv.style.margin = `${10 + topOffset}px 10px 10px 10px`;
  // ... rest of control creation
};

// Applied to native controls via spacer
if (controlsTopOffset > 0) {
  const nativeControlSpacer = document.createElement('div');
  nativeControlSpacer.style.height = `${controlsTopOffset}px`;
  nativeControlSpacer.style.width = '1px';
  map.controls[google.maps.ControlPosition.LEFT_TOP].insertAt(0, nativeControlSpacer);
}
```

**Implementation in GPSControls:**
```typescript
interface GPSControlsProps {
  isTracking: boolean;
  autoCenterEnabled: boolean;
  onToggleTracking: () => void;
  onToggleAutoCenter: () => void;
  rulerActive: boolean;
  onToggleRuler: () => void;
  topOffset?: number; // Added prop for vertical offset
}

export const GPSControls: React.FC<GPSControlsProps> = ({
  // ... other props
  topOffset = 0
}) => {
  return (
    <div style={{
      position: 'absolute',
      top: `${10 + topOffset}px`, // Apply offset
      left: '152px',
      zIndex: 10000,
      // ...
    }}>
```

**Usage in PortalMapPage:**
```tsx
<GoogleMapContainer
  height="100%"
  onMapLoad={setMapInstance}
  controlsTopOffset={42}  // 42px offset for search box
/>
```

### 2. Address Search with Geocoding

**AddressSearchBox Component Changes:**
```typescript
interface AddressSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (address?: string) => void; // Optional address param added
  onPropertySelect?: (property: PropertyResult) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  isSearching?: boolean;
}

// When suggestion is selected, pass address directly to avoid state timing issues
const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
  if (suggestion.type === 'address' && suggestion.addressData) {
    const address = suggestion.addressData.description;
    onChange(address);
    setTimeout(() => {
      onSearch(address); // Pass address directly instead of relying on state
    }, 50);
  }
  // ... similar for 'place' type
};
```

**PortalMapPage Search Handler:**
```typescript
const handleSearch = async (address?: string) => {
  const addressToSearch = address || searchAddress;
  if (!addressToSearch.trim() || !mapInstance) return;

  setIsSearching(true);
  try {
    // Fixed: Use correct method name and property names
    const result = await geocodingService.geocodeAddress(addressToSearch);

    if (result && 'latitude' in result) {
      // Clear existing search markers
      searchMarkers.forEach(m => m.setMap(null));

      // Create blue circle marker for search result
      const marker = new google.maps.Marker({
        position: { lat: result.latitude, lng: result.longitude },
        map: mapInstance,
        title: addressToSearch,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#3b82f6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });

      setSearchMarkers([marker]);
      mapInstance.panTo({ lat: result.latitude, lng: result.longitude });
      mapInstance.setZoom(14);
    }
  } catch (err) {
    console.error('Search error:', err);
  } finally {
    setIsSearching(false);
  }
};
```

### 3. Selected Marker Visual Enhancement

**File: advancedMarkers.ts**
```typescript
export function createSelectedStageMarkerElement(
  stageName: string,
  shape: MarkerShape,
  verified: boolean = false,
  size: number = 52  // Larger than standard
): HTMLElement {
  const SELECTED_COLOR = '#f97316'; // Orange for selection
  return createMarkerElement({
    color: SELECTED_COLOR,
    shape,
    size,
    icon: stageName,
    verified
  });
}
```

**File: SiteSubmitLayer.tsx**
```typescript
interface SiteSubmitLayerProps {
  map: google.maps.Map;
  isVisible: boolean;
  loadingConfig: SiteSubmitLoadingConfig;
  onPinClick?: (siteSubmit: any) => void;
  onStageCountsUpdate?: (counts: Record<string, number>) => void;
  selectedSiteSubmitId?: string | null;  // New prop
  onSelectedSiteSubmitPosition?: (lat: number, lng: number) => void;  // New prop
}
```

---

## Files Modified

### 1. src/components/mapping/GoogleMapContainer.tsx
**Changes:**
- Added `controlsTopOffset` prop to interface
- Modified `createCustomMapTypeControl` to accept topOffset
- Added native control spacer logic
- Passed topOffset to GPSControls component

### 2. src/components/mapping/GPSTrackingButton.tsx
**Changes:**
- Added `topOffset` prop to GPSControlsProps interface
- Applied topOffset to absolute positioning calculation
- Default value of 0 for backward compatibility

### 3. src/components/mapping/AddressSearchBox.tsx
**Changes:**
- Modified `onSearch` signature to accept optional address parameter
- Updated `handleSelectSuggestion` to pass address directly
- Fixed timing issue with React state updates

### 4. src/pages/portal/PortalMapPage.tsx
**Changes:**
- Added `controlsTopOffset={42}` to GoogleMapContainer
- Changed search container z-index from `z-20` to `style={{ zIndex: 10002 }}`
- Fixed `handleSearch` to use `geocodingService.geocodeAddress()`
- Fixed result property access: `result.latitude`/`result.longitude`
- Added `'latitude' in result` type guard

### 5. src/components/mapping/utils/advancedMarkers.ts
**Changes:**
- Added `createSelectedStageMarkerElement()` function
- Orange color (#f97316) for selected state
- 52px size for visibility

### 6. src/components/mapping/layers/SiteSubmitLayer.tsx
**Changes:**
- Added `selectedSiteSubmitId` prop
- Added `onSelectedSiteSubmitPosition` prop
- Implemented marker highlighting for selected property
- Position callback for "View on Map" centering

---

## Bug Fixes

### Bug 1: geocodingService.geocode is not a function
**Error:** `TypeError: geocodingService.geocode is not a function`

**Root Cause:** Incorrect method name used

**Fix:**
```typescript
// Before (broken)
const result = await geocodingService.geocode(addressToSearch);

// After (fixed)
const result = await geocodingService.geocodeAddress(addressToSearch);
```

### Bug 2: Incorrect Result Property Names
**Error:** Map not centering correctly on search result

**Root Cause:** Wrong property names for coordinates

**Fix:**
```typescript
// Before (broken)
mapInstance.panTo({ lat: result.lat, lng: result.lng });

// After (fixed)
mapInstance.panTo({ lat: result.latitude, lng: result.longitude });
```

### Bug 3: GPS/Ruler Buttons Overlapping Search Dropdown
**Error:** GPS and Ruler buttons appeared on top of search suggestions

**Root Cause:** Tailwind z-20 class (z-index: 20) lower than GPSControls (z-index: 10000)

**Fix:**
```tsx
// Before (broken)
<div className="absolute top-2 left-2 z-20" style={{ width: '400px' }}>

// After (fixed)
<div className="absolute top-2 left-2" style={{ width: '400px', zIndex: 10002 }}>
```

### Bug 4: State Timing Issue with Search
**Error:** Search not triggering when selecting from dropdown

**Root Cause:** React state update async - `searchAddress` not updated when `onSearch()` called

**Fix:**
```typescript
// Before (broken)
onChange(address);
onSearch(); // Uses stale state

// After (fixed)
onChange(address);
setTimeout(() => {
  onSearch(address); // Pass address directly
}, 50);
```

---

## Z-Index Hierarchy

Established z-index hierarchy for Portal Map Page:

| Element | Z-Index | Notes |
|---------|---------|-------|
| Search Container | 10002 | Highest - search must be accessible |
| Search Dropdown | 10001 | Below search input, above controls |
| GPS Controls | 10000 | Map control buttons |
| Admin Menu Dropdown | 10001 | (on MappingPage) |
| Legend | 10 | Bottom-left, low priority |
| Map | default | Base layer |

**Best Practices:**
- Use explicit z-index values via style prop for critical elements
- Avoid relying on Tailwind z-* classes for values above z-50
- Document z-index assignments in code comments
- Keep 1000+ gap between major UI layers

---

## Testing Guide

### Address Search Testing
- [ ] Type "123 Main St, Atlanta, GA" - should show suggestions
- [ ] Select address suggestion - should drop blue pin
- [ ] Map should pan and zoom to location
- [ ] Type property name - should show property suggestions
- [ ] Select property - should pan to property location

### Z-Index Testing
- [ ] Open search dropdown with suggestions visible
- [ ] Verify dropdown appears ABOVE GPS/Ruler buttons
- [ ] Click outside dropdown - should close
- [ ] GPS button should still be clickable when dropdown closed

### View on Map Testing
- [ ] Go to Pipeline tab in Portal
- [ ] Click "View on Map" button for any property
- [ ] Map should center on property
- [ ] Selected property marker should be orange and larger
- [ ] URL should include `?selected=<id>`

### Controls Layout Testing
- [ ] Search bar at top of map (not in header)
- [ ] Map/Satellite buttons below search (42px offset)
- [ ] GPS and Ruler buttons next to Map/Satellite
- [ ] Zoom controls on left side
- [ ] Legend at bottom-left

### Mobile Testing
- [ ] All controls accessible on iPad
- [ ] Search dropdown scrollable if many results
- [ ] Touch targets large enough (48x48px minimum)

---

## Related Features

### Previous Session Work
These features were implemented in earlier sessions but documented here for completeness:

1. **Portal User Setup** - RLS policies for portal access
2. **Chat with Threaded Replies** - PortalChatTab component
3. **Activity Logging** - Chat activity entries
4. **View on Map Button** - Pipeline to Map navigation
5. **Selected Marker Highlighting** - Visual feedback for selection

### Files From Previous Sessions
- `src/components/portal/PortalChatTab.tsx` - Chat functionality
- `src/components/portal/PortalDetailSidebar.tsx` - Property sidebar
- `src/pages/portal/PortalPipelinePage.tsx` - Pipeline with "View on Map"

---

## API Reference

### geocodingService

```typescript
interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress?: string;
  // ... other fields
}

// Correct method to use for address geocoding
geocodingService.geocodeAddress(address: string): Promise<GeocodingResult | null>
```

### GoogleMapContainer Props

```typescript
interface GoogleMapContainerProps {
  height?: string;              // Default: '100%'
  width?: string;               // Default: '100%'
  className?: string;           // Additional CSS classes
  onMapLoad?: (map: google.maps.Map) => void;  // Callback when map ready
  onCenterOnLocationReady?: (centerFunction: () => void) => void;
  controlsTopOffset?: number;   // Pixels to push controls down (default: 0)
}
```

### GPSControlsProps

```typescript
interface GPSControlsProps {
  isTracking: boolean;
  autoCenterEnabled: boolean;
  onToggleTracking: () => void;
  onToggleAutoCenter: () => void;
  rulerActive: boolean;
  onToggleRuler: () => void;
  topOffset?: number;           // Pixels from top (default: 0)
}
```

### AddressSearchBoxProps

```typescript
interface AddressSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (address?: string) => void;  // Address passed directly for timing
  onPropertySelect?: (property: PropertyResult) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  isSearching?: boolean;
}
```

---

## Console Debugging

### Check Z-Index Values
```javascript
// Check search container z-index
const search = document.querySelector('[style*="z-index: 10002"]');
console.log('Search z-index:', getComputedStyle(search).zIndex);

// Check GPS controls z-index
const gps = document.querySelector('[data-gps-react-controls]');
console.log('GPS z-index:', getComputedStyle(gps).zIndex);
```

### Debug Geocoding
```javascript
// Test geocoding directly
import { geocodingService } from './services/geocodingService';
const result = await geocodingService.geocodeAddress('Atlanta, GA');
console.log('Geocode result:', result);
```

---

## Summary of Session Changes

### Layout Changes
- Search bar positioned inside map at top
- 42px vertical offset for map controls
- Consistent with OVIS Map page layout

### Functionality Fixes
- Address search now properly geocodes and drops pins
- Search dropdown appears above control buttons
- State timing issue resolved for dropdown selection

### Code Patterns Established
- `controlsTopOffset` prop pattern for pushing controls down
- Direct parameter passing for async state scenarios
- Explicit z-index values for critical overlay elements

---

## Deployment Notes

### Pre-Deployment Checklist
- [x] TypeScript compilation successful
- [x] Address search working with pin drop
- [x] Z-index layering correct
- [x] Controls layout matches OVIS Map
- [x] Mobile touch targets appropriate
- [x] No console errors

### Production Considerations
- geocodingService requires Google Maps API key
- Search suggestions need network connectivity
- Z-index values work across browsers

---

**Session Date:** January 31, 2026
**Status:** Complete
**Build:** Successful
**Last Updated:** January 31, 2026
