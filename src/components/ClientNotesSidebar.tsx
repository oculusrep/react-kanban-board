import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import RichTextNote from './RichTextNote';

type Note = Database['public']['Tables']['note']['Row'];

interface ClientNotesSidebarProps {
  clientId: string;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onNoteModalChange?: (isOpen: boolean) => void;
}

// Sidebar Module Component (reused from PropertySidebar)
interface SidebarModuleProps {
  title: string;
  count: number;
  onAddNew: () => void;
  children: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  icon?: string;
  isEmpty?: boolean;
}

const SidebarModule: React.FC<SidebarModuleProps> = ({
  title,
  count,
  onAddNew,
  children,
  isExpanded = true,
  onToggle,
  icon,
  isEmpty = false
}) => (
  <div className={`bg-white border border-gray-200 rounded-lg mb-3 shadow-sm ${isEmpty ? 'opacity-60' : ''}`}>
    <div className={`flex items-center justify-between p-3 border-b border-gray-100 ${
      isEmpty ? 'bg-gray-50' : 'bg-gradient-to-r from-slate-50 to-gray-50'
    }`}>
      <button
        onClick={onToggle}
        className="flex items-center space-x-2 flex-1 text-left hover:bg-white/50 -mx-3 px-3 py-1 rounded-t-lg transition-colors"
      >
        <svg
          className={`w-4 h-4 text-gray-400 transform transition-transform ${
            isExpanded ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {icon && (
          <div className="w-4 h-4 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
          </div>
        )}
        <h4 className="font-medium text-gray-900 text-sm">{title}</h4>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
          isEmpty ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-800'
        }`}>
          {count}
        </span>
        {isEmpty && (
          <span className="text-xs text-gray-500 italic">(Empty)</span>
        )}
      </button>
      <button
        onClick={onAddNew}
        className="flex items-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors ml-2"
      >
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New
      </button>
    </div>
    {isExpanded && (
      <div className="max-h-[560px] overflow-y-auto">
        {count === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            <div className="w-12 h-12 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
              {icon && (
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
              )}
            </div>
            No {title.toLowerCase()} yet
          </div>
        ) : (
          children
        )}
      </div>
    )}
  </div>
);

// Note Item Component
interface NoteItemProps {
  note: Note;
  isExpanded?: boolean;
  onToggle?: () => void;
  onEdit?: (noteId: string) => void;
}

const NoteItem: React.FC<NoteItemProps> = ({ note, isExpanded = false, onToggle, onEdit }) => {
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return '';
    }
  };

  const truncateText = (text?: string, maxLength: number = 100) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div
        className="p-2 hover:bg-purple-50 cursor-pointer transition-colors flex items-start justify-between"
        onClick={onToggle}
      >
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h5 className="text-sm font-medium text-gray-900 truncate mb-1">
                  {note.title || 'Untitled Note'}
                </h5>
                <p className="text-xs text-gray-600 line-clamp-2 mb-1">
                  {truncateText(note.body, 80)}
                </p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatDate(note.created_at)}</span>
                  {note.content_size && (
                    <span className="text-purple-600 font-medium">
                      {Math.round(note.content_size / 1024)}KB
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <svg
          className={`w-3 h-3 text-gray-400 transform transition-transform flex-shrink-0 mt-1 ${
            isExpanded ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      {isExpanded && (
        <div className="px-2 pb-2 bg-purple-25">
          <div className="bg-purple-50 border border-purple-200 rounded p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                <span className="font-medium text-purple-900">Note Details</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(note.id);
                }}
                className="text-purple-600 hover:text-purple-800 font-medium"
              >
                View
              </button>
            </div>
            <div className="space-y-2 ml-4">
              {note.title && (
                <div><span className="font-medium text-purple-800">Title:</span> <span className="text-purple-700">{note.title}</span></div>
              )}
              {note.body && (
                <div className="space-y-1">
                  <span className="font-medium text-purple-800">Content:</span>
                  <div className="text-purple-700 bg-white p-2 rounded border text-xs">
                    <RichTextNote
                      content={note.body}
                      className="text-xs text-purple-700"
                      maxHeight="max-h-40"
                    />
                  </div>
                </div>
              )}
              {note.share_type && (
                <div><span className="font-medium text-purple-800">Sharing:</span> <span className="text-purple-700">{note.share_type}</span></div>
              )}
              {note.visibility && (
                <div><span className="font-medium text-purple-800">Visibility:</span> <span className="text-purple-700">{note.visibility}</span></div>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-purple-200">
                <span className="text-purple-600">Created: {formatDate(note.created_at)}</span>
                {note.updated_at && note.updated_at !== note.created_at && (
                  <span className="text-purple-600">Updated: {formatDate(note.updated_at)}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ClientNotesSidebar: React.FC<ClientNotesSidebarProps> = ({
  clientId,
  isMinimized = false,
  onMinimize,
  onNoteModalChange
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expansion state for notes
  const [expandedSidebarModules, setExpandedSidebarModules] = useState(() => {
    const saved = localStorage.getItem(`expandedSidebarModules_client_${clientId}`);
    return saved ? JSON.parse(saved) : { notes: true };
  });

  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  // Load notes data
  useEffect(() => {
    if (!clientId || clientId === 'new') {
      // For new clients, start with empty data but still show sidebar
      setNotes([]);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load notes associated with this client
        const { data: notesData, error: notesError } = await supabase
          .from('note')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false });

        if (notesError) throw notesError;
        setNotes(notesData || []);

      } catch (err) {
        console.error('Error loading client notes:', err);
        setError(err instanceof Error ? err.message : 'Failed to load notes');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [clientId]);

  // Update expansion state when data changes
  useEffect(() => {
    if (!loading) {
      setExpandedSidebarModules(prev => {
        const defaults = { notes: notes.length > 0 };
        const saved = localStorage.getItem(`expandedSidebarModules_client_${clientId}`);
        return saved ? JSON.parse(saved) : defaults;
      });
    }
  }, [notes.length, loading, clientId]);

  const toggleSidebarModule = (module: keyof typeof expandedSidebarModules) => {
    const newState = {
      ...expandedSidebarModules,
      [module]: !expandedSidebarModules[module]
    };
    setExpandedSidebarModules(newState);
    localStorage.setItem(`expandedSidebarModules_client_${clientId}`, JSON.stringify(newState));
  };

  const toggleNote = (noteId: string) => {
    const newState = {
      ...expandedNotes,
      [noteId]: !expandedNotes[noteId]
    };
    setExpandedNotes(newState);
    localStorage.setItem(`expandedNotes_client_${clientId}`, JSON.stringify(newState));
  };

  const handleAddNewNote = () => {
    if (clientId === 'new') {
      alert('Please save the client first before adding notes.');
      return;
    }
    // TODO: Implement note creation modal
    console.log('Add new note for client:', clientId);
    onNoteModalChange?.(true);
  };

  const handleEditNote = (noteId: string) => {
    // TODO: Implement note editing modal
    console.log('Edit note:', noteId);
    onNoteModalChange?.(true);
  };

  return (
    <div
      className={`fixed right-0 bg-white border-l border-gray-200 shadow-xl transition-all duration-300 ${
        isMinimized ? 'w-12' : 'w-[500px]'
      } z-40 ${isMinimized ? 'overflow-hidden' : 'overflow-visible'}`}
      style={{
        top: '180px',
        height: isMinimized ? '60px' : `${Math.min(120 + (notes.length * 80), 120 + (10 * 80))}px`
      }}
    >
      {/* Header with minimize/expand controls */}
      <div className={`flex items-center ${isMinimized ? 'justify-center' : 'justify-between'} p-2 border-b border-gray-200 bg-gray-50`}>
        {!isMinimized && (
          <h3 className="text-sm font-medium text-gray-700">Client Notes</h3>
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
              <div className="animate-pulse">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-600">
              <p className="font-medium">Error loading notes</p>
              <p className="text-sm">{error}</p>
            </div>
          ) : (
            <>
              {/* Notes Module */}
              <SidebarModule
                title="Notes"
                count={notes.length}
                onAddNew={handleAddNewNote}
                isExpanded={expandedSidebarModules.notes}
                onToggle={() => toggleSidebarModule('notes')}
                icon="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                isEmpty={notes.length === 0}
              >
                {notes.map(note => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    isExpanded={expandedNotes[note.id]}
                    onToggle={() => toggleNote(note.id)}
                    onEdit={handleEditNote}
                  />
                ))}
              </SidebarModule>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientNotesSidebar;