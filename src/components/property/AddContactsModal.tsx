import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Database } from '../../../database-schema';

type Contact = Database['public']['Tables']['contact']['Row'];

interface AddContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  existingContactIds: string[];
  onContactsAdded: () => void;
  onCreateNew: () => void;
}

const AddContactsModal: React.FC<AddContactsModalProps> = ({
  isOpen,
  onClose,
  propertyId,
  existingContactIds,
  onContactsAdded,
  onCreateNew
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Search contacts with debounce
  useEffect(() => {
    if (!searchTerm.trim()) {
      setContacts([]);
      return;
    }

    const searchContacts = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('contact')
          .select('id, first_name, last_name, email, phone, mobile_phone, title, company')
          .or(
            `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%`
          )
          .order('first_name, last_name')
          .limit(5);

        if (error) throw error;

        // Filter out contacts already associated with this property
        const filtered = (data || []).filter(
          contact => !existingContactIds.includes(contact.id)
        );

        setContacts(filtered);
      } catch (err) {
        console.error('Error searching contacts:', err);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(searchContacts, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, existingContactIds]);

  const getContactDisplayName = (contact: Contact) => {
    const parts = [];
    if (contact.first_name) parts.push(contact.first_name);
    if (contact.last_name) parts.push(contact.last_name);
    return parts.join(' ') || 'Unnamed Contact';
  };

  const handleToggleContact = (contactId: string) => {
    setSelectedContactIds(prev => {
      if (prev.includes(contactId)) {
        return prev.filter(id => id !== contactId);
      } else {
        return [...prev, contactId];
      }
    });
  };

  const handleAddContacts = async () => {
    if (selectedContactIds.length === 0) return;

    setSaving(true);
    try {
      // Insert all selected contacts
      const insertions = selectedContactIds.map(contactId => ({
        property_id: propertyId,
        contact_id: contactId,
      }));

      const { error } = await supabase
        .from('property_contact')
        .insert(insertions);

      if (error) throw error;

      // Success - notify parent and close
      onContactsAdded();
      handleClose();
    } catch (err) {
      console.error('Error adding contacts:', err);
      alert('Failed to add contacts. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSearchTerm('');
    setSelectedContactIds([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Add Contacts to Property</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search Input */}
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search contacts by name, email, or company..."
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : !searchTerm ? (
              <div className="text-center py-8">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-gray-500 mb-2">Start typing to search for contacts</p>
                <p className="text-sm text-gray-400">Search by name, email, or company</p>
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-gray-500 mb-4">No contacts found</p>
                <button
                  onClick={onCreateNew}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Contact
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {contacts.map((contact) => {
                  const isSelected = selectedContactIds.includes(contact.id);
                  return (
                    <button
                      key={contact.id}
                      onClick={() => handleToggleContact(contact.id)}
                      className={`w-full p-3 text-left rounded-lg border-2 transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        {/* Checkbox */}
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>

                        {/* Avatar */}
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-medium text-sm">
                            {(contact.first_name?.charAt(0) || '').toUpperCase()}
                            {(contact.last_name?.charAt(0) || '').toUpperCase()}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {getContactDisplayName(contact)}
                          </p>
                          {(contact.title || contact.company || contact.email) && (
                            <p className="text-sm text-gray-600 truncate">
                              {contact.title && `${contact.title}`}
                              {contact.company && ` • ${contact.company}`}
                              {contact.email && ` • ${contact.email}`}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onCreateNew}
              className="inline-flex items-center px-4 py-2 text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Contact
            </button>

            <div className="flex items-center space-x-3">
              {selectedContactIds.length > 0 && (
                <span className="text-sm text-gray-600">
                  {selectedContactIds.length} selected
                </span>
              )}
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddContacts}
                disabled={selectedContactIds.length === 0 || saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Adding...' : `Add ${selectedContactIds.length > 0 ? `(${selectedContactIds.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AddContactsModal;
