import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { usePropertyContacts } from '../../hooks/usePropertyContacts';
import { supabase } from '../../lib/supabaseClient';
import AddPropertyContactModal from './AddPropertyContactModal';
import ContactFormModal from '../ContactFormModal';

interface PropertyContactsTabProps {
  propertyId: string;
}

/**
 * Displays contacts associated with a property
 * Used in Property Details slideout
 * Reuses the exact same pattern as PropertySidebar ContactItem
 */
export default function PropertyContactsTab({ propertyId }: PropertyContactsTabProps) {
  const { contacts, loading, error, refetch } = usePropertyContacts({ propertyId });

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [expandedContacts, setExpandedContacts] = useState<Record<string, boolean>>({});

  const toggleContact = (contactId: string) => {
    setExpandedContacts(prev => ({
      ...prev,
      [contactId]: !prev[contactId]
    }));
  };

  const handleRemoveContact = async (contactId: string) => {
    try {
      const { error } = await supabase
        .from('property_contact')
        .delete()
        .eq('property_id', propertyId)
        .eq('contact_id', contactId);

      if (error) throw error;
      await refetch();
    } catch (err) {
      console.error('Error removing contact:', err);
      alert('Failed to remove contact');
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
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
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-red-600 font-medium text-sm mb-1">Error Loading Contacts</p>
        <p className="text-xs text-gray-500">{error}</p>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
        </div>
        <p className="text-gray-700 font-medium text-sm mb-2">No Contacts Found</p>
        <p className="text-xs text-gray-500 mb-4">No contacts are associated with this property</p>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Contact
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3 className="text-sm font-semibold text-gray-900">
          Contacts ({contacts.length})
        </h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Contact List - Exact same pattern as PropertySidebar */}
      <div className="border-t border-gray-100">
        {contacts.map((contact) => {
          const displayPhone = contact.mobile_phone || contact.phone;
          const phoneLabel = contact.mobile_phone ? 'Mobile' : 'Phone';
          const isExpanded = expandedContacts[contact.id];

          return (
            <div key={contact.id} className="border-b border-gray-100 last:border-b-0 group">
              <div className="p-2 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1 min-w-0" onClick={() => toggleContact(contact.id)}>
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-medium text-xs">
                      {contact.first_name?.[0] || '?'}{contact.last_name?.[0] || ''}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {contact.first_name} {contact.last_name}
                      </span>
                      {displayPhone && (
                        <span className="text-xs text-gray-500 truncate">{phoneLabel}: {displayPhone}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {/* Trash icon - visible on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Remove this contact from the property? The contact will not be deleted, only the association.')) {
                        handleRemoveContact(contact.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded"
                    title="Remove contact from property"
                  >
                    <svg
                      className="w-4 h-4 text-gray-400 hover:text-red-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  {/* Chevron - always visible */}
                  <div onClick={() => toggleContact(contact.id)}>
                    <svg
                      className={`w-3 h-3 text-gray-400 transform transition-transform flex-shrink-0 ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
              {isExpanded && (
                <div className="px-2 pb-2 bg-blue-25">
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                        <span className="font-medium text-blue-900">Contact Details</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingContactId(contact.id);
                        }}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                        title="Edit contact"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="space-y-1 ml-4">
                      {contact.title && (
                        <div><span className="font-medium text-blue-800">Title:</span> <span className="text-blue-700">{contact.title}</span></div>
                      )}
                      {contact.company && (
                        <div><span className="font-medium text-blue-800">Company:</span> <span className="text-blue-700">{contact.company}</span></div>
                      )}
                      {contact.email && (
                        <div><span className="font-medium text-blue-800">Email:</span> <span className="text-blue-700">{contact.email}</span></div>
                      )}
                      {contact.phone && (
                        <div><span className="font-medium text-blue-800">Phone:</span> <span className="text-blue-700">{contact.phone}</span></div>
                      )}
                      {contact.mobile_phone && (
                        <div><span className="font-medium text-blue-800">Mobile:</span> <span className="text-blue-700">{contact.mobile_phone}</span></div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Contact Modal */}
      <AddPropertyContactModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        propertyId={propertyId}
        onContactAdded={() => {
          refetch();
          setShowAddModal(false);
        }}
      />

      {/* Edit Contact Modal */}
      {editingContactId && (
        <ContactFormModal
          isOpen={true}
          onClose={() => setEditingContactId(null)}
          propertyId={propertyId}
          contactId={editingContactId}
          onSave={() => {
            refetch();
            setEditingContactId(null);
          }}
          onUpdate={() => {
            refetch();
            setEditingContactId(null);
          }}
        />
      )}
    </div>
  );
}
