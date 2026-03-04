/**
 * Custom hook for managing contact tags (campaigns, marketing lists)
 *
 * This hook allows tagging contacts for campaigns like "Nurture Campaign",
 * "Holiday Mailer", etc. A contact can have multiple tags.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ContactTagType, ContactTagDisplay } from '../types/contact-tags';

// Random color generator for new tags
const TAG_COLORS = [
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#10b981', // emerald
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#ef4444', // red
  '#84cc16', // lime
  '#f97316', // orange
];

interface UseContactTagsReturn {
  // Data
  tags: ContactTagDisplay[];
  availableTagTypes: ContactTagType[];
  loading: boolean;
  error: string | null;

  // Methods
  refreshTags: () => Promise<void>;
  refreshTagTypes: () => Promise<void>;
  addTag: (contactId: string, tagId: string, notes?: string) => Promise<void>;
  removeTag: (tagAssignmentId: string) => Promise<void>;
  createTagType: (tagName: string, description?: string) => Promise<string>; // Returns new tag ID
}

/**
 * Hook to manage tags for a specific contact
 */
export function useContactTags(contactId?: string | null): UseContactTagsReturn {
  const [tags, setTags] = useState<ContactTagDisplay[]>([]);
  const [availableTagTypes, setAvailableTagTypes] = useState<ContactTagType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available tag types on mount
  useEffect(() => {
    loadTagTypes();
  }, []);

  // Load tags when contactId changes
  useEffect(() => {
    if (contactId) {
      refreshTags();
    } else {
      setTags([]);
    }
  }, [contactId]);

  const loadTagTypes = async () => {
    try {
      const { data, error: err } = await supabase
        .from('contact_tag_type')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (err) throw err;
      setAvailableTagTypes(data || []);
    } catch (err) {
      console.error('Error loading tag types:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tag types');
    }
  };

  const refreshTags = useCallback(async () => {
    if (!contactId) {
      setTags([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: err } = await supabase
        .from('contact_tag')
        .select(`
          id,
          tag_id,
          notes,
          tag:tag_id (
            id,
            tag_name,
            color
          )
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (err) throw err;

      // Flatten the nested tag data
      const flattenedTags: ContactTagDisplay[] = (data || []).map((item: any) => ({
        id: item.id,
        tag_id: item.tag_id,
        tag_name: item.tag?.tag_name || 'Unknown',
        tag_color: item.tag?.color || '#3b82f6',
        notes: item.notes,
      }));

      setTags(flattenedTags);
    } catch (err) {
      console.error('Error loading contact tags:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  const addTag = async (contactIdParam: string, tagId: string, notes?: string) => {
    try {
      setError(null);

      // Get current user for created_by_id
      const { data: session } = await supabase.auth.getSession();
      const authUserId = session?.session?.user?.id;

      let createdById: string | null = null;
      if (authUserId) {
        const { data: userData } = await supabase
          .from('user')
          .select('id')
          .eq('auth_user_id', authUserId)
          .single();
        createdById = userData?.id || null;
      }

      const { error: err } = await supabase
        .from('contact_tag')
        .insert({
          contact_id: contactIdParam,
          tag_id: tagId,
          notes: notes || null,
          created_by_id: createdById,
        })
        .select()
        .single();

      if (err) {
        // Check for unique constraint violation
        if (err.code === '23505') {
          throw new Error('This tag is already assigned to this contact');
        }
        throw err;
      }

      await refreshTags();
    } catch (err) {
      console.error('Error adding tag:', err);
      setError(err instanceof Error ? err.message : 'Failed to add tag');
      throw err;
    }
  };

  const removeTag = async (tagAssignmentId: string) => {
    try {
      setError(null);

      const { error: err } = await supabase
        .from('contact_tag')
        .delete()
        .eq('id', tagAssignmentId);

      if (err) throw err;

      await refreshTags();
    } catch (err) {
      console.error('Error removing tag:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove tag');
      throw err;
    }
  };

  const createTagType = async (tagName: string, description?: string): Promise<string> => {
    try {
      setError(null);

      // Pick a random color
      const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];

      // Get max sort_order
      const { data: maxOrderData } = await supabase
        .from('contact_tag_type')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();

      const nextSortOrder = (maxOrderData?.sort_order || 0) + 1;

      const { data, error: err } = await supabase
        .from('contact_tag_type')
        .insert({
          tag_name: tagName.trim(),
          description: description?.trim() || null,
          color,
          is_active: true,
          sort_order: nextSortOrder,
        })
        .select()
        .single();

      if (err) {
        if (err.code === '23505') {
          throw new Error('A tag with this name already exists');
        }
        throw err;
      }

      // Refresh tag types list
      await loadTagTypes();

      return data.id;
    } catch (err) {
      console.error('Error creating tag type:', err);
      setError(err instanceof Error ? err.message : 'Failed to create tag');
      throw err;
    }
  };

  return {
    tags,
    availableTagTypes,
    loading,
    error,
    refreshTags,
    refreshTagTypes: loadTagTypes,
    addTag,
    removeTag,
    createTagType,
  };
}

/**
 * Hook to get all contacts with a specific tag (for campaign queries)
 */
export function useContactsByTag(tagName: string | null): {
  contacts: Array<{
    contact_id: string;
    contact_name: string;
    contact_email: string | null;
    contact_company: string | null;
  }>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tagName) {
      setContacts([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: err } = await supabase
        .from('v_contact_tags')
        .select('contact_id, contact_name, contact_email, contact_company')
        .eq('tag_name', tagName);

      if (err) throw err;
      setContacts(data || []);
    } catch (err) {
      console.error('Error loading contacts by tag:', err);
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [tagName]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { contacts, loading, error, refresh };
}
