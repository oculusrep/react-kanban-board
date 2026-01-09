# POI Labels Toggle with Map ID Swapping

## Overview

When using `AdvancedMarkerElement` for Google Maps markers, the map requires a **Map ID** which uses cloud-based styling. This means the traditional JSON `styles` property for hiding/showing POIs (Points of Interest) no longer works at runtime.

The solution is to create two separate Map IDs with different cloud-based styles and swap between them by recreating the map.

## Why Map Recreation is Required

- `AdvancedMarkerElement` requires a Map ID to function
- Map IDs use cloud-based styling configured in Google Cloud Console
- Cloud-based styling ignores the runtime `styles` property
- **The `mapId` property cannot be changed dynamically** via `map.setOptions()`
- The only way to change the Map ID is to recreate the entire map instance

## Google Cloud Console Setup

### Step 1: Create Two Map Styles

1. Go to [Google Cloud Console > Maps > Map Styles](https://console.cloud.google.com/google/maps-apis/studio/styles)
2. Create first style: **"OVIS MAP POI ON"**
   - Leave all POI settings at default (visible)
   - Save the style
3. Create second style: **"OVIS MAP No POI"**
   - Under "Points of interest" → Toggle OFF visibility
   - Under "Transit" → Toggle OFF visibility (optional)
   - Save the style

### Step 2: Create Two Map IDs

1. Go to [Google Cloud Console > Maps > Map IDs](https://console.cloud.google.com/google/maps-apis/studio/maps)
2. Create first Map ID:
   - Name: "OVIS MAP POI ON"
   - Map type: JavaScript
   - Associated style: Select "OVIS MAP POI ON"
3. Create second Map ID:
   - Name: "OVIS MAP No POI"
   - Map type: JavaScript
   - Associated style: Select "OVIS MAP No POI"

### Step 3: Configure Environment Variables

Add both Map IDs to `.env`:

```env
# Google Map IDs for AdvancedMarkerElement (cloud-based styling)
# POI ON - shows business/place labels
VITE_GOOGLE_MAP_ID=your_poi_on_map_id_here

# POI OFF - hides business/place labels
VITE_GOOGLE_MAP_ID_NO_POI=your_poi_off_map_id_here
```

## Implementation Details

### GoogleMapContainer.tsx

The labels toggle handler recreates the map with the appropriate Map ID:

```typescript
const handleLabelsToggle = (fromCheckbox = false) => {
  // Determine new labels state...

  const newMapId = newLabelsVisible ? mapIdWithPoi : mapIdNoPoi;

  // Save current map state
  const currentCenter = map.getCenter();
  const currentZoom = map.getZoom();
  const mapContainer = map.getDiv();

  // Create new map with different Map ID
  const newMap = new google.maps.Map(mapContainer, {
    center: currentCenter,
    zoom: currentZoom,
    mapTypeId: currentMapType,
    mapId: newMapId,
    // ... other options
  });

  // Notify parent that map instance has changed
  if (onMapRecreated) {
    onMapRecreated(newMap);
  }
};
```

### Map Recreation Callback

When the map is recreated:
1. The map reference is updated in the parent component
2. Custom controls are re-added to the new map
3. The `onMapLoad` callback notifies layers to recreate their markers

```typescript
const handleMapRecreated = (newMap: google.maps.Map) => {
  mapInstanceRef.current = newMap;

  // Re-add the map type control to the new map
  const newMapTypeControl = createCustomMapTypeControl(newMap, setLabelsVisible, handleMapRecreated);
  newMap.controls[google.maps.ControlPosition.TOP_LEFT].push(newMapTypeControl.controlDiv);

  // Notify parent component so layers can update
  if (onMapLoad) {
    onMapLoad(newMap);
  }
};
```

### Layer Updates

When layers (SiteSubmitLayer, PropertyLayer) receive a new map via props:
- They detect the map reference has changed
- They remove markers from the old map
- They create new markers on the new map

## Important Notes

1. **Map ID is immutable**: Once a map is created with a Map ID, it cannot be changed. The entire map must be recreated.

2. **State preservation**: When recreating the map, save and restore:
   - Center position
   - Zoom level
   - Map type (roadmap/satellite/hybrid/terrain)

3. **Markers must be recreated**: AdvancedMarkerElement instances are tied to their map. When the map is recreated, all markers must also be recreated.

4. **Fallback for legacy mode**: If Map IDs are not configured, the code falls back to JSON styles (but this won't work with AdvancedMarkerElement).

## Troubleshooting

### POIs still visible after toggle
- Verify you saved the map style in Google Cloud Console
- Check the style is associated with the correct Map ID
- Ensure the environment variables are correct
- Check browser console for the Map ID being used

### Markers disappear after toggle
- Ensure layers are listening for map prop changes
- Verify `onMapLoad` is being called after map recreation
- Check that markers are being recreated with the new map instance

## Related Files

- `src/components/mapping/GoogleMapContainer.tsx` - Map initialization and labels toggle
- `src/components/mapping/layers/SiteSubmitLayer.tsx` - Site submit markers
- `src/components/mapping/layers/PropertyLayer.tsx` - Property markers
- `.env` - Map ID configuration
