import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePropertyContacts } from '../../hooks/usePropertyContacts';

interface ContactsSidebarProps {
  propertyId: string;
  isOpen: boolean;
  onClose: () => void;
}

const ContactsSidebar: React.FC<ContactsSidebarProps> = ({
  propertyId,
  isOpen,
  onClose
}) => {
  const { contacts, loading, error } = usePropertyContacts({ propertyId, enabled: isOpen });

  // Fetch contacts associated with the property via junction table
  useEffect(() => {
    if (!isOpen || !propertyId) return;

    const fetchPropertyContacts = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log('ContactsSidebar: Fetching contacts for property:', propertyId);
        
        // Get contacts through the property_contact junction table
        const { data: propertyContacts, error: junctionError } = await supabase
          .from('property_contact')
          .select(`
            *,
            contact!fk_property_contact_contact_id (
              *
            )
          `)
          .eq('property_id', propertyId);

        console.log('ContactsSidebar: Property contacts query result:', { propertyContacts, junctionError });

        if (junctionError) throw junctionError;

        const allContacts: PropertyContactWithDetails[] = [];

        // Process junction table contacts
        if (propertyContacts) {
          propertyContacts.forEach((pc: any) => {
            if (pc.contact) {
              allContacts.push({
                ...pc.contact,
                isPrimaryContact: false, // We'll determine this below
                fromDeal: false
              });
            }
          });
        }

        // Also check for the property's primary contact (legacy support)
        const { data: property, error: propertyError } = await supabase
          .from('property')
          .select('contact_id')
          .eq('id', propertyId)
          .single();

        if (!propertyError && property?.contact_id) {
          // Mark the primary contact if it exists in our list
          const primaryContactIndex = allContacts.findIndex(c => c.id === property.contact_id);
          if (primaryContactIndex >= 0) {
            allContacts[primaryContactIndex].isPrimaryContact = true;
          } else {
            // If primary contact not in junction table, fetch it separately
            const { data: primaryContact, error: contactError } = await supabase
              .from('contact')
              .select(`
                *,
                client:client_id (
                  id,
                  client_name,
                  type,
                  phone,
                  email
                )
              `)
              .eq('id', property.contact_id)
              .single();

            if (!contactError && primaryContact) {
              allContacts.unshift({ ...primaryContact, isPrimaryContact: true, fromDeal: false });
            }
          }
        }

        // Also look for contacts through deals associated with this property (as fallback)
        const { data: deals, error: dealsError } = await supabase
          .from('deal')
          .select(`
            id,
            deal_contact!inner (
              contact_id,
              primary_contact,
              contact:contact_id (
                *,
                client:client_id (
                  id,
                  client_name,
                  type,
                  phone,
                  email
                )
              )
            )
          `)
          .eq('property_id', propertyId);

        if (!dealsError && deals) {
          deals.forEach(deal => {
            if (deal.deal_contact) {
              deal.deal_contact.forEach((dc: any) => {
                if (dc.contact && !allContacts.some(c => c.id === dc.contact.id)) {
                  allContacts.push({ ...dc.contact, fromDeal: true, isPrimaryContact: false });
                }
              });
            }
          });
        }

        console.log('ContactsSidebar: Final contacts list:', allContacts);
        setContacts(allContacts);
      } catch (err) {
        console.error('Error fetching property contacts:', err);
        setError(err instanceof Error ? err.message : 'Failed to load contacts');
      } finally {
        setLoading(false);
      }
    };

    fetchPropertyContacts();
  }, [isOpen, propertyId]);

  const getContactInitials = (firstName: string | null, lastName: string | null): string => {
    const first = firstName?.charAt(0)?.toUpperCase() || '';
    const last = lastName?.charAt(0)?.toUpperCase() || '';
    return first + last || '?';
  };

  const getContactDisplayName = (firstName: string | null, lastName: string | null): string => {
    const parts = [firstName, lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Unnamed Contact';
  };

  const handleCall = (phone: string | null, name: string) => {
    if (phone) {
      window.open(`tel:${phone}`, '_self');
    }
  };

  const handleEmail = (email: string | null) => {
    if (email) {
      window.open(`mailto:${email}`, '_self');
    }
  };

  console.log('ContactsSidebar render:', { isOpen, propertyId, contacts: contacts.length });
  
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/10 transition-all duration-300 z-40"
        onClick={onClose}
      />

      {/* Sidebar Panel */}
      <div className={`
        fixed right-0 top-0 h-full w-80 bg-white shadow-2xl border-l border-gray-200
        transform transition-all duration-300 ease-out z-50
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        flex flex-col
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Property Contacts</h2>
              <p className="text-xs text-gray-500">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <p className="text-red-600 font-medium mb-1">Error Loading Contacts</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <p className="text-gray-700 font-medium mb-2">No Contacts Found</p>
              <p className="text-sm text-gray-500 mb-4">No contacts are associated with this property</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {contacts.map((contact) => (
                <div key={contact.id} className="p-4 hover:bg-gray-25 transition-colors">
                  <div className="flex items-start space-x-3">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full flex items-center justify-center shadow-sm">
                        <span className="text-white font-medium text-sm">
                          {getContactInitials(contact.first_name, contact.last_name)}
                        </span>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {getContactDisplayName(contact.first_name, contact.last_name)}
                        </h3>
                        {contact.isPrimaryContact && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                            Primary
                          </span>
                        )}
                        {contact.fromDeal && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
                            Deal
                          </span>
                        )}
                      </div>

                      {contact.company && (
                        <p className="text-xs text-gray-600 mb-1">
                          {contact.company}
                        </p>
                      )}
                      
                      {contact.title && (
                        <p className="text-xs font-medium text-blue-600 mb-2">
                          {contact.title}
                        </p>
                      )}

                      {/* Contact Details */}
                      <div className="space-y-1">
                        {contact.email && (
                          <button
                            onClick={() => handleEmail(contact.email)}
                            className="text-xs text-gray-600 hover:text-blue-600 transition-colors cursor-pointer block"
                          >
                            📧 {contact.email}
                          </button>
                        )}
                        {contact.phone && (
                          <button
                            onClick={() => handleCall(contact.phone, getContactDisplayName(contact.first_name, contact.last_name))}
                            className="text-xs text-gray-600 hover:text-blue-600 transition-colors cursor-pointer block"
                          >
                            📞 {contact.phone}
                          </button>
                        )}
                        {contact.mobile_phone && (
                          <button
                            onClick={() => handleCall(contact.mobile_phone, getContactDisplayName(contact.first_name, contact.last_name))}
                            className="text-xs text-gray-600 hover:text-blue-600 transition-colors cursor-pointer block"
                          >
                            📱 {contact.mobile_phone}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col space-y-1">
                      {contact.phone && (
                        <button
                          onClick={() => handleCall(contact.phone, getContactDisplayName(contact.first_name, contact.last_name))}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="Call"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </button>
                      )}
                      {contact.email && (
                        <button
                          onClick={() => handleEmail(contact.email)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Email"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <button className="w-full flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            <span className="mr-2">+</span>
            Add Contact
          </button>
        </div>
      </div>
    </>
  );
};

export default ContactsSidebar;