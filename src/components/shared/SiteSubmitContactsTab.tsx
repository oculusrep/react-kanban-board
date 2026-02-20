/**
 * SiteSubmitContactsTab - Contact management for property associated with site submit
 *
 * Allows viewing, adding, and removing contacts from the property.
 * Used in the map context only.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AddContactsModal from '../property/AddContactsModal';
import ContactFormModal from '../ContactFormModal';

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  title: string | null;
  company: string | null;
}

interface SiteSubmitContactsTabProps {
  propertyId: string | null;
  isEditable: boolean;
  onEditContact?: (contactId: string | null, propertyId: string) => void;
}

export default function SiteSubmitContactsTab({
  propertyId,
  isEditable,
  onEditContact,
}: SiteSubmitContactsTabProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  const loadContacts = async () => {
    if (!propertyId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('property_contact')
        .select(`
          *,
          contact!fk_property_contact_contact_id (*)
        `)
        .eq('property_id', propertyId);

      if (error) throw error;

      const contactsData = (data || [])
        .map((pc: any) => pc.contact)
        .filter(Boolean);

      setContacts(contactsData);
    } catch (err) {
      console.error('Error loading contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, [propertyId]);

  const handleRemoveContact = async (contactId: string) => {
    if (!propertyId) return;
    if (!confirm('Remove this contact from the property?')) return;

    try {
      const { error } = await supabase
        .from('property_contact')
        .delete()
        .eq('property_id', propertyId)
        .eq('contact_id', contactId);

      if (error) throw error;

      setContacts(prev => prev.filter(c => c.id !== contactId));
    } catch (err) {
      console.error('Error removing contact:', err);
      alert('Failed to remove contact');
    }
  };

  if (!propertyId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 p-4">
        <p>No property associated with this site submit</p>
      </div>
    );
  }

  return (
    <div className="p-4 flex-1 overflow-y-auto">
      {/* Add Contact Button */}
      {isEditable && (
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Add Contacts
        </button>
      )}

      {/* Contacts List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p>No contacts associated</p>
          {isEditable && (
            <p className="text-xs mt-1">Click "Add Contacts" to get started</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => {
            const isExpanded = expandedContactId === contact.id;
            const displayPhone = contact.mobile_phone || contact.phone;
            const phoneLabel = contact.mobile_phone ? 'Mobile' : 'Phone';

            return (
              <div key={contact.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="group flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div
                    className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedContactId(isExpanded ? null : contact.id)}
                  >
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-medium text-xs">
                        {(contact.first_name?.charAt(0) || '').toUpperCase()}
                        {(contact.last_name?.charAt(0) || '').toUpperCase()}
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
                    {isEditable && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveContact(contact.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded transition-all"
                        title="Remove contact"
                      >
                        <svg className="w-4 h-4 text-gray-400 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                    <div
                      className="cursor-pointer"
                      onClick={() => setExpandedContactId(isExpanded ? null : contact.id)}
                    >
                      <svg
                        className={`w-3 h-3 text-gray-400 transform transition-transform ${
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

                {/* Expanded Contact Details */}
                {isExpanded && (
                  <div className="px-3 pb-3 bg-blue-25">
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                          <span className="font-medium text-blue-900">Contact Details</span>
                        </div>
                        {isEditable && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onEditContact) {
                                onEditContact(contact.id, propertyId);
                              } else {
                                setEditingContactId(contact.id);
                                setShowContactForm(true);
                              }
                            }}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                            title="Edit contact"
                          >
                            Edit
                          </button>
                        )}
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
      )}

      {/* Add Contacts Modal */}
      {showAddModal && propertyId && (
        <AddContactsModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          propertyId={propertyId}
          existingContactIds={contacts.map(c => c.id)}
          onContactsAdded={() => {
            loadContacts();
            setShowAddModal(false);
          }}
          onCreateNew={() => {
            if (onEditContact) {
              setShowAddModal(false);
              onEditContact(null, propertyId);
            } else {
              setShowContactForm(true);
            }
          }}
        />
      )}

      {/* Contact Form Modal */}
      {showContactForm && propertyId && (
        <ContactFormModal
          isOpen={showContactForm}
          onClose={() => {
            setShowContactForm(false);
            setEditingContactId(null);
          }}
          propertyId={propertyId}
          contactId={editingContactId || undefined}
          onSave={() => {
            loadContacts();
            setShowContactForm(false);
            setEditingContactId(null);
          }}
          onUpdate={() => {
            loadContacts();
            setShowContactForm(false);
            setEditingContactId(null);
          }}
        />
      )}
    </div>
  );
}
