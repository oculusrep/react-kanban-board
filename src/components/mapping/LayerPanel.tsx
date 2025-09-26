import React from 'react';
import { useLayerManager, CreateMode } from './layers/LayerManager';

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

const LayerPanel: React.FC = () => {
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
      <div className="fixed left-4 top-20 z-[60]">
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
    <div className="fixed left-4 top-20 bottom-4 w-80 z-[60] flex flex-col">
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

          {/* Future: Custom Layers Section */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Custom Layers</h3>
            <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded border-2 border-dashed border-gray-200">
              💡 Custom layer creation coming in Phase 2.4
            </div>
          </div>
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