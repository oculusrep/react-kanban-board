# Property Pin Selection System Documentation

## Overview
This document describes the implementation of the property pin selection system that ensures only the currently active property (open in the sidebar) displays as a large orange pin, and that this pin remains visible even when other pins are clustered during zoom operations.

## Problem Statement
The original issue was that:
1. Multiple properties would show as orange pins instead of just the currently selected one
2. When zooming out, the selected orange pin would get "swallowed up" by the clustering system and become invisible

## Solution Architecture

### Core Components
- **PropertyLayer.tsx** (`/src/components/mapping/layers/PropertyLayer.tsx`)
- **MappingPageNew.tsx** (`/src/pages/MappingPageNew.tsx`)

### Key State Management

#### 1. Selection State (`MappingPageNew.tsx`)
```typescript
const [selectedPinData, setSelectedPinData] = useState<any>(null);
const [selectedPinType, setSelectedPinType] = useState<'property' | 'site_submit' | null>(null);

// Derived selectedPropertyId
selectedPropertyId={selectedPinType === 'property' && selectedPinData ? selectedPinData.id : null}
```

#### 2. Marker State (`PropertyLayer.tsx`)
```typescript
const [markers, setMarkers] = useState<google.maps.Marker[]>([]);
const [selectedMarker, setSelectedMarker] = useState<google.maps.Marker | null>(null);
const [clusterer, setClusterer] = useState<MarkerClusterer | null>(null);
```

## Implementation Details

### 1. Marker Creation and Selection Tracking

When creating markers, the system identifies and stores the selected marker:

```typescript
const createMarkers = () => {
  let newSelectedMarker: google.maps.Marker | null = null;

  const newMarkers = properties.map(property => {
    const isSelected = selectedPropertyId === property.id;

    // Create marker with appropriate icon
    if (isSelected) {
      markerIcon = ModernMarkerStyles.property.selected(); // Orange
    } else {
      // Other icon types (blue, green, etc.)
    }

    const marker = new google.maps.Marker({...});

    // Store reference to selected marker
    if (isSelected) {
      newSelectedMarker = marker;
    }

    return marker;
  });

  setMarkers(newMarkers);
  setSelectedMarker(newSelectedMarker);
};
```

### 2. Clustering Exclusion System

The visibility update function separates selected markers from clustered markers:

```typescript
const updateMarkerVisibility = () => {
  clusterer.clearMarkers();

  if (isVisible) {
    // Separate selected marker from regular markers
    const regularMarkers = markers.filter(marker => marker !== selectedMarker);

    // Add regular markers to clusterer (can be clustered)
    clusterer.addMarkers(regularMarkers);

    // Show selected marker directly on map (never clustered)
    if (selectedMarker) {
      selectedMarker.setMap(map);
    }
  }
};
```

### 3. Proper Cleanup

Critical cleanup ensures old markers don't persist:

```typescript
const createMarkers = () => {
  // Clear existing markers from map and clusterer
  if (clusterer) {
    clusterer.clearMarkers();
  }
  markers.forEach(marker => marker.setMap(null));

  // Create new markers...
};
```

## Key Dependencies and Triggers

### Marker Recreation Triggers
The `createMarkers()` function is called when any of these change:
```typescript
useEffect(() => {
  if (properties.length > 0) {
    createMarkers();
  }
}, [properties, map, recentlyCreatedIds, verifyingPropertyId, selectedPropertyId]);
```

**Critical**: `selectedPropertyId` in the dependency array ensures markers are recreated when selection changes.

### Clustering Setup
Clustering is initialized once when the map is ready:
```typescript
useEffect(() => {
  if (map) {
    setupClustering();
  }
}, [map]);
```

## Flow Diagram

```
User clicks property pin
        ↓
handlePinClick() updates selectedPinData & selectedPinType
        ↓
selectedPropertyId is derived from these values
        ↓
PropertyLayer useEffect triggers due to selectedPropertyId change
        ↓
createMarkers() called with new selectedPropertyId
        ↓
New markers created, selectedMarker stored
        ↓
updateMarkerVisibility() separates selected from regular markers
        ↓
Regular markers → clusterer (can be grouped)
Selected marker → directly on map (always visible)
```

## Debugging and Troubleshooting

### Key Debug Logs
When troubleshooting, look for these console logs:

```typescript
// Selection state
console.log('🎯 PropertyLayer selectedPropertyId calculated:', {
  selectedPinType,
  selectedPinDataId: selectedPinData?.id,
  resultingId: id
});

// Marker creation
console.log('🎯 Current selectedPropertyId:', selectedPropertyId);
console.log('🧡 Property is SELECTED:', property.id, property.property_name);

// Visibility updates
console.log(`👁️ PropertyLayer: Showing ${regularMarkers.length} clustered markers + ${selectedMarker ? 1 : 0} selected marker`);
console.log('🧡 Selected marker shown individually (not clustered)');
```

### Common Issues and Solutions

#### Issue: Multiple orange pins visible
**Cause**: Markers not being properly cleaned up
**Solution**: Ensure `clusterer.clearMarkers()` and `marker.setMap(null)` are called before creating new markers

#### Issue: Orange pin disappears when zooming out
**Cause**: Selected marker being added to clusterer
**Solution**: Verify that `selectedMarker` is excluded from `clusterer.addMarkers()`

#### Issue: Selection not updating when clicking different properties
**Cause**: `selectedPropertyId` not in useEffect dependency array
**Solution**: Ensure `selectedPropertyId` is in the `createMarkers` useEffect dependencies

## Testing Checklist

To verify the system is working correctly:

1. ✅ Click property → Only that property shows orange
2. ✅ Click different property → Previous returns to normal, new shows orange
3. ✅ Zoom out → Orange pin stays visible (not clustered)
4. ✅ Zoom in → Orange pin remains orange and visible
5. ✅ Close sidebar → Orange pin returns to normal color
6. ✅ No leftover orange pins from previous selections

## File Locations

### Main Implementation Files
- `/src/components/mapping/layers/PropertyLayer.tsx` - Core marker management
- `/src/pages/MappingPageNew.tsx` - Selection state management

### Related Files
- `/src/components/mapping/utils/modernMarkers.ts` - Marker styling
- `/src/components/mapping/slideouts/PinDetailsSlideout.tsx` - Sidebar component

## Dependencies
- `@googlemaps/markerclusterer` - For clustering functionality
- `@googlemaps/js-api-loader` - Google Maps API
- Google Maps JavaScript API

## Future Considerations

### Potential Improvements
1. **Performance**: Consider marker pooling for very large datasets
2. **UX**: Add animation when switching between selected properties
3. **Accessibility**: Ensure keyboard navigation works with selection system

### Breaking Changes to Watch For
1. **Google Maps API updates**: Changes to Marker or MarkerClusterer APIs
2. **State management changes**: Modifications to selectedPinData/selectedPinType logic
3. **Clustering library updates**: Changes to MarkerClusterer behavior

## Common Data Issues

### Issue: Property Type Dropdown Not Working After Search Selection

#### Problem Description
When selecting a property from the AddressSearchBox search results, the property type dropdown in the PinDetailsSlideout appears empty or doesn't show the current property type value. Additionally, other fields like `rent_psf` and `nnn_psf` may not display correctly.

#### Root Cause
The `AddressSearchBox` component's property search query was not fetching all the necessary fields from the database. Specifically, it was missing:
- `property_record_type_id` - Required for the property type dropdown
- `rent_psf` - Rent per square foot
- `nnn_psf` - NNN per square foot
- `acres`, `building_sqft`, `available_sqft` - Other property details
- `property_notes` - Property notes

#### Solution
Update the property search query in `AddressSearchBox.tsx` to include all necessary fields:

```typescript
// File: /src/components/mapping/AddressSearchBox.tsx
// In the searchProperties function:

const { data, error } = await supabase
  .from('property')
  .select(`
    id,
    property_name,
    address,
    city,
    state,
    zip,
    latitude,
    longitude,
    verified_latitude,
    verified_longitude,
    property_record_type_id,
    rent_psf,
    nnn_psf,
    acres,
    building_sqft,
    available_sqft,
    property_notes
  `)
```

#### Key Takeaway
**Always ensure that search/fetch queries include ALL fields that downstream components need.** If a slideout, modal, or detail view needs certain fields, make sure they're fetched in the initial query. Missing fields will result in incomplete data being passed through the component tree.

#### How to Identify This Issue
Look for console logs showing:
1. Property data being passed with some fields: `🏢 Calling onPropertySelect with: {id: '...', property_name: '...', ...}`
2. But then the slideout rendering without expected field values
3. Dropdowns or inputs showing empty/null values when they should have data

#### Related Files
- `/src/components/mapping/AddressSearchBox.tsx` - Property search queries
- `/src/components/mapping/slideouts/PinDetailsSlideout.tsx` - Property detail display
- `/src/components/mapping/layers/PropertyLayer.tsx` - Reference for complete field list

#### Prevention
When adding new fields to property displays:
1. Check what fields are needed in the UI component
2. Verify that ALL data sources (search, layer fetch, direct queries) include those fields
3. Common data sources to check:
   - `AddressSearchBox` property search
   - `PropertyLayer` property fetch
   - Any direct supabase queries for properties
   - Context menu property data fetching

## Version History
- **v1.1** (2025-09-30): Added documentation for property type dropdown data issue
- **v1.0** (2025-09-30): Initial implementation with selection tracking and clustering exclusion