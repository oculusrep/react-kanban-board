# Property Map Verification System

## Overview

This document describes the property map verification feature that allows users to verify and adjust property locations directly on the map. The system matches the existing site submit verification workflow and provides two convenient entry points for accessing the verification interface.

## Implementation Date
November 18, 2025

## Features

### 1. Verify Location Button (LocationSection)
- **Location**: Property Details page → Location section
- **Appearance**: Purple button with map pin icon
- **Behavior**: Opens map in new window with verification mode enabled
- **Button Text**: "Verify Location"

### 2. Map Icon Button (PropertyHeader)
- **Location**: Property Details page → Header (to the left of Delete button)
- **Appearance**: Purple circular button with map pin icon
- **Behavior**: Opens map in new window with verification mode enabled
- **Tooltip**: "Open on map"

## User Flow

### Starting Verification

1. User opens a property detail page
2. User clicks either:
   - "Verify Location" button in the Location section, OR
   - Map icon button in the property header
3. New browser window opens to: `/mapping?property={propertyId}&verify=true`

### Map Verification Process

When the map opens in verification mode:

1. **Auto-zoom**: Map centers on property location at zoom level 18
2. **Layer Auto-enable**: Properties layer automatically enables if not already visible
3. **Pin Visibility**: Property pin becomes visible and draggable
4. **Sidebar Opens**: Property details sidebar opens to the "Details" tab
5. **User Guidance**: Toast notification appears: "Zoomed to {property_name} - Drag the pin to verify location"

### Adjusting Location

1. User drags the property pin to the correct location
2. On drag end, the system:
   - Captures the new coordinates
   - Performs reverse geocoding to get the address at that location
   - Updates the property record in the database
   - Refreshes the property layer to show the updated position

## Technical Architecture

### Components Modified

#### 1. LocationSection.tsx
**File**: `src/components/property/LocationSection.tsx`

**Changes**:
- Removed "Future Feature" tooltip
- Made `handleVerifyLocation` functional
- Opens map URL: `/mapping?property=${property.id}&verify=true`
- Styled button as purple (matching site submit style)
- Removed unused state variables (`showVerifyTooltip`)

**Code**:
```typescript
const handleVerifyLocation = () => {
  if (!property.id) return;
  const mapUrl = `/mapping?property=${property.id}&verify=true`;
  window.open(mapUrl, '_blank');
};
```

#### 2. PropertyHeader.tsx
**File**: `src/components/property/PropertyHeader.tsx`

**Changes**:
- Added `onOpenMap` prop to interface
- Added map icon button rendering logic
- Positioned button to the left of Delete button

**Code**:
```typescript
{onOpenMap && property.id && (
  <button
    onClick={onOpenMap}
    className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors"
    title="Open on map"
  >
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  </button>
)}
```

#### 3. PropertyDetailScreen.tsx
**File**: `src/components/property/PropertyDetailScreen.tsx`

**Changes**:
- Added `handleOpenMap` function
- Passed `onOpenMap` prop to PropertyHeader component

**Code**:
```typescript
const handleOpenMap = () => {
  if (!propertyId) return;
  const mapUrl = `/mapping?property=${propertyId}&verify=true`;
  window.open(mapUrl, '_blank');
};
```

#### 4. MappingPageNew.tsx
**File**: `src/pages/MappingPageNew.tsx` (Lines 280-332)

**Changes**:
- Added new `useEffect` hook to handle property verification URL parameters
- Fetches full property data from database
- Implements coordinate priority system
- Auto-enables properties layer
- Opens property details sidebar

**Code**:
```typescript
useEffect(() => {
  const params = new URLSearchParams(location.search);
  const propertyId = params.get('property');
  const verifyMode = params.get('verify') === 'true';

  if (propertyId && verifyMode && mapInstance) {
    console.log('📍 Property verification requested:', propertyId);

    // Fetch the FULL property data
    supabase
      .from('property')
      .select('*')
      .eq('id', propertyId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          console.error('Failed to fetch property:', error);
          showToast('Property not found', { type: 'error' });
          return;
        }

        // Determine coordinates to use (priority: verified coords > regular coords)
        const lat = data.verified_latitude ?? data.latitude;
        const lng = data.verified_longitude ?? data.longitude;

        if (lat && lng) {
          // Zoom to the location
          mapInstance.setCenter({ lat, lng });
          mapInstance.setZoom(18);

          // Enable properties layer if not already visible
          if (!layerState.properties?.isVisible) {
            console.log('🎯 Verify mode: auto-enabling properties layer');
            toggleLayer('properties');
          }

          // Set verifying state so PropertyLayer makes marker draggable
          setVerifyingPropertyId(propertyId);

          // Open the pin details slideout
          setSelectedPinData(data);
          setSelectedPinType('property');
          setPinDetailsInitialTab('details');
          setIsPinDetailsOpen(true);

          showToast(`Zoomed to ${data.property_name || data.address || 'Property'} - Drag the pin to verify location`, { type: 'success' });
        } else {
          showToast('This property has no coordinates. Please add coordinates first.', { type: 'info' });
        }
      });
  }
}, [location.search, mapInstance, layerState.properties?.isVisible, toggleLayer, setVerifyingPropertyId]);
```

### Existing Infrastructure Leveraged

#### PropertyLayer.tsx
**File**: `src/components/mapping/layers/PropertyLayer.tsx`

The PropertyLayer already had full support for location verification (no changes needed):

**Props**:
- `verifyingPropertyId`: ID of property being verified
- `onLocationVerified`: Callback function when location is updated

**Marker Behavior** (Line 543):
```typescript
const marker = new google.maps.Marker({
  position: { lat: coords.lat, lng: coords.lng },
  map: null,
  title: property.property_name || property.address,
  icon: markerIcon,
  draggable: isBeingVerified, // ← Marker becomes draggable when verifying
  zIndex: isSelected ? 3000 : (isBeingVerified ? 2000 : 100)
});
```

**Drag Event Handlers** (Lines 551-565):
```typescript
if (isBeingVerified && onLocationVerified) {
  marker.addListener('dragstart', () => {
    touchStartTime = 0;
    wasLongPress = false;
  });

  marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
    if (event.latLng) {
      const newLat = event.latLng.lat();
      const newLng = event.latLng.lng();
      console.log('📍 Property location verified:', { propertyId: property.id, lat: newLat, lng: newLng });
      onLocationVerified(property.id, newLat, newLng);
    }
  });
}
```

#### Location Save Handler
**File**: `src/pages/MappingPageNew.tsx` (Lines 1149-1203)

The `handleLocationVerified` function already existed and handles:
- Reverse geocoding to get address at new location
- Database update with verified coordinates
- Address field updates (if reverse geocoding succeeds)
- Layer refresh
- Verification mode completion

**Code**:
```typescript
const handleLocationVerified = async (propertyId: string, lat: number, lng: number) => {
  console.log('📍 Saving verified location for property:', propertyId, { lat, lng });

  try {
    // Perform reverse geocoding
    const reverseGeocodeResult = await geocodingService.reverseGeocode(lat, lng);

    let updateData: any = {
      verified_latitude: lat,
      verified_longitude: lng
    };

    // If reverse geocoding succeeded, update address fields too
    if ('latitude' in reverseGeocodeResult) {
      updateData = {
        ...updateData,
        address: reverseGeocodeResult.street_address || reverseGeocodeResult.formatted_address,
        city: reverseGeocodeResult.city,
        state: reverseGeocodeResult.state,
        zip: reverseGeocodeResult.zip,
      };
    }

    // Update the property
    const { error } = await supabase
      .from('property')
      .update(updateData)
      .eq('id', propertyId);

    if (error) throw error;

    // Complete verification
    setVerifyingPropertyId(null);
    refreshLayer('properties');
  } catch (error) {
    console.error('❌ Failed to save verified location:', error);
  }
};
```

## Database Schema

### Fields Updated

When a property location is verified, the following fields are updated in the `property` table:

**Always Updated**:
- `verified_latitude` (NUMERIC, nullable) - User-verified GPS latitude
- `verified_longitude` (NUMERIC, nullable) - User-verified GPS longitude

**Conditionally Updated** (if reverse geocoding succeeds):
- `address` (TEXT) - Street address from reverse geocoding
- `city` (TEXT) - City from reverse geocoding
- `state` (TEXT) - State from reverse geocoding
- `zip` (TEXT) - ZIP code from reverse geocoding

### Coordinate Priority System

The system uses a priority-based approach for displaying coordinates:

1. **Verified coordinates** (`verified_latitude`, `verified_longitude`) - Highest priority
2. **Regular coordinates** (`latitude`, `longitude`) - Fallback

**Implementation**:
```typescript
const lat = property.verified_latitude ?? property.latitude;
const lng = property.verified_longitude ?? property.longitude;
```

This ensures that manually verified coordinates always take precedence over automatically geocoded ones.

## URL Parameters

### Verification Mode URL
```
/mapping?property={propertyId}&verify=true
```

**Parameters**:
- `property`: UUID of the property to verify
- `verify`: Boolean flag to enable verification mode (`true`)

**Example**:
```
/mapping?property=123e4567-e89b-12d3-a456-426614174000&verify=true
```

## Visual Design

### Button Styling

**Verify Location Button (LocationSection)**:
- Background: Purple (`bg-purple-600`)
- Hover: Darker purple (`hover:bg-purple-700`)
- Text: White
- Size: Extra small (`text-xs`)
- Icon: Map pin (3x3 pixels)
- Disabled state: Gray background with cursor-not-allowed

**Map Icon Button (PropertyHeader)**:
- Background: Purple (`bg-purple-600`)
- Hover: Darker purple (`hover:bg-purple-700`)
- Shape: Circular (10x10 pixels)
- Icon: Map pin (5x5 pixels)
- Tooltip: "Open on map"

### Map Pin States

**Verification Mode**:
- Pin uses special "verifying" icon style
- Pin is draggable
- Higher z-index (2000) to stay above other markers
- Excluded from clustering to remain always visible

**After Verification**:
- Pin shows "verified" icon style (green)
- Pin returns to non-draggable state
- Normal z-index

## Error Handling

### Missing Property ID
```typescript
if (!property.id) return;
```
Button is disabled if property doesn't have an ID.

### Property Not Found
```typescript
if (error || !data) {
  showToast('Property not found', { type: 'error' });
  return;
}
```
Shows error toast if property cannot be fetched from database.

### No Coordinates
```typescript
if (!lat || !lng) {
  showToast('This property has no coordinates. Please add coordinates first.', { type: 'info' });
}
```
Shows info toast if property has no coordinates to display on map.

### Save Failure
```typescript
catch (error) {
  console.error('❌ Failed to save verified location:', error);
  // Keep verification mode active so user can try again
}
```
Logs error and keeps verification mode active to allow retry.

## Comparison with Site Submit Verification

The property verification system was intentionally designed to match the site submit verification workflow:

| Feature | Site Submit | Property |
|---------|-------------|----------|
| **Entry Point** | Site Submit Details page | Property Details page |
| **Button Color** | Purple | Purple |
| **URL Pattern** | `/mapping?site-submit={id}&verify=true` | `/mapping?property={id}&verify=true` |
| **Zoom Level** | 18 | 18 |
| **Auto-enable Layer** | Yes (site_submits) | Yes (properties) |
| **Sidebar Tab** | Location | Details |
| **Draggable Pin** | Yes | Yes |
| **Reverse Geocoding** | Optional | Yes |
| **Save Fields** | `verified_latitude`, `verified_longitude` | `verified_latitude`, `verified_longitude`, address fields |
| **Toast Notification** | Yes | Yes |

## Benefits

### User Experience
- **Two convenient entry points** for accessing verification
- **Visual consistency** with existing site submit verification
- **Clear guidance** via toast notifications
- **Immediate feedback** when dragging pins
- **Automatic address updates** via reverse geocoding

### Data Quality
- **User-verified coordinates** stored separately from auto-geocoded ones
- **Priority system** ensures verified coordinates are always used
- **Address synchronization** keeps location data consistent
- **Audit trail** via verified coordinate fields

### Developer Experience
- **Consistent patterns** across verification features
- **Reusable components** and handlers
- **Well-documented** code with clear logging
- **Error handling** at all levels
- **Backward compatible** with existing code

## Testing Checklist

- [ ] Verify Location button opens map in new window
- [ ] Map icon button opens map in new window
- [ ] Map centers on property at zoom 18
- [ ] Properties layer auto-enables if hidden
- [ ] Property pin is visible and draggable
- [ ] Property sidebar opens to Details tab
- [ ] Toast notification displays correctly
- [ ] Dragging pin updates coordinates in database
- [ ] Reverse geocoding updates address fields
- [ ] Verified coordinates take priority over regular ones
- [ ] Error handling works for missing/invalid properties
- [ ] Buttons are disabled when property has no ID
- [ ] Works on both desktop and mobile devices

## Future Enhancements

### Potential Improvements
1. **Undo/Redo**: Allow users to revert location changes
2. **History Tracking**: Show history of location changes with timestamps
3. **Bulk Verification**: Verify multiple properties in sequence
4. **Verification Status Badge**: Visual indicator on properties with verified coords
5. **Confidence Score**: Display geocoding confidence level
6. **Street View Integration**: Show Google Street View for visual verification
7. **Nearby Properties**: Show nearby properties during verification
8. **Verification Notes**: Allow users to add notes about why location was adjusted

## Related Documentation

- [Site Submit Autosave and Verification Improvements](./docs/site-submit-autosave-and-verification-improvements.md)
- [Site Submit Coordinate Management](./docs/site-submit-coordinate-management.md)
- [Property Pin Selection System](./PROPERTY_PIN_SELECTION_SYSTEM.md)
- [Mapping System Quick Start](./MAPPING_SYSTEM_QUICK_START.md)

## Commit Information

**Commit Hash**: `0b30e37`
**Branch**: `main`
**Date**: November 18, 2025

**Files Changed**:
- `src/components/property/LocationSection.tsx`
- `src/components/property/PropertyHeader.tsx`
- `src/components/property/PropertyDetailScreen.tsx`
- `src/pages/MappingPageNew.tsx`

**Lines Added**: 91
**Lines Removed**: 33
