import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useMapLayers } from '../../hooks/useMapLayers';
import { MapLayer, GeoJSONGeometry, mapLayerService } from '../../services/mapLayerService';

interface DrawnShape {
  type: 'polygon' | 'circle' | 'polyline' | 'rectangle';
  geometry: GeoJSONGeometry;
}

interface Client {
  id: string;
  client_name: string;
}

interface SaveShapeModalProps {
  isOpen: boolean;
  drawnShape: DrawnShape | null;
  onClose: () => void;
  onSaved: (layerId: string) => void;
  onContinueEditing?: () => void;
}

export default function SaveShapeModal({ isOpen, drawnShape, onClose, onSaved, onContinueEditing }: SaveShapeModalProps) {
  const { layers, createLayer, fetchLayers } = useMapLayers({ autoFetch: true });

  // Save mode: 'existing' or 'new'
  const [saveMode, setSaveMode] = useState<'existing' | 'new'>('existing');

  // Existing layer selection
  const [selectedLayerId, setSelectedLayerId] = useState('');

  // New layer form
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerColor, setNewLayerColor] = useState('#3b82f6');

  // Shape name
  const [shapeName, setShapeName] = useState('');

  // Share with client
  const [shareWithClient, setShareWithClient] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [isLoadingClients, setIsLoadingClients] = useState(false);

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set default shape name based on type
  useEffect(() => {
    if (drawnShape && isOpen) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setShapeName(`${drawnShape.type.charAt(0).toUpperCase() + drawnShape.type.slice(1)} ${timeStr}`);
    }
  }, [drawnShape, isOpen]);

  // Auto-select first layer if available
  useEffect(() => {
    if (layers.length > 0 && !selectedLayerId) {
      setSelectedLayerId(layers[0].id);
    }
  }, [layers, selectedLayerId]);

  // If no layers exist, default to new layer mode
  useEffect(() => {
    if (layers.length === 0) {
      setSaveMode('new');
    }
  }, [layers]);

  // Fetch clients when share is enabled
  useEffect(() => {
    async function fetchClients() {
      setIsLoadingClients(true);
      try {
        const { data, error } = await supabase
          .from('client')
          .select('id, client_name')
          .order('client_name');

        if (error) throw error;
        setClients(data || []);
      } catch (err) {
        console.error('Error fetching clients:', err);
      } finally {
        setIsLoadingClients(false);
      }
    }

    if (shareWithClient && clients.length === 0) {
      fetchClients();
    }
  }, [shareWithClient, clients.length]);

  const filteredClients = clients.filter(c =>
    c.client_name.toLowerCase().includes(clientSearchQuery.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!drawnShape) {
      setError('No shape to save');
      return;
    }

    if (saveMode === 'existing' && !selectedLayerId) {
      setError('Please select a layer');
      return;
    }

    if (saveMode === 'new' && !newLayerName.trim()) {
      setError('Please enter a layer name');
      return;
    }

    setIsSubmitting(true);
    try {
      let layerId = selectedLayerId;

      // Create new layer if needed
      if (saveMode === 'new') {
        const result = await createLayer({
          name: newLayerName.trim(),
          default_color: newLayerColor,
          default_opacity: 0.35,
          default_stroke_width: 2,
        });

        if (!result.success || !result.layer) {
          throw new Error(result.error || 'Failed to create layer');
        }

        layerId = result.layer.id;
        await fetchLayers();
      }

      // Create the shape
      const savedShape = await mapLayerService.createShape({
        layer_id: layerId,
        name: shapeName.trim() || `${drawnShape.type} ${new Date().toLocaleTimeString()}`,
        shape_type: drawnShape.type,
        geometry: drawnShape.geometry,
      });

      console.log('Shape saved:', savedShape);

      // Share with client if selected
      if (shareWithClient && selectedClientId) {
        await mapLayerService.shareLayerToClient(layerId, selectedClientId, 'reference');
      }

      // Reset form
      resetForm();
      onSaved(layerId);
    } catch (err: any) {
      console.error('Failed to save shape:', err);
      setError(err?.message || 'Failed to save shape');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSaveMode('existing');
    setSelectedLayerId(layers.length > 0 ? layers[0].id : '');
    setNewLayerName('');
    setNewLayerColor('#3b82f6');
    setShapeName('');
    setShareWithClient(false);
    setSelectedClientId('');
    setClientSearchQuery('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen || !drawnShape) return null;

  const shapeTypeLabel = drawnShape.type.charAt(0).toUpperCase() + drawnShape.type.slice(1);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10002]">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Save Shape</h2>
          <p className="text-sm text-gray-500 mt-1">
            You drew a {shapeTypeLabel.toLowerCase()}. Choose where to save it.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Shape Name */}
          <div>
            <label htmlFor="shapeName" className="block text-sm font-medium text-gray-700 mb-1">
              Shape Name
            </label>
            <input
              type="text"
              id="shapeName"
              value={shapeName}
              onChange={(e) => setShapeName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={`My ${shapeTypeLabel}`}
            />
          </div>

          {/* Save Mode Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Save to Layer</label>

            {/* Existing Layer Option */}
            {layers.length > 0 && (
              <label className={`flex items-start space-x-3 p-3 border rounded-md cursor-pointer transition-colors ${
                saveMode === 'existing' ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  name="saveMode"
                  value="existing"
                  checked={saveMode === 'existing'}
                  onChange={() => setSaveMode('existing')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">Existing Layer</div>
                  {saveMode === 'existing' && (
                    <select
                      value={selectedLayerId}
                      onChange={(e) => setSelectedLayerId(e.target.value)}
                      className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      {layers.map(layer => (
                        <option key={layer.id} value={layer.id}>
                          {layer.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            )}

            {/* New Layer Option */}
            <label className={`flex items-start space-x-3 p-3 border rounded-md cursor-pointer transition-colors ${
              saveMode === 'new' ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
            }`}>
              <input
                type="radio"
                name="saveMode"
                value="new"
                checked={saveMode === 'new'}
                onChange={() => setSaveMode('new')}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900">Create New Layer</div>
                {saveMode === 'new' && (
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      value={newLayerName}
                      onChange={(e) => setNewLayerName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="Layer name..."
                    />
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={newLayerColor}
                        onChange={(e) => setNewLayerColor(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer"
                      />
                      <span className="text-sm text-gray-500">Layer color</span>
                    </div>
                  </div>
                )}
              </div>
            </label>
          </div>

          {/* Share with Client Option */}
          <div className="pt-4 border-t">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={shareWithClient}
                onChange={(e) => setShareWithClient(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Share with a client</span>
                <p className="text-xs text-gray-500">Make this layer visible in a client's portal</p>
              </div>
            </label>

            {shareWithClient && (
              <div className="mt-3 ml-7 space-y-2">
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={clientSearchQuery}
                  onChange={(e) => setClientSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  disabled={isLoadingClients}
                >
                  <option value="">Select a client...</option>
                  {filteredClients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.client_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md"
              disabled={isSubmitting}
            >
              Discard
            </button>
            <div className="flex space-x-3">
              {onContinueEditing && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    onContinueEditing();
                  }}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                  disabled={isSubmitting}
                >
                  Continue Editing
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save Shape'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
