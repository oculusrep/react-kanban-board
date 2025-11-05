import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import SidebarModule from './sidebar/SidebarModule';
import FileManagerModule from './sidebar/FileManagerModule';
import ContactFormModal from './ContactFormModal';
import ContactDealRolesManager from './ContactDealRolesManager';

type Note = Database['public']['Tables']['note']['Row'];
type Contact = Database['public']['Tables']['contact']['Row'];

interface DealSidebarProps {
  dealId: string;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onContactClick?: (contactId: string) => void;
}

// Contact Item Component
interface ContactItemProps {
  contact: Contact;
  dealId: string;
  dealName?: string;
  isExpanded?: boolean;
  onToggle?: () => void;
  onClick?: (contactId: string) => void;
  onDelete?: (contactId: string) => void;
  onRoleChange?: () => void;
}

const ContactItem: React.FC<ContactItemProps> = ({
  contact,
  dealId,
  dealName,
  isExpanded = false,
  onToggle,
  onClick,
  onDelete,
  onRoleChange
}) => {
  const displayPhone = contact.mobile_phone || contact.phone;
  const phoneLabel = contact.mobile_phone ? 'Mobile' : 'Phone';

  return (
    <div className="border-b border-gray-100 last:border-b-0 group">
      <div
        className="p-2 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
        onClick={() => onClick?.(contact.id)}
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
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
        <div className="flex items-center space-x-1">
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(contact.id);
              }}
              className="p-1 text-gray-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove from deal"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.();
            }}
          >
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
          </button>
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
            {/* Contact Roles */}
            <div className="mt-3 pt-2 border-t border-blue-200">
              <ContactDealRolesManager
                contactId={contact.id}
                dealId={dealId}
                contactName={`${contact.first_name} ${contact.last_name}`}
                dealName={dealName}
                compact={true}
                onRoleChange={onRoleChange}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Note Item Component
interface NoteItemProps {
  note: Note;
  onUpdate: (noteId: string, title: string, body: string) => void;
  onDelete: (noteId: string) => void;
  initialEditMode?: boolean;
}

const NoteItem: React.FC<NoteItemProps> = ({ note, onUpdate, onDelete, initialEditMode = false }) => {
  const [isEditing, setIsEditing] = useState(initialEditMode);
  const [title, setTitle] = useState(note.title || '');
  const [body, setBody] = useState(note.body || '');
  const [linkedObjects, setLinkedObjects] = useState<any[]>([]);
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchType, setSearchType] = useState<'deal' | 'contact' | 'property' | 'client'>('deal');

  // Fetch linked objects when editing
  useEffect(() => {
    if (isEditing) {
      fetchLinkedObjects();
    }
  }, [isEditing]);

  const fetchLinkedObjects = async () => {
    console.log('Fetching linked objects for note:', note.id);
    const { data, error } = await supabase
      .from('note_object_link')
      .select(`
        id,
        object_type,
        object_id,
        client:client!note_object_link_client_id_fkey(id, client_name),
        deal:deal!note_object_link_deal_id_fkey(id, deal_name),
        contact:contact!note_object_link_contact_id_fkey(id, first_name, last_name),
        property:property!note_object_link_property_id_fkey(id, property_name)
      `)
      .eq('note_id', note.id);

    console.log('Fetched linked objects:', { data, error });

    if (!error && data) {
      setLinkedObjects(data);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    let results: any[] = [];

    if (searchType === 'deal') {
      const { data } = await supabase
        .from('deal')
        .select('id, deal_name')
        .ilike('deal_name', `%${query}%`)
        .limit(10);
      results = data || [];
    } else if (searchType === 'contact') {
      const { data } = await supabase
        .from('contact')
        .select('id, first_name, last_name, email')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);
      results = data || [];
    } else if (searchType === 'property') {
      const { data } = await supabase
        .from('property')
        .select('id, property_name, address')
        .ilike('property_name', `%${query}%`)
        .limit(10);
      results = data || [];
    } else if (searchType === 'client') {
      const { data } = await supabase
        .from('client')
        .select('id, client_name')
        .ilike('client_name', `%${query}%`)
        .limit(10);
      results = data || [];
    }

    setSearchResults(results);
  };

  const handleLinkObject = async (objectId: string) => {
    const insertData = {
      note_id: note.id,
      object_type: searchType,
      object_id: objectId,
      [`${searchType}_id`]: objectId
    };

    console.log('Attempting to link object:', insertData);

    const { data, error } = await supabase
      .from('note_object_link')
      .insert(insertData)
      .select();

    if (error) {
      console.error('Error linking object:', error);
    } else {
      console.log('Link created successfully:', data);
      await fetchLinkedObjects();
      setSearchQuery('');
      setSearchResults([]);
      setShowLinkSearch(false);
    }
  };

  const handleUnlinkObject = async (linkId: string) => {
    const { error } = await supabase
      .from('note_object_link')
      .delete()
      .eq('id', linkId);

    if (!error) {
      await fetchLinkedObjects();
    }
  };

  const handleSave = async () => {
    const { error } = await supabase
      .from('note')
      .update({ title, body })
      .eq('id', note.id);

    if (!error) {
      onUpdate(note.id, title, body);
      setIsEditing(false);
    }
  };

  return (
    <div className={`p-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${isEditing ? 'min-h-[400px]' : ''}`}>
      {isEditing ? (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Note content"
            className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
          />

          {/* Linked Objects Section */}
          <div className="border-t border-gray-200 pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-700">Linked to:</span>
              <button
                onClick={() => setShowLinkSearch(!showLinkSearch)}
                className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                + Link
              </button>
            </div>

            {/* Display linked objects */}
            {linkedObjects.length > 0 && (
              <div className="space-y-1 mb-2">
                {linkedObjects.map((link) => {
                  const obj = link.client || link.deal || link.contact || link.property;
                  const displayName = link.object_type === 'contact'
                    ? `${obj?.first_name} ${obj?.last_name}`
                    : obj?.client_name || obj?.deal_name || obj?.property_name || 'Unknown';

                  return (
                    <div key={link.id} className="flex items-center justify-between bg-blue-50 px-2 py-1 rounded text-xs">
                      <div className="flex items-center space-x-1">
                        <span className="text-blue-600 font-medium capitalize">{link.object_type}:</span>
                        <span className="text-gray-700">{displayName}</span>
                      </div>
                      <button
                        onClick={() => handleUnlinkObject(link.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Link Search Interface */}
            {showLinkSearch && (
              <div className="bg-gray-50 p-2 rounded space-y-2">
                <div className="flex space-x-2">
                  <select
                    value={searchType}
                    onChange={(e) => setSearchType(e.target.value as any)}
                    className="text-xs border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="deal">Deal</option>
                    <option value="contact">Contact</option>
                    <option value="property">Property</option>
                    <option value="client">Client</option>
                  </select>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder={`Search ${searchType}s...`}
                    className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                  />
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="max-h-32 overflow-y-auto border border-gray-200 rounded bg-white">
                    {searchResults.map((result) => {
                      const displayName = searchType === 'contact'
                        ? `${result.first_name} ${result.last_name}`
                        : result.client_name || result.deal_name || result.property_name;

                      return (
                        <button
                          key={result.id}
                          onClick={() => handleLinkObject(result.id)}
                          className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                        >
                          {displayName}
                          {searchType === 'contact' && result.email && (
                            <span className="text-gray-500 ml-1">({result.email})</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleSave}
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={() => {
                setTitle(note.title || '');
                setBody(note.body || '');
                setIsEditing(false);
              }}
              className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between group">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">{note.title || 'Untitled Note'}</p>
            {note.body && (
              <p className="text-xs text-gray-600 mt-1 line-clamp-2">{note.body}</p>
            )}
          </div>
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 text-gray-500 hover:text-blue-600"
              title="Edit"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => onDelete(note.id)}
              className="p-1 text-gray-500 hover:text-red-600"
              title="Delete"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// AddContactsModal adapted for deals
interface AddContactsModalForDealsProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  existingContactIds: string[];
  onContactsAdded: () => void;
  onCreateNew: () => void;
}

const AddContactsModalForDeals: React.FC<AddContactsModalForDealsProps> = ({
  isOpen,
  onClose,
  dealId,
  existingContactIds,
  onContactsAdded,
  onCreateNew
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Search contacts with debounce
  React.useEffect(() => {
    if (!searchTerm.trim()) {
      setContacts([]);
      return;
    }

    const searchContacts = async () => {
      setLoading(true);
      try {
        // Handle "First Last" or "Last First" patterns
        const trimmedSearch = searchTerm.trim();
        const parts = trimmedSearch.split(/\s+/);

        let query = supabase
          .from('contact')
          .select('id, first_name, last_name, email, phone, mobile_phone, title, company');

        if (parts.length >= 2) {
          // Multi-word search - try "First Last" AND "Last First"
          const [part1, part2] = parts;
          query = query.or(
            `and(first_name.ilike.%${part1}%,last_name.ilike.%${part2}%),` +
            `and(first_name.ilike.%${part2}%,last_name.ilike.%${part1}%),` +
            `first_name.ilike.%${trimmedSearch}%,` +
            `last_name.ilike.%${trimmedSearch}%,` +
            `email.ilike.%${trimmedSearch}%,` +
            `company.ilike.%${trimmedSearch}%`
          );
        } else {
          // Single word search
          query = query.or(
            `first_name.ilike.%${trimmedSearch}%,` +
            `last_name.ilike.%${trimmedSearch}%,` +
            `email.ilike.%${trimmedSearch}%,` +
            `company.ilike.%${trimmedSearch}%`
          );
        }

        const { data, error } = await query
          .order('first_name, last_name')
          .limit(5);

        if (error) throw error;

        // Filter out contacts already associated with this deal
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
        deal_id: dealId,
        contact_id: contactId,
        primary_contact: false,
        role_id: null,
      }));

      const { error } = await supabase
        .from('deal_contact')
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
            <h2 className="text-lg font-semibold text-gray-900">Add Contacts to Deal</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-gray-200">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, or company..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading && (
              <div className="text-center text-gray-500 py-8">
                Searching...
              </div>
            )}

            {!loading && searchTerm && contacts.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">No contacts found</p>
                <button
                  onClick={onCreateNew}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create New Contact
                </button>
              </div>
            )}

            {!loading && contacts.length > 0 && (
              <div className="space-y-2">
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    onClick={() => handleToggleContact(contact.id)}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedContactIds.includes(contact.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedContactIds.includes(contact.id)}
                          onChange={() => {}}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <div>
                          <div className="font-medium text-gray-900">
                            {getContactDisplayName(contact)}
                          </div>
                          {contact.email && (
                            <div className="text-sm text-gray-500">{contact.email}</div>
                          )}
                          {(contact.company || contact.title) && (
                            <div className="text-xs text-gray-400">
                              {[contact.title, contact.company].filter(Boolean).join(' at ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-gray-200">
            <button
              onClick={onCreateNew}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              + Create New Contact
            </button>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleAddContacts}
                disabled={selectedContactIds.length === 0 || saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Adding...' : `Add ${selectedContactIds.length} Contact${selectedContactIds.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const DealSidebar: React.FC<DealSidebarProps> = ({
  dealId,
  isMinimized = false,
  onMinimize,
  onContactClick
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newlyCreatedNoteId, setNewlyCreatedNoteId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [dealName, setDealName] = useState<string | null>(null);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showContactFormModal, setShowContactFormModal] = useState(false);

  // Expansion states - all collapsed by default
  const [expandedSidebarModules, setExpandedSidebarModules] = useState(() => {
    const saved = localStorage.getItem(`expandedDealSidebarModules_${dealId}`);
    return saved ? JSON.parse(saved) : {
      notes: false,
      contacts: false,
      files: false
    };
  });

  const [expandedContacts, setExpandedContacts] = useState<Record<string, boolean>>({});

  // Fetch notes using note_object_link (many-to-many relationship)
  useEffect(() => {
    if (!dealId) return;

    const fetchNotes = async () => {
      try {
        const { data: noteAssociations, error } = await supabase
          .from('note_object_link')
          .select(`
            note_id,
            note!note_object_link_note_id_fkey (*)
          `)
          .eq('object_type', 'deal')
          .eq('object_id', dealId);

        if (error) throw error;

        const notesData: Note[] = [];
        if (noteAssociations) {
          noteAssociations.forEach((na: any) => {
            if (na.note) {
              notesData.push(na.note);
            }
          });
        }

        setNotes(notesData);
      } catch (err) {
        console.error('Error fetching notes:', err);
      }
    };

    fetchNotes();
  }, [dealId]);

  // Fetch associated contacts
  useEffect(() => {
    if (!dealId) return;

    const fetchContacts = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch property_id and deal_name from deal
        const { data: dealData } = await supabase
          .from('deal')
          .select('property_id, deal_name')
          .eq('id', dealId)
          .single();

        if (dealData?.property_id) {
          setPropertyId(dealData.property_id);
        }
        if (dealData?.deal_name) {
          setDealName(dealData.deal_name);
        }

        const { data, error } = await supabase
          .from('deal_contact')
          .select('contact:contact_id(*)')
          .eq('deal_id', dealId);

        if (error) throw error;

        if (data) {
          setContacts(data.map((dc: any) => dc.contact).filter(Boolean));
        }
      } catch (err) {
        console.error('Error loading deal contacts:', err);
        setError(err instanceof Error ? err.message : 'Failed to load contacts');
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, [dealId]);

  const handleSyncFromProperty = async () => {
    if (!propertyId) return;

    setSyncing(true);
    try {
      // Get property contacts
      const { data: propertyContacts, error: propertyContactsError } = await supabase
        .from('property_contact')
        .select('contact_id')
        .eq('property_id', propertyId);

      if (propertyContactsError) throw propertyContactsError;
      if (!propertyContacts || propertyContacts.length === 0) {
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
        setSyncing(false);
        return;
      }

      // Insert new contacts
      const { error: insertError } = await supabase
        .from('deal_contact')
        .insert(newContacts);

      if (insertError) throw insertError;

      // Refresh the contacts list
      const { data, error } = await supabase
        .from('deal_contact')
        .select('contact:contact_id(*)')
        .eq('deal_id', dealId);

      if (!error && data) {
        setContacts(data.map((dc: any) => dc.contact).filter(Boolean));
      }
    } catch (err) {
      console.error('Error syncing contacts from property:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    try {
      // Delete from deal_contact junction table (does NOT affect property_contact)
      const { error } = await supabase
        .from('deal_contact')
        .delete()
        .eq('deal_id', dealId)
        .eq('contact_id', contactId);

      if (error) throw error;

      // Update local state to remove the contact
      setContacts(prev => prev.filter(c => c.id !== contactId));
    } catch (err) {
      console.error('Error removing contact from deal:', err);
      alert('Failed to remove contact from deal');
    }
  };

  const handleAddContact = () => {
    setShowAddContactModal(true);
  };

  const handleContactsAdded = async () => {
    // Refresh the contacts list after adding
    const { data, error } = await supabase
      .from('deal_contact')
      .select('contact:contact_id(*)')
      .eq('deal_id', dealId);

    if (!error && data) {
      setContacts(data.map((dc: any) => dc.contact).filter(Boolean));
    }

    setShowAddContactModal(false);
  };

  const handleCreateNewContact = () => {
    setShowAddContactModal(false);
    setShowContactFormModal(true);
  };

  const handleContactCreated = async () => {
    // Refresh contacts after creating a new one
    await handleContactsAdded();
    setShowContactFormModal(false);
  };

  const toggleSidebarModule = (module: keyof typeof expandedSidebarModules) => {
    const newState = {
      ...expandedSidebarModules,
      [module]: !expandedSidebarModules[module]
    };
    setExpandedSidebarModules(newState);
    localStorage.setItem(`expandedDealSidebarModules_${dealId}`, JSON.stringify(newState));
  };

  const toggleContact = (contactId: string) => {
    const newState = {
      ...expandedContacts,
      [contactId]: !expandedContacts[contactId]
    };
    setExpandedContacts(newState);
    localStorage.setItem(`expandedDealContacts_${dealId}`, JSON.stringify(newState));
  };

  const handleAddNote = async () => {
    try {
      // First create the note
      const { data: newNote, error: noteError } = await supabase
        .from('note')
        .insert({
          title: '',
          body: ''
        })
        .select()
        .single();

      if (noteError) throw noteError;

      // Then create the link to the deal
      const { error: linkError } = await supabase
        .from('note_object_link')
        .insert({
          note_id: newNote.id,
          object_type: 'deal',
          object_id: dealId,
          deal_id: dealId
        });

      if (linkError) throw linkError;

      // Add to local state and mark as newly created to open in edit mode
      setNotes(prev => [newNote, ...prev]);
      setNewlyCreatedNoteId(newNote.id);
    } catch (err) {
      console.error('Error creating note:', err);
    }
  };

  const handleNoteUpdate = (noteId: string, newTitle: string, newBody: string) => {
    setNotes(prev => prev.map(note =>
      note.id === noteId ? { ...note, title: newTitle, body: newBody } : note
    ));
  };

  const handleNoteDelete = async (noteId: string) => {
    const { error } = await supabase
      .from('note')
      .delete()
      .eq('id', noteId);

    if (!error) {
      setNotes(prev => prev.filter(note => note.id !== noteId));
    }
  };

  return (
    <div
      className={`fixed right-0 top-0 h-full bg-white border-l border-gray-200 shadow-xl transition-all duration-300 ${
        isMinimized ? 'w-12' : 'w-[500px]'
      } z-40 ${isMinimized ? 'overflow-hidden' : 'overflow-y-auto'}`}
      style={{ top: '180px', height: 'calc(100vh - 180px)' }}
    >
      {/* Header with minimize/expand controls */}
      <div className={`flex items-center ${isMinimized ? 'justify-center' : 'justify-between'} p-2 border-b border-gray-200 bg-gray-50`}>
        {!isMinimized && (
          <h3 className="text-sm font-medium text-gray-700">Deal Info</h3>
        )}
        <button
          onClick={onMinimize}
          className={`p-2 hover:bg-blue-100 hover:text-blue-600 rounded-md transition-colors group ${
            isMinimized ? 'text-gray-600' : 'text-gray-500'
          }`}
          title={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isMinimized ? (
              // Expand icon - panel expand right
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M4 12h16" />
            ) : (
              // Minimize icon - panel collapse right
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M20 12H4" />
            )}
          </svg>
        </button>
      </div>

      {/* Sidebar Content */}
      {!isMinimized && (
        <div className="p-3">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-600">
              <p className="font-medium">Error loading data</p>
              <p className="text-sm">{error}</p>
            </div>
          ) : (
            <>
              {/* Contacts Module */}
              <SidebarModule
                title="Associated Contacts"
                count={contacts.length}
                isExpanded={expandedSidebarModules.contacts}
                onToggle={() => toggleSidebarModule('contacts')}
                isEmpty={contacts.length === 0}
                showAddButton={true}
                onAddNew={handleAddContact}
                icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                customAction={
                  propertyId && (
                    <button
                      onClick={handleSyncFromProperty}
                      disabled={syncing}
                      title="Sync contacts from associated property"
                      className="inline-flex items-center justify-center p-1 border border-blue-600 rounded text-blue-600 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 ml-2"
                    >
                      <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )
                }
              >
                {contacts.map((contact) => (
                  <ContactItem
                    key={contact.id}
                    contact={contact}
                    dealId={dealId}
                    dealName={dealName || undefined}
                    isExpanded={expandedContacts[contact.id]}
                    onToggle={() => toggleContact(contact.id)}
                    onClick={onContactClick}
                    onDelete={handleRemoveContact}
                    onRoleChange={fetchContacts}
                  />
                ))}
              </SidebarModule>

              {/* Files Module */}
              <FileManagerModule
                entityType="deal"
                entityId={dealId}
                isExpanded={expandedSidebarModules.files}
                onToggle={() => toggleSidebarModule('files')}
              />

              {/* Notes Module */}
              <SidebarModule
                title="Notes"
                count={notes.length}
                onAddNew={handleAddNote}
                isExpanded={expandedSidebarModules.notes}
                onToggle={() => toggleSidebarModule('notes')}
                isEmpty={notes.length === 0}
                icon="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              >
                <div className="p-2">
                  {notes.map((note) => (
                    <NoteItem
                      key={note.id}
                      note={note}
                      onUpdate={handleNoteUpdate}
                      onDelete={handleNoteDelete}
                      initialEditMode={note.id === newlyCreatedNoteId}
                    />
                  ))}
                </div>
              </SidebarModule>
            </>
          )}
        </div>
      )}

      {/* Add Contacts Modal - adapted for deals */}
      <AddContactsModalForDeals
        isOpen={showAddContactModal}
        onClose={() => setShowAddContactModal(false)}
        dealId={dealId}
        existingContactIds={contacts.map(c => c.id)}
        onContactsAdded={handleContactsAdded}
        onCreateNew={handleCreateNewContact}
      />

      {/* Contact Form Modal for creating new contacts */}
      {showContactFormModal && (
        <ContactFormModal
          isOpen={showContactFormModal}
          onClose={() => setShowContactFormModal(false)}
          onSave={handleContactCreated}
        />
      )}
    </div>
  );
};

export default DealSidebar;
