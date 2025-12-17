/**
 * Gmail Connect Edge Function
 *
 * Initiates the OAuth 2.0 flow for connecting a user's Gmail account.
 * Returns a redirect URL that the frontend should navigate to.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Google OAuth configuration
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI')!;

// Gmail scopes needed
// gmail.modify includes read + ability to add/remove labels
// gmail.send allows sending emails on behalf of the user
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract user from JWT
    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userEmail = payload.email;

    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: 'Invalid token - no email' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client to get user ID
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('user')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user already has a Gmail connection
    const { data: existingConnection } = await supabase
      .from('gmail_connection')
      .select('id, google_email, is_active')
      .eq('user_id', user.id)
      .single();

    if (existingConnection?.is_active) {
      return new Response(
        JSON.stringify({
          error: 'Gmail already connected',
          google_email: existingConnection.google_email,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate state parameter with user info (will be validated in callback)
    // Include timestamp to prevent replay attacks
    const stateData = {
      user_id: user.id,
      user_email: userEmail,
      timestamp: Date.now(),
      nonce: crypto.randomUUID(),
    };

    // Encode state as base64 (in production, consider encrypting this)
    const state = btoa(JSON.stringify(stateData));

    // Build Google OAuth URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('access_type', 'offline'); // Get refresh token
    authUrl.searchParams.set('prompt', 'consent'); // Always show consent to get refresh token
    authUrl.searchParams.set('state', state);

    // Return the auth URL for frontend to redirect to
    return new Response(
      JSON.stringify({
        auth_url: authUrl.toString(),
        message: 'Redirect user to auth_url to complete Gmail connection',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in gmail-connect:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
