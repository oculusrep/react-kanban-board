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

  // Load existing note if editing
  useEffect(() => {
    if (isOpen && noteId) {
      loadNote();
    } else if (isOpen) {
      // Reset form for new note
      setFormData({
        title: '',
        body: ''
      });
      setErrors({});
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

        // Create note associations if provided
        const associations = [];
        if (clientId) associations.push({ object_type: 'client', object_id: clientId });
        if (dealId) associations.push({ object_type: 'deal', object_id: dealId });
        if (contactId) associations.push({ object_type: 'contact', object_id: contactId });
        if (propertyId) associations.push({ object_type: 'property', object_id: propertyId });
        if (assignmentId) associations.push({ object_type: 'assignment', object_id: assignmentId });
        if (siteSubmitId) associations.push({ object_type: 'site_submit', object_id: siteSubmitId });

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
                      />
                    </div>

                    {errors.body && (
                      <p className="mt-1 text-sm text-red-600">{errors.body}</p>
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
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
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