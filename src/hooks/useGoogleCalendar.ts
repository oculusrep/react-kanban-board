import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  ExternalCalendarEvent,
  GoogleCalendarConnection,
  GoogleCalendarSubscription,
  GoogleCalendarSubscriptionInsert,
  GoogleCalendarSubscriptionUpdate,
} from '../types/calendar';

// CRUD layer for Phase 3. Edge functions (gcal-connect / gcal-callback /
// gcal-sync) handle OAuth + the actual Google API calls; these hooks read
// state out of Postgres and offer subscription toggles + a manual "Sync now"
// trigger that invokes the sync edge function.

// ---------------------------------------------------------------------------
// useGoogleCalendarConnection — fetch the user's single connection row.
// Returns null when the user hasn't connected yet.
// ---------------------------------------------------------------------------

interface UseConnectionResult {
  connection: GoogleCalendarConnection | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGoogleCalendarConnection(userId: string | null | undefined): UseConnectionResult {
  const [connection, setConnection] = useState<GoogleCalendarConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnection = useCallback(async () => {
    if (!userId) {
      setConnection(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('google_calendar_connection')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      setConnection((data as GoogleCalendarConnection) ?? null);
    } catch (err) {
      console.error('useGoogleCalendarConnection error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load connection');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchConnection();
  }, [fetchConnection]);

  return { connection, loading, error, refetch: fetchConnection };
}

// ---------------------------------------------------------------------------
// useCalendarSubscriptions — list subscriptions for a connection.
// ---------------------------------------------------------------------------

interface UseSubscriptionsResult {
  subscriptions: GoogleCalendarSubscription[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCalendarSubscriptions(connectionId: string | null | undefined): UseSubscriptionsResult {
  const [subscriptions, setSubscriptions] = useState<GoogleCalendarSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    if (!connectionId) {
      setSubscriptions([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('google_calendar_subscription')
        .select('*')
        .eq('connection_id', connectionId)
        .order('display_name', { ascending: true });
      if (fetchError) throw fetchError;
      setSubscriptions((data ?? []) as GoogleCalendarSubscription[]);
    } catch (err) {
      console.error('useCalendarSubscriptions error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  return { subscriptions, loading, error, refetch: fetchSubscriptions };
}

// ---------------------------------------------------------------------------
// useExternalCalendarEvents — events overlapping a (user, date range).
// PR 7's Conflicts lane and PR 8's timeline interleave both call this.
// ---------------------------------------------------------------------------

interface UseEventsOptions {
  userId: string | null | undefined;
  /** Local YYYY-MM-DD per CLAUDE.md timezone guidance. */
  fromDate: string | null | undefined;
  toDate: string | null | undefined;
}

interface UseEventsResult {
  events: ExternalCalendarEvent[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Resolves which subscription ids belong to the user, then queries events
// in the [fromDate 00:00, toDate 24:00) local window. RLS already scopes
// events to the user via the connection chain, but we also filter by
// subscription_ids client-side to avoid cross-user leakage in the unlikely
// event of an RLS misconfiguration.
export function useExternalCalendarEvents(opts: UseEventsOptions): UseEventsResult {
  const { userId, fromDate, toDate } = opts;
  const [events, setEvents] = useState<ExternalCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!userId || !fromDate || !toDate) {
      setEvents([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      // Resolve user → connection → subscription ids.
      const { data: subs, error: subError } = await supabase
        .from('google_calendar_subscription')
        .select('id, connection:google_calendar_connection!inner(user_id)')
        .eq('enabled', true)
        // PostgREST resolves the !inner join, then we filter on the joined column
        .eq('connection.user_id', userId);
      if (subError) throw subError;
      const subscriptionIds = (subs ?? []).map((s: { id: string }) => s.id);
      if (subscriptionIds.length === 0) {
        setEvents([]);
        return;
      }

      // Local-day window: parse the dates as local midnight; toDate end-of-day.
      const [fy, fm, fd] = fromDate.split('-').map((s) => parseInt(s, 10));
      const [ty, tm, td] = toDate.split('-').map((s) => parseInt(s, 10));
      const windowStart = new Date(fy, fm - 1, fd, 0, 0, 0);
      const windowEnd = new Date(ty, tm - 1, td, 23, 59, 59, 999);

      const { data, error: fetchError } = await supabase
        .from('external_calendar_event')
        .select('*')
        .in('subscription_id', subscriptionIds)
        // Overlap: event ends after window start AND event starts before window end.
        .gte('end_at', windowStart.toISOString())
        .lte('start_at', windowEnd.toISOString())
        .neq('status', 'cancelled')
        .order('start_at', { ascending: true });
      if (fetchError) throw fetchError;
      setEvents((data ?? []) as ExternalCalendarEvent[]);
    } catch (err) {
      console.error('useExternalCalendarEvents error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [userId, fromDate, toDate]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents };
}

// ---------------------------------------------------------------------------
// Mutations — plain async functions.
// ---------------------------------------------------------------------------

export async function setSubscriptionEnabled(
  subscriptionId: string,
  enabled: boolean
): Promise<GoogleCalendarSubscription> {
  const { data, error } = await supabase
    .from('google_calendar_subscription')
    .update({ enabled })
    .eq('id', subscriptionId)
    .select()
    .single();
  if (error) throw error;
  return data as GoogleCalendarSubscription;
}

export async function upsertSubscription(
  input: GoogleCalendarSubscriptionInsert
): Promise<GoogleCalendarSubscription> {
  const { data, error } = await supabase
    .from('google_calendar_subscription')
    .upsert(input, { onConflict: 'connection_id,google_calendar_id' })
    .select()
    .single();
  if (error) throw error;
  return data as GoogleCalendarSubscription;
}

export async function updateSubscription(
  id: string,
  patch: GoogleCalendarSubscriptionUpdate
): Promise<GoogleCalendarSubscription> {
  const { data, error } = await supabase
    .from('google_calendar_subscription')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as GoogleCalendarSubscription;
}

// Triggers an immediate sync for the current user via the gcal-sync edge
// function. Used by the dashboard "↻ Sync" button. The cron tick handles
// background sync; this is for "I just connected and want to see events
// right away" or "I added a meeting in Google and want it pulled now."
export async function triggerSyncNow(userId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('gcal-sync', {
    body: { user_id: userId },
  });
  if (error) throw error;
}
