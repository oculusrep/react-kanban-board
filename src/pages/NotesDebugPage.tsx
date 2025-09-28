import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import RichTextNote from '../components/RichTextNote';
import NoteAssociations from '../components/NoteAssociations';
import NoteFormModal from '../components/NoteFormModal';

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
  const [showAllExpanded, setShowAllExpanded] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [notesPerPage] = useState(25);

  // Modal state
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadNotesAndRelatedData();
  }, []);

  const loadNotesAndRelatedData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load all notes with their relationships efficiently
      let allNotesWithRelationships = [];
      let hasMore = true;
      let offset = 0;
      const batchSize = 1000;

      while (hasMore) {
        // Load notes in batches
        const { data: notesBatch, error: notesError } = await supabase
          .from('note')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (notesError) {
          throw notesError;
        }

        // Get all relationships for this batch of notes
        if (notesBatch && notesBatch.length > 0) {
          const noteIds = notesBatch.map(note => note.id);

          try {
            // Get relationships in smaller batches to avoid URL length limits
            const relationshipBatchSize = 100;
            const allRelationships = [];

            for (let i = 0; i < noteIds.length; i += relationshipBatchSize) {
              const relationshipBatch = noteIds.slice(i, i + relationshipBatchSize);
              try {
                const { data: relationshipData } = await supabase
                  .from('note_object_link')
                  .select('*')
                  .in('note_id', relationshipBatch);

                if (relationshipData) {
                  allRelationships.push(...relationshipData);
                }
              } catch (relBatchError) {
                console.warn(`Error fetching relationship batch:`, relBatchError);
              }
            }

            // Create a comprehensive map of note_id -> all relationships
            const relationshipMap = new Map();
            if (allRelationships) {
              allRelationships.forEach(rel => {
                if (!relationshipMap.has(rel.note_id)) {
                  relationshipMap.set(rel.note_id, {
                    client_id: null,
                    deal_id: null,
                    contact_id: null,
                    property_id: null,
                    assignment_id: null,
                    site_submit_id: null,
                    user_id: null,
                  });
                }

                const noteRels = relationshipMap.get(rel.note_id);
                // Set the specific relationship field
                if (rel.client_id) noteRels.client_id = rel.client_id;
                if (rel.deal_id) noteRels.deal_id = rel.deal_id;
                if (rel.contact_id) noteRels.contact_id = rel.contact_id;
                if (rel.property_id) noteRels.property_id = rel.property_id;
                if (rel.assignment_id) noteRels.assignment_id = rel.assignment_id;
                if (rel.site_submit_id) noteRels.site_submit_id = rel.site_submit_id;
                if (rel.user_id) noteRels.user_id = rel.user_id;
              });
            }

            // Apply relationships to notes
            notesBatch.forEach(note => {
              const relationships = relationshipMap.get(note.id);

              if (relationships) {
                // Note has relationships - apply all of them
                (note as any).client_id = relationships.client_id;
                (note as any).deal_id = relationships.deal_id;
                (note as any).contact_id = relationships.contact_id;
                (note as any).property_id = relationships.property_id;
                (note as any).assignment_id = relationships.assignment_id;
                (note as any).site_submit_id = relationships.site_submit_id;
                (note as any).user_id = relationships.user_id;
              } else {
                // Note has no relationships (unassigned)
                (note as any).client_id = null;
                (note as any).deal_id = null;
                (note as any).contact_id = null;
                (note as any).property_id = null;
                (note as any).assignment_id = null;
                (note as any).site_submit_id = null;
                (note as any).user_id = null;
              }
            });

            allNotesWithRelationships.push(...notesBatch);

          } catch (relError) {
            console.warn(`Error getting batch relationships:`, relError);
            // If batch relationship query fails, mark all notes as unassigned
            notesBatch.forEach(note => {
              (note as any).client_id = null;
              (note as any).deal_id = null;
              (note as any).contact_id = null;
              (note as any).property_id = null;
              (note as any).assignment_id = null;
              (note as any).site_submit_id = null;
              (note as any).user_id = null;
            });
            allNotesWithRelationships.push(...notesBatch);
          }
        }

        const batchData = notesBatch;

        if (batchData && batchData.length > 0) {
          offset += batchSize;
          // If we got less than batchSize, we've reached the end
          if (batchData.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      const notesData = allNotesWithRelationships;

      if (!notesData) {
        throw new Error('Failed to load notes');
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

    } catch (err) {
      console.error('Error loading notes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  // Utility functions - defined before they're used
  const formatDateShort = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Invalid Date';
    }
  };

  // Enhanced search function with multiple features
  const searchNote = (note: Note, searchTerm: string): boolean => {
    if (!searchTerm.trim()) return true;

    const search = searchTerm.trim();

    // Helper function to get all searchable text for a note
    const getSearchableText = (note: Note): string => {
      const parts = [
        note.title || '',
        note.body || '',
        note.sf_content_note_id || '',
        // Related object names
        note.client_id && clientsMap[note.client_id]?.client_name || '',
        note.deal_id && dealsMap[note.deal_id]?.deal_name || '',
        note.contact_id && contactsMap[note.contact_id] ?
          `${contactsMap[note.contact_id].first_name || ''} ${contactsMap[note.contact_id].last_name || ''}`.trim() : '',
        // Date fields
        formatDateShort(note.created_at),
        formatDateShort(note.updated_at),
      ];
      return parts.filter(Boolean).join(' ').toLowerCase();
    };

    // Handle field-specific searches (e.g., "title:meeting", "client:huey", "date:2024")
    const fieldMatch = search.match(/^(title|client|deal|contact|body|date):(.+)$/i);
    if (fieldMatch) {
      const [, field, value] = fieldMatch;
      const valueLower = value.toLowerCase();

      switch (field.toLowerCase()) {
        case 'title':
          return note.title?.toLowerCase().includes(valueLower) || false;
        case 'client':
          return note.client_id && clientsMap[note.client_id]?.client_name?.toLowerCase().includes(valueLower) || false;
        case 'deal':
          return note.deal_id && dealsMap[note.deal_id]?.deal_name?.toLowerCase().includes(valueLower) || false;
        case 'contact':
          if (!note.contact_id || !contactsMap[note.contact_id]) return false;
          const contact = contactsMap[note.contact_id];
          const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.toLowerCase();
          return fullName.includes(valueLower);
        case 'body':
          return note.body?.toLowerCase().includes(valueLower) || false;
        case 'date':
          const dateStr = `${formatDateShort(note.created_at)} ${formatDateShort(note.updated_at)}`.toLowerCase();
          return dateStr.includes(valueLower);
        default:
          return false;
      }
    }

    // Handle phrase search with quotes (e.g., "exact phrase")
    const phraseMatch = search.match(/^"(.+)"$/);
    if (phraseMatch) {
      const phrase = phraseMatch[1].toLowerCase();
      return getSearchableText(note).includes(phrase);
    }

    // Handle exclude terms with minus (e.g., "meeting -call" finds notes with "meeting" but not "call")
    const hasExcludeTerms = search.includes(' -');
    if (hasExcludeTerms) {
      const parts = search.split(' ');
      const includeTerms = parts.filter(p => !p.startsWith('-')).map(p => p.toLowerCase());
      const excludeTerms = parts.filter(p => p.startsWith('-')).map(p => p.substring(1).toLowerCase());

      const text = getSearchableText(note);

      // All include terms must match
      const includeMatch = includeTerms.length === 0 || includeTerms.every(term => text.includes(term));

      // No exclude terms should match
      const excludeMatch = excludeTerms.some(term => text.includes(term));

      return includeMatch && !excludeMatch;
    }

    // Handle multi-word search (all words must match somewhere)
    const words = search.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    if (words.length > 1) {
      const text = getSearchableText(note);
      return words.every(word => text.includes(word));
    }

    // Single word search (fuzzy matching)
    const text = getSearchableText(note);
    const singleWord = search.toLowerCase();

    // Direct match
    if (text.includes(singleWord)) {
      return true;
    }

    // Partial/fuzzy matching for words longer than 3 characters
    if (singleWord.length > 3) {
      const words = text.split(/\s+/);
      return words.some(word => {
        // Check if the search term is a substring of any word
        if (word.includes(singleWord)) return true;

        // Check if any word starts with the search term
        if (word.startsWith(singleWord)) return true;

        // Simple fuzzy matching: allow 1 character difference for every 4 characters
        if (singleWord.length >= 4) {
          const allowedDifferences = Math.floor(singleWord.length / 4);
          return levenshteinDistance(word, singleWord) <= allowedDifferences;
        }

        return false;
      });
    }

    return false;
  };

  // Simple Levenshtein distance for fuzzy matching
  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
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
        case 'property':
          if (!note.property_id) return false;
          break;
        case 'assignment':
          if (!note.assignment_id) return false;
          break;
        case 'site_submit':
          if (!note.site_submit_id) return false;
          break;
        case 'user':
          if (!(note as any).user_id) return false;
          break;
        case 'unassigned':
          // In normalized structure, unassigned means no relationships exist
          // Since we're using inner join in our query, we won't get truly unassigned notes
          // We need to check if all relationship fields are null
          if (note.client_id || note.deal_id || note.contact_id || note.property_id || note.assignment_id || note.site_submit_id || (note as any).user_id) return false;
          break;
      }
    }

    // Enhanced search
    return searchNote(note, searchTerm);
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredNotes.length / notesPerPage);
  const startIndex = (currentPage - 1) * notesPerPage;
  const endIndex = startIndex + notesPerPage;
  const paginatedNotes = filteredNotes.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  const resetPagination = () => {
    setCurrentPage(1);
  };

  // Update pagination when search or filter changes
  React.useEffect(() => {
    resetPagination();
  }, [searchTerm, filter]);

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

  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  // Note modal handlers
  const handleCreateNote = () => {
    setEditingNoteId(undefined);
    setIsNoteModalOpen(true);
  };

  const handleEditNote = (noteId: string) => {
    setEditingNoteId(noteId);
    setIsNoteModalOpen(true);
  };

  const handleNoteModalClose = () => {
    setIsNoteModalOpen(false);
    setEditingNoteId(undefined);
  };

  const handleNoteSaved = (savedNote: Note) => {
    // Refresh the notes list to show the new/updated note
    loadNotesAndRelatedData();
    handleNoteModalClose();
  };

  const handleNoteUpdated = (updatedNote: Note) => {
    // Update the specific note in the current state without full reload
    setNotes(prevNotes =>
      prevNotes.map(note =>
        note.id === updatedNote.id ? updatedNote : note
      )
    );
    handleNoteModalClose();
  };

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notes</h1>
            <p className="text-sm text-gray-500 mt-1">
              Total notes: {notes.length} | Filtered: {filteredNotes.length} | Showing {startIndex + 1}-{Math.min(endIndex, filteredNotes.length)} of {filteredNotes.length}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Advanced search: field filters, phrase matching, multi-word, exclusions, and fuzzy search
            </p>
          </div>
          <button
            onClick={handleCreateNote}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Note
          </button>
        </div>
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
              <option value="property">Property Notes ({notes.filter(n => n.property_id).length})</option>
              <option value="assignment">Assignment Notes ({notes.filter(n => n.assignment_id).length})</option>
              <option value="site_submit">Site Submit Notes ({notes.filter(n => n.site_submit_id).length})</option>
              <option value="user">User Notes ({notes.filter(n => (n as any).user_id).length})</option>
              <option value="unassigned">Unassigned ({notes.filter(n => !n.client_id && !n.deal_id && !n.contact_id && !n.property_id && !n.assignment_id && !n.site_submit_id && !(n as any).user_id).length})</option>
            </select>
          </div>
          <div className="flex-1 max-w-lg">
            <label className="block text-sm font-medium text-gray-700 mb-1">Powerful Search:</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder='Try: "huey magoo", client:huey, meeting -call, title:site, date:2024'
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 pl-10"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <svg className="h-4 w-4 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {/* Search Help */}
            <div className="mt-1 text-xs text-gray-600">
              <details className="cursor-pointer">
                <summary className="hover:text-blue-600">Search Help ▼</summary>
                <div className="mt-1 space-y-1 text-xs bg-gray-50 p-2 rounded border">
                  <div><strong>Field search:</strong> <code>client:huey</code>, <code>title:meeting</code>, <code>body:lease</code>, <code>date:2024</code></div>
                  <div><strong>Phrase search:</strong> <code>"exact phrase"</code></div>
                  <div><strong>Multiple words:</strong> <code>huey magoo lease</code> (all must match)</div>
                  <div><strong>Exclude terms:</strong> <code>meeting -call</code> (has "meeting" but not "call")</div>
                  <div><strong>Fuzzy matching:</strong> <code>hueymago</code> finds "huey magoo"</div>
                </div>
              </details>
            </div>
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

      {/* Pagination Controls - Top */}
      {totalPages > 1 && (
        <div className="mb-6 flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-lg shadow-sm">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                <span className="font-medium">{Math.min(endIndex, filteredNotes.length)}</span> of{' '}
                <span className="font-medium">{filteredNotes.length}</span> results
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Previous</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* Page numbers */}
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (currentPage <= 4) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = currentPage - 3 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                        currentPage === pageNum
                          ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                          : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div className="space-y-4">
        {paginatedNotes.length === 0 ? (
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
          paginatedNotes.map((note) => {
            const isExpanded = expandedNotes.has(note.id);
            const relatedTags = [];

            // Build related object tags
            if (note.client_id && clientsMap[note.client_id]) {
              relatedTags.push({ type: 'Client', name: clientsMap[note.client_id].client_name || 'Unnamed' });
            }
            if (note.deal_id && dealsMap[note.deal_id]) {
              relatedTags.push({ type: 'Deal', name: dealsMap[note.deal_id].deal_name || 'Unnamed' });
            }
            if (note.contact_id && contactsMap[note.contact_id]) {
              const contact = contactsMap[note.contact_id];
              const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unnamed';
              relatedTags.push({ type: 'Contact', name });
            }
            if (note.property_id) {
              relatedTags.push({ type: 'Property', name: note.property_id });
            }
            if (note.assignment_id) {
              relatedTags.push({ type: 'Assignment', name: note.assignment_id });
            }
            if (note.site_submit_id) {
              relatedTags.push({ type: 'Site Submit', name: note.site_submit_id });
            }

            return (
              <div
                key={note.id}
                className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Top Level - Always Visible */}
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => toggleNoteExpansion(note.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Single line with title, tag, date, and size */}
                      <div className="flex items-center space-x-3">
                        <h3 className="text-base font-medium text-gray-900 truncate flex-shrink-0 max-w-xs">
                          {note.title || 'Untitled Note'}
                        </h3>

                        {/* Note Associations */}
                        <div className="flex-1 min-w-0">
                          <NoteAssociations
                            noteId={note.id}
                            currentAssociations={{
                              client_id: note.client_id || undefined,
                              deal_id: note.deal_id || undefined,
                              contact_id: note.contact_id || undefined,
                              property_id: note.property_id || undefined,
                              assignment_id: note.assignment_id || undefined,
                              site_submit_id: note.site_submit_id || undefined,
                              user_id: (note as any).user_id || undefined
                            }}
                            onAssociationChange={(updatedAssociations) => {
                              // Update the specific note's associations in state without full page reload
                              setNotes(prevNotes =>
                                prevNotes.map(n =>
                                  n.id === note.id
                                    ? { ...n, ...updatedAssociations }
                                    : n
                                )
                              );
                            }}
                          />
                        </div>

                        <span className="text-sm text-gray-500 flex-shrink-0">{formatDateShort(note.created_at)}</span>

                        {note.body && (
                          <span className="text-sm text-gray-500 flex-shrink-0">({note.body.length} chars)</span>
                        )}
                      </div>
                    </div>

                    {/* Expand/collapse arrow */}
                    <div className="flex items-center ml-3">
                      <svg
                        className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
                          isExpanded ? 'transform rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {(isExpanded || showAllExpanded) && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    {/* Note Details */}
                    <div className="mt-4 flex items-center justify-between mb-4">
                      <div className="text-sm space-y-1">
                        <p className="text-gray-500">Created: <span className="text-gray-900">{formatDate(note.created_at)}</span></p>
                        {note.updated_at && note.updated_at !== note.created_at && (
                          <p className="text-gray-500">Updated: <span className="text-gray-900">{formatDate(note.updated_at)}</span></p>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditNote(note.id);
                        }}
                        className="inline-flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit Note
                      </button>
                    </div>

                    {/* Note Content */}
                    <div className="bg-gray-50 rounded-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-gray-600 font-medium">Content:</p>
                        {note.body && note.body.length > 500 && (
                          <span className="text-xs text-gray-500">
                            {note.body.length.toLocaleString()} characters
                          </span>
                        )}
                      </div>
                      <RichTextNote
                        content={note.body || 'No content available'}
                        className="text-sm"
                        maxHeight="max-h-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls - Bottom */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center">
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-l-md px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            <span className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center rounded-r-md px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </nav>
        </div>
      )}

      {/* Note Form Modal */}
      <NoteFormModal
        isOpen={isNoteModalOpen}
        onClose={handleNoteModalClose}
        onSave={handleNoteSaved}
        onUpdate={handleNoteUpdated}
        noteId={editingNoteId}
      />
    </div>
  );
};

export default NotesDebugPage;