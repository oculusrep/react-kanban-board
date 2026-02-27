import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawCircleMode,
  TerraDrawLineStringMode,
  TerraDrawSelectMode,
  TerraDrawRenderMode,
} from 'terra-draw';
import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter';
import { GeoJSONGeometry } from '../../services/mapLayerService';
import { convertTerraDrawFeature, DrawnShape } from '../../utils/coordinateConversion';

export type DrawingTool = 'polygon' | 'circle' | 'polyline' | 'rectangle' | null;

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

// Map our tool names to Terra Draw mode names
const TOOL_TO_MODE: Record<string, string> = {
  polygon: 'polygon',
  rectangle: 'rectangle',
  circle: 'circle',
  polyline: 'linestring',
};

const DrawingToolbarV2: React.FC<DrawingToolbarProps> = ({
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
  const [isReady, setIsReady] = useState(false);
  const terraDrawRef = useRef<TerraDraw | null>(null);
  const drawnFeaturesRef = useRef<Set<string>>(new Set());

  // Initialize Terra Draw
  useEffect(() => {
    if (!map || !isActive) return;

    try {
      const adapter = new TerraDrawGoogleMapsAdapter({
        map,
        lib: google.maps,
        coordinatePrecision: 9,
      });

      const draw = new TerraDraw({
        adapter,
        modes: [
          new TerraDrawPolygonMode({
            styles: {
              fillColor: '#3b82f6',
              fillOpacity: 0.35,
              outlineColor: '#3b82f6',
              outlineWidth: 2,
            },
          }),
          new TerraDrawRectangleMode({
            styles: {
              fillColor: '#3b82f6',
              fillOpacity: 0.35,
              outlineColor: '#3b82f6',
              outlineWidth: 2,
            },
          }),
          new TerraDrawCircleMode({
            styles: {
              fillColor: '#3b82f6',
              fillOpacity: 0.35,
              outlineColor: '#3b82f6',
              outlineWidth: 2,
            },
          }),
          new TerraDrawLineStringMode({
            styles: {
              lineStringColor: '#3b82f6',
              lineStringWidth: 2,
            },
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: false,
                  coordinates: {
                    deletable: true,
                    draggable: true,
                  },
                },
              },
              linestring: {
                feature: {
                  draggable: false,
                  coordinates: {
                    deletable: true,
                    draggable: true,
                  },
                },
              },
            },
          }),
          new TerraDrawRenderMode({
            modeName: 'render',
            styles: {
              polygonFillColor: '#3b82f6',
              polygonFillOpacity: 0.35,
              polygonOutlineColor: '#3b82f6',
              polygonOutlineWidth: 2,
              lineStringColor: '#3b82f6',
              lineStringWidth: 2,
            },
          }),
        ],
      });

      draw.start();
      terraDrawRef.current = draw;
      setIsReady(true);

      // Listen for feature changes (drawing completion)
      draw.on('finish', (id: string, context: { mode: string; action: string }) => {
        if (context.action === 'draw') {
          handleFeatureComplete(id, context.mode);
        }
      });

    } catch (err) {
      console.error('Failed to initialize Terra Draw:', err);
    }

    return () => {
      if (terraDrawRef.current) {
        terraDrawRef.current.stop();
        terraDrawRef.current = null;
      }
      setIsReady(false);
      drawnFeaturesRef.current.clear();
    };
  }, [map, isActive]);

  // Handle feature completion
  const handleFeatureComplete = useCallback((featureId: string, mode: string) => {
    if (!terraDrawRef.current) return;

    // Prevent duplicate processing
    if (drawnFeaturesRef.current.has(featureId)) return;
    drawnFeaturesRef.current.add(featureId);

    const snapshot = terraDrawRef.current.getSnapshot();
    const feature = snapshot.find(f => f.id === featureId);

    if (!feature) return;

    // Convert mode name to our shape type
    let shapeType: 'polygon' | 'circle' | 'rectangle' | 'freehand' | 'linestring';
    switch (mode) {
      case 'polygon':
        shapeType = 'polygon';
        break;
      case 'rectangle':
        shapeType = 'rectangle';
        break;
      case 'circle':
        shapeType = 'circle';
        break;
      case 'linestring':
        shapeType = 'linestring';
        break;
      default:
        shapeType = 'polygon';
    }

    const drawnShape = convertTerraDrawFeature(feature, shapeType);

    if (drawnShape) {
      // Remove the feature from Terra Draw (layer component will render it)
      terraDrawRef.current.removeFeatures([featureId]);

      onShapeComplete(drawnShape);
      setSelectedTool(null);
    }
  }, [onShapeComplete]);

  // Update Terra Draw mode when tool changes
  useEffect(() => {
    if (!terraDrawRef.current || !isReady) return;

    if (selectedTool) {
      const mode = TOOL_TO_MODE[selectedTool];
      terraDrawRef.current.setMode(mode);
    } else {
      // When no tool is selected, switch to render mode (no drawing)
      terraDrawRef.current.setMode('render');
    }
  }, [selectedTool, isReady]);

  const handleToolSelect = (tool: DrawingTool) => {
    setSelectedTool(prev => prev === tool ? null : tool);
  };

  const handleCancel = () => {
    setSelectedTool(null);
    // Clear any in-progress drawing
    if (terraDrawRef.current) {
      const snapshot = terraDrawRef.current.getSnapshot();
      const ids = snapshot.map(f => f.id as string);
      if (ids.length > 0) {
        terraDrawRef.current.removeFeatures(ids);
      }
    }
    drawnFeaturesRef.current.clear();
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
              disabled={!isReady}
              className={`flex flex-col items-center px-3 py-2 rounded transition-colors ${
                selectedTool === tool.id
                  ? 'bg-blue-100 text-blue-700'
                  : isReady
                    ? 'hover:bg-gray-100 text-gray-700'
                    : 'text-gray-300 cursor-not-allowed'
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

export default DrawingToolbarV2;
