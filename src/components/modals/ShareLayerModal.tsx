import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useMapLayers } from '../../hooks/useMapLayers';
import { MapLayer, MapLayerClientShare } from '../../services/mapLayerService';
import { mapLayerService } from '../../services/mapLayerService';

interface Client {
  id: string;
  client_name: string;
}

interface ShareLayerModalProps {
  isOpen: boolean;
  layer: MapLayer;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ShareLayerModal({ isOpen, layer, onClose, onSuccess }: ShareLayerModalProps) {
  const { shareToClient, unshareFromClient } = useMapLayers({ autoFetch: false });

  const [clients, setClients] = useState<Client[]>([]);
  const [shares, setShares] = useState<MapLayerClientShare[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [shareType, setShareType] = useState<'reference' | 'copy'>('reference');
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingShares, setIsLoadingShares] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch clients
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

    if (isOpen) {
      fetchClients();
    }
  }, [isOpen]);

  // Fetch existing shares for this layer
  useEffect(() => {
    async function fetchShares() {
      setIsLoadingShares(true);
      try {
        const shareData = await mapLayerService.getClientShares(layer.id);
        setShares(shareData);
      } catch (err) {
        console.error('Error fetching shares:', err);
      } finally {
        setIsLoadingShares(false);
      }
    }

    if (isOpen && layer) {
      fetchShares();
    }
  }, [isOpen, layer]);

  // Filter clients not already shared
  const sharedClientIds = new Set(shares.map(s => s.client_id));
  const availableClients = clients.filter(c => !sharedClientIds.has(c.id));
  const filteredClients = availableClients.filter(c =>
    c.client_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleShare = async () => {
    if (!selectedClientId) {
      setError('Please select a client');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await shareToClient(layer.id, selectedClientId, shareType);
      if (result.success) {
        // Refresh shares
        const shareData = await mapLayerService.getClientShares(layer.id);
        setShares(shareData);
        setSelectedClientId('');
        setSearchQuery('');
      } else {
        setError(result.error || 'Failed to share layer');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnshare = async (share: MapLayerClientShare) => {
    const clientName = share.client?.client_name || 'this client';
    if (!confirm(`Remove sharing with ${clientName}?`)) return;

    setIsSubmitting(true);
    try {
      const result = await unshareFromClient(share.layer_id!, share.client_id);
      if (result.success) {
        // Refresh shares
        const shareData = await mapLayerService.getClientShares(layer.id);
        setShares(shareData);
      } else {
        setError(result.error || 'Failed to remove share');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedClientId('');
    setSearchQuery('');
    setError(null);
    onClose();
    onSuccess(); // Refresh parent to show updated share counts
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Share Layer</h2>
          <p className="text-sm text-gray-500 mt-1">
            Share "{layer.name}" with client accounts
          </p>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Add Share Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Share with new client</h3>

            <div>
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoadingClients}
              >
                <option value="">Select a client...</option>
                {filteredClients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.client_name}
                  </option>
                ))}
              </select>
              {filteredClients.length === 0 && !isLoadingClients && (
                <p className="text-sm text-gray-500 mt-1">
                  {availableClients.length === 0
                    ? 'All clients already have access to this layer'
                    : 'No clients match your search'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Share Type</label>
              <div className="space-y-2">
                <label className="flex items-start space-x-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="shareType"
                    value="reference"
                    checked={shareType === 'reference'}
                    onChange={() => setShareType('reference')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Live Reference</div>
                    <div className="text-sm text-gray-500">
                      Client sees the same layer. Changes you make are reflected in their portal.
                    </div>
                  </div>
                </label>
                <label className="flex items-start space-x-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="shareType"
                    value="copy"
                    checked={shareType === 'copy'}
                    onChange={() => setShareType('copy')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Client Copy</div>
                    <div className="text-sm text-gray-500">
                      Create an independent copy for this client. Changes won't affect the original.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={handleShare}
              disabled={!selectedClientId || isSubmitting}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Sharing...' : 'Share with Client'}
            </button>
          </div>

          {/* Existing Shares Section */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-medium text-gray-700">
              Currently shared with ({shares.length})
            </h3>

            {isLoadingShares ? (
              <div className="text-gray-500 text-sm">Loading...</div>
            ) : shares.length === 0 ? (
              <div className="text-gray-500 text-sm">Not shared with any clients yet</div>
            ) : (
              <div className="space-y-2">
                {shares.map(share => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                  >
                    <div>
                      <div className="font-medium text-gray-900">
                        {share.client?.client_name || 'Unknown Client'}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center space-x-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                            share.share_type === 'copy'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {share.share_type === 'copy' ? 'Copy' : 'Live'}
                        </span>
                        <span>
                          Shared {new Date(share.shared_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnshare(share)}
                      disabled={isSubmitting}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50">
          <button
            onClick={handleClose}
            className="w-full px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
