/**
 * Google Calendar List Edge Function
 *
 * Returns the list of calendars the user can subscribe to. Reads the user's
 * stored access_token (refreshing if expired) and calls Google's CalendarList
 * API server-side so tokens stay out of the browser.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// Refreshes the access token using the stored refresh_token and writes the
// new access_token + expires_at back to the connection row. Returns the
// fresh access_token. Throws on Google API failure.
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
  const { error: updateError } = await supabase
    .from('google_calendar_connection')
    .update({
      access_token: tokens.access_token,
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);
  if (updateError) {
    console.warn('Failed to persist refreshed token:', updateError);
  }
  return tokens.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userEmail = payload.email;
    if (!userEmail) {
      return new Response(JSON.stringify({ error: 'Invalid token - no email' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: user, error: userError } = await supabase
      .from('user')
      .select('id')
      .eq('email', userEmail)
      .single();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: connection, error: connError } = await supabase
      .from('google_calendar_connection')
      .select('id, access_token, refresh_token, token_expires_at, is_active')
      .eq('user_id', user.id)
      .single();
    if (connError || !connection || !connection.is_active) {
      return new Response(JSON.stringify({ error: 'Calendar not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let accessToken = connection.access_token as string;
    const expiresAt = new Date(connection.token_expires_at as string);
    if (expiresAt.getTime() <= Date.now() + 30_000) {
      accessToken = await refreshAccessToken(
        supabase,
        connection.id as string,
        connection.refresh_token as string
      );
    }

    const calResp = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!calResp.ok) {
      const errorText = await calResp.text();
      console.error('CalendarList fetch failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'CalendarList fetch failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const calData = await calResp.json();
    const items = (calData.items ?? []).map(
      (c: { id: string; summary: string; primary?: boolean; backgroundColor?: string }) => ({
        id: c.id,
        summary: c.summary,
        primary: c.primary === true,
        backgroundColor: c.backgroundColor ?? null,
      })
    );

    return new Response(JSON.stringify({ calendars: items }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in gcal-list-calendars:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
