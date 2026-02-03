# Distance Measurement Feature Guide

This guide explains how to use the new distance measurement capabilities in the mapping system.

## Overview

The distance measurement feature provides three main capabilities:

1. **Interactive Point-to-Point Measurement** - Click on the map to measure distances between multiple points
2. **As the Crow Flies Distance** - Straight-line distance using Haversine formula
3. **Driving Distance & Time** - Actual driving distance and duration using Google Distance Matrix API

## Features

### Distance Measurement Tools

#### Measurement Modes
- **Driving** 🚗 - Calculate driving distance with traffic estimates
- **Walking** 🚶 - Calculate walking distance and time
- **Bicycling** 🚴 - Calculate bicycling distance and time
- **Transit** 🚇 - Calculate public transit distance and time

#### UI Controls
Located in the top-right corner of the map:
- **Measure Distance** button - Toggle measurement mode on/off
- **Travel Mode Selector** - Switch between driving, walking, bicycling, transit
- **Measurement Info Panel** - Shows real-time distance calculations
- **Undo** button - Remove the last measurement point
- **Clear** button - Clear all measurement points

### Using the Distance Measurement Tool

1. **Start Measuring**
   - Click the "Measure Distance" button in the top-right corner
   - The cursor will change to a crosshair

2. **Add Measurement Points**
   - Click anywhere on the map to add a measurement point
   - Blue markers will appear at each point
   - Blue lines will connect the points

3. **View Distances**
   - As you add points, the info panel will show:
     - Number of points
     - Straight-line distance ("As the crow flies")
     - Driving/walking/bicycling/transit distance
     - Estimated travel time
     - Traffic-adjusted time (for driving mode)

4. **Change Travel Mode**
   - Click the travel mode dropdown (shows current mode like "🚗 Driving")
   - Select a different mode (Walking, Bicycling, Transit)
   - Distances will automatically recalculate

5. **Undo or Clear**
   - Click **Undo** to remove the last point
   - Click **Clear** to remove all points and start over

6. **Stop Measuring**
   - Click "Stop Measuring" button to exit measurement mode
   - All markers and lines will be cleared

## Programmatic Usage

### Service Layer

#### Calculate Straight-Line Distance

```typescript
import { calculateStraightLineDistance, formatDistance } from '../services/distanceService';

const point1 = { lat: 33.7490, lng: -84.3880 }; // Atlanta
const point2 = { lat: 33.7756, lng: -84.3963 }; // Midtown

const distance = calculateStraightLineDistance(point1, point2);
console.log(formatDistance(distance)); // "2.11 mi"
```

#### Calculate Driving Distance

```typescript
import { calculateDrivingDistance, formatDuration } from '../services/distanceService';

const result = await calculateDrivingDistance(point1, point2, {
  mode: 'DRIVING',
  includeTraffic: true
});

console.log(result.distance.text); // "2.5 mi"
console.log(result.duration.text); // "8 mins"
console.log(result.durationInTraffic?.text); // "12 mins"
```

#### Using Cache for Performance

```typescript
import { calculateDrivingDistanceWithCache } from '../services/distanceService';

// First call hits the API
const result1 = await calculateDrivingDistanceWithCache(point1, point2);

// Second call returns from cache (instant)
const result2 = await calculateDrivingDistanceWithCache(point1, point2);
```

### React Hooks

#### useDistanceMeasurement Hook

```typescript
import { useDistanceMeasurement } from '../hooks/useDistanceMeasurement';

function MyMapComponent() {
  const {
    isActive,
    points,
    measurements,
    mode,
    calculating,
    startMeasurement,
    stopMeasurement,
    addPoint,
    clearPoints,
    changeTravelMode,
    getTotalDistance,
  } = useDistanceMeasurement({
    autoCalculateDriving: true,
    defaultMode: 'DRIVING',
    includeTraffic: true,
  });

  // Start measurement mode
  const handleStart = () => {
    startMeasurement();
  };

  // Add a point when map is clicked
  const handleMapClick = (latLng: google.maps.LatLng) => {
    if (isActive) {
      addPoint({
        position: { lat: latLng.lat(), lng: latLng.lng() },
      });
    }
  };

  // Get total distance for all segments
  const total = getTotalDistance();
  console.log(`Total distance: ${total.driving?.formatted}`);
  console.log(`Total time: ${total.duration}`);
}
```

### Helper Functions for Info Windows

#### Add Distance to Info Windows

```typescript
import { getDistanceInfoHTML, addDistanceToInfoWindow } from '../services/distanceHelpers';

// Get GPS location
const userLocation = { lat: 33.7490, lng: -84.3880 };
const propertyLocation = { lat: 33.7756, lng: -84.3963 };

// Method 1: Get HTML string
const distanceHTML = await getDistanceInfoHTML(userLocation, propertyLocation, {
  mode: 'DRIVING',
  includeTraffic: true,
  showStraightLine: true,
});

// Append to existing info window content
const infoContent = `
  <div>
    <h3>Property Name</h3>
    <p>123 Main St</p>
    ${distanceHTML}
  </div>
`;

// Method 2: Modify existing info window
const infoWindow = new google.maps.InfoWindow({
  content: originalContent
});

await addDistanceToInfoWindow(
  infoWindow,
  userLocation,
  propertyLocation,
  { mode: 'DRIVING' }
);
```

#### Get Distance Info Object

```typescript
import { getDistanceInfo } from '../services/distanceHelpers';

const info = await getDistanceInfo(userLocation, propertyLocation, {
  mode: 'DRIVING',
  includeTraffic: true,
});

if (info) {
  console.log(`Straight line: ${info.straightLine}`);
  console.log(`Driving: ${info.driving?.distance}`);
  console.log(`Time: ${info.driving?.duration}`);
}
```

## Integration Examples

### Adding Distance to PropertyLayer Info Windows

To add distance information to property info windows when GPS tracking is active:

```typescript
// In PropertyLayer.tsx or similar component

import { getDistanceInfoHTML } from '../../../services/distanceHelpers';

// When creating info window content
const coords = getDisplayCoordinates(property);
const userLocation = gpsPosition ? { lat: gpsPosition.lat, lng: gpsPosition.lng } : null;

let infoContent = `
  <div class="p-3 max-w-sm">
    <h3 class="font-semibold text-lg text-gray-900 mb-2">
      ${property.property_name || 'Property'}
    </h3>
    <div class="space-y-1 text-sm text-gray-600">
      <div><strong>Address:</strong> ${property.address}</div>
      <div><strong>Coordinates:</strong> ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}</div>
    </div>
`;

// Add distance info if GPS is available
if (userLocation && coords) {
  const distanceHTML = await getDistanceInfoHTML(
    userLocation,
    { lat: coords.lat, lng: coords.lng },
    { mode: 'DRIVING', includeTraffic: true }
  );
  infoContent += distanceHTML;
}

infoContent += `</div>`;

const infoWindow = new google.maps.InfoWindow({ content: infoContent });
```

### Creating a Custom Distance Display Component

```typescript
import React, { useEffect, useState } from 'react';
import { getDistanceInfo } from '../services/distanceHelpers';
import type { LatLng } from '../services/distanceService';

interface DistanceDisplayProps {
  userLocation: LatLng | null;
  targetLocation: LatLng;
  mode?: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';
}

export function DistanceDisplay({ userLocation, targetLocation, mode = 'DRIVING' }: DistanceDisplayProps) {
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userLocation) return;

    setLoading(true);
    getDistanceInfo(userLocation, targetLocation, { mode })
      .then(setInfo)
      .finally(() => setLoading(false));
  }, [userLocation, targetLocation, mode]);

  if (!userLocation) {
    return <div>Enable GPS to see distance</div>;
  }

  if (loading) {
    return <div>Calculating distance...</div>;
  }

  if (!info) {
    return null;
  }

  return (
    <div className="text-sm">
      <div className="text-gray-600">
        <strong>As the crow flies:</strong> {info.straightLine}
      </div>
      {info.driving && (
        <>
          <div className="text-blue-600">
            <strong>Driving:</strong> {info.driving.distance}
          </div>
          <div className="text-gray-700">
            <strong>Time:</strong> {info.driving.duration}
          </div>
          {info.driving.durationInTraffic && (
            <div className="text-red-600 text-xs">
              <strong>In traffic:</strong> {info.driving.durationInTraffic}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

## API Reference

### distanceService.ts

#### Functions

- `calculateStraightLineDistance(point1, point2)` - Calculate straight-line distance using Haversine
- `calculateStraightLineDistanceWithGoogle(point1, point2)` - Calculate using Google Geometry library
- `calculateDrivingDistance(origin, destination, options)` - Calculate driving distance via API
- `calculateDrivingDistanceWithCache(origin, destination, options)` - Calculate with caching
- `calculateDistancesToMultiplePoints(origin, destinations, options)` - Batch distance calculation
- `formatDistance(distance)` - Format distance for display
- `formatDuration(seconds)` - Format duration for display

#### Types

```typescript
interface LatLng {
  lat: number;
  lng: number;
}

interface StraightLineDistance {
  meters: number;
  kilometers: number;
  miles: number;
  feet: number;
}

interface DrivingDistanceResult {
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  durationInTraffic?: { text: string; value: number };
  status: string;
}

type TravelMode = 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';
```

### useDistanceMeasurement Hook

#### Options

```typescript
interface UseDistanceMeasurementOptions {
  autoCalculateDriving?: boolean; // Auto-calculate driving distances (default: true)
  defaultMode?: TravelMode; // Default travel mode (default: 'DRIVING')
  includeTraffic?: boolean; // Include traffic data (default: true)
}
```

#### Return Value

```typescript
{
  // State
  isActive: boolean;
  points: MeasurementPoint[];
  measurements: DistanceMeasurement[];
  mode: TravelMode;
  calculating: boolean;

  // Actions
  startMeasurement: () => void;
  stopMeasurement: () => void;
  addPoint: (point: MeasurementPoint) => Promise<void>;
  removeLastPoint: () => void;
  clearPoints: () => void;
  changeTravelMode: (mode: TravelMode) => Promise<void>;
  calculateDistanceFromUserLocation: (userLoc: LatLng, target: LatLng, mode?: TravelMode) => Promise<{...}>;
  getTotalDistance: () => {...};

  // Computed
  hasPoints: boolean;
  hasMeasurements: boolean;
  pointCount: number;
}
```

### distanceHelpers.ts

#### Functions

- `getDistanceInfoHTML(userLocation, targetLocation, options)` - Get formatted HTML string
- `getDistanceInfo(userLocation, targetLocation, options)` - Get distance data object
- `addDistanceToInfoWindow(infoWindow, userLocation, targetLocation, options)` - Modify info window

## Performance Considerations

### Caching

The distance service includes a built-in cache that stores results for 30 minutes:

```typescript
import { distanceCache } from '../services/distanceService';

// Clear cache manually if needed
distanceCache.clear();

// Clean up expired entries
distanceCache.cleanup();
```

### API Quota

Google Distance Matrix API has usage limits:
- Free tier: Limited requests per day
- Consider implementing your own rate limiting for production

### Best Practices

1. **Use caching** - Always use `calculateDrivingDistanceWithCache` instead of `calculateDrivingDistance`
2. **Batch requests** - Use `calculateDistancesToMultiplePoints` for multiple destinations
3. **Straight-line first** - Show straight-line distance immediately, load driving distance async
4. **Debounce** - Debounce distance calculations when user is actively moving
5. **Error handling** - Always handle API errors gracefully

## Troubleshooting

### Distance Matrix API not working

1. Check that your Google Maps API key has Distance Matrix API enabled
2. Verify the API key in `.env` file: `VITE_GOOGLE_MAPS_API_KEY`
3. Check browser console for API errors

### Distances showing as "Calculating..."

- Ensure you have an active internet connection
- Check that the Distance Matrix API is enabled in Google Cloud Console
- Verify API key permissions and billing

### Measurements not appearing

1. Make sure measurement mode is active (cursor should be crosshair)
2. Check browser console for JavaScript errors
3. Verify Google Maps API loaded successfully

## Future Enhancements

Potential improvements:

1. **Route visualization** - Show driving route on map, not just straight line
2. **Waypoints** - Support multiple stops along a route
3. **Export measurements** - Export distance data to CSV/PDF
4. **Persistent measurements** - Save measurements to database
5. **Comparison mode** - Compare distances between multiple routes
6. **Elevation data** - Include elevation changes in distance calculations

## Support

For issues or questions:
- Check the browser console for error messages
- Review Google Maps API documentation
- Verify API key and permissions in Google Cloud Console
