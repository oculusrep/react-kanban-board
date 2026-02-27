/**
 * Coordinate Conversion Utilities for Terra Draw Migration
 *
 * Terra Draw uses GeoJSON standard: [lng, lat] (longitude first)
 * Our app storage uses Google Maps convention: [lat, lng] (latitude first)
 *
 * These utilities handle conversion between the two formats.
 */

import { GeoJSONGeometry } from '../services/mapLayerService';

// Type for drawn shape (matches DrawingToolbar interface)
export interface DrawnShape {
  type: 'polygon' | 'circle' | 'polyline' | 'rectangle';
  geometry: GeoJSONGeometry;
}

/**
 * Convert Terra Draw coordinates [lng, lat] to app format [lat, lng]
 */
export function terraDrawToAppCoords(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng]);
}

/**
 * Convert app coordinates [lat, lng] to Terra Draw format [lng, lat]
 */
export function appToTerraDrawCoords(coords: [number, number][]): [number, number][] {
  return coords.map(([lat, lng]) => [lng, lat]);
}

/**
 * Calculate centroid of a polygon
 */
export function calculateCentroid(coords: [number, number][]): [number, number] {
  if (coords.length === 0) {
    return [0, 0];
  }

  let sumLng = 0;
  let sumLat = 0;

  for (const [lng, lat] of coords) {
    sumLng += lng;
    sumLat += lat;
  }

  return [sumLng / coords.length, sumLat / coords.length];
}

/**
 * Calculate distance between two points using Haversine formula
 * @param p1 [lng, lat] in degrees
 * @param p2 [lng, lat] in degrees
 * @returns Distance in meters
 */
export function calculateDistanceMeters(p1: [number, number], p2: [number, number]): number {
  const R = 6371000; // Earth's radius in meters
  const [lng1, lat1] = p1;
  const [lng2, lat2] = p2;

  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const deltaLat = (lat2 - lat1) * Math.PI / 180;
  const deltaLng = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Extract circle center and radius from a polygon approximation
 * Terra Draw stores circles as polygons, we need to convert back to center+radius
 *
 * @param polygonCoords Polygon coordinates in Terra Draw format [lng, lat][]
 * @returns { center: [lat, lng], radius: meters }
 */
export function extractCircleFromPolygon(polygonCoords: [number, number][]): {
  center: [number, number];
  radius: number
} {
  // Calculate centroid (in [lng, lat] format)
  const centroid = calculateCentroid(polygonCoords);

  // Calculate average distance from centroid to all points
  let totalDistance = 0;
  for (const coord of polygonCoords) {
    totalDistance += calculateDistanceMeters(centroid, coord);
  }
  const avgRadius = totalDistance / polygonCoords.length;

  // Convert center from [lng, lat] to [lat, lng] for app storage
  const center: [number, number] = [centroid[1], centroid[0]];

  return { center, radius: avgRadius };
}

/**
 * Convert a Terra Draw GeoJSON feature to our app's DrawnShape format
 *
 * @param feature GeoJSON feature from Terra Draw
 * @param shapeType The type of shape that was drawn (from Terra Draw mode)
 * @returns DrawnShape in app format
 */
export function convertTerraDrawFeature(
  feature: GeoJSON.Feature,
  shapeType: 'polygon' | 'circle' | 'rectangle' | 'freehand' | 'linestring'
): DrawnShape | null {
  if (!feature.geometry) {
    return null;
  }

  const geometry = feature.geometry;

  switch (shapeType) {
    case 'polygon':
    case 'freehand': {
      if (geometry.type !== 'Polygon') return null;
      // Polygon coordinates are [ring][point][lng, lat]
      // Get the outer ring (first array), skip closing point if duplicated
      const coords = geometry.coordinates[0] as [number, number][];
      const cleanedCoords = coords.slice(0, -1); // Remove closing point
      return {
        type: 'polygon',
        geometry: {
          type: 'polygon',
          coordinates: terraDrawToAppCoords(cleanedCoords),
        },
      };
    }

    case 'rectangle': {
      if (geometry.type !== 'Polygon') return null;
      const coords = geometry.coordinates[0] as [number, number][];
      // Rectangle is a 4-point polygon (plus closing point)
      const cleanedCoords = coords.slice(0, 4);
      return {
        type: 'rectangle',
        geometry: {
          type: 'rectangle',
          coordinates: terraDrawToAppCoords(cleanedCoords),
        },
      };
    }

    case 'circle': {
      if (geometry.type !== 'Polygon') return null;
      // Terra Draw stores circles as polygon approximations
      const coords = geometry.coordinates[0] as [number, number][];
      // Skip closing point
      const cleanedCoords = coords.slice(0, -1);
      const { center, radius } = extractCircleFromPolygon(cleanedCoords);
      return {
        type: 'circle',
        geometry: {
          type: 'circle',
          center,
          radius,
        },
      };
    }

    case 'linestring': {
      if (geometry.type !== 'LineString') return null;
      const coords = geometry.coordinates as [number, number][];
      return {
        type: 'polyline',
        geometry: {
          type: 'polyline',
          coordinates: terraDrawToAppCoords(coords),
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Convert our app's GeoJSONGeometry to a Terra Draw GeoJSON feature
 * Used for editing existing shapes
 *
 * @param geometry App geometry format
 * @param id Optional feature ID
 * @returns GeoJSON Feature in Terra Draw format
 */
export function appGeometryToTerraDrawFeature(
  geometry: GeoJSONGeometry,
  id?: string
): GeoJSON.Feature {
  const baseFeature = {
    type: 'Feature' as const,
    id: id || crypto.randomUUID(),
    properties: {},
  };

  switch (geometry.type) {
    case 'polygon':
    case 'rectangle': {
      const coords = appToTerraDrawCoords(geometry.coordinates);
      // Close the polygon by adding first point at end
      const closedCoords = [...coords, coords[0]];
      return {
        ...baseFeature,
        geometry: {
          type: 'Polygon',
          coordinates: [closedCoords],
        },
      };
    }

    case 'circle': {
      // Convert center from [lat, lng] to [lng, lat]
      const center: [number, number] = [geometry.center[1], geometry.center[0]];
      // Create circle polygon approximation (64 points)
      const points = 64;
      const coords: [number, number][] = [];
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * 2 * Math.PI;
        // Approximate: 1 degree ≈ 111km at equator
        const latOffset = (geometry.radius / 111000) * Math.cos(angle);
        const lngOffset = (geometry.radius / (111000 * Math.cos(center[1] * Math.PI / 180))) * Math.sin(angle);
        coords.push([center[0] + lngOffset, center[1] + latOffset]);
      }
      // Close the polygon
      coords.push(coords[0]);
      return {
        ...baseFeature,
        geometry: {
          type: 'Polygon',
          coordinates: [coords],
        },
      };
    }

    case 'polyline': {
      const coords = appToTerraDrawCoords(geometry.coordinates);
      return {
        ...baseFeature,
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      };
    }

    default:
      throw new Error(`Unknown geometry type: ${(geometry as any).type}`);
  }
}
