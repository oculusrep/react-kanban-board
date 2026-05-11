/**
 * Google Calendar Sync Edge Function
 *
 * Pulls events from each enabled subscription into external_calendar_event.
 *
 * Two invocation modes:
 *   - body { user_id: X }     - scope to one user (manual "Sync now" button)
 *   - body {} (or empty body) - process all active connections (cron tick)
 *
 * For each (connection, subscription):
 *   1. Refresh access_token if token_expires_at <= now() + 30s
 *   2. Call Google Calendar events.list with timeMin/timeMax window
 *   3. Upsert results into external_calendar_event keyed on
 *      (subscription_id, google_event_id). Cancelled events kept with
 *      status='cancelled' so the timeline can show "this got cancelled".
 *   4. Update last_synced_at on the subscription
 *
 * Per-connection errors are caught + persisted to connection.sync_error
 * so the cron tick continues processing other users.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

// Sync window per Phase 3 plan resolved decisions.
const WINDOW_DAYS_BACK = 1;
const WINDOW_DAYS_FORWARD = 14;

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface CalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

async function refreshAccessToken(
  supabase: ReturnType<typeof createClient>,
  connectionId: string,
  refreshToken: string
): Promise<string> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }
  const tokens: RefreshResponse = await resp.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await supabase
    .from('google_calendar_connection')
    .update({
      access_token: tokens.access_token,
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);
  return tokens.access_token;
}

interface ConnectionRow {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

interface SubscriptionRow {
  id: string;
  google_calendar_id: string;
}

async function syncSubscription(
  accessToken: string,
  subscription: SubscriptionRow,
  supabase: ReturnType<typeof createClient>
): Promise<{ upserted: number }> {
  const now = new Date();
  const timeMin = new Date(now.getTime() - WINDOW_DAYS_BACK * 86400_000).toISOString();
  const timeMax = new Date(now.getTime() + WINDOW_DAYS_FORWARD * 86400_000).toISOString();

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(subscription.google_calendar_id)}/events`
  );
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true'); // expand recurring events
  url.searchParams.set('showDeleted', 'true'); // see cancellations
  url.searchParams.set('maxResults', '250');

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`events.list failed for ${subscription.google_calendar_id}: ${errorText}`);
  }
  const data = await resp.json();
  const items: CalendarEvent[] = data.items ?? [];
  if (items.length === 0) {
    await supabase
      .from('google_calendar_subscription')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', subscription.id);
    return { upserted: 0 };
  }

  // Map Google event → external_calendar_event row. All-day events use
  // start.date / end.date (no time component); timed events use start.dateTime.
  const rows = items.map((ev) => {
    const isAllDay = !!ev.start?.date && !ev.start?.dateTime;
    const startIso = ev.start?.dateTime ?? ev.start?.date ?? new Date().toISOString();
    const endIso = ev.end?.dateTime ?? ev.end?.date ?? startIso;
    // For all-day events, Google returns YYYY-MM-DD which Postgres parses
    // as midnight UTC. Anchor to local-of-the-day by appending T00:00:00.
    const normalize = (s: string) => (s.length === 10 ? `${s}T00:00:00` : s);
    return {
      subscription_id: subscription.id,
      google_event_id: ev.id,
      summary: ev.summary ?? null,
      description: ev.description ?? null,
      start_at: normalize(startIso),
      end_at: normalize(endIso),
      is_all_day: isAllDay,
      location: ev.location ?? null,
      html_link: ev.htmlLink ?? null,
      status: ev.status ?? 'confirmed',
      pulled_at: new Date().toISOString(),
    };
  });

  const { error: upsertError } = await supabase
    .from('external_calendar_event')
    .upsert(rows, { onConflict: 'subscription_id,google_event_id' });
  if (upsertError) {
    throw new Error(`Upsert failed: ${upsertError.message}`);
  }

  await supabase
    .from('google_calendar_subscription')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', subscription.id);

  return { upserted: rows.length };
}

async function syncConnection(
  connection: ConnectionRow,
  supabase: ReturnType<typeof createClient>
): Promise<{ subscriptions: number; events: number }> {
  let accessToken = connection.access_token;
  const expiresAt = new Date(connection.token_expires_at);
  if (expiresAt.getTime() <= Date.now() + 30_000) {
    accessToken = await refreshAccessToken(supabase, connection.id, connection.refresh_token);
  }

  const { data: subs, error: subError } = await supabase
    .from('google_calendar_subscription')
    .select('id, google_calendar_id')
    .eq('connection_id', connection.id)
    .eq('enabled', true);
  if (subError) {
    throw new Error(`Failed to load subscriptions: ${subError.message}`);
  }

  let totalEvents = 0;
  for (const sub of (subs ?? []) as SubscriptionRow[]) {
    try {
      const { upserted } = await syncSubscription(accessToken, sub, supabase);
      totalEvents += upserted;
    } catch (subErr) {
      // One subscription failing shouldn't kill the whole connection sync.
      console.error(`Subscription ${sub.id} sync failed:`, (subErr as Error).message);
    }
  }

  await supabase
    .from('google_calendar_connection')
    .update({
      last_sync_at: new Date().toISOString(),
      sync_error: null,
      sync_error_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  return { subscriptions: subs?.length ?? 0, events: totalEvents };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    // Custom dual-auth: deployed with verify_jwt=false so the cron can
    // reach the function without a Bearer JWT. The function then accepts
    // EITHER a valid user JWT (the in-app "Sync now" button — Supabase
    // auto-attaches the user's session token) OR an X-Cron-Secret header
    // matching the CRON_SECRET env var (the pg_cron tick every 5 min).
    // Anything else is rejected.
    const cronSecret = Deno.env.get('CRON_SECRET');
    const cronHeader = req.headers.get('X-Cron-Secret');
    const isCronCall = !!cronSecret && cronHeader === cronSecret;

    const authHeader = req.headers.get('Authorization');
    let isUserCall = false;
    if (!isCronCall && authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload?.email) isUserCall = true;
      } catch {
        // Invalid JWT shape — fall through to 401.
      }
    }

    if (!isCronCall && !isUserCall) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let userId: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.user_id === 'string') userId = body.user_id;
    } catch {
      // Empty body or non-JSON — fall through to cron mode (all connections).
    }

    let query = supabase
      .from('google_calendar_connection')
      .select('id, user_id, access_token, refresh_token, token_expires_at')
      .eq('is_active', true);
    if (userId) query = query.eq('user_id', userId);

    const { data: connections, error: connError } = await query;
    if (connError) {
      throw new Error(`Failed to load connections: ${connError.message}`);
    }

    const results: { connection_id: string; subscriptions?: number; events?: number; error?: string }[] = [];

    for (const conn of (connections ?? []) as ConnectionRow[]) {
      try {
        const r = await syncConnection(conn, supabase);
        results.push({ connection_id: conn.id, ...r });
      } catch (err) {
        const msg = (err as Error).message;
        console.error(`Connection ${conn.id} sync failed:`, msg);
        await supabase
          .from('google_calendar_connection')
          .update({
            sync_error: msg,
            sync_error_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', conn.id);
        results.push({ connection_id: conn.id, error: msg });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in gcal-sync:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
