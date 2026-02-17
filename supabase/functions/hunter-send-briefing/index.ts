/**
 * Hunter Send Briefing Edge Function
 *
 * Sends daily briefing emails via Gmail API to the configured recipient.
 * Used by the Hunter agent to deliver daily summaries of prospecting activity.
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

interface BriefingRequest {
  to: string;              // Recipient email (BRIEFING_TO_EMAIL)
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
    const request = await req.json() as BriefingRequest;

    // Validate required fields
    if (!request.to) {
      return new Response(
        JSON.stringify({ error: 'to email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!request.subject) {
      return new Response(
        JSON.stringify({ error: 'subject is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!request.body_html) {
      return new Response(
        JSON.stringify({ error: 'body_html is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // For briefings, we need to find an admin user's Gmail connection
    // Get the first active Gmail connection (typically the admin's) with user info
    const { data: connection, error: connError } = await supabase
      .from('gmail_connection')
      .select(`
        *,
        user:user_id (name, first_name, last_name)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({
          error: 'No Gmail connection found',
          details: 'An admin needs to connect their Gmail account in OVIS settings',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gmailConnection = connection as GmailConnection & {
      user?: { name?: string; first_name?: string; last_name?: string } | null;
    };

    // Get sender display name from user record
    const senderUser = gmailConnection.user;
    const senderName = senderUser?.name ||
      (senderUser?.first_name && senderUser?.last_name
        ? `${senderUser.first_name} ${senderUser.last_name}`
        : null) ||
      senderUser?.first_name ||
      null;

    // Check if token needs refresh
    let accessToken = gmailConnection.access_token;

    if (isTokenExpired(gmailConnection.token_expires_at)) {
      console.log(`[Hunter Briefing] Refreshing token for ${gmailConnection.google_email}`);

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

    // Prepare email options
    const emailOptions: SendEmailOptions = {
      to: [request.to],
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
      console.error(`[Hunter Briefing] Failed to send: ${sendResult.error}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: sendResult.error,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Hunter Briefing] Email sent successfully: ${sendResult.messageId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: sendResult.messageId,
        thread_id: sendResult.threadId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Hunter Briefing] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
