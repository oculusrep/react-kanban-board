import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { prepareInsert, prepareUpdate } from '../lib/supabaseHelpers';
import { Database } from '../../database-schema';

type Contact = Database['public']['Tables']['contact']['Row'];
type DealContact = Database['public']['Tables']['deal_contact']['Row'];

interface DealContactWithDetails extends Contact {
  isPrimaryContact?: boolean;
  dealContactId?: string;
  roleId?: string | null;
  roleName?: string | null;
}

interface DealContactsTabProps {
  dealId: string;
}

const DealContactsTab: React.FC<DealContactsTabProps> = ({ dealId }) => {
  const [contacts, setContacts] = useState<DealContactWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [propertyId, setPropertyId] = useState<string | null>(null);

  // Fetch contacts associated with the deal
  const fetchDealContacts = async () => {
    if (!dealId) return;
    setLoading(true);
    setError(null);

    try {
      console.log('DealContactsTab: Fetching contacts for deal:', dealId);

      // First, get the property_id from the deal
      const { data: dealData, error: dealError } = await supabase
        .from('deal')
        .select('property_id')
        .eq('id', dealId)
        .single();

      if (dealError) {
        console.error('Error fetching deal property:', dealError);
      } else {
        console.log('DealContactsTab: Deal data:', dealData);
        if (dealData?.property_id) {
          console.log('DealContactsTab: Property ID found:', dealData.property_id);
          setPropertyId(dealData.property_id);
        } else {
          console.log('DealContactsTab: No property_id on this deal');
        }
      }

      // Get contacts through the deal_contact junction table with role information
      const { data: dealContacts, error: junctionError } = await supabase
        .from('deal_contact')
        .select(`
          id,
          primary_contact,
          role_id,
          contact_role (
            id,
            name
          ),
          contact (
            *
          )
        `)
        .eq('deal_id', dealId);

      console.log('DealContactsTab: Deal contacts query result:', { dealContacts, junctionError });

      if (junctionError) throw junctionError;

      const allContacts: DealContactWithDetails[] = [];

      // Process junction table contacts
      if (dealContacts) {
        dealContacts.forEach((dc: any) => {
          if (dc.contact) {
            allContacts.push({
              ...dc.contact,
              isPrimaryContact: dc.primary_contact || false,
              dealContactId: dc.id,
              roleId: dc.role_id,
              roleName: dc.contact_role?.name || null
            });
          }
        });
      }

      console.log('DealContactsTab: Final contacts list:', allContacts);
      setContacts(allContacts);
    } catch (err) {
      console.error('Error fetching deal contacts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDealContacts();
  }, [dealId]);

  const getContactInitials = (firstName: string | null, lastName: string | null): string => {
    const first = firstName?.charAt(0)?.toUpperCase() || '';
    const last = lastName?.charAt(0)?.toUpperCase() || '';
    return first + last || '?';
  };

  const getContactDisplayName = (firstName: string | null, lastName: string | null): string => {
    const parts = [firstName, lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Unnamed Contact';
  };

  const handleCall = (phone: string | null) => {
    if (phone) {
      window.open(`tel:${phone}`, '_self');
    }
  };

  const handleEmail = (email: string | null) => {
    if (email) {
      window.open(`mailto:${email}`, '_self');
    }
  };

  const handleRemoveContact = async (dealContactId: string, contactName: string) => {
    if (!confirm(`Remove ${contactName} from this deal? This will not affect their relationship with the property.`)) {
      return;
    }

    setDeletingContactId(dealContactId);
    try {
      console.log('Removing deal contact:', dealContactId);

      const { error } = await supabase
        .from('deal_contact')
        .delete()
        .eq('id', dealContactId);

      if (error) throw error;

      console.log('Successfully removed contact from deal');
      // Refresh the contacts list
      await fetchDealContacts();
    } catch (err) {
      console.error('Error removing contact from deal:', err);
      alert(`Failed to remove contact: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingContactId(null);
    }
  };

  const handleSyncFromProperty = async () => {
    if (!propertyId) {
      alert('This deal is not associated with a property.');
      return;
    }

    if (!confirm('This will add any missing property contacts to this deal. Existing deal contacts will not be affected. Continue?')) {
      return;
    }

    setSyncing(true);
    try {
      console.log('Syncing contacts from property:', propertyId);

      // Get property contacts
      const { data: propertyContacts, error: propertyContactsError } = await supabase
        .from('property_contact')
        .select('contact_id')
        .eq('property_id', propertyId);

      if (propertyContactsError) throw propertyContactsError;

      if (!propertyContacts || propertyContacts.length === 0) {
        alert('No contacts found on the property.');
        setSyncing(false);
        return;
      }

      // Get existing deal contacts to avoid duplicates
      const { data: existingDealContacts, error: existingError } = await supabase
        .from('deal_contact')
        .select('contact_id')
        .eq('deal_id', dealId);

      if (existingError) throw existingError;

      const existingContactIds = new Set(existingDealContacts?.map(dc => dc.contact_id) || []);

      // Filter out contacts that are already on the deal
      const newContacts = propertyContacts
        .filter(pc => pc.contact_id && !existingContactIds.has(pc.contact_id))
        .map(pc => ({
          deal_id: dealId,
          contact_id: pc.contact_id,
          primary_contact: false,
          role_id: null,
        }));

      if (newContacts.length === 0) {
        alert('All property contacts are already associated with this deal.');
        setSyncing(false);
        return;
      }

      // Insert new contacts
      const { error: insertError } = await supabase
        .from('deal_contact')
        .insert(prepareInsert(newContacts));

      if (insertError) throw insertError;

      console.log(`Successfully synced ${newContacts.length} contacts from property`);
      alert(`Added ${newContacts.length} contact(s) from the property to this deal.`);

      // Refresh the contacts list
      await fetchDealContacts();
    } catch (err) {
      console.error('Error syncing contacts from property:', err);
      alert(`Failed to sync contacts: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading contacts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Deal Contacts</h2>
            <p className="text-sm text-gray-500 mt-1">
              Contacts associated with this deal. Remove contacts from the deal without affecting their property relationship.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm font-medium text-gray-500">
              {contacts.length} {contacts.length === 1 ? 'Contact' : 'Contacts'}
            </div>
            <button
              onClick={handleSyncFromProperty}
              disabled={syncing || !propertyId}
              title={!propertyId ? 'No property associated with this deal' : 'Sync contacts from associated property'}
              className="inline-flex items-center justify-center p-2 border border-blue-600 rounded-md text-blue-600 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
            >
              <svg className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Contacts List */}
      <div className="divide-y divide-gray-200">
        {contacts.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="text-gray-400 mb-2">
              <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">No contacts associated with this deal yet.</p>
            <p className="text-gray-400 text-xs mt-1">Contacts are automatically copied from the property when converting from an assignment.</p>
          </div>
        ) : (
          contacts.map((contact) => (
            <div key={contact.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 ${
                    contact.isPrimaryContact ? 'bg-blue-600' : 'bg-gray-400'
                  }`}>
                    {getContactInitials(contact.first_name, contact.last_name)}
                  </div>

                  {/* Contact Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-gray-900">
                        {getContactDisplayName(contact.first_name, contact.last_name)}
                      </h3>
                      {contact.isPrimaryContact && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          Primary
                        </span>
                      )}
                      {contact.roleName && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          {contact.roleName}
                        </span>
                      )}
                    </div>

                    {/* Contact Details */}
                    <div className="mt-1 space-y-1">
                      {contact.email && (
                        <div className="flex items-center text-xs text-gray-500">
                          <svg className="w-4 h-4 mr-1.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <button
                            onClick={() => handleEmail(contact.email)}
                            className="hover:text-blue-600 truncate"
                          >
                            {contact.email}
                          </button>
                        </div>
                      )}
                      {contact.phone && (
                        <div className="flex items-center text-xs text-gray-500">
                          <svg className="w-4 h-4 mr-1.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <button
                            onClick={() => handleCall(contact.phone)}
                            className="hover:text-blue-600"
                          >
                            {contact.phone}
                          </button>
                        </div>
                      )}
                      {contact.title && (
                        <div className="flex items-center text-xs text-gray-500">
                          <svg className="w-4 h-4 mr-1.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span>{contact.title}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleRemoveContact(contact.dealContactId!, getContactDisplayName(contact.first_name, contact.last_name))}
                    disabled={deletingContactId === contact.dealContactId}
                    className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Remove from deal"
                  >
                    {deletingContactId === contact.dealContactId ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DealContactsTab;
