import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { prepareInsert, prepareUpdate } from '../lib/supabaseHelpers';
import { Database } from '../../database-schema';

type Client = Database['public']['Tables']['client']['Row'];

interface AddChildAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (childClientId: string) => Promise<void>;
  currentClientId: string;
  existingChildIds?: string[];
}

const AddChildAccountModal: React.FC<AddChildAccountModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  currentClientId,
  existingChildIds = []
}) => {
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [searchTerm, setSearchTerm] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New client form data
  const [newClientName, setNewClientName] = useState('');
  const [newClientType, setNewClientType] = useState<string>('');
  const [newClientPhone, setNewClientPhone] = useState('');

  // Search for clients
  useEffect(() => {
    if (!isOpen) return;

    const loadClients = async () => {
      if (!searchTerm.trim()) {
        setClients([]);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('client')
          .select('*')
          .neq('id', currentClientId) // Don't show current client
          .ilike('client_name', `%${searchTerm}%`)
          .order('client_name')
          .limit(10);

        if (error) throw error;

        // Filter out clients that are already children and prevent circular relationships
        const filtered = (data || []).filter(c => {
          // Don't show if already a child
          if (existingChildIds.includes(c.id)) return false;
          // Don't show if this would create a circular relationship (current client is child of this client)
          if (c.parent_id === currentClientId) return false;
          return true;
        });

        setClients(filtered);
      } catch (err) {
        console.error('Error loading clients:', err);
        setError(err instanceof Error ? err.message : 'Failed to load clients');
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(loadClients, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, isOpen, currentClientId, existingChildIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'select') {
      if (!selectedClient) {
        setError('Please select a client');
        return;
      }

      setSaving(true);
      setError(null);

      try {
        await onAdd(selectedClient.id);
        handleClose();
      } catch (err) {
        console.error('Error adding child account:', err);
        setError(err instanceof Error ? err.message : 'Failed to add child account');
      } finally {
        setSaving(false);
      }
    } else {
      // Create new client
      if (!newClientName.trim()) {
        setError('Client name is required');
        return;
      }

      setSaving(true);
      setError(null);

      try {
        // Create the new client
        const { data: newClient, error: createError } = await supabase
          .from('client')
          .insert(prepareInsert([{
            client_name: newClientName.trim(),
            sf_client_type: newClientType || null,
            phone: newClientPhone || null,
            parent_id: currentClientId,
            is_active_client: true
          }]))
          .select()
          .single();

        if (createError) throw createError;

        // Refresh the parent's child list
        await onAdd(newClient.id);
        handleClose();
      } catch (err) {
        console.error('Error creating child client:', err);
        setError(err instanceof Error ? err.message : 'Failed to create child client');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleClose = () => {
    setMode('select');
    setSearchTerm('');
    setSelectedClient(null);
    setNewClientName('');
    setNewClientType('');
    setNewClientPhone('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="border-b border-gray-200">
            <div className="flex items-center justify-between p-6 pb-0">
              <h2 className="text-xl font-semibold text-gray-900">Add Child Client</h2>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-6">
              <button
                type="button"
                onClick={() => setMode('select')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  mode === 'select'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Select Existing
              </button>
              <button
                type="button"
                onClick={() => setMode('create')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  mode === 'create'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Create New
              </button>
            </div>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            {mode === 'select' ? (
              <>
                {/* Search Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search for Client
                  </label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Type to search..."
                    autoFocus
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Search by client name
                  </p>
                </div>

                {/* Client Selection */}
                {searchTerm && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Client
                    </label>
                    {loading && (
                      <p className="text-sm text-gray-500">Searching...</p>
                    )}
                    {!loading && clients.length === 0 && (
                      <p className="text-sm text-gray-500">No clients found</p>
                    )}
                    {!loading && clients.length > 0 && (
                      <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-md">
                        {clients.map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => setSelectedClient(client)}
                            className={`w-full text-left p-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                              selectedClient?.id === client.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                            }`}
                          >
                            <div className="font-medium text-sm text-gray-900">
                              {client.client_name || 'Unnamed Client'}
                            </div>
                            <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
                              {client.sf_client_type && <span>{client.sf_client_type}</span>}
                              {client.billing_city && client.billing_state && (
                                <span>• {client.billing_city}, {client.billing_state}</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Selected Client Display */}
                {selectedClient && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <p className="text-xs font-medium text-blue-900 mb-1">Selected Client:</p>
                    <p className="text-sm font-semibold text-blue-900">{selectedClient.client_name}</p>
                    {(selectedClient.sf_client_type || (selectedClient.billing_city && selectedClient.billing_state)) && (
                      <div className="flex items-center space-x-2 text-xs text-blue-700 mt-1">
                        {selectedClient.sf_client_type && <span>{selectedClient.sf_client_type}</span>}
                        {selectedClient.billing_city && selectedClient.billing_state && (
                          <span>• {selectedClient.billing_city}, {selectedClient.billing_state}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Create New Client Form */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Enter client name"
                    autoFocus
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client Type
                  </label>
                  <select
                    value={newClientType}
                    onChange={(e) => setNewClientType(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Select type...</option>
                    <option value="Tenant">Tenant</option>
                    <option value="Landlord">Landlord</option>
                    <option value="Prospect">Prospect</option>
                    <option value="Vendor">Vendor</option>
                    <option value="Partner">Partner</option>
                    <option value="Competitor">Competitor</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    placeholder="(555) 555-5555"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-xs text-blue-700">
                    This client will be created as a child of the current client. You can add more details after creation.
                  </p>
                </div>
              </>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={mode === 'select' ? (!selectedClient || saving) : (!newClientName.trim() || saving)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {saving
                ? (mode === 'select' ? 'Adding...' : 'Creating...')
                : (mode === 'select' ? 'Add Child Client' : 'Create Child Client')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AddChildAccountModal;
