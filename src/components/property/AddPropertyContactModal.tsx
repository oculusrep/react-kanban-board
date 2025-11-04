import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Database } from '../../../database-schema';
import ContactFormModal from '../ContactFormModal';

type Contact = Database['public']['Tables']['contact']['Row'];

interface AddPropertyContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  existingContactIds?: string[];
  onContactAdded?: () => void;
}

// Stable empty array to prevent infinite re-renders
const EMPTY_ARRAY: string[] = [];

const AddPropertyContactModal: React.FC<AddPropertyContactModalProps> = ({
  isOpen,
  onClose,
  propertyId,
  existingContactIds = EMPTY_ARRAY,
  onContactAdded
}) => {
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);

  // Load contacts when search term changes
  useEffect(() => {
    if (!isOpen || mode !== 'search') return;

    const loadContacts = async () => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('contact')
          .select('id, first_name, last_name, email, phone, mobile_phone, title, company')
          .order('first_name, last_name');

        if (searchTerm) {
          query = query.or(
            `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%`
          );
        }

        const { data, error: fetchError } = await query.limit(50);

        if (fetchError) throw fetchError;

        // Filter out contacts that are already associated with this property
        const filtered = (data || []).filter(
          contact => !existingContactIds.includes(contact.id)
        );

        setContacts(filtered);
      } catch (err) {
        console.error('Error loading contacts:', err);
        setError(err instanceof Error ? err.message : 'Failed to load contacts');
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(loadContacts, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, isOpen, existingContactIds, mode]);

  const handleAddExistingContact = async () => {
    if (!selectedContact) {
      setError('Please select a contact');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('property_contact')
        .insert({
          property_id: propertyId,
          contact_id: selectedContact.id,
        });

      if (insertError) throw insertError;

      // Success!
      onContactAdded?.();
      handleClose();
    } catch (err) {
      console.error('Error adding contact to property:', err);
      setError(err instanceof Error ? err.message : 'Failed to add contact');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNewContact = () => {
    setShowContactForm(true);
  };

  const handleContactCreated = async (newContact: Contact) => {
    // Contact is already associated with the property via ContactFormModal
    // Just refresh the parent component
    setShowContactForm(false);
    onContactAdded?.();
    handleClose();
  };

  const handleClose = () => {
    setMode('search');
    setSearchTerm('');
    setSelectedContact(null);
    setError(null);
    setShowContactForm(false);
    onClose();
  };

  const getContactDisplayName = (contact: Contact) => {
    const parts = [];
    if (contact.first_name) parts.push(contact.first_name);
    if (contact.last_name) parts.push(contact.last_name);
    return parts.join(' ') || 'Unnamed Contact';
  };

  if (!isOpen) return null;

  // Show the ContactFormModal if in create mode
  if (showContactForm) {
    return (
      <ContactFormModal
        isOpen={showContactForm}
        onClose={() => setShowContactForm(false)}
        onSave={handleContactCreated}
        propertyId={propertyId}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add Contact to Property</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setMode('search')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              mode === 'search'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Select Existing Contact</span>
            </div>
          </button>
          <button
            onClick={() => setMode('create')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              mode === 'create'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Create New Contact</span>
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {mode === 'search' ? (
            <>
              {/* Search Mode */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search for Contact
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, email, or company..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Type to search contacts by name, email, or company
                </p>
              </div>

              {/* Selected Contact Display */}
              {selectedContact && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{getContactDisplayName(selectedContact)}</p>
                    <p className="text-sm text-gray-600">
                      {selectedContact.title && `${selectedContact.title}`}
                      {selectedContact.company && ` • ${selectedContact.company}`}
                      {selectedContact.email && ` • ${selectedContact.email}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedContact(null)}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Contact List */}
              {!selectedContact && (
                <div className="border border-gray-200 rounded-md max-h-96 overflow-y-auto">
                  {loading ? (
                    <div className="p-4 text-center text-gray-500">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="mt-2 text-sm">Loading contacts...</p>
                    </div>
                  ) : contacts.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <p className="text-sm font-medium mb-1">
                        {searchTerm ? 'No contacts found' : 'Start typing to search'}
                      </p>
                      <p className="text-xs">
                        {searchTerm ? 'Try a different search term' : 'Search by name, email, or company'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {contacts.map(contact => (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => setSelectedContact(contact)}
                          className="w-full p-3 text-left hover:bg-blue-50 transition-colors focus:outline-none focus:bg-blue-50"
                        >
                          <div className="flex items-center space-x-3">
                            {/* Avatar */}
                            <div className="flex-shrink-0">
                              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full flex items-center justify-center shadow-sm">
                                <span className="text-white font-medium text-sm">
                                  {(contact.first_name?.charAt(0) || '').toUpperCase()}
                                  {(contact.last_name?.charAt(0) || '').toUpperCase()}
                                </span>
                              </div>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">
                                {getContactDisplayName(contact)}
                              </p>
                              <p className="text-sm text-gray-600 truncate">
                                {contact.title && `${contact.title}`}
                                {contact.company && ` • ${contact.company}`}
                                {contact.email && ` • ${contact.email}`}
                              </p>
                            </div>

                            {/* Chevron */}
                            <div className="flex-shrink-0">
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Create Mode */}
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Create New Contact</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Click the button below to open the contact form and create a new contact.<br/>
                  The contact will be automatically added to this property.
                </p>
                <button
                  onClick={handleCreateNewContact}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Open Contact Form
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {mode === 'search' && (
          <div className="flex items-center justify-end space-x-3 p-4 border-t border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddExistingContact}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving || !selectedContact}
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
                'Add Contact'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddPropertyContactModal;
