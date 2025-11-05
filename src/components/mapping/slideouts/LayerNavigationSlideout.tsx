import React, { useState } from 'react';
import { useLayerManager } from '../layers/LayerManager';

interface LayerNavigationSlideoutProps {
  isOpen: boolean;
  onToggle: () => void;
}

const LayerNavigationSlideout: React.FC<LayerNavigationSlideoutProps> = ({
  isOpen,
  onToggle
}) => {
  const { layers, layerState, toggleLayer, createMode, setCreateMode } = useLayerManager();

  const getLayerIcon = (layerId: string) => {
    switch (layerId) {
      case 'restaurants': return '🍔';
      case 'properties': return '🏢';
      case 'site_submits': return '📍';
      case 'property_units': return '🏬';
      default: return '📊';
    }
  };

  const getLayerColor = (layerId: string, isVisible: boolean) => {
    if (!isVisible) return 'bg-gray-100 text-gray-600';

    switch (layerId) {
      case 'restaurants': return 'bg-red-100 text-red-700 border-red-200';
      case 'properties': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'site_submits': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'property_units': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <>
      {/* Slideout Content */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl transform transition-transform duration-300 ease-out z-30 ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ height: '120px' }}
      >
        {/* Handle */}
        <div className="flex justify-center py-2">
          <button
            onClick={onToggle}
            className="w-12 h-1 bg-gray-300 rounded-full hover:bg-gray-400 transition-colors"
          />
        </div>

        {/* Content */}
        <div className="px-6 pb-4">
          <div className="flex items-center justify-between">
            {/* Layer Toggles */}
            <div className="flex items-center space-x-3">
              <h3 className="text-sm font-semibold text-gray-900 mr-4">Map Layers</h3>

              {layers.map(layer => {
                const state = layerState[layer.id] || { isVisible: false, count: 0, isLoading: false };
                const isActive = state.isVisible;
                console.log('🗺️ Rendering layer toggle:', layer.id, layer.name, 'state:', state);

                return (
                  <button
                    key={layer.id}
                    onClick={() => toggleLayer(layer.id)}
                    className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium border transition-all duration-200 hover:scale-105 ${
                      getLayerColor(layer.id, isActive)
                    }`}
                  >
                    <span className="mr-2">{getLayerIcon(layer.id)}</span>
                    <span>{layer.name}</span>
                    {state.count > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-white bg-opacity-70 rounded-full text-xs">
                        {state.isLoading ? '...' : state.count.toLocaleString()}
                      </span>
                    )}
                    {state.isLoading && (
                      <div className="ml-2 w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Create Mode Toggle & Actions */}
            <div className="flex items-center space-x-3">
              {/* Create Mode Status */}
              {createMode && (
                <div className="flex items-center px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-sm text-blue-700 font-medium">
                    🎯 {createMode === 'property' ? 'Creating Property' : 'Creating Site Submit'}
                  </span>
                  <button
                    onClick={() => setCreateMode(null)}
                    className="ml-2 text-blue-500 hover:text-blue-700"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCreateMode(createMode === 'property' ? null : 'property')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    createMode === 'property'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  + Property
                </button>

                <button
                  onClick={() => setCreateMode(createMode === 'site_submit' ? null : 'site_submit')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    createMode === 'site_submit'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  + Site Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toggle Button (when closed) */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed bottom-6 left-6 bg-white hover:bg-gray-50 border border-gray-200 rounded-full p-3 shadow-lg transition-all duration-200 hover:shadow-xl z-20"
          title="Open Layer Controls"
        >
          <span className="text-lg">🗺️</span>
        </button>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-20"
          onClick={onToggle}
        />
      )}
    </>
  );
};

export default LayerNavigationSlideout;