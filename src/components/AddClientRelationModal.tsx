import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import { useContactClientRoles } from '../hooks/useContactClientRoles';

type Client = Database['public']['Tables']['client']['Row'];

// Type for the partial client data we fetch for the search results
interface ClientSearchResult {
  id: string;
  client_name: string | null;
  sf_client_type: string | null;
  phone: string | null;
}

interface AddClientRelationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (clientId: string, role?: string, isPrimary?: boolean) => Promise<void>;
  existingClientIds?: string[];
  contactId?: string; // Optional: for adding roles at the same time
}

const AddClientRelationModal: React.FC<AddClientRelationModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  existingClientIds = [],
  contactId
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [clients, setClients] = useState<ClientSearchResult[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-select role selection
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const { availableRoleTypes, addRole } = useContactClientRoles();

  // Load clients when search term changes
  useEffect(() => {
    if (!isOpen) return;

    // Only load clients if user has started typing
    if (!searchTerm || searchTerm.trim().length === 0) {
      setClients([]);
      setLoading(false);
      return;
    }

    const loadClients = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log('[AddClientRelationModal] Starting client query...');
        let query = supabase
          .from('client')
          .select('id, client_name, sf_client_type, phone')
          .ilike('client_name', `%${searchTerm}%`)
          .order('client_name');

        console.log('[AddClientRelationModal] Executing query with limit 50');
        const { data, error: fetchError } = await query.limit(50);

        if (fetchError) {
          console.error('[AddClientRelationModal] Query error:', fetchError);
          throw fetchError;
        }

        console.log('[AddClientRelationModal] Query successful, got', data?.length, 'clients');

        // Filter out clients that are already associated
        const filtered = (data || []).filter(
          client => !existingClientIds.includes(client.id)
        );

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
  }, [searchTerm, isOpen, existingClientIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedClient) {
      setError('Please select a client');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onAdd(selectedClient.id, undefined, isPrimary);

      // If contactId is provided and roles are selected, add them
      if (contactId && selectedRoleIds.length > 0) {
        for (const roleId of selectedRoleIds) {
          try {
            await addRole(contactId, selectedClient.id, roleId);
          } catch (roleErr) {
            console.error('Error adding role:', roleErr);
            // Continue adding other roles even if one fails
          }
        }
      }

      handleClose();
    } catch (err) {
      console.error('Error adding client relation:', err);
      setError(err instanceof Error ? err.message : 'Failed to add client');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSearchTerm('');
    setSelectedClient(null);
    setIsPrimary(false);
    setSelectedRoleIds([]);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add Client Association</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Client Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Client *
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for a client..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={saving}
            />

            {/* Selected Client Display */}
            {selectedClient && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{selectedClient.client_name}</p>
                  {selectedClient.sf_client_type && (
                    <p className="text-sm text-gray-600">{selectedClient.sf_client_type}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedClient(null)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Client List */}
            {!selectedClient && (
              <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-md">
                {loading ? (
                  <div className="p-4 text-center text-gray-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-sm">Loading clients...</p>
                  </div>
                ) : clients.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <p className="text-sm">
                      {searchTerm ? 'No clients found matching your search' : 'Start typing to search for clients'}
                    </p>
                  </div>
                ) : (
                  clients.map(client => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setSelectedClient(client)}
                      className="w-full p-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                    >
                      <p className="font-medium text-gray-900">{client.client_name}</p>
                      {client.sf_client_type && (
                        <p className="text-sm text-gray-600">{client.sf_client_type}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Role Types (Multi-Select) */}
          {contactId && availableRoleTypes.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assign Roles
              </label>
              <div className="border border-gray-200 rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                {availableRoleTypes.map((roleType) => (
                  <label key={roleType.id} className="flex items-start space-x-3 hover:bg-gray-50 p-2 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.includes(roleType.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRoleIds([...selectedRoleIds, roleType.id]);
                        } else {
                          setSelectedRoleIds(selectedRoleIds.filter(id => id !== roleType.id));
                        }
                      }}
                      className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled={saving}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{roleType.role_name}</p>
                      {roleType.description && (
                        <p className="text-xs text-gray-500">{roleType.description}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Select one or more roles for this contact at this client
              </p>
            </div>
          )}

          {/* Primary Checkbox */}
          <div className="mb-6">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                disabled={saving}
              />
              <span className="text-sm font-medium text-gray-700">
                Set as primary client
              </span>
            </label>
            <p className="mt-1 ml-6 text-xs text-gray-500">
              The primary client will be the default client association for this contact
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving || !selectedClient}
            >
              {saving ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Adding...
                </span>
              ) : (
                'Add Client'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddClientRelationModal;
