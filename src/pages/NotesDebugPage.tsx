import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import RichTextNote from '../components/RichTextNote';

type Note = Database['public']['Tables']['note']['Row'];

interface Client {
  id: string;
  client_name?: string;
}

interface Deal {
  id: string;
  deal_name?: string;
}

interface Contact {
  id: string;
  first_name?: string;
  last_name?: string;
}

const NotesDebugPage: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [clientsMap, setClientsMap] = useState<Record<string, Client>>({});
  const [dealsMap, setDealsMap] = useState<Record<string, Deal>>({});
  const [contactsMap, setContactsMap] = useState<Record<string, Contact>>({});
  const [tableCounts, setTableCounts] = useState<{
    notes: number;
    contentNotes: number;
    contentVersions: number;
    contentDocLinks: number;
  }>({ notes: 0, contentNotes: 0, contentVersions: 0, contentDocLinks: 0 });
  const [sampleContentNotes, setSampleContentNotes] = useState<any[]>([]);
  const [showAllExpanded, setShowAllExpanded] = useState(false);

  useEffect(() => {
    loadNotesAndRelatedData();
  }, []);

  const loadNotesAndRelatedData = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Loading notes from database...');

      // First, test basic connection with a simple query
      const { count, error: countError } = await supabase
        .from('note')
        .select('*', { count: 'exact', head: true });

      console.log('Database connection test:', { count, error: countError });

      // Test if the table exists by trying to get a single row
      const { data: singleRow, error: singleError } = await supabase
        .from('note')
        .select('*')
        .limit(1);

      console.log('Single row test:', { data: singleRow, error: singleError });

      // Check if the source ContentNote data exists
      const { count: contentNoteCount, error: contentNoteError } = await supabase
        .from('salesforce_ContentNote')
        .select('*', { count: 'exact', head: true });

      console.log('ContentNote source table test:', { count: contentNoteCount, error: contentNoteError });

      // Sample a few ContentNotes to see the actual content structure
      const { data: sampleContentNotes, error: sampleError } = await supabase
        .from('salesforce_ContentNote')
        .select('Id, Content, TextPreview')
        .limit(3);

      console.log('Sample ContentNote data:', { data: sampleContentNotes, error: sampleError });

      // Check ContentVersion table
      const { count: contentVersionCount, error: contentVersionError } = await supabase
        .from('salesforce_ContentVersion')
        .select('*', { count: 'exact', head: true });

      console.log('ContentVersion source table test:', { count: contentVersionCount, error: contentVersionError });

      // Check ContentDocumentLink table
      const { count: contentDocLinkCount, error: contentDocLinkError } = await supabase
        .from('salesforce_ContentDocumentLink')
        .select('*', { count: 'exact', head: true });

      console.log('ContentDocumentLink source table test:', { count: contentDocLinkCount, error: contentDocLinkError });

      // Test RLS permissions - try with different auth contexts
      console.log('Current user context:', await supabase.auth.getUser());

      // Try to get notes with minimal select to test permissions
      const { data: notesTestData, error: notesTestError } = await supabase
        .from('note')
        .select('id')
        .limit(1);

      console.log('Notes permission test (select id only):', { data: notesTestData, error: notesTestError });

      // Load all notes
      const { data: notesData, error: notesError } = await supabase
        .from('note')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('Notes query result:', {
        data: notesData,
        error: notesError,
        count: notesData?.length
      });

      if (notesError) {
        console.error('Notes error:', notesError);
        throw notesError;
      }

      // Load clients for mapping
      const { data: clientsData, error: clientsError } = await supabase
        .from('client')
        .select('id, client_name');

      if (clientsError) throw clientsError;

      // Load deals for mapping
      const { data: dealsData, error: dealsError } = await supabase
        .from('deal')
        .select('id, deal_name');

      if (dealsError) throw dealsError;

      // Load contacts for mapping
      const { data: contactsData, error: contactsError } = await supabase
        .from('contact')
        .select('id, first_name, last_name');

      if (contactsError) throw contactsError;

      // Create lookup maps
      const clientsLookup = (clientsData || []).reduce((acc, client) => {
        acc[client.id] = client;
        return acc;
      }, {} as Record<string, Client>);

      const dealsLookup = (dealsData || []).reduce((acc, deal) => {
        acc[deal.id] = deal;
        return acc;
      }, {} as Record<string, Deal>);

      const contactsLookup = (contactsData || []).reduce((acc, contact) => {
        acc[contact.id] = contact;
        return acc;
      }, {} as Record<string, Contact>);

      setNotes(notesData || []);
      setClientsMap(clientsLookup);
      setDealsMap(dealsLookup);
      setContactsMap(contactsLookup);
      setSampleContentNotes(sampleContentNotes || []);
      setTableCounts({
        notes: notesData?.length || 0,
        contentNotes: contentNoteCount || 0,
        contentVersions: contentVersionCount || 0,
        contentDocLinks: contentDocLinkCount || 0
      });

    } catch (err) {
      console.error('Error loading notes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  const filteredNotes = notes.filter(note => {
    // Filter by type
    if (filter !== 'all') {
      switch (filter) {
        case 'client':
          if (!note.client_id) return false;
          break;
        case 'deal':
          if (!note.deal_id) return false;
          break;
        case 'contact':
          if (!note.contact_id) return false;
          break;
        case 'unassigned':
          if (note.client_id || note.deal_id || note.contact_id || note.property_id || note.assignment_id || note.site_submit_id) return false;
          break;
      }
    }

    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        note.title?.toLowerCase().includes(searchLower) ||
        note.body?.toLowerCase().includes(searchLower) ||
        note.sf_content_note_id?.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });

  const getRelatedObjectName = (note: Note) => {
    if (note.client_id && clientsMap[note.client_id]) {
      return `Client: ${clientsMap[note.client_id].client_name || 'Unnamed'}`;
    }
    if (note.deal_id && dealsMap[note.deal_id]) {
      return `Deal: ${dealsMap[note.deal_id].deal_name || 'Unnamed'}`;
    }
    if (note.contact_id && contactsMap[note.contact_id]) {
      const contact = contactsMap[note.contact_id];
      return `Contact: ${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unnamed';
    }
    if (note.property_id) {
      return `Property: ${note.property_id}`;
    }
    if (note.assignment_id) {
      return `Assignment: ${note.assignment_id}`;
    }
    if (note.site_submit_id) {
      return `Site Submit: ${note.site_submit_id}`;
    }
    return 'Unassigned';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Invalid Date';
    }
  };

  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const toggleNoteExpansion = (noteId: string) => {
    const newExpanded = new Set(expandedNotes);
    if (newExpanded.has(noteId)) {
      newExpanded.delete(noteId);
    } else {
      newExpanded.add(noteId);
    }
    setExpandedNotes(newExpanded);
  };

  const truncateText = (text?: string, maxLength: number = 500) => {
    if (!text) return 'No content';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error Loading Notes</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Notes Debug - All Notes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Total notes: {notes.length} | Filtered: {filteredNotes.length}
        </p>
        <p className="text-xs text-blue-600 mt-1">
          Check browser console for detailed database query logs
        </p>

        {/* Table Counts Summary */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs font-medium text-blue-800">Notes Table</p>
            <p className="text-2xl font-bold text-blue-900">{tableCounts.notes}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs font-medium text-green-800">ContentNotes</p>
            <p className="text-2xl font-bold text-green-900">{tableCounts.contentNotes}</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs font-medium text-yellow-800">ContentVersions</p>
            <p className="text-2xl font-bold text-yellow-900">{tableCounts.contentVersions}</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-xs font-medium text-purple-800">ContentDocLinks</p>
            <p className="text-2xl font-bold text-purple-900">{tableCounts.contentDocLinks}</p>
          </div>
        </div>

        {/* Sample ContentNote Data */}
        {sampleContentNotes.length > 0 && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-yellow-800 mb-3">Sample ContentNote Data</h3>
            <div className="space-y-3">
              {sampleContentNotes.map((contentNote, index) => (
                <div key={index} className="bg-white border border-yellow-200 rounded p-3 text-sm">
                  <p><strong>ID:</strong> {contentNote.Id}</p>
                  <p><strong>Content:</strong> <code className="bg-gray-100 px-1 rounded">{String(contentNote.Content).substring(0, 100)}...</code></p>
                  {contentNote.TextPreview && (
                    <p><strong>Text Preview:</strong> {contentNote.TextPreview}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by type:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="all">All Notes ({notes.length})</option>
              <option value="client">Client Notes ({notes.filter(n => n.client_id).length})</option>
              <option value="deal">Deal Notes ({notes.filter(n => n.deal_id).length})</option>
              <option value="contact">Contact Notes ({notes.filter(n => n.contact_id).length})</option>
              <option value="unassigned">Unassigned ({notes.filter(n => !n.client_id && !n.deal_id && !n.contact_id && !n.property_id && !n.assignment_id && !n.site_submit_id).length})</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search:</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search title, content, or ID..."
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end space-x-2">
            <button
              onClick={() => setShowAllExpanded(!showAllExpanded)}
              className={`px-4 py-2 rounded-md transition-colors ${
                showAllExpanded
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
            >
              {showAllExpanded ? 'Show Truncated' : 'Show All Full Content'}
            </button>
            <button
              onClick={loadNotesAndRelatedData}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Notes List */}
      <div className="space-y-4">
        {filteredNotes.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No notes found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {filter === 'all' ? 'No notes exist in the database.' : 'No notes match the current filter.'}
            </p>
          </div>
        ) : (
          filteredNotes.map((note) => (
            <div key={note.id} className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-medium text-gray-900 truncate">
                      {note.title || 'Untitled Note'}
                    </h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      {getRelatedObjectName(note)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-500">Note ID: <span className="text-gray-900 font-mono">{note.id}</span></p>
                      {note.sf_content_note_id && (
                        <p className="text-sm text-gray-500">SF ID: <span className="text-gray-900 font-mono">{note.sf_content_note_id}</span></p>
                      )}
                      <p className="text-sm text-gray-500">Created: <span className="text-gray-900">{formatDate(note.created_at)}</span></p>
                      {note.content_size && (
                        <p className="text-sm text-gray-500">Size: <span className="text-gray-900">{Math.round(note.content_size / 1024)}KB</span></p>
                      )}
                    </div>
                    <div>
                      {note.client_id && <p className="text-sm text-gray-500">Client ID: <span className="text-gray-900 font-mono">{note.client_id}</span></p>}
                      {note.deal_id && <p className="text-sm text-gray-500">Deal ID: <span className="text-gray-900 font-mono">{note.deal_id}</span></p>}
                      {note.contact_id && <p className="text-sm text-gray-500">Contact ID: <span className="text-gray-900 font-mono">{note.contact_id}</span></p>}
                      {note.property_id && <p className="text-sm text-gray-500">Property ID: <span className="text-gray-900 font-mono">{note.property_id}</span></p>}
                      {note.assignment_id && <p className="text-sm text-gray-500">Assignment ID: <span className="text-gray-900 font-mono">{note.assignment_id}</span></p>}
                      {note.site_submit_id && <p className="text-sm text-gray-500">Site Submit ID: <span className="text-gray-900 font-mono">{note.site_submit_id}</span></p>}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-md p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-gray-600 font-medium">Content:</p>
                      {note.body && (
                        <button
                          onClick={() => toggleNoteExpansion(note.id)}
                          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors"
                        >
                          {expandedNotes.has(note.id) ? 'Show Less' : 'Show Full Content'}
                        </button>
                      )}
                    </div>
                    <RichTextNote
                      content={note.body || ''}
                      className="text-sm"
                      maxHeight={showAllExpanded || expandedNotes.has(note.id) ? "max-h-none" : "max-h-40"}
                    />
                    {note.body && note.body.length > 500 && !showAllExpanded && !expandedNotes.has(note.id) && (
                      <div className="mt-2 text-xs text-blue-600 italic">
                        Content truncated - click "Show Full Content" to see complete note ({note.body.length} characters)
                      </div>
                    )}
                  </div>

                  {(note.share_type || note.visibility) && (
                    <div className="mt-3 flex items-center space-x-4">
                      {note.share_type && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Share: {note.share_type}
                        </span>
                      )}
                      {note.visibility && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Visibility: {note.visibility}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotesDebugPage;