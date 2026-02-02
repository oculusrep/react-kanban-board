import React, { useEffect, useState, useRef, useCallback } from 'react';
import { mapLayerService, MapLayerShape, GeoJSONGeometry } from '../../../services/mapLayerService';

interface CustomLayerLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  layerId: string;
  onShapeClick?: (shape: MapLayerShape) => void;
  selectedShapeId?: string | null;
  editMode?: boolean;
  onShapeUpdated?: (shape: MapLayerShape) => void;
  refreshTrigger?: number; // Increment to trigger a refresh of shapes
}

type GoogleShape = google.maps.Polygon | google.maps.Circle | google.maps.Polyline;

interface ShapeRef {
  shape: MapLayerShape;
  googleShape: GoogleShape;
}

const CustomLayerLayer: React.FC<CustomLayerLayerProps> = ({
  map,
  isVisible,
  layerId,
  onShapeClick,
  selectedShapeId,
  editMode = false,
  onShapeUpdated,
  refreshTrigger,
}) => {
  const [shapes, setShapes] = useState<MapLayerShape[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const shapeRefs = useRef<Map<string, ShapeRef>>(new Map());
  const previousSelectedId = useRef<string | null>(null);

  // Use refs for callbacks to avoid recreating shapes on every render
  const onShapeClickRef = useRef(onShapeClick);
  const onShapeUpdatedRef = useRef(onShapeUpdated);

  // Keep refs updated
  useEffect(() => {
    onShapeClickRef.current = onShapeClick;
  }, [onShapeClick]);

  useEffect(() => {
    onShapeUpdatedRef.current = onShapeUpdated;
  }, [onShapeUpdated]);

  // Fetch shapes for this layer
  const fetchShapes = useCallback(async () => {
    if (!layerId) return;

    setIsLoading(true);
    try {
      const data = await mapLayerService.getShapesForLayer(layerId);
      setShapes(data);
    } catch (err) {
      console.error('Error fetching shapes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [layerId]);

  // Initial fetch and refresh when trigger changes
  useEffect(() => {
    fetchShapes();
  }, [fetchShapes, refreshTrigger]);

  // Create/update Google Maps shapes
  useEffect(() => {
    if (!map) return;

    // Clear existing shapes
    shapeRefs.current.forEach(({ googleShape }) => {
      googleShape.setMap(null);
    });
    shapeRefs.current.clear();

    if (!isVisible) return;

    console.log('🗺️ Creating', shapes.length, 'shapes for layer', layerId, 'editMode:', editMode);

    // Create shapes - use wrapper functions that call refs
    shapes.forEach(shape => {
      const googleShape = createGoogleShape(
        map,
        shape,
        editMode,
        // Wrapper for onClick that uses ref
        (clickedShape) => {
          console.log('🎯 Shape click handler called:', clickedShape.name || clickedShape.id);
          onShapeClickRef.current?.(clickedShape);
        },
        // Wrapper for onUpdated that uses ref
        (updatedShape) => {
          onShapeUpdatedRef.current?.(updatedShape);
        }
      );
      if (googleShape) {
        shapeRefs.current.set(shape.id, { shape, googleShape });
      }
    });

    // Cleanup on unmount
    return () => {
      shapeRefs.current.forEach(({ googleShape }) => {
        googleShape.setMap(null);
      });
      shapeRefs.current.clear();
    };
  }, [map, shapes, isVisible, editMode, layerId]); // Removed callback deps - using refs instead

  // Handle visibility changes
  useEffect(() => {
    shapeRefs.current.forEach(({ googleShape }) => {
      googleShape.setMap(isVisible ? map : null);
    });
  }, [isVisible, map]);

  // Handle selection changes
  useEffect(() => {
    // Deselect previous
    if (previousSelectedId.current && previousSelectedId.current !== selectedShapeId) {
      const prevRef = shapeRefs.current.get(previousSelectedId.current);
      if (prevRef) {
        updateShapeStyle(prevRef.googleShape, prevRef.shape, false);
      }
    }

    // Select new
    if (selectedShapeId) {
      const ref = shapeRefs.current.get(selectedShapeId);
      if (ref) {
        updateShapeStyle(ref.googleShape, ref.shape, true);
      }
    }

    previousSelectedId.current = selectedShapeId || null;
  }, [selectedShapeId]);

  return null; // This component doesn't render any DOM elements
};

// Helper to create a Google Maps shape from our shape data
function createGoogleShape(
  map: google.maps.Map,
  shape: MapLayerShape,
  editable: boolean,
  onClick?: (shape: MapLayerShape) => void,
  onUpdated?: (shape: MapLayerShape) => void
): GoogleShape | null {
  const geometry = shape.geometry as GeoJSONGeometry;

  let googleShape: GoogleShape | null = null;

  switch (geometry.type) {
    case 'polygon':
    case 'rectangle': {
      const path = geometry.coordinates.map(([lat, lng]) => ({ lat, lng }));
      googleShape = new google.maps.Polygon({
        paths: path,
        strokeColor: shape.color,
        strokeOpacity: 1,
        strokeWeight: shape.stroke_width,
        fillColor: shape.color,
        fillOpacity: shape.fill_opacity,
        map,
        editable,
        draggable: editable,
        clickable: true,
        zIndex: 100,
      });
      break;
    }

    case 'circle': {
      const [lat, lng] = geometry.center;
      googleShape = new google.maps.Circle({
        center: { lat, lng },
        radius: geometry.radius,
        strokeColor: shape.color,
        strokeOpacity: 1,
        strokeWeight: shape.stroke_width,
        fillColor: shape.color,
        fillOpacity: shape.fill_opacity,
        map,
        editable,
        draggable: editable,
        clickable: true,
        zIndex: 100,
      });
      break;
    }

    case 'polyline': {
      const path = geometry.coordinates.map(([lat, lng]) => ({ lat, lng }));
      googleShape = new google.maps.Polyline({
        path,
        strokeColor: shape.color,
        strokeOpacity: 1,
        strokeWeight: shape.stroke_width,
        map,
        editable,
        clickable: true,
        zIndex: 100,
      });
      break;
    }

    default:
      console.warn(`Unknown shape type: ${(geometry as any).type}`);
      return null;
  }

  // Add click listener - use mouseup for better compatibility with editable shapes
  if (googleShape && onClick) {
    google.maps.event.addListener(googleShape, 'click', (e: google.maps.MapMouseEvent) => {
      console.log('🎯 Shape clicked:', shape.name || shape.id);
      onClick(shape);
    });
    // Also listen for mouseup as backup (works better when shape is editable)
    google.maps.event.addListener(googleShape, 'mouseup', (e: google.maps.MapMouseEvent) => {
      // Only trigger if it wasn't a drag operation
      console.log('🎯 Shape mouseup:', shape.name || shape.id);
    });
  }

  // Add edit listeners if editable
  if (googleShape && editable && onUpdated) {
    // For polygons
    if (googleShape instanceof google.maps.Polygon) {
      const path = googleShape.getPath();
      google.maps.event.addListener(path, 'set_at', () => {
        const updatedCoords = extractPolygonCoords(googleShape as google.maps.Polygon);
        onUpdated({
          ...shape,
          geometry: { type: 'polygon', coordinates: updatedCoords },
        });
      });
      google.maps.event.addListener(path, 'insert_at', () => {
        const updatedCoords = extractPolygonCoords(googleShape as google.maps.Polygon);
        onUpdated({
          ...shape,
          geometry: { type: 'polygon', coordinates: updatedCoords },
        });
      });
      google.maps.event.addListener(path, 'remove_at', () => {
        const updatedCoords = extractPolygonCoords(googleShape as google.maps.Polygon);
        onUpdated({
          ...shape,
          geometry: { type: 'polygon', coordinates: updatedCoords },
        });
      });
      google.maps.event.addListener(googleShape, 'dragend', () => {
        const updatedCoords = extractPolygonCoords(googleShape as google.maps.Polygon);
        onUpdated({
          ...shape,
          geometry: { type: 'polygon', coordinates: updatedCoords },
        });
      });
    }

    // For circles
    if (googleShape instanceof google.maps.Circle) {
      google.maps.event.addListener(googleShape, 'center_changed', () => {
        const center = (googleShape as google.maps.Circle).getCenter();
        if (center) {
          onUpdated({
            ...shape,
            geometry: {
              type: 'circle',
              center: [center.lat(), center.lng()],
              radius: (googleShape as google.maps.Circle).getRadius(),
            },
          });
        }
      });
      google.maps.event.addListener(googleShape, 'radius_changed', () => {
        const center = (googleShape as google.maps.Circle).getCenter();
        if (center) {
          onUpdated({
            ...shape,
            geometry: {
              type: 'circle',
              center: [center.lat(), center.lng()],
              radius: (googleShape as google.maps.Circle).getRadius(),
            },
          });
        }
      });
    }

    // For polylines
    if (googleShape instanceof google.maps.Polyline) {
      const path = googleShape.getPath();
      google.maps.event.addListener(path, 'set_at', () => {
        const updatedCoords = extractPolylineCoords(googleShape as google.maps.Polyline);
        onUpdated({
          ...shape,
          geometry: { type: 'polyline', coordinates: updatedCoords },
        });
      });
      google.maps.event.addListener(path, 'insert_at', () => {
        const updatedCoords = extractPolylineCoords(googleShape as google.maps.Polyline);
        onUpdated({
          ...shape,
          geometry: { type: 'polyline', coordinates: updatedCoords },
        });
      });
      google.maps.event.addListener(path, 'remove_at', () => {
        const updatedCoords = extractPolylineCoords(googleShape as google.maps.Polyline);
        onUpdated({
          ...shape,
          geometry: { type: 'polyline', coordinates: updatedCoords },
        });
      });
    }
  }

  return googleShape;
}

// Extract coordinates from a polygon
function extractPolygonCoords(polygon: google.maps.Polygon): [number, number][] {
  const path = polygon.getPath();
  const coords: [number, number][] = [];
  for (let i = 0; i < path.getLength(); i++) {
    const point = path.getAt(i);
    coords.push([point.lat(), point.lng()]);
  }
  return coords;
}

// Extract coordinates from a polyline
function extractPolylineCoords(polyline: google.maps.Polyline): [number, number][] {
  const path = polyline.getPath();
  const coords: [number, number][] = [];
  for (let i = 0; i < path.getLength(); i++) {
    const point = path.getAt(i);
    coords.push([point.lat(), point.lng()]);
  }
  return coords;
}

// Update shape style (for selection)
function updateShapeStyle(googleShape: GoogleShape, shape: MapLayerShape, isSelected: boolean) {
  const strokeWeight = isSelected ? shape.stroke_width + 2 : shape.stroke_width;
  const strokeColor = isSelected ? '#1d4ed8' : shape.color;
  const zIndex = isSelected ? 1000 : 100;

  if (googleShape instanceof google.maps.Polygon) {
    googleShape.setOptions({
      strokeWeight,
      strokeColor,
      zIndex,
    });
  } else if (googleShape instanceof google.maps.Circle) {
    googleShape.setOptions({
      strokeWeight,
      strokeColor,
      zIndex,
    });
  } else if (googleShape instanceof google.maps.Polyline) {
    googleShape.setOptions({
      strokeWeight,
      strokeColor,
      zIndex,
    });
  }
}

export default CustomLayerLayer;
