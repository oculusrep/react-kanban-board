import React, { useState, useEffect } from 'react';
import 'react-quill/dist/quill.snow.css';
import './QuillEditor.css';
import QuillWrapper from './QuillWrapper';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';

type Note = Database['public']['Tables']['note']['Row'];
type NoteInsert = Database['public']['Tables']['note']['Insert'];

interface NoteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (note: Note) => void;
  onUpdate?: (note: Note) => void;
  noteId?: string;
  clientId?: string;
  dealId?: string;
  contactId?: string;
  propertyId?: string;
  assignmentId?: string;
  siteSubmitId?: string;
}

interface FormData {
  title: string;
  body: string;
}

interface LinkedObject {
  id: string;
  object_type: string;
  object_id: string;
  client?: { id: string; client_name: string | null };
  deal?: { id: string; deal_name: string | null };
  contact?: { id: string; first_name: string | null; last_name: string | null };
  property?: { id: string; property_name: string | null };
}

const NoteFormModal: React.FC<NoteFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onUpdate,
  noteId,
  clientId,
  dealId,
  contactId,
  propertyId,
  assignmentId,
  siteSubmitId
}) => {
  const [formData, setFormData] = useState<FormData>({
    title: '',
    body: ''
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [linkedObjects, setLinkedObjects] = useState<LinkedObject[]>([]);
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchType, setSearchType] = useState<'deal' | 'contact' | 'property' | 'client'>('client');

  // Load existing note if editing
  useEffect(() => {
    if (isOpen && noteId) {
      loadNote();
      fetchLinkedObjects();
    } else if (isOpen) {
      // Reset form for new note
      setFormData({
        title: '',
        body: ''
      });
      setErrors({});
      setLinkedObjects([]);
      setShowLinkSearch(false);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen, noteId]);

  const loadNote = async () => {
    if (!noteId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('note')
        .select('*')
        .eq('id', noteId)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          title: data.title || '',
          body: data.body || ''
        });
      }
    } catch (err) {
      console.error('Error loading note:', err);
      setErrors({ general: 'Failed to load note' });
    } finally {
      setLoading(false);
    }
  };

  const fetchLinkedObjects = async () => {
    if (!noteId) return;

    try {
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
        .eq('note_id', noteId);

      if (!error && data) {
        setLinkedObjects(data as LinkedObject[]);
      }
    } catch (err) {
      console.error('Error fetching linked objects:', err);
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
        .or(`property_name.ilike.%${query}%,address.ilike.%${query}%`)
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
    if (noteId) {
      // If note exists, save to database immediately
      const insertData: any = {
        note_id: noteId,
        sf_content_document_link_id: `manual_${Date.now()}_${searchType}_${objectId}`,
        object_type: searchType,
        object_id: objectId,
        [`${searchType}_id`]: objectId
      };

      const { error } = await supabase
        .from('note_object_link')
        .insert(insertData);

      if (error) {
        console.error('Error linking object:', error);
      } else {
        await fetchLinkedObjects();
        setSearchQuery('');
        setSearchResults([]);
        setShowLinkSearch(false);
      }
    } else {
      // If note doesn't exist yet, add to pending links
      const result = searchResults.find(r => r.id === objectId);
      if (result) {
        const displayName = searchType === 'contact'
          ? `${result.first_name} ${result.last_name}`
          : result.client_name || result.deal_name || result.property_name;

        const newLink: LinkedObject = {
          id: `temp_${Date.now()}`,
          object_type: searchType,
          object_id: objectId,
          ...(searchType === 'client' && { client: { id: objectId, client_name: displayName } }),
          ...(searchType === 'contact' && { contact: { id: objectId, first_name: result.first_name, last_name: result.last_name } }),
          ...(searchType === 'deal' && { deal: { id: objectId, deal_name: displayName } }),
          ...(searchType === 'property' && { property: { id: objectId, property_name: displayName } })
        };

        setLinkedObjects(prev => [...prev, newLink]);
        setSearchQuery('');
        setSearchResults([]);
        setShowLinkSearch(false);
      }
    }
  };

  const handleUnlinkObject = async (linkId: string) => {
    if (linkId.startsWith('temp_')) {
      // Remove from pending links (not yet saved)
      setLinkedObjects(prev => prev.filter(link => link.id !== linkId));
    } else {
      // Remove from database
      const { error } = await supabase
        .from('note_object_link')
        .delete()
        .eq('id', linkId);

      if (!error) {
        await fetchLinkedObjects();
      }
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    // Remove HTML tags for validation (Quill uses HTML)
    const textContent = formData.body.replace(/<[^>]*>/g, '').trim();
    if (!textContent) {
      newErrors.body = 'Note content is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      if (noteId) {
        // Update existing note
        const { data, error } = await supabase
          .from('note')
          .update({
            title: formData.title.trim(),
            body: formData.body,
            updated_at: new Date().toISOString()
          })
          .eq('id', noteId)
          .select()
          .single();

        if (error) throw error;
        onUpdate?.(data);
      } else {
        // Create new note
        const noteData: NoteInsert = {
          sf_content_note_id: `manual_${Date.now()}_${Math.random().toString(36).substring(2)}`,
          title: formData.title.trim(),
          body: formData.body,
          content_size: formData.body.replace(/<[^>]*>/g, '').length,
          share_type: 'V',
          visibility: 'AllUsers',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data: note, error: noteError } = await supabase
          .from('note')
          .insert([noteData])
          .select()
          .single();

        if (noteError) throw noteError;

        // Create note associations from props
        const associations = [];
        if (clientId) associations.push({ object_type: 'client', object_id: clientId });
        if (dealId) associations.push({ object_type: 'deal', object_id: dealId });
        if (contactId) associations.push({ object_type: 'contact', object_id: contactId });
        if (propertyId) associations.push({ object_type: 'property', object_id: propertyId });
        if (assignmentId) associations.push({ object_type: 'assignment', object_id: assignmentId });
        if (siteSubmitId) associations.push({ object_type: 'site_submit', object_id: siteSubmitId });

        // Add manually linked objects from the UI
        linkedObjects.forEach(link => {
          associations.push({
            object_type: link.object_type,
            object_id: link.object_id
          });
        });

        if (associations.length > 0) {
          const associationData = associations.map(assoc => ({
            note_id: note.id,
            sf_content_document_link_id: `manual_${Date.now()}_${assoc.object_type}_${assoc.object_id}`,
            object_type: assoc.object_type,
            object_id: assoc.object_id,
            [`${assoc.object_type}_id`]: assoc.object_id
          }));

          const { error: linkError } = await supabase
            .from('note_object_link')
            .insert(associationData);

          if (linkError) {
            console.error('Error creating note associations:', linkError);
            // Don't fail the note creation for association errors
          }
        }

        onSave?.(note);
      }

      onClose();
    } catch (err) {
      console.error('Error saving note:', err);
      setErrors({ general: err instanceof Error ? err.message : 'Failed to save note' });
    } finally {
      setSaving(false);
    }
  };

  // Quill editor configuration
  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'color': [] }, { 'background': [] }],
      ['link'],
      ['clean']
    ],
  };

  const quillFormats = [
    'header', 'bold', 'italic', 'underline',
    'list', 'bullet', 'color', 'background', 'link'
  ];

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative w-full max-w-4xl transform overflow-hidden rounded-lg bg-white shadow-xl">
            {/* Header */}
            <div className="bg-white px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {noteId ? 'Edit Note' : 'Create New Note'}
                </h3>
                <button
                  onClick={onClose}
                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-6 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading note...</p>
              </div>
            ) : (
              <>
                {/* Form Content */}
                <div className="px-6 py-4 max-h-[calc(100vh-200px)] overflow-y-auto">
                  {errors.general && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                      {errors.general}
                    </div>
                  )}

                  {/* Title */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Title *
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.title ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Enter note title..."
                      tabIndex={1}
                      autoFocus
                    />
                    {errors.title && (
                      <p className="mt-1 text-sm text-red-600">{errors.title}</p>
                    )}
                  </div>

                  {/* Rich Text Editor */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Content *
                    </label>

                    <div className={`border rounded-md ${errors.body ? 'border-red-300' : 'border-gray-300'}`}>
                      <QuillWrapper
                        value={formData.body}
                        onChange={(content) => handleInputChange('body', content)}
                        modules={quillModules}
                        formats={quillFormats}
                        placeholder="Write your note here..."
                        className="quill-editor"
                        tabIndex={2}
                      />
                    </div>

                    {errors.body && (
                      <p className="mt-1 text-sm text-red-600">{errors.body}</p>
                    )}
                  </div>

                  {/* Linked Objects Section */}
                  <div className="border-t border-gray-200 pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <label className="block text-sm font-medium text-gray-700">
                          Associated Records
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowLinkSearch(!showLinkSearch)}
                          className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                          tabIndex={3}
                        >
                          + Link Record
                        </button>
                      </div>

                      {/* Display linked objects */}
                      {linkedObjects.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {linkedObjects.map((link) => {
                            const obj = link.client || link.deal || link.contact || link.property;
                            const displayName = link.object_type === 'contact'
                              ? `${obj?.first_name} ${obj?.last_name}`
                              : (link.client?.client_name || link.deal?.deal_name || link.property?.property_name || 'Unknown');

                            return (
                              <div key={link.id} className="flex items-center justify-between bg-blue-50 px-3 py-2 rounded text-sm">
                                <div className="flex items-center space-x-2">
                                  <span className="text-blue-600 font-medium capitalize">{link.object_type}:</span>
                                  <span className="text-gray-700">{displayName}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleUnlinkObject(link.id)}
                                  className="text-red-500 hover:text-red-700 font-bold"
                                  title="Remove link"
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
                        <div className="bg-gray-50 p-3 rounded space-y-3 border border-gray-200">
                          <div className="flex space-x-2">
                            <select
                              value={searchType}
                              onChange={(e) => setSearchType(e.target.value as any)}
                              className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="client">Client</option>
                              <option value="contact">Contact</option>
                              <option value="deal">Deal</option>
                              <option value="property">Property</option>
                            </select>
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => handleSearch(e.target.value)}
                              placeholder={`Search ${searchType}s...`}
                              className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          {/* Search Results */}
                          {searchResults.length > 0 && (
                            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded bg-white">
                              {searchResults.map((result) => {
                                const displayName = searchType === 'contact'
                                  ? `${result.first_name} ${result.last_name}`
                                  : result.client_name || result.deal_name || result.property_name;

                                return (
                                  <button
                                    key={result.id}
                                    type="button"
                                    onClick={() => handleLinkObject(result.id)}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                                  >
                                    {displayName}
                                    {searchType === 'contact' && result.email && (
                                      <span className="text-gray-500 ml-2">({result.email})</span>
                                    )}
                                    {searchType === 'property' && result.address && (
                                      <span className="text-gray-500 text-xs block">{result.address}</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-3 flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    {clientId && 'Will be associated with this client'}
                    {dealId && 'Will be associated with this deal'}
                    {contactId && 'Will be associated with this contact'}
                    {propertyId && 'Will be associated with this property'}
                    {assignmentId && 'Will be associated with this assignment'}
                    {siteSubmitId && 'Will be associated with this site submit'}
                  </div>
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      tabIndex={4}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                      tabIndex={5}
                    >
                      {saving ? 'Saving...' : (noteId ? 'Update Note' : 'Create Note')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default NoteFormModal;