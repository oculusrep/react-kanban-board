import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Database } from '../../../database-schema';

type Contact = Database['public']['Tables']['contact']['Row'];

interface ContactSearchInputProps {
  propertyId: string;
  existingContactIds: string[];
  recentlyAddedIds: string[]; // Track contacts added in this session
  onContactSelected: (contactId: string) => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

const ContactSearchInput: React.FC<ContactSearchInputProps> = ({
  propertyId,
  existingContactIds,
  recentlyAddedIds,
  onContactSelected,
  onCreateNew,
  onCancel
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, contacts.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex === contacts.length) {
        // "+ New Contact" selected
        onCreateNew();
      } else if (selectedIndex >= 0 && contacts[selectedIndex]) {
        // Contact selected
        onContactSelected(contacts[selectedIndex].id);
      }
    }
  };

  const handleContactClick = (contactId: string) => {
    onContactSelected(contactId);
    // Clear search term but keep input focused for next search
    setSearchTerm('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      {/* Search Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search contacts..."
          className="w-full px-3 py-2 pr-20 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
          <button
            onClick={onCancel}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Dropdown Results */}
      {searchTerm && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-y-auto"
        >
          {loading ? (
            <div className="p-3 text-center text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : contacts.length === 0 ? (
            <>
              <div className="p-3 text-sm text-gray-500 text-center">
                No contacts found
              </div>
              <button
                onClick={onCreateNew}
                onMouseEnter={() => setSelectedIndex(0)}
                className={`w-full p-3 text-left hover:bg-blue-50 border-t border-gray-100 flex items-center space-x-2 text-sm text-blue-600 font-medium ${
                  selectedIndex === 0 ? 'bg-blue-50' : ''
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>New Contact</span>
              </button>
            </>
          ) : (
            <>
              {/* Contact Results */}
              {contacts.map((contact, index) => {
                const isRecentlyAdded = recentlyAddedIds.includes(contact.id);
                return (
                  <button
                    key={contact.id}
                    onClick={() => handleContactClick(contact.id)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full p-3 text-left hover:bg-blue-50 border-b border-gray-100 transition-colors ${
                      selectedIndex === index ? 'bg-blue-50' : ''
                    } ${isRecentlyAdded ? 'bg-green-50' : ''}`}
                  >
                    <div className="flex items-center space-x-3">
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isRecentlyAdded ? 'bg-green-500' : 'bg-gradient-to-br from-blue-400 to-blue-500'
                      }`}>
                        {isRecentlyAdded ? (
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="text-white font-medium text-xs">
                            {(contact.first_name?.charAt(0) || '').toUpperCase()}
                            {(contact.last_name?.charAt(0) || '').toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate text-sm ${isRecentlyAdded ? 'text-green-900' : 'text-gray-900'}`}>
                          {getContactDisplayName(contact)}
                          {isRecentlyAdded && (
                            <span className="ml-2 text-xs text-green-600 font-normal">Added</span>
                          )}
                        </p>
                        {(contact.title || contact.company || contact.email) && (
                          <p className={`text-xs truncate ${isRecentlyAdded ? 'text-green-700' : 'text-gray-600'}`}>
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

              {/* "+ New Contact" option */}
              <button
                onClick={onCreateNew}
                onMouseEnter={() => setSelectedIndex(contacts.length)}
                className={`w-full p-3 text-left hover:bg-blue-50 border-t border-gray-200 flex items-center space-x-2 text-sm text-blue-600 font-medium ${
                  selectedIndex === contacts.length ? 'bg-blue-50' : ''
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>New Contact</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ContactSearchInput;
