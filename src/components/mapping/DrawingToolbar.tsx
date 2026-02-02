import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GeoJSONGeometry, CreateShapeInput } from '../../services/mapLayerService';

export type DrawingTool = 'polygon' | 'circle' | 'polyline' | 'rectangle' | null;

interface DrawnShape {
  type: 'polygon' | 'circle' | 'polyline' | 'rectangle';
  geometry: GeoJSONGeometry;
}

interface DrawingToolbarProps {
  map: google.maps.Map | null;
  isActive: boolean;
  selectedLayerId: string | null;
  onShapeComplete: (shape: DrawnShape) => void;
  onDone: () => void;
  onCancel: () => void;
  onFormatClick?: () => void;
  hasSelectedShape?: boolean;
}

const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  map,
  isActive,
  selectedLayerId,
  onShapeComplete,
  onDone,
  onCancel,
  onFormatClick,
  hasSelectedShape = false,
}) => {
  const [selectedTool, setSelectedTool] = useState<DrawingTool>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const currentShapeRef = useRef<google.maps.Polygon | google.maps.Circle | google.maps.Polyline | google.maps.Rectangle | null>(null);

  // Initialize Drawing Manager
  useEffect(() => {
    if (!map || !isActive) return;

    // Load drawing library
    const loadDrawingLibrary = async () => {
      try {
        // @ts-ignore - Google Maps library loading
        await google.maps.importLibrary('drawing');

        const drawingManager = new google.maps.drawing.DrawingManager({
          drawingMode: null,
          drawingControl: false, // We use our own controls
          polygonOptions: {
            fillColor: '#3b82f6',
            fillOpacity: 0.35,
            strokeColor: '#3b82f6',
            strokeWeight: 2,
            editable: true,
            draggable: true,
          },
          circleOptions: {
            fillColor: '#3b82f6',
            fillOpacity: 0.35,
            strokeColor: '#3b82f6',
            strokeWeight: 2,
            editable: true,
            draggable: true,
          },
          polylineOptions: {
            strokeColor: '#3b82f6',
            strokeWeight: 2,
            editable: true,
          },
          rectangleOptions: {
            fillColor: '#3b82f6',
            fillOpacity: 0.35,
            strokeColor: '#3b82f6',
            strokeWeight: 2,
            editable: true,
            draggable: true,
          },
        });

        drawingManager.setMap(map);
        drawingManagerRef.current = drawingManager;

        // Listen for shape completion events
        google.maps.event.addListener(drawingManager, 'polygoncomplete', handlePolygonComplete);
        google.maps.event.addListener(drawingManager, 'circlecomplete', handleCircleComplete);
        google.maps.event.addListener(drawingManager, 'polylinecomplete', handlePolylineComplete);
        google.maps.event.addListener(drawingManager, 'rectanglecomplete', handleRectangleComplete);
      } catch (err) {
        console.error('Failed to load drawing library:', err);
      }
    };

    loadDrawingLibrary();

    return () => {
      if (drawingManagerRef.current) {
        drawingManagerRef.current.setMap(null);
        drawingManagerRef.current = null;
      }
      if (currentShapeRef.current) {
        currentShapeRef.current.setMap(null);
        currentShapeRef.current = null;
      }
    };
  }, [map, isActive]);

  // Update drawing mode when tool changes
  useEffect(() => {
    if (!drawingManagerRef.current) return;

    let drawingMode: google.maps.drawing.OverlayType | null = null;
    switch (selectedTool) {
      case 'polygon':
        drawingMode = google.maps.drawing.OverlayType.POLYGON;
        break;
      case 'circle':
        drawingMode = google.maps.drawing.OverlayType.CIRCLE;
        break;
      case 'polyline':
        drawingMode = google.maps.drawing.OverlayType.POLYLINE;
        break;
      case 'rectangle':
        drawingMode = google.maps.drawing.OverlayType.RECTANGLE;
        break;
    }

    drawingManagerRef.current.setDrawingMode(drawingMode);
  }, [selectedTool]);

  // Shape completion handlers
  const handlePolygonComplete = useCallback((polygon: google.maps.Polygon) => {
    const path = polygon.getPath();
    const coordinates: [number, number][] = [];
    for (let i = 0; i < path.getLength(); i++) {
      const point = path.getAt(i);
      coordinates.push([point.lat(), point.lng()]);
    }

    // Remove the drawn shape (layer component will render it)
    polygon.setMap(null);

    onShapeComplete({
      type: 'polygon',
      geometry: { type: 'polygon', coordinates },
    });

    setSelectedTool(null);
  }, [onShapeComplete]);

  const handleCircleComplete = useCallback((circle: google.maps.Circle) => {
    const center = circle.getCenter();
    const radius = circle.getRadius();

    if (!center) return;

    // Remove the drawn shape
    circle.setMap(null);

    onShapeComplete({
      type: 'circle',
      geometry: {
        type: 'circle',
        center: [center.lat(), center.lng()],
        radius,
      },
    });

    setSelectedTool(null);
  }, [onShapeComplete]);

  const handlePolylineComplete = useCallback((polyline: google.maps.Polyline) => {
    const path = polyline.getPath();
    const coordinates: [number, number][] = [];
    for (let i = 0; i < path.getLength(); i++) {
      const point = path.getAt(i);
      coordinates.push([point.lat(), point.lng()]);
    }

    // Remove the drawn shape
    polyline.setMap(null);

    onShapeComplete({
      type: 'polyline',
      geometry: { type: 'polyline', coordinates },
    });

    setSelectedTool(null);
  }, [onShapeComplete]);

  const handleRectangleComplete = useCallback((rectangle: google.maps.Rectangle) => {
    const bounds = rectangle.getBounds();
    if (!bounds) return;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    // Convert rectangle to polygon coordinates
    const coordinates: [number, number][] = [
      [ne.lat(), sw.lng()], // NW
      [ne.lat(), ne.lng()], // NE
      [sw.lat(), ne.lng()], // SE
      [sw.lat(), sw.lng()], // SW
    ];

    // Remove the drawn shape
    rectangle.setMap(null);

    onShapeComplete({
      type: 'rectangle',
      geometry: { type: 'rectangle', coordinates },
    });

    setSelectedTool(null);
  }, [onShapeComplete]);

  const handleToolSelect = (tool: DrawingTool) => {
    setSelectedTool(prev => prev === tool ? null : tool);
  };

  const handleCancel = () => {
    setSelectedTool(null);
    if (currentShapeRef.current) {
      currentShapeRef.current.setMap(null);
      currentShapeRef.current = null;
    }
    onCancel();
  };

  if (!isActive) return null;

  const tools: { id: DrawingTool; icon: string; label: string }[] = [
    { id: 'polygon', icon: '⬡', label: 'Polygon' },
    { id: 'rectangle', icon: '▭', label: 'Rectangle' },
    { id: 'circle', icon: '○', label: 'Circle' },
    { id: 'polyline', icon: '╱', label: 'Line' },
  ];

  return (
    <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-[1000]">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-2">
        <div className="flex items-center space-x-2">
          {/* Layer indicator */}
          <div className="text-xs text-gray-500 px-2 border-r border-gray-200">
            Drawing to layer
          </div>

          {/* Tool buttons */}
          {tools.map(tool => (
            <button
              key={tool.id}
              onClick={() => handleToolSelect(tool.id)}
              className={`flex flex-col items-center px-3 py-2 rounded transition-colors ${
                selectedTool === tool.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
              title={tool.label}
            >
              <span className="text-lg">{tool.icon}</span>
              <span className="text-xs mt-0.5">{tool.label}</span>
            </button>
          ))}

          {/* Separator */}
          <div className="h-8 w-px bg-gray-200 mx-1" />

          {/* Format button - opens shape editor */}
          <button
            onClick={onFormatClick}
            disabled={!hasSelectedShape}
            className={`flex flex-col items-center px-3 py-2 rounded transition-colors ${
              hasSelectedShape
                ? 'hover:bg-gray-100 text-gray-700'
                : 'text-gray-300 cursor-not-allowed'
            }`}
            title={hasSelectedShape ? 'Format selected shape' : 'Select a shape to format'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            <span className="text-xs mt-0.5">Format</span>
          </button>

          {/* Done button - saves and closes */}
          <button
            onClick={() => {
              setSelectedTool(null);
              onDone();
            }}
            className="px-3 py-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded font-medium"
            title="Done - save and close"
          >
            <span className="text-sm">Done</span>
          </button>

          {/* Cancel button - discards changes */}
          <button
            onClick={handleCancel}
            className="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
            title="Cancel - discard changes"
          >
            <span className="text-sm">Cancel</span>
          </button>
        </div>

        {/* Instructions */}
        {selectedTool && (
          <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 text-center">
            {selectedTool === 'polygon' && 'Click to add points, click first point to close'}
            {selectedTool === 'rectangle' && 'Click and drag to draw a rectangle'}
            {selectedTool === 'circle' && 'Click and drag to draw a circle'}
            {selectedTool === 'polyline' && 'Click to add points, double-click to finish'}
          </div>
        )}
      </div>
    </div>
  );
};

export default DrawingToolbar;
