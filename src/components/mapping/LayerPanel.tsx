import React from 'react';
import { useLayerManager, CreateMode } from './layers/LayerManager';
import { Link } from 'react-router-dom';

interface CreateModeButtonProps {
  layerId: string;
  layerName: string;
  icon: string;
}

const CreateModeButton: React.FC<CreateModeButtonProps> = ({ layerId, layerName, icon }) => {
  const { createMode, setCreateMode } = useLayerManager();

  const getCreateModeFromLayerId = (layerId: string): CreateMode | null => {
    switch (layerId) {
      case 'properties': return 'property';
      case 'site_submits': return 'site_submit';
      default: return null;
    }
  };

  const targetCreateMode = getCreateModeFromLayerId(layerId);
  const isActive = createMode === targetCreateMode;

  const handleToggle = () => {
    if (isActive) {
      setCreateMode(null); // Turn off create mode
    } else {
      setCreateMode(targetCreateMode); // Turn on this create mode
    }
  };

  const getActionText = (layerId: string) => {
    switch (layerId) {
      case 'properties': return 'Create Property';
      case 'site_submits': return 'Create Site Submit';
      default: return 'Create Item';
    }
  };

  return (
    <button
      onClick={handleToggle}
      className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
      }`}
    >
      <span>{isActive ? '🎯' : '📍'}</span>
      <span>{isActive ? 'Click Map to Create' : getActionText(layerId)}</span>
    </button>
  );
};

interface LayerGroupProps {
  layerId: string;
  name: string;
  icon: string;
  description?: string;
  count: number;
  isVisible: boolean;
  isLoading: boolean;
  hasError: boolean;
  onToggle: () => void;
  isSystemLayer: boolean;
}

const LayerGroup: React.FC<LayerGroupProps> = ({
  layerId,
  name,
  icon,
  description,
  count,
  isVisible,
  isLoading,
  hasError,
  onToggle,
  isSystemLayer,
}) => {
  return (
    <div className="border border-gray-200 rounded-lg mb-3 bg-white shadow-sm">
      {/* Layer Header */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-lg">{icon}</span>
            <div>
              <h3 className="font-medium text-gray-900 text-sm">{name}</h3>
              {description && (
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              )}
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="flex items-center space-x-2">
            {/* Count Badge */}
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              isVisible
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {isLoading ? '...' : count.toLocaleString()}
            </span>

            {/* Toggle Switch */}
            <button
              onClick={onToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                isVisible
                  ? 'bg-blue-600'
                  : 'bg-gray-200'
              }`}
              role="switch"
              aria-checked={isVisible}
              aria-label={`Toggle ${name} layer`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isVisible ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Loading Indicator */}
        {isLoading && (
          <div className="mt-2 flex items-center space-x-2 text-xs text-blue-600">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
            <span>Loading layer data...</span>
          </div>
        )}

        {/* Error State */}
        {hasError && (
          <div className="mt-2 flex items-center space-x-2 text-xs text-red-600">
            <span>⚠️</span>
            <span>Failed to load layer</span>
          </div>
        )}

        {/* System Layer Badge */}
        {isSystemLayer && (
          <div className="mt-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
              🔧 System Layer
            </span>
          </div>
        )}
      </div>

      {/* Create Mode Controls - Only for Properties */}
      {isVisible && layerId === 'properties' && (
        <div className="border-t border-gray-100 px-3 py-2 bg-gray-50">
          <CreateModeButton
            layerId={layerId}
            layerName={name}
            icon={icon}
          />
        </div>
      )}

      {/* Site Submit Info - No standalone creation */}
      {isVisible && layerId === 'site_submits' && (
        <div className="border-t border-gray-100 px-3 py-2 bg-gray-50">
          <div className="text-xs text-gray-600 p-2 bg-blue-50 rounded border border-blue-200">
            💡 Click property markers to create site submits
          </div>
        </div>
      )}
    </div>
  );
};

// Custom Layers Section Component
interface CustomLayersSectionProps {
  onBuildTerritory?: () => void;
}

const CustomLayersSection: React.FC<CustomLayersSectionProps> = ({ onBuildTerritory }) => {
  const {
    customLayers,
    customLayerVisibility,
    customLayersLoading,
    toggleCustomLayer,
    refreshCustomLayers,
  } = useLayerManager();

  const [mergingLayerId, setMergingLayerId] = React.useState<string | null>(null);
  const [shapeCounts, setShapeCounts] = React.useState<Record<string, number>>({});

  // Fetch shape counts for layers that don't have shapes loaded
  React.useEffect(() => {
    const fetchShapeCounts = async () => {
      const layersNeedingCounts = customLayers.filter(l => l.shapes === undefined);
      if (layersNeedingCounts.length === 0) return;

      const { mapLayerService } = await import('../../services/mapLayerService');
      const counts: Record<string, number> = {};

      for (const layer of layersNeedingCounts) {
        try {
          const shapes = await mapLayerService.getShapesForLayer(layer.id);
          counts[layer.id] = shapes.length;
        } catch (err) {
          console.error('Error fetching shapes for layer:', layer.id, err);
          counts[layer.id] = 0;
        }
      }

      setShapeCounts(prev => ({ ...prev, ...counts }));
    };

    fetchShapeCounts();
  }, [customLayers]);

  const handleMergeShapes = async (layerId: string, layerName: string) => {
    if (!confirm(`Merge all shapes in "${layerName}" into a single polygon? This cannot be undone.`)) {
      return;
    }

    setMergingLayerId(layerId);
    try {
      const { mapLayerService } = await import('../../services/mapLayerService');
      await mapLayerService.mergeLayerShapes(layerId, layerName);
      await refreshCustomLayers();
      // Reset shape counts to trigger refetch
      setShapeCounts({});
    } catch (error) {
      console.error('Failed to merge shapes:', error);
      alert('Failed to merge shapes. Please try again.');
    } finally {
      setMergingLayerId(null);
    }
  };

  // Helper to get shape count - use loaded shapes or fallback to fetched count
  const getShapeCount = (layer: typeof customLayers[0]) => {
    if (layer.shapes !== undefined) {
      return layer.shapes.length;
    }
    return shapeCounts[layer.id] ?? 0;
  };

  if (customLayersLoading) {
    return (
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Custom Layers</h3>
        <div className="text-xs text-gray-500 p-3">Loading...</div>
      </div>
    );
  }

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700">Custom Layers</h3>
        <Link
          to="/admin/layers"
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Manage
        </Link>
      </div>

      {/* Build Territory Button */}
      {onBuildTerritory && (
        <button
          onClick={onBuildTerritory}
          className="w-full mb-3 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:from-blue-700 hover:to-indigo-700 flex items-center justify-center space-x-2 shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <span>Build Territory from Boundaries</span>
        </button>
      )}

      {customLayers.length === 0 ? (
        <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded border-2 border-dashed border-gray-200">
          No custom layers created yet.{' '}
          <Link to="/admin/layers" className="text-blue-600 hover:underline">
            Create one
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {customLayers.map(layer => {
            const shapeCount = getShapeCount(layer);
            const canMerge = shapeCount > 1;
            const isMerging = mergingLayerId === layer.id;
            // Debug logging
            console.log('🗺️ Layer:', layer.name, 'shapes:', shapeCount, 'canMerge:', canMerge);

            return (
              <div
                key={layer.id}
                className="p-2 bg-white border rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: layer.default_color }}
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{layer.name}</div>
                      <div className="text-xs text-gray-500">
                        {shapeCount} shape{shapeCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleCustomLayer(layer.id)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      customLayerVisibility[layer.id]
                        ? 'bg-blue-600'
                        : 'bg-gray-200'
                    }`}
                    role="switch"
                    aria-checked={customLayerVisibility[layer.id]}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        customLayerVisibility[layer.id] ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Merge button for layers with multiple shapes */}
                {canMerge && (
                  <button
                    onClick={() => handleMergeShapes(layer.id, layer.name)}
                    disabled={isMerging}
                    className="mt-2 w-full text-xs px-2 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-1"
                  >
                    {isMerging ? (
                      <>
                        <div className="animate-spin h-3 w-3 border-2 border-amber-600 border-t-transparent rounded-full"></div>
                        <span>Merging...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                        <span>Merge {shapeCount} shapes into one</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface LayerPanelProps {
  onBuildTerritory?: () => void;
}

const LayerPanel: React.FC<LayerPanelProps> = ({ onBuildTerritory }) => {
  const {
    layers,
    layerState,
    toggleLayer,
    isPanelOpen,
    togglePanel,
    createMode,
    setCreateMode,
  } = useLayerManager();

  // Debug: Uncomment these to debug layer state
  // console.log('🗺️ LayerPanel rendering - isPanelOpen:', isPanelOpen);
  // console.log('🗺️ LayerPanel layers:', layers);
  // console.log('🗺️ LayerPanel layerState:', layerState);

  if (!isPanelOpen) {
    // Collapsed state - just show toggle button
    return (
      <div className="fixed left-4 top-32 z-[10]">
        <button
          onClick={togglePanel}
          className="bg-white border border-gray-300 rounded-lg p-3 shadow-lg hover:shadow-xl transition-shadow"
          title="Open Layer Panel"
        >
          <span className="text-lg">🗺️</span>
          <div className="text-xs text-gray-600 mt-1">Layers</div>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed left-4 top-32 bottom-4 w-80 z-[10] flex flex-col">
      {/* Panel Container */}
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col h-full">
        {/* Panel Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <span className="text-lg">🗺️</span>
            <h2 className="font-semibold text-gray-900">Map Layers</h2>
          </div>
          <button
            onClick={togglePanel}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Collapse Panel"
          >
            <span className="text-gray-400">←</span>
          </button>
        </div>

        {/* Layer List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {layers.map(layer => {
              const state = layerState[layer.id] || {
                isVisible: false,
                isLoading: false,
                count: 0,
                hasError: false,
              };

              return (
                <LayerGroup
                  key={layer.id}
                  layerId={layer.id}
                  name={layer.name}
                  icon={layer.icon}
                  description={layer.description}
                  count={state.count}
                  isVisible={state.isVisible}
                  isLoading={state.isLoading}
                  hasError={state.hasError}
                  onToggle={() => toggleLayer(layer.id)}
                  isSystemLayer={layer.isSystemLayer}
                />
              );
            })}
          </div>

          {/* Custom Layers Section */}
          <CustomLayersSection onBuildTerritory={onBuildTerritory} />
        </div>

        {/* Create Mode Status */}
        <div className="border-t border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Create Mode</h3>
          {createMode ? (
            <div className="text-xs text-blue-700 p-2 bg-blue-50 rounded border border-blue-200 flex items-center space-x-2">
              <span>🎯</span>
              <span>
                <strong>{createMode === 'property' ? 'Property' : createMode === 'site_submit' ? 'Site Submit' : 'Item'}</strong>
                {' '}creation mode active - click map to create
              </span>
            </div>
          ) : (
            <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded border border-gray-200">
              📍 Enable a layer and click "Create" to start pin dropping
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LayerPanel;