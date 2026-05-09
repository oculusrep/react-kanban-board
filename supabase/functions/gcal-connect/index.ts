/**
 * Google Calendar Connect Edge Function
 *
 * Initiates the OAuth 2.0 flow for connecting a user's Google Calendar.
 * Mirrors gmail-connect — same Google OAuth client, different scope.
 *
 * Returns a redirect URL that the frontend should navigate to. After the
 * user consents, Google redirects to gcal-callback (a separate edge function
 * keyed by GOOGLE_CALENDAR_REDIRECT_URI).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CALENDAR_REDIRECT_URI = Deno.env.get('GOOGLE_CALENDAR_REDIRECT_URI')!;

// Read-only access. We pull events; we never push, delete, or modify.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

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

    // Existing active connection? Tell the caller to use disconnect first.
    const { data: existingConnection } = await supabase
      .from('google_calendar_connection')
      .select('id, google_email, is_active')
      .eq('user_id', user.id)
      .single();

    if (existingConnection?.is_active) {
      return new Response(
        JSON.stringify({
          error: 'Google Calendar already connected',
          google_email: existingConnection.google_email,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const stateData = {
      user_id: user.id,
      user_email: userEmail,
      timestamp: Date.now(),
      nonce: crypto.randomUUID(),
    };
    const state = btoa(JSON.stringify(stateData));

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_CALENDAR_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('access_type', 'offline'); // get refresh token
    authUrl.searchParams.set('prompt', 'consent'); // force re-consent so we always get refresh_token
    authUrl.searchParams.set('state', state);

    return new Response(
      JSON.stringify({
        auth_url: authUrl.toString(),
        message: 'Redirect user to auth_url to complete Calendar connection',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in gcal-connect:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
