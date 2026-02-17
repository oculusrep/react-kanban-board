/**
 * Hunter Send Outreach Edge Function
 *
 * Sends prospecting emails via Gmail API on behalf of the Hunter agent.
 * Uses the authenticated user's Gmail connection to send emails that appear
 * in their Sent folder and maintain proper threading.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  sendEmail,
  refreshAccessToken,
  isTokenExpired,
  type GmailConnection,
  type SendEmailOptions,
} from '../_shared/gmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OutreachRequest {
  outreach_id: string;       // ID of the hunter_outreach record
  user_email: string;        // Email of the OVIS user whose Gmail to use
  to: string[];              // Recipient emails
  cc?: string[];
  subject: string;
  body_html: string;
  body_text?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const request = await req.json() as OutreachRequest;

    // Validate required fields
    if (!request.outreach_id) {
      return new Response(
        JSON.stringify({ error: 'outreach_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!request.user_email) {
      return new Response(
        JSON.stringify({ error: 'user_email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!request.to || request.to.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one recipient is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from database (including name for email sender display)
    const { data: user, error: userError } = await supabase
      .from('user')
      .select('id, name, first_name, last_name')
      .eq('email', request.user_email)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: `User not found: ${request.user_email}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Gmail connection for this user
    const { data: connection, error: connError } = await supabase
      .from('gmail_connection')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({
          error: 'Gmail not connected',
          details: 'User needs to connect their Gmail account in OVIS settings',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gmailConnection = connection as GmailConnection;

    // Check if token needs refresh
    let accessToken = gmailConnection.access_token;

    if (isTokenExpired(gmailConnection.token_expires_at)) {
      console.log(`[Hunter Outreach] Refreshing token for ${gmailConnection.google_email}`);

      const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

      const refreshResult = await refreshAccessToken(
        gmailConnection.refresh_token,
        clientId,
        clientSecret
      );

      accessToken = refreshResult.access_token;

      // Update stored token
      const newExpiresAt = new Date(Date.now() + refreshResult.expires_in * 1000).toISOString();
      await supabase
        .from('gmail_connection')
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
        })
        .eq('id', gmailConnection.id);
    }

    // Get the sender's display name (prefer full name, fall back to first+last, then email username)
    const senderName = user.name ||
      (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : null) ||
      user.first_name ||
      null;

    // Prepare email options
    const emailOptions: SendEmailOptions = {
      to: request.to,
      cc: request.cc,
      subject: request.subject,
      bodyHtml: request.body_html,
      bodyText: request.body_text,
      fromName: senderName || undefined,
    };

    // Send the email
    const sendResult = await sendEmail(
      accessToken,
      gmailConnection.google_email,
      emailOptions
    );

    if (!sendResult.success) {
      // Update outreach record with error
      await supabase
        .from('hunter_outreach')
        .update({
          status: 'failed',
          error_message: sendResult.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.outreach_id);

      return new Response(
        JSON.stringify({
          success: false,
          error: sendResult.error,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update outreach record with success
    await supabase
      .from('hunter_outreach')
      .update({
        status: 'sent',
        gmail_message_id: sendResult.messageId,
        gmail_thread_id: sendResult.threadId,
        sent_at: new Date().toISOString(),
        sent_by_user_email: request.user_email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.outreach_id);

    console.log(`[Hunter Outreach] Email sent successfully: ${sendResult.messageId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: sendResult.messageId,
        thread_id: sendResult.threadId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Hunter Outreach] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
