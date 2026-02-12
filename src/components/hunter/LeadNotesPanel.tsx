// Slack-like running notes panel for leads
// src/components/hunter/LeadNotesPanel.tsx

import { useEffect, useState, useRef } from 'react';
import { useProspectingNotes } from '../../hooks/useProspectingNotes';
import { PaperAirplaneIcon, TrashIcon } from '@heroicons/react/24/outline';

interface LeadNotesPanelProps {
  leadId: string;
  maxHeight?: string;
}

export default function LeadNotesPanel({ leadId, maxHeight = '300px' }: LeadNotesPanelProps) {
  const { notes, loading, error, loadNotes, addNote, deleteNote } = useProspectingNotes();
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const notesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotes(leadId);
  }, [leadId, loadNotes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const result = await addNote(newNoteContent, { leadId });
    if (result) {
      setNewNoteContent('');
      // Scroll to top to see new note
      if (notesContainerRef.current) {
        notesContainerRef.current.scrollTop = 0;
      }
    }
    setIsSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Cmd/Ctrl + Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (window.confirm('Delete this note?')) {
      await deleteNote(noteId);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' +
        date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
        date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-900">Notes</h3>
      </div>

      {/* Notes List */}
      <div
        ref={notesContainerRef}
        className="overflow-y-auto"
        style={{ maxHeight }}
      >
        {loading && notes.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            Loading notes...
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-500 text-sm">
            {error}
          </div>
        ) : notes.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            No notes yet. Add your first note below.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notes.map((note) => (
              <div key={note.id} className="p-3 hover:bg-gray-50 group">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                      {note.content}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {formatDate(note.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
                    title="Delete note"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Note Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a note... (Cmd+Enter to submit)"
            rows={2}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
          <button
            type="submit"
            disabled={!newNoteContent.trim() || isSubmitting}
            className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
            ) : (
              <PaperAirplaneIcon className="w-5 h-5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
