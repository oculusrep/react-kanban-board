/**
 * useContactTimeline Hook
 *
 * Fetches and unifies activity data from multiple sources into a single
 * chronological timeline for a contact.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  UnifiedTimelineItem,
  TimelineSource,
  TimelineGroup,
  TimelineSummary,
  TimelineActivityType,
  ActivityDirection,
} from '../types/timeline';

interface UseContactTimelineOptions {
  contactId: string | null;
  targetId?: string | null;
  sources?: TimelineSource[];
  limit?: number;
}

interface UseContactTimelineReturn {
  // Data
  items: UnifiedTimelineItem[];
  groupedItems: TimelineGroup[];
  summary: TimelineSummary | null;

  // State
  loading: boolean;
  error: string | null;

  // Actions
  refresh: () => Promise<void>;

  // Mutations
  addNote: (content: string) => Promise<UnifiedTimelineItem | null>;
  logActivity: (
    type: TimelineActivityType,
    options?: { notes?: string; emailSubject?: string }
  ) => Promise<UnifiedTimelineItem | null>;
}

const DEFAULT_SOURCES: TimelineSource[] = [
  'prospecting_activity',
  'prospecting_note',
  'activity',
  'email',
  'hunter_outreach',
];

export function useContactTimeline(
  options: UseContactTimelineOptions
): UseContactTimelineReturn {
  const {
    contactId,
    targetId,
    sources = DEFAULT_SOURCES,
    limit = 100,
  } = options;

  const [items, setItems] = useState<UnifiedTimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch unified timeline data
  const fetchTimeline = useCallback(async () => {
    if (!contactId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const allItems: UnifiedTimelineItem[] = [];

      // 1. Fetch from prospecting_activity
      // Note: hidden_from_timeline column may not exist yet - omit to avoid query failure
      if (sources.includes('prospecting_activity')) {
        let query = supabase
          .from('prospecting_activity')
          .select('id, activity_type, notes, email_subject, created_at, created_by')
          .order('created_at', { ascending: false });

        if (targetId) {
          query = query.or(`contact_id.eq.${contactId},target_id.eq.${targetId}`);
        } else {
          query = query.eq('contact_id', contactId);
        }

        const { data: prospectingActivities } = await query;

        (prospectingActivities || []).forEach((a) => {
          allItems.push({
            id: a.id,
            source: 'prospecting_activity',
            type: a.activity_type as TimelineActivityType,
            created_at: a.created_at,
            content: a.notes,
            email_subject: a.email_subject,
            created_by: a.created_by,
            contact_id: contactId,
          });
        });
      }

      // 2. Fetch from prospecting_note
      if (sources.includes('prospecting_note')) {
        let noteQuery = supabase
          .from('prospecting_note')
          .select('id, content, created_at, created_by')
          .order('created_at', { ascending: false });

        if (targetId) {
          noteQuery = noteQuery.or(`contact_id.eq.${contactId},target_id.eq.${targetId}`);
        } else {
          noteQuery = noteQuery.eq('contact_id', contactId);
        }

        const { data: notes } = await noteQuery;

        (notes || []).forEach((n) => {
          allItems.push({
            id: n.id,
            source: 'prospecting_note',
            type: 'note',
            created_at: n.created_at,
            content: n.content,
            created_by: n.created_by,
            contact_id: contactId,
          });
        });
      }

      // 3. Fetch from main activity table
      if (sources.includes('activity')) {
        const { data: activities } = await supabase
          .from('activity')
          .select(`
            id, subject, description, created_at, completed_at,
            completed_call, call_duration_seconds, call_disposition,
            meeting_held, direction,
            activity_type!fk_activity_type_id (name),
            activity_status:status_id (name, is_closed)
          `)
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false });

        (activities || []).forEach((a) => {
          const actTypeName = ((a.activity_type as { name?: string })?.name || '').toLowerCase();
          let type: TimelineActivityType = 'task';
          if (actTypeName === 'call' || a.completed_call) type = 'call';
          else if (actTypeName === 'email') type = 'email';
          else if (actTypeName === 'meeting') type = 'meeting';

          allItems.push({
            id: a.id,
            source: 'activity',
            type,
            created_at: a.created_at,
            completed_at: a.completed_at,
            subject: a.subject,
            content: a.description,
            call_duration_seconds: a.call_duration_seconds,
            call_disposition: a.call_disposition,
            completed_call: a.completed_call,
            meeting_held: a.meeting_held,
            direction: a.direction as ActivityDirection,
            activity_type_name: (a.activity_type as { name?: string })?.name,
            activity_status: a.activity_status as { name: string; is_closed: boolean } | null,
            contact_id: contactId,
          });
        });
      }

      // 4. Fetch emails via email_object_link
      if (sources.includes('email')) {
        const { data: emailLinks } = await supabase
          .from('email_object_link')
          .select(`
            email_id,
            emails!email_object_link_email_id_fkey (
              id, gmail_id, subject, snippet, sender_email, sender_name,
              recipient_list, direction, received_at, thread_id
            )
          `)
          .eq('object_type', 'contact')
          .eq('object_id', contactId);

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
            contact_id: contactId,
          });
        });
      }

      // 5. Fetch hunter_outreach_draft (sent emails)
      if (sources.includes('hunter_outreach')) {
        let effectiveTargetId = targetId;
        if (!effectiveTargetId) {
          const { data: contact } = await supabase
            .from('contact')
            .select('target_id')
            .eq('id', contactId)
            .single();
          effectiveTargetId = contact?.target_id;
        }

        if (effectiveTargetId) {
          const { data: outreachDrafts } = await supabase
            .from('hunter_outreach_draft')
            .select('id, subject, body, sent_at, gmail_message_id, ai_reasoning, status, contact_email')
            .eq('target_id', effectiveTargetId)
            .eq('status', 'sent')
            .order('sent_at', { ascending: false });

          (outreachDrafts || []).forEach((draft) => {
            if (draft.sent_at) {
              allItems.push({
                id: draft.id,
                source: 'hunter_outreach',
                type: 'email_sent',
                created_at: draft.sent_at,
                email_subject: draft.subject,
                content: draft.body,
                direction: 'outbound',
                hunter_outreach_id: draft.id,
                ai_reasoning: draft.ai_reasoning,
                gmail_id: draft.gmail_message_id,
                target_id: effectiveTargetId,
                recipient_list: draft.contact_email ? [{ email: draft.contact_email }] : null,
              });
            }
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
      console.error('Error fetching timeline:', err);
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [contactId, targetId, sources, limit]);

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

  // Build summary for AI consumption
  const summary: TimelineSummary | null = useMemo(() => {
    if (!contactId || items.length === 0) return null;

    const counts = {
      emails_sent: 0,
      emails_received: 0,
      calls: 0,
      meetings: 0,
      linkedin_messages: 0,
      sms_messages: 0,
      voicemails: 0,
      notes: 0,
      tasks: 0,
    };

    items.forEach((item) => {
      switch (item.type) {
        case 'email_sent':
          counts.emails_sent++;
          break;
        case 'email_received':
          counts.emails_received++;
          break;
        case 'email':
          if (item.direction === 'outbound') counts.emails_sent++;
          else counts.emails_received++;
          break;
        case 'call':
          counts.calls++;
          break;
        case 'meeting':
          counts.meetings++;
          break;
        case 'linkedin':
          counts.linkedin_messages++;
          break;
        case 'sms':
          counts.sms_messages++;
          break;
        case 'voicemail':
          counts.voicemails++;
          break;
        case 'note':
          counts.notes++;
          break;
        case 'task':
          counts.tasks++;
          break;
      }
    });

    const sortedByDate = [...items].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return {
      contact_id: contactId,
      contact_name: '', // Populated by component
      total_activities: items.length,
      first_contact_date: sortedByDate[0]?.created_at,
      last_contact_date: sortedByDate[sortedByDate.length - 1]?.created_at,
      activity_counts: counts,
      timeline_items: items,
    };
  }, [contactId, items]);

  // Effect to load on mount and when dependencies change
  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // Add note mutation
  const addNote = useCallback(
    async (content: string): Promise<UnifiedTimelineItem | null> => {
      if (!contactId || !content.trim()) return null;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error: insertError } = await supabase
          .from('prospecting_note')
          .insert({
            contact_id: contactId,
            target_id: targetId || null,
            content: content.trim(),
            created_by: user.id,
          })
          .select('id, content, created_at, created_by')
          .single();

        if (insertError) throw insertError;

        const newItem: UnifiedTimelineItem = {
          id: data.id,
          source: 'prospecting_note',
          type: 'note',
          created_at: data.created_at,
          content: data.content,
          created_by: data.created_by,
          contact_id: contactId,
        };

        setItems((prev) => [newItem, ...prev]);
        return newItem;
      } catch (err) {
        console.error('Error adding note:', err);
        return null;
      }
    },
    [contactId, targetId]
  );

  // Log activity mutation
  const logActivity = useCallback(
    async (
      type: TimelineActivityType,
      activityOptions?: { notes?: string; emailSubject?: string }
    ): Promise<UnifiedTimelineItem | null> => {
      if (!contactId) return null;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error: insertError } = await supabase
          .from('prospecting_activity')
          .insert({
            contact_id: contactId,
            target_id: targetId || null,
            activity_type: type,
            notes: activityOptions?.notes || null,
            email_subject: activityOptions?.emailSubject || null,
            created_by: user.id,
          })
          .select('id, activity_type, notes, email_subject, created_at, created_by')
          .single();

        if (insertError) throw insertError;

        const newItem: UnifiedTimelineItem = {
          id: data.id,
          source: 'prospecting_activity',
          type: data.activity_type as TimelineActivityType,
          created_at: data.created_at,
          content: data.notes,
          email_subject: data.email_subject,
          created_by: data.created_by,
          contact_id: contactId,
        };

        setItems((prev) => [newItem, ...prev]);
        return newItem;
      } catch (err) {
        console.error('Error logging activity:', err);
        return null;
      }
    },
    [contactId, targetId]
  );

  return {
    items,
    groupedItems,
    summary,
    loading,
    error,
    refresh: fetchTimeline,
    addNote,
    logActivity,
  };
}
