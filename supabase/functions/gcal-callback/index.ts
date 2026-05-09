/**
 * Google Calendar Callback Edge Function
 *
 * Handles the OAuth 2.0 callback after the user authorizes Calendar access.
 * Exchanges the auth code for tokens, fetches the user's email, and upserts
 * the google_calendar_connection row. Redirects back to /settings/calendars.
 *
 * verify_jwt is FALSE for this function — Google's redirect doesn't carry
 * a Supabase JWT. Auth context is reconstructed from the `state` parameter.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const GOOGLE_CALENDAR_REDIRECT_URI = Deno.env.get('GOOGLE_CALENDAR_REDIRECT_URI')!;

const FRONTEND_BASE = Deno.env.get('FRONTEND_URL') ?? 'http://localhost:5173';
const FRONTEND_SUCCESS_URL = `${FRONTEND_BASE}/settings/calendars?status=success`;
const FRONTEND_ERROR_URL = `${FRONTEND_BASE}/settings/calendars?status=error`;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleUserInfo {
  email: string;
  verified_email: boolean;
}

serve(async (req) => {
  try {
    const url = new URL(req.url);

    const error = url.searchParams.get('error');
    if (error) {
      console.error('OAuth error from Google:', error);
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=${encodeURIComponent(error)}`);
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      console.error('Missing code or state parameter');
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=missing_parameters`);
    }

    let stateData: { user_id: string; user_email: string; timestamp: number; nonce: string };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      console.error('Invalid state parameter');
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=invalid_state`);
    }

    const stateAge = Date.now() - stateData.timestamp;
    if (stateAge > 10 * 60 * 1000) {
      console.error('State expired');
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=state_expired`);
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_CALENDAR_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=token_exchange_failed`);
    }

    const tokens: TokenResponse = await tokenResponse.json();
    console.log('Scopes granted by Google:', tokens.scope);

    if (!tokens.scope?.includes('calendar.readonly') && !tokens.scope?.includes('calendar')) {
      console.error('calendar.readonly scope not granted! Received:', tokens.scope);
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=missing_calendar_scope`);
    }

    if (!tokens.refresh_token) {
      console.error('No refresh token received - user may need to revoke access and retry');
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=no_refresh_token`);
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      console.error('Failed to get user info');
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=userinfo_failed`);
    }

    const userInfo: GoogleUserInfo = await userInfoResponse.json();
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Upsert keyed on user_id (UNIQUE in v1 schema) — re-connect overwrites
    // the existing tokens cleanly.
    const { error: upsertError } = await supabase
      .from('google_calendar_connection')
      .upsert(
        {
          user_id: stateData.user_id,
          google_email: userInfo.email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: tokenExpiresAt.toISOString(),
          is_active: true,
          last_sync_at: null,
          sync_error: null,
          sync_error_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      console.error('Failed to save Calendar connection:', upsertError);
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=database_error`);
    }

    console.log(`Google Calendar connected: ${userInfo.email} for user ${stateData.user_id}`);

    return Response.redirect(`${FRONTEND_SUCCESS_URL}&email=${encodeURIComponent(userInfo.email)}`);
  } catch (error) {
    console.error('Error in gcal-callback:', error);
    return Response.redirect(`${FRONTEND_ERROR_URL}&message=internal_error`);
  }
});
