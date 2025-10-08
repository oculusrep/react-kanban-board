import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';

type Contact = Database['public']['Tables']['contact']['Row'];

interface AddContactRelationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (contactId: string, role?: string, isPrimary?: boolean) => Promise<void>;
  existingContactIds?: string[];
}

const AddContactRelationModal: React.FC<AddContactRelationModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  existingContactIds = []
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [role, setRole] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load contacts when search term changes
  useEffect(() => {
    if (!isOpen) return;

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
            `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`
          );
        }

        const { data, error: fetchError } = await query.limit(50);

        if (fetchError) throw fetchError;

        // Filter out contacts that are already associated
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
  }, [searchTerm, isOpen, existingContactIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedContact) {
      setError('Please select a contact');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onAdd(selectedContact.id, role || undefined, isPrimary);
      handleClose();
    } catch (err) {
      console.error('Error adding contact relation:', err);
      setError(err instanceof Error ? err.message : 'Failed to add contact');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSearchTerm('');
    setSelectedContact(null);
    setRole('');
    setIsPrimary(false);
    setError(null);
    onClose();
  };

  const getContactDisplayName = (contact: Contact) => {
    const parts = [];
    if (contact.first_name) parts.push(contact.first_name);
    if (contact.last_name) parts.push(contact.last_name);
    return parts.join(' ') || 'Unnamed Contact';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add Contact Association</h2>
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

          {/* Contact Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Contact *
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for a contact..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={saving}
            />

            {/* Selected Contact Display */}
            {selectedContact && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between">
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
              <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-md">
                {loading ? (
                  <div className="p-4 text-center text-gray-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-sm">Loading contacts...</p>
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <p className="text-sm">
                      {searchTerm ? 'No contacts found matching your search' : 'Start typing to search for contacts'}
                    </p>
                  </div>
                ) : (
                  contacts.map(contact => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => setSelectedContact(contact)}
                      className="w-full p-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                    >
                      <p className="font-medium text-gray-900">{getContactDisplayName(contact)}</p>
                      <p className="text-sm text-gray-600">
                        {contact.title && `${contact.title}`}
                        {contact.company && ` • ${contact.company}`}
                        {contact.email && ` • ${contact.email}`}
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Role Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role (Optional)
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Decision Maker, Influencer, Gatekeeper"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={saving}
            />
            <p className="mt-1 text-xs text-gray-500">
              Describe this contact's role at this client
            </p>
          </div>

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
                Set as primary contact
              </span>
            </label>
            <p className="mt-1 ml-6 text-xs text-gray-500">
              The primary contact will be the default contact association for this client
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
        </form>
      </div>
    </div>
  );
};

export default AddContactRelationModal;
