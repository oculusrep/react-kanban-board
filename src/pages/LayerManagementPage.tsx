import React, { useState, useEffect } from 'react';
import { useMapLayers } from '../hooks/useMapLayers';
import { MapLayer } from '../services/mapLayerService';
import CreateLayerModal from '../components/modals/CreateLayerModal';
import EditLayerModal from '../components/modals/EditLayerModal';
import ShareLayerModal from '../components/modals/ShareLayerModal';
import ConfirmDialog from '../components/ConfirmDialog';

export default function LayerManagementPage() {
  const {
    layers,
    loading,
    error,
    fetchLayers,
    deleteLayer,
  } = useMapLayers({ includeShapes: true, includeShares: true });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<MapLayer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());

  // Update document title
  useEffect(() => {
    document.title = 'Map Layers | OVIS';
  }, []);

  // Filter layers based on search query
  const filteredLayers = layers.filter(layer => {
    const query = searchQuery.toLowerCase();
    return (
      layer.name.toLowerCase().includes(query) ||
      layer.description?.toLowerCase().includes(query)
    );
  });

  // Stats
  const totalLayers = layers.length;
  const totalShapes = layers.reduce((sum, layer) => sum + (layer.shapes?.length || 0), 0);
  const sharedLayers = layers.filter(layer => (layer.client_shares?.length || 0) > 0).length;

  const handleEdit = (layer: MapLayer) => {
    setSelectedLayer(layer);
    setShowEditModal(true);
  };

  const handleShare = (layer: MapLayer) => {
    setSelectedLayer(layer);
    setShowShareModal(true);
  };

  const handleDelete = (layer: MapLayer) => {
    setSelectedLayer(layer);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!selectedLayer) return;
    const result = await deleteLayer(selectedLayer.id);
    if (!result.success) {
      alert(`Failed to delete layer: ${result.error}`);
    }
    setShowDeleteConfirm(false);
    setSelectedLayer(null);
  };

  const toggleExpanded = (layerId: string) => {
    setExpandedLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Map Layers</h1>
          <p className="text-gray-600 mt-1">
            Create and manage custom map layers with polygons, circles, and other shapes.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-blue-600">{totalLayers}</div>
            <div className="text-sm text-gray-600">Total Layers</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-green-600">{totalShapes}</div>
            <div className="text-sm text-gray-600">Total Shapes</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-purple-600">{sharedLayers}</div>
            <div className="text-sm text-gray-600">Shared Layers</div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search layers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Create Layer
          </button>
        </div>

        {/* Layers Table */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Layer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shapes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shared With
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Default Style
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLayers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    {searchQuery ? 'No layers match your search' : 'No layers created yet'}
                  </td>
                </tr>
              ) : (
                filteredLayers.map(layer => (
                  <React.Fragment key={layer.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <button
                            onClick={() => toggleExpanded(layer.id)}
                            className="mr-2 text-gray-400 hover:text-gray-600"
                          >
                            {expandedLayers.has(layer.id) ? '▼' : '▶'}
                          </button>
                          <div>
                            <div className="font-medium text-gray-900">{layer.name}</div>
                            {layer.description && (
                              <div className="text-sm text-gray-500">{layer.description}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {layer.shapes?.length || 0} shapes
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {(layer.client_shares?.length || 0) > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {layer.client_shares?.slice(0, 3).map(share => (
                              <span
                                key={share.id}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800"
                              >
                                {share.client?.client_name || 'Unknown'}
                              </span>
                            ))}
                            {(layer.client_shares?.length || 0) > 3 && (
                              <span className="text-xs text-gray-500">
                                +{(layer.client_shares?.length || 0) - 3} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">Not shared</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-6 h-6 rounded border"
                            style={{
                              backgroundColor: layer.default_color,
                              opacity: layer.default_opacity,
                            }}
                            title={`Color: ${layer.default_color}`}
                          />
                          <span className="text-sm text-gray-600">
                            {Math.round(layer.default_opacity * 100)}% opacity
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleEdit(layer)}
                          className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleShare(layer)}
                          className="text-purple-600 hover:text-purple-900 text-sm font-medium"
                        >
                          Share
                        </button>
                        <button
                          onClick={() => handleDelete(layer)}
                          className="text-red-600 hover:text-red-900 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {/* Expanded shapes view */}
                    {expandedLayers.has(layer.id) && layer.shapes && layer.shapes.length > 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 bg-gray-50">
                          <div className="ml-8">
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Shapes in this layer:</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {layer.shapes.map(shape => (
                                <div
                                  key={shape.id}
                                  className="flex items-center space-x-2 p-2 bg-white rounded border"
                                >
                                  <div
                                    className="w-4 h-4 rounded"
                                    style={{ backgroundColor: shape.color }}
                                  />
                                  <span className="text-sm">
                                    {shape.name || `Unnamed ${shape.shape_type}`}
                                  </span>
                                  <span className="text-xs text-gray-400 capitalize">
                                    ({shape.shape_type})
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modals */}
        <CreateLayerModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchLayers();
          }}
        />

        {selectedLayer && (
          <>
            <EditLayerModal
              isOpen={showEditModal}
              layer={selectedLayer}
              onClose={() => {
                setShowEditModal(false);
                setSelectedLayer(null);
              }}
              onSuccess={() => {
                setShowEditModal(false);
                setSelectedLayer(null);
                fetchLayers();
              }}
            />

            <ShareLayerModal
              isOpen={showShareModal}
              layer={selectedLayer}
              onClose={() => {
                setShowShareModal(false);
                setSelectedLayer(null);
              }}
              onSuccess={() => {
                setShowShareModal(false);
                setSelectedLayer(null);
                fetchLayers();
              }}
            />
          </>
        )}

        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Delete Layer"
          message={`Are you sure you want to delete "${selectedLayer?.name}"? This will also delete all shapes in this layer and remove it from any clients it's shared with. This action cannot be undone.`}
          confirmLabel="Delete"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setSelectedLayer(null);
          }}
        />
      </div>
    </div>
  );
}
