/**
 * Gmail Callback Edge Function
 *
 * Handles the OAuth 2.0 callback from Google after user authorization.
 * Exchanges the code for tokens and stores the connection in the database.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Google OAuth configuration
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI')!;

// Frontend URLs for redirect after OAuth
const FRONTEND_SUCCESS_URL = Deno.env.get('FRONTEND_URL')
  ? `${Deno.env.get('FRONTEND_URL')}/admin/gmail?status=success`
  : 'http://localhost:5173/admin/gmail?status=success';
const FRONTEND_ERROR_URL = Deno.env.get('FRONTEND_URL')
  ? `${Deno.env.get('FRONTEND_URL')}/admin/gmail?status=error`
  : 'http://localhost:5173/admin/gmail?status=error';

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

    // Handle error from Google
    const error = url.searchParams.get('error');
    if (error) {
      console.error('OAuth error from Google:', error);
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=${encodeURIComponent(error)}`);
    }

    // Get authorization code and state
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      console.error('Missing code or state parameter');
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=missing_parameters`);
    }

    // Decode and validate state
    let stateData: { user_id: string; user_email: string; timestamp: number; nonce: string };
    try {
      stateData = JSON.parse(atob(state));
    } catch (e) {
      console.error('Invalid state parameter');
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=invalid_state`);
    }

    // Check state timestamp (expire after 10 minutes)
    const stateAge = Date.now() - stateData.timestamp;
    if (stateAge > 10 * 60 * 1000) {
      console.error('State expired');
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=state_expired`);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=token_exchange_failed`);
    }

    const tokens: TokenResponse = await tokenResponse.json();

    // Log the scopes actually granted by Google
    console.log('Scopes granted by Google:', tokens.scope);

    // Verify gmail.modify scope was granted (or gmail.readonly as fallback)
    // gmail.modify includes all gmail.readonly permissions
    if (!tokens.scope?.includes('gmail.modify') && !tokens.scope?.includes('gmail.readonly')) {
      console.error('gmail.modify scope not granted! Received:', tokens.scope);
      return Response.redirect(
        `${FRONTEND_ERROR_URL}&message=missing_gmail_readonly_scope`
      );
    }

    if (!tokens.refresh_token) {
      console.error('No refresh token received - user may need to revoke access and retry');
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=no_refresh_token`);
    }

    // Get user's Gmail address
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      console.error('Failed to get user info');
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=userinfo_failed`);
    }

    const userInfo: GoogleUserInfo = await userInfoResponse.json();

    // Calculate token expiration time
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this Gmail is already connected to another user
    const { data: existingGmail } = await supabase
      .from('gmail_connection')
      .select('id, user_id')
      .eq('google_email', userInfo.email)
      .single();

    if (existingGmail && existingGmail.user_id !== stateData.user_id) {
      console.error('Gmail already connected to different user');
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=gmail_already_connected`);
    }

    // Upsert the Gmail connection
    const { error: upsertError } = await supabase
      .from('gmail_connection')
      .upsert(
        {
          user_id: stateData.user_id,
          google_email: userInfo.email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: tokenExpiresAt.toISOString(),
          is_active: true,
          last_history_id: null, // Will be set on first sync
          last_sync_at: null,
          sync_error: null,
          sync_error_at: null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (upsertError) {
      console.error('Failed to save Gmail connection:', upsertError);
      return Response.redirect(`${FRONTEND_ERROR_URL}&message=database_error`);
    }

    console.log(`Gmail connected: ${userInfo.email} for user ${stateData.user_id}`);

    // Redirect to success page
    return Response.redirect(`${FRONTEND_SUCCESS_URL}&email=${encodeURIComponent(userInfo.email)}`);
  } catch (error) {
    console.error('Error in gmail-callback:', error);
    return Response.redirect(`${FRONTEND_ERROR_URL}&message=internal_error`);
  }
});
