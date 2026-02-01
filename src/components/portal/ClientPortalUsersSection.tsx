import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface PortalUser {
  contact_id: string;
  contact_name: string;
  contact_email: string;
  is_active: boolean;
  portal_invite_status: string | null;
  portal_last_login_at: string | null;
  granted_at: string | null;
}

interface AvailableContact {
  id: string;
  name: string;
  email: string;
  portal_access_enabled: boolean;
}

interface ClientPortalUsersSectionProps {
  clientId: string | null;
  isNewClient: boolean;
}

/**
 * ClientPortalUsersSection - Admin UI for managing which portal users have access to a client
 *
 * Features:
 * - Shows all contacts with portal access to this client
 * - Add new portal users from existing contacts
 * - Revoke access for existing users
 * - View portal status (invite status, last login)
 */
export default function ClientPortalUsersSection({
  clientId,
  isNewClient,
}: ClientPortalUsersSectionProps) {
  const { user } = useAuth();
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [availableContacts, setAvailableContacts] = useState<AvailableContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [addingContactId, setAddingContactId] = useState<string | null>(null);

  // Load portal users for this client
  useEffect(() => {
    async function loadPortalUsers() {
      if (!clientId || isNewClient) return;

      setLoading(true);
      try {
        // Get all contacts with portal access to this client
        const { data: accessGrants, error: accessError } = await supabase
          .from('portal_user_client_access')
          .select(`
            contact_id,
            is_active,
            granted_at,
            contact:contact_id (
              id,
              first_name,
              last_name,
              email,
              portal_access_enabled,
              portal_invite_status,
              portal_last_login_at
            )
          `)
          .eq('client_id', clientId)
          .eq('is_active', true);

        if (accessError) throw accessError;

        const users: PortalUser[] = (accessGrants || [])
          .filter(g => g.contact)
          .map(g => {
            const contact = g.contact as any;
            return {
              contact_id: g.contact_id,
              contact_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || 'Unknown',
              contact_email: contact.email || '',
              is_active: g.is_active,
              portal_invite_status: contact.portal_invite_status,
              portal_last_login_at: contact.portal_last_login_at,
              granted_at: g.granted_at,
            };
          });

        setPortalUsers(users);
      } catch (err) {
        console.error('Error loading portal users:', err);
      } finally {
        setLoading(false);
      }
    }

    loadPortalUsers();
  }, [clientId, isNewClient]);

  // Load available contacts when adding a user
  useEffect(() => {
    async function loadAvailableContacts() {
      if (!showAddUser || !clientId) return;

      try {
        // Get contacts related to this client that don't already have portal access
        // First get contacts from contact_client_relation
        const { data: relations } = await supabase
          .from('contact_client_relation')
          .select(`
            contact:contact_id (
              id,
              first_name,
              last_name,
              email,
              portal_access_enabled
            )
          `)
          .eq('client_id', clientId)
          .eq('is_active', true);

        // Also get contacts with direct client_id
        const { data: directContacts } = await supabase
          .from('contact')
          .select('id, first_name, last_name, email, portal_access_enabled')
          .eq('client_id', clientId);

        // Combine and dedupe
        const contactsMap = new Map<string, AvailableContact>();

        (relations || []).forEach(r => {
          const contact = r.contact as any;
          if (contact?.id && contact.email) {
            contactsMap.set(contact.id, {
              id: contact.id,
              name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email,
              email: contact.email,
              portal_access_enabled: contact.portal_access_enabled || false,
            });
          }
        });

        (directContacts || []).forEach(contact => {
          if (contact.id && contact.email && !contactsMap.has(contact.id)) {
            contactsMap.set(contact.id, {
              id: contact.id,
              name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email,
              email: contact.email,
              portal_access_enabled: contact.portal_access_enabled || false,
            });
          }
        });

        // Filter out contacts that already have access
        const existingIds = new Set(portalUsers.map(u => u.contact_id));
        const available = Array.from(contactsMap.values())
          .filter(c => !existingIds.has(c.id))
          .sort((a, b) => a.name.localeCompare(b.name));

        setAvailableContacts(available);
      } catch (err) {
        console.error('Error loading available contacts:', err);
      }
    }

    loadAvailableContacts();
  }, [showAddUser, clientId, portalUsers]);

  const handleAddPortalUser = async (contactId: string) => {
    if (!clientId) return;

    setAddingContactId(contactId);
    try {
      // First enable portal access on the contact if not already enabled
      const contact = availableContacts.find(c => c.id === contactId);
      if (contact && !contact.portal_access_enabled) {
        const { error: enableError } = await supabase
          .from('contact')
          .update({ portal_access_enabled: true })
          .eq('id', contactId);

        if (enableError) throw enableError;
      }

      // Grant access to this client
      const { error } = await supabase
        .from('portal_user_client_access')
        .upsert({
          contact_id: contactId,
          client_id: clientId,
          is_active: true,
          granted_by_id: user?.id,
          granted_at: new Date().toISOString(),
        });

      if (error) throw error;

      // Add to local state
      if (contact) {
        setPortalUsers(prev => [
          ...prev,
          {
            contact_id: contactId,
            contact_name: contact.name,
            contact_email: contact.email,
            is_active: true,
            portal_invite_status: null,
            portal_last_login_at: null,
            granted_at: new Date().toISOString(),
          },
        ]);
      }

      // Remove from available contacts
      setAvailableContacts(prev => prev.filter(c => c.id !== contactId));
      setShowAddUser(false);
      setSearchTerm('');
    } catch (err) {
      console.error('Error adding portal user:', err);
    } finally {
      setAddingContactId(null);
    }
  };

  const handleRevokeAccess = async (contactId: string) => {
    if (!clientId) return;

    try {
      const { error } = await supabase
        .from('portal_user_client_access')
        .update({ is_active: false })
        .eq('contact_id', contactId)
        .eq('client_id', clientId);

      if (error) throw error;

      // Remove from local state
      setPortalUsers(prev => prev.filter(u => u.contact_id !== contactId));
    } catch (err) {
      console.error('Error revoking access:', err);
    }
  };

  const getStatusBadge = (user: PortalUser) => {
    if (user.portal_last_login_at) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
          Active
        </span>
      );
    }

    switch (user.portal_invite_status) {
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
            Invite Pending
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
            Invite Expired
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
            Not Invited
          </span>
        );
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const filteredContacts = availableContacts.filter(
    c =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isNewClient) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2 mb-4">
          Portal Users
        </h3>
        <p className="text-sm text-gray-500">
          Save the client first to manage portal users.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-4">
        <h3 className="text-lg font-medium text-gray-900">Portal Users</h3>
        <button
          type="button"
          onClick={() => setShowAddUser(true)}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add User
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Contacts listed here can log into the client portal and view site submits for this client.
      </p>

      {loading ? (
        <div className="flex items-center space-x-2 text-sm text-gray-500 py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span>Loading portal users...</span>
        </div>
      ) : portalUsers.length === 0 ? (
        <div className="text-center py-6">
          <svg
            className="mx-auto h-12 w-12 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-500">No portal users yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Click "Add User" to grant portal access to a contact
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {portalUsers.map(portalUser => (
            <div
              key={portalUser.contact_id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-sm font-medium text-blue-700">
                      {portalUser.contact_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {portalUser.contact_name}
                  </p>
                  <p className="text-xs text-gray-500">{portalUser.contact_email}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                {getStatusBadge(portalUser)}
                {portalUser.portal_last_login_at && (
                  <span className="text-xs text-gray-400">
                    Last login: {formatDate(portalUser.portal_last_login_at)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRevokeAccess(portalUser.contact_id)}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  title="Revoke access"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Add Portal User</h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddUser(false);
                  setSearchTerm('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Select a contact associated with this client to grant portal access.
            </p>

            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search contacts..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Contact List */}
            <div className="max-h-64 overflow-y-auto">
              {filteredContacts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  {availableContacts.length === 0
                    ? 'No contacts available. Add contacts to this client first.'
                    : 'No contacts match your search.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredContacts.map(contact => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => handleAddPortalUser(contact.id)}
                      disabled={addingContactId === contact.id}
                      className="w-full flex items-center justify-between p-3 text-left rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                        <p className="text-xs text-gray-500">{contact.email}</p>
                      </div>
                      {addingContactId === contact.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      ) : (
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowAddUser(false);
                  setSearchTerm('');
                }}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
