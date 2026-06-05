/**
 * DealNotesTab - Notes + Document Handoffs panel for the deal detail page.
 *
 * These sections used to live in the old right-side DealSidebar. They were
 * relocated here when the deal page sidebar was swapped for the shared
 * SiteSubmitSidebar (green deal slideout). The permanent home for these
 * sections is still TBD — for now they live in their own tab on the deal page.
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Database } from '../../../database-schema';
import { prepareInsert, prepareUpdate } from '../../lib/supabaseHelpers';
import HandoffHistory from './HandoffHistory';

type Note = Database['public']['Tables']['note']['Row'];

interface DealNotesTabProps {
  dealId: string;
}

interface LinkedObject {
  id: string;
  object_type: 'deal' | 'contact' | 'property' | 'client';
  object_id: string;
  client?: { id: string; client_name: string | null } | null;
  deal?: { id: string; deal_name: string | null } | null;
  contact?: { id: string; first_name: string | null; last_name: string | null } | null;
  property?: { id: string; property_name: string | null } | null;
}

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
  const [linkedObjects, setLinkedObjects] = useState<LinkedObject[]>([]);
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchType, setSearchType] = useState<'deal' | 'contact' | 'property' | 'client'>('deal');

  useEffect(() => {
    if (isEditing) fetchLinkedObjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const fetchLinkedObjects = async () => {
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
    if (!error && data) setLinkedObjects(data as unknown as LinkedObject[]);
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
      [`${searchType}_id`]: objectId,
    };

    const { error } = await supabase
      .from('note_object_link')
      .insert(prepareInsert(insertData));

    if (!error) {
      await fetchLinkedObjects();
      setSearchQuery('');
      setSearchResults([]);
      setShowLinkSearch(false);
    }
  };

  const handleUnlinkObject = async (linkId: string) => {
    const { error } = await supabase.from('note_object_link').delete().eq('id', linkId);
    if (!error) await fetchLinkedObjects();
  };

  const handleSave = async () => {
    const { error } = await supabase
      .from('note')
      .update(prepareUpdate({ title, body }))
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
            rows={4}
          />

          {/* Linked Objects */}
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

            {linkedObjects.length > 0 && (
              <div className="space-y-1 mb-2">
                {linkedObjects.map((link) => {
                  const obj = link.client || link.deal || link.contact || link.property;
                  const displayName =
                    link.object_type === 'contact'
                      ? `${(obj as any)?.first_name ?? ''} ${(obj as any)?.last_name ?? ''}`.trim()
                      : (obj as any)?.client_name ||
                        (obj as any)?.deal_name ||
                        (obj as any)?.property_name ||
                        'Unknown';

                  return (
                    <div key={link.id} className="flex items-center justify-between bg-blue-50 px-2 py-1 rounded text-xs">
                      <div className="flex items-center space-x-1">
                        <span className="text-blue-600 font-medium capitalize">{link.object_type}:</span>
                        <span className="text-gray-700">{displayName}</span>
                      </div>
                      <button onClick={() => handleUnlinkObject(link.id)} className="text-red-500 hover:text-red-700">
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

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

                {searchResults.length > 0 && (
                  <div className="max-h-32 overflow-y-auto border border-gray-200 rounded bg-white">
                    {searchResults.map((result) => {
                      const displayName =
                        searchType === 'contact'
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
            <button onClick={handleSave} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
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
            {note.body && <p className="text-xs text-gray-600 mt-1 line-clamp-3 whitespace-pre-wrap">{note.body}</p>}
          </div>
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setIsEditing(true)} className="p-1 text-gray-500 hover:text-blue-600" title="Edit">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={() => onDelete(note.id)} className="p-1 text-gray-500 hover:text-red-600" title="Delete">
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

export default function DealNotesTab({ dealId }: DealNotesTabProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [newlyCreatedNoteId, setNewlyCreatedNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (!dealId) return;
    const fetchNotes = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('note_object_link')
          .select(`note_id, note!note_object_link_note_id_fkey (*)`)
          .eq('object_type', 'deal')
          .eq('object_id', dealId);

        if (error) throw error;

        const notesData: Note[] = [];
        (data || []).forEach((row: any) => {
          if (row.note) notesData.push(row.note);
        });
        setNotes(notesData);
      } catch (err) {
        console.error('Error fetching notes:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();
  }, [dealId]);

  const handleAddNote = async () => {
    try {
      const { data: newNote, error: noteError } = await supabase
        .from('note')
        .insert(prepareInsert({ title: '', body: '' }))
        .select()
        .single();

      if (noteError) throw noteError;

      const { error: linkError } = await supabase
        .from('note_object_link')
        .insert(
          prepareInsert({
            note_id: newNote.id,
            object_type: 'deal',
            object_id: dealId,
            deal_id: dealId,
          })
        );

      if (linkError) throw linkError;

      setNotes((prev) => [newNote, ...prev]);
      setNewlyCreatedNoteId(newNote.id);
    } catch (err) {
      console.error('Error creating note:', err);
    }
  };

  const handleNoteUpdate = (noteId: string, newTitle: string, newBody: string) => {
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, title: newTitle, body: newBody } : n)));
  };

  const handleNoteDelete = async (noteId: string) => {
    const { error } = await supabase.from('note').delete().eq('id', noteId);
    if (!error) setNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  return (
    <div className="space-y-6">
      {/* Notes */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">
            Notes <span className="ml-1 text-xs text-gray-500">({notes.length})</span>
          </h3>
          <button
            onClick={handleAddNote}
            className="text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Note
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          </div>
        ) : notes.length === 0 ? (
          <p className="text-xs text-gray-500 italic px-4 py-6">No notes on this deal yet.</p>
        ) : (
          <div>
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
        )}
      </section>

      {/* Document Handoffs */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">Document Handoffs</h3>
        </div>
        <div className="p-3">
          <HandoffHistory dealId={dealId} defaultCollapsed={false} />
        </div>
      </section>
    </div>
  );
}
