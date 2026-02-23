/**
 * usePropertyTimeline Hook
 *
 * Fetches and unifies activity data from multiple sources into a single
 * chronological timeline for a property. Similar to useContactTimeline
 * but for property-level activities.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  UnifiedTimelineItem,
  TimelineSource,
  TimelineGroup,
  TimelineActivityType,
  ActivityDirection,
} from '../types/timeline';

// Property-specific activity types
export type PropertyActivityType = 'phone_call' | 'email' | 'sms' | 'voicemail' | 'linkedin';

interface UsePropertyTimelineOptions {
  propertyId: string | null;
  sources?: TimelineSource[];
  limit?: number;
}

interface UsePropertyTimelineReturn {
  // Data
  items: UnifiedTimelineItem[];
  groupedItems: TimelineGroup[];

  // State
  loading: boolean;
  error: string | null;

  // Actions
  refresh: () => Promise<void>;

  // Mutations
  addNote: (content: string) => Promise<UnifiedTimelineItem | null>;
  logActivity: (
    type: PropertyActivityType,
    options?: { notes?: string; contactId?: string; emailSubject?: string }
  ) => Promise<UnifiedTimelineItem | null>;
  deleteItem: (item: UnifiedTimelineItem) => Promise<boolean>;
}

const DEFAULT_SOURCES: TimelineSource[] = [
  'property_activity',
  'property_note',
  'email',
];

export function usePropertyTimeline(
  options: UsePropertyTimelineOptions
): UsePropertyTimelineReturn {
  const {
    propertyId,
    sources = DEFAULT_SOURCES,
    limit = 100,
  } = options;

  const [items, setItems] = useState<UnifiedTimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch unified timeline data
  const fetchTimeline = useCallback(async () => {
    if (!propertyId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const allItems: UnifiedTimelineItem[] = [];

      // 1. Fetch from property_activity
      if (sources.includes('property_activity')) {
        const { data: activities, error: activityError } = await supabase
          .from('property_activity')
          .select(`
            id, activity_type, notes, email_subject, created_at, created_by,
            contact_id,
            contact:contact_id (
              first_name,
              last_name
            )
          `)
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false });

        if (activityError) {
          console.error('Error fetching property activities:', activityError);
        } else {
          (activities || []).forEach((a) => {
            const contact = a.contact as { first_name?: string; last_name?: string } | null;
            const contactName = contact
              ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
              : null;

            allItems.push({
              id: a.id,
              source: 'property_activity',
              type: a.activity_type as TimelineActivityType,
              created_at: a.created_at,
              content: a.notes,
              email_subject: a.email_subject,
              created_by: a.created_by,
              property_id: propertyId,
              contact_id: a.contact_id,
              contact_name: contactName || undefined,
            });
          });
        }
      }

      // 2. Fetch from property_note
      if (sources.includes('property_note')) {
        const { data: notes, error: noteError } = await supabase
          .from('property_note')
          .select('id, content, is_migrated, migrated_from, created_at, created_by')
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false });

        if (noteError) {
          console.error('Error fetching property notes:', noteError);
        } else {
          (notes || []).forEach((n) => {
            allItems.push({
              id: n.id,
              source: 'property_note',
              type: 'note',
              created_at: n.created_at,
              content: n.content,
              created_by: n.created_by,
              property_id: propertyId,
              is_migrated: n.is_migrated || false,
              migrated_from: n.migrated_from,
            });
          });
        }
      }

      // 3. Fetch emails linked to this property via email_object_link
      if (sources.includes('email')) {
        const { data: emailLinks, error: emailError } = await supabase
          .from('email_object_link')
          .select(`
            email_id,
            emails!email_object_link_email_id_fkey (
              id, gmail_id, subject, snippet, sender_email, sender_name,
              recipient_list, direction, received_at, thread_id
            )
          `)
          .eq('object_type', 'property')
          .eq('object_id', propertyId);

        if (emailError) {
          console.error('Error fetching property emails:', emailError);
        } else {
          (emailLinks || []).forEach((link) => {
            const email = (link as { emails?: {
              id: string;
              gmail_id?: string;
              subject?: string;
              snippet?: string;
              sender_email?: string;
              sender_name?: string;
              recipient_list?: Array<{ email: string; name?: string; type?: string }>;
              direction?: string;
              received_at?: string;
              thread_id?: string;
            } }).emails;
            if (!email || !email.received_at) return;

            allItems.push({
              id: email.id,
              source: 'email',
              type: email.direction === 'INBOUND' ? 'email_received' : 'email_sent',
              created_at: email.received_at,
              email_subject: email.subject,
              email_body_preview: email.snippet,
              sender_email: email.sender_email,
              sender_name: email.sender_name,
              recipient_list: email.recipient_list,
              direction: (email.direction?.toLowerCase() || 'unknown') as ActivityDirection,
              thread_id: email.thread_id,
              gmail_id: email.gmail_id,
              property_id: propertyId,
            });
          });
        }
      }

      // Sort all items by created_at descending
      allItems.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Apply limit
      setItems(allItems.slice(0, limit));
    } catch (err) {
      console.error('Error fetching property timeline:', err);
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [propertyId, sources, limit]);

  // Group items by date for display
  const groupedItems: TimelineGroup[] = useMemo(() => {
    const groups: Map<string, UnifiedTimelineItem[]> = new Map();
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    items.forEach((item) => {
      const dateKey = item.created_at.split('T')[0];
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(item);
    });

    return Array.from(groups.entries()).map(([date, dateItems]) => {
      let displayDate: string;
      if (date === today) displayDate = 'Today';
      else if (date === yesterday) displayDate = 'Yesterday';
      else
        displayDate = new Date(date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

      return { date, displayDate, items: dateItems };
    });
  }, [items]);

  // Effect to load on mount and when dependencies change
  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // Add note mutation
  const addNote = useCallback(
    async (content: string): Promise<UnifiedTimelineItem | null> => {
      if (!propertyId || !content.trim()) return null;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error: insertError } = await supabase
          .from('property_note')
          .insert({
            property_id: propertyId,
            content: content.trim(),
            created_by: user.id,
          })
          .select('id, content, created_at, created_by')
          .single();

        if (insertError) throw insertError;

        const newItem: UnifiedTimelineItem = {
          id: data.id,
          source: 'property_note',
          type: 'note',
          created_at: data.created_at,
          content: data.content,
          created_by: data.created_by,
          property_id: propertyId,
        };

        setItems((prev) => [newItem, ...prev]);
        return newItem;
      } catch (err) {
        console.error('Error adding property note:', err);
        return null;
      }
    },
    [propertyId]
  );

  // Log activity mutation
  const logActivity = useCallback(
    async (
      type: PropertyActivityType,
      activityOptions?: { notes?: string; contactId?: string; emailSubject?: string }
    ): Promise<UnifiedTimelineItem | null> => {
      if (!propertyId) return null;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error: insertError } = await supabase
          .from('property_activity')
          .insert({
            property_id: propertyId,
            contact_id: activityOptions?.contactId || null,
            activity_type: type,
            notes: activityOptions?.notes || null,
            email_subject: activityOptions?.emailSubject || null,
            created_by: user.id,
          })
          .select(`
            id, activity_type, notes, email_subject, created_at, created_by, contact_id,
            contact:contact_id (
              first_name,
              last_name
            )
          `)
          .single();

        if (insertError) throw insertError;

        const contact = data.contact as { first_name?: string; last_name?: string } | null;
        const contactName = contact
          ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
          : null;

        const newItem: UnifiedTimelineItem = {
          id: data.id,
          source: 'property_activity',
          type: data.activity_type as TimelineActivityType,
          created_at: data.created_at,
          content: data.notes,
          email_subject: data.email_subject,
          created_by: data.created_by,
          property_id: propertyId,
          contact_id: data.contact_id,
          contact_name: contactName || undefined,
        };

        setItems((prev) => [newItem, ...prev]);
        return newItem;
      } catch (err) {
        console.error('Error logging property activity:', err);
        return null;
      }
    },
    [propertyId]
  );

  // Delete item mutation
  const deleteItem = useCallback(
    async (item: UnifiedTimelineItem): Promise<boolean> => {
      try {
        let deleteError = null;

        // Delete from the appropriate table based on source
        if (item.source === 'property_activity') {
          const { error } = await supabase
            .from('property_activity')
            .delete()
            .eq('id', item.id);
          deleteError = error;
        } else if (item.source === 'property_note') {
          const { error } = await supabase
            .from('property_note')
            .delete()
            .eq('id', item.id);
          deleteError = error;
        } else {
          // Cannot delete emails or other sources from here
          console.warn('Cannot delete items from source:', item.source);
          return false;
        }

        if (deleteError) throw deleteError;

        // Remove from local state
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        return true;
      } catch (err) {
        console.error('Error deleting timeline item:', err);
        return false;
      }
    },
    []
  );

  return {
    items,
    groupedItems,
    loading,
    error,
    refresh: fetchTimeline,
    addNote,
    logActivity,
    deleteItem,
  };
}
