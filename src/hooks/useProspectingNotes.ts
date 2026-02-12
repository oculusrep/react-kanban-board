// Hook for managing prospecting notes (Slack-like running notes)
// src/hooks/useProspectingNotes.ts

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ProspectingNote } from '../lib/types';

interface UseProspectingNotesReturn {
  notes: ProspectingNote[];
  loading: boolean;
  error: string | null;
  loadNotes: (leadId?: string, contactId?: string) => Promise<void>;
  addNote: (
    content: string,
    options: {
      leadId?: string;
      contactId?: string;
    }
  ) => Promise<ProspectingNote | null>;
  updateNote: (noteId: string, content: string) => Promise<boolean>;
  deleteNote: (noteId: string) => Promise<boolean>;
}

export const useProspectingNotes = (): UseProspectingNotesReturn => {
  const [notes, setNotes] = useState<ProspectingNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load notes for a lead or contact
  const loadNotes = useCallback(async (leadId?: string, contactId?: string) => {
    if (!leadId && !contactId) {
      setNotes([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('prospecting_note')
        .select('*')
        .order('created_at', { ascending: false });

      if (leadId) {
        query = query.eq('target_id', leadId);
      } else if (contactId) {
        query = query.eq('contact_id', contactId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setNotes(data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load notes';
      setError(message);
      console.error('Error loading notes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Add a new note
  const addNote = useCallback(async (
    content: string,
    options: {
      leadId?: string;
      contactId?: string;
    }
  ): Promise<ProspectingNote | null> => {
    const { leadId, contactId } = options;

    if (!leadId && !contactId) {
      setError('Must provide either a lead ID or contact ID');
      return null;
    }

    if (!content.trim()) {
      setError('Note content cannot be empty');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: insertError } = await supabase
        .from('prospecting_note')
        .insert({
          target_id: leadId || null,
          contact_id: contactId || null,
          content: content.trim(),
          created_by: user.id
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Add to local state (newest first)
      setNotes(prev => [data, ...prev]);

      console.log('✅ Added note');
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add note';
      setError(message);
      console.error('Error adding note:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update an existing note
  const updateNote = useCallback(async (noteId: string, content: string): Promise<boolean> => {
    if (!content.trim()) {
      setError('Note content cannot be empty');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('prospecting_note')
        .update({ content: content.trim() })
        .eq('id', noteId);

      if (updateError) throw updateError;

      // Update local state
      setNotes(prev => prev.map(n =>
        n.id === noteId ? { ...n, content: content.trim() } : n
      ));

      console.log('✅ Updated note');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update note';
      setError(message);
      console.error('Error updating note:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete a note
  const deleteNote = useCallback(async (noteId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('prospecting_note')
        .delete()
        .eq('id', noteId);

      if (deleteError) throw deleteError;

      // Remove from local state
      setNotes(prev => prev.filter(n => n.id !== noteId));

      console.log('✅ Deleted note');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete note';
      setError(message);
      console.error('Error deleting note:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    notes,
    loading,
    error,
    loadNotes,
    addNote,
    updateNote,
    deleteNote
  };
};
