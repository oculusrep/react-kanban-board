/**
 * CFO Context Panel
 *
 * Displays and manages saved context notes for the CFO Agent.
 * Shows business rules, corrections, and other saved knowledge.
 */

import { useState, useEffect } from 'react';
import { X, Trash2, Lightbulb, AlertCircle, Calendar, Tag, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface ContextNote {
  id: string;
  context_type: string;
  context_text: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface CFOContextPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const CONTEXT_TYPE_LABELS: Record<string, { label: string; color: string; bgColor: string }> = {
  business_rule: { label: 'Business Rule', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  correction: { label: 'Correction', color: 'text-red-700', bgColor: 'bg-red-100' },
  seasonal_pattern: { label: 'Seasonal Pattern', color: 'text-green-700', bgColor: 'bg-green-100' },
  client_note: { label: 'Client Note', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  vendor_note: { label: 'Vendor Note', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  budget_note: { label: 'Budget Note', color: 'text-amber-700', bgColor: 'bg-amber-100' },
};

export default function CFOContextPanel({ isOpen, onClose }: CFOContextPanelProps) {
  const [notes, setNotes] = useState<ContextNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');

  const fetchNotes = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('ai_financial_context')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setNotes(data || []);
    } catch (err) {
      console.error('Failed to fetch context notes:', err);
      setError('Failed to load context notes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotes();
    }
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error: deleteError } = await supabase
        .from('ai_financial_context')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete context note:', err);
      setError('Failed to delete note');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const filteredNotes = filterType === 'all'
    ? notes
    : notes.filter((n) => n.context_type === filterType);

  const uniqueTypes = Array.from(new Set(notes.map((n) => n.context_type)));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-30" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-white" />
            <h2 className="font-semibold text-white">Context Notes</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded p-1 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b">
          These notes help the CFO Agent remember important business rules, corrections, and context.
        </p>

        {/* Filter and Refresh */}
        <div className="px-4 py-2 border-b flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1 flex-1"
          >
            <option value="all">All Types ({notes.length})</option>
            {uniqueTypes.map((type) => (
              <option key={type} value={type}>
                {CONTEXT_TYPE_LABELS[type]?.label || type} (
                {notes.filter((n) => n.context_type === type).length})
              </option>
            ))}
          </select>
          <button
            onClick={fetchNotes}
            disabled={isLoading}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="flex items-center gap-2 text-gray-500">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Loading...</span>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Lightbulb className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">No context notes yet.</p>
              <p className="text-xs mt-1">
                Use the "Remember" button on agent responses to save notes.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredNotes.map((note) => {
                const typeInfo = CONTEXT_TYPE_LABELS[note.context_type] || {
                  label: note.context_type,
                  color: 'text-gray-700',
                  bgColor: 'bg-gray-100',
                };

                return (
                  <div key={note.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.bgColor} ${typeInfo.color}`}
                          >
                            <Tag className="h-3 w-3" />
                            {typeInfo.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-900">{note.context_text}</p>
                        <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                          <Calendar className="h-3 w-3" />
                          {formatDate(note.created_at)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(note.id)}
                        disabled={deletingId === note.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title="Delete note"
                      >
                        <Trash2 className={`h-4 w-4 ${deletingId === note.id ? 'animate-pulse' : ''}`} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            {notes.length} note{notes.length !== 1 ? 's' : ''} saved
          </p>
        </div>
      </div>
    </div>
  );
}
