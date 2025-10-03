import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import SidebarModule from './sidebar/SidebarModule';
import FileManagerModule from './sidebar/FileManagerModule';

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
  isExpanded?: boolean;
  onToggle?: () => void;
  onClick?: (contactId: string) => void;
}

const ContactItem: React.FC<ContactItemProps> = ({
  contact,
  isExpanded = false,
  onToggle,
  onClick
}) => {
  const displayPhone = contact.mobile_phone || contact.phone;
  const phoneLabel = contact.mobile_phone ? 'Mobile' : 'Phone';

  return (
    <div className="border-b border-gray-100 last:border-b-0">
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

  // Expansion states
  const getSmartDefaults = () => ({
    notes: notes.length > 0,
    contacts: contacts.length > 0,
    files: true  // Files expanded by default
  });

  const [expandedSidebarModules, setExpandedSidebarModules] = useState(() => {
    const saved = localStorage.getItem(`expandedDealSidebarModules_${dealId}`);
    return saved ? JSON.parse(saved) : getSmartDefaults();
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

  // Update smart defaults when data changes
  useEffect(() => {
    if (!loading) {
      setExpandedSidebarModules(prev => {
        const defaults = getSmartDefaults();
        const saved = localStorage.getItem(`expandedDealSidebarModules_${dealId}`);
        return saved ? JSON.parse(saved) : defaults;
      });
    }
  }, [notes.length, contacts.length, loading, dealId]);

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
                showAddButton={false}
                icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              >
                {contacts.map((contact) => (
                  <ContactItem
                    key={contact.id}
                    contact={contact}
                    isExpanded={expandedContacts[contact.id]}
                    onToggle={() => toggleContact(contact.id)}
                    onClick={onContactClick}
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
    </div>
  );
};

export default DealSidebar;
