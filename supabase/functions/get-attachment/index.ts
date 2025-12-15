/**
 * Get Attachment Edge Function
 *
 * Fetches an email attachment from Gmail on-demand and returns it
 * for download or preview.
 *
 * GET /functions/v1/get-attachment?attachment_id=<uuid>
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  refreshAccessToken,
  isTokenExpired,
} from '../_shared/gmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const attachmentId = url.searchParams.get('attachment_id');

    if (!attachmentId) {
      return new Response(
        JSON.stringify({ error: 'attachment_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get attachment record with email and connection info
    const { data: attachment, error: attachError } = await supabase
      .from('email_attachments')
      .select(`
        id,
        gmail_attachment_id,
        filename,
        mime_type,
        size_bytes,
        email_id,
        emails!inner (
          gmail_id,
          email_visibility!inner (
            gmail_connection_id
          )
        )
      `)
      .eq('id', attachmentId)
      .single();

    if (attachError || !attachment) {
      console.error('Attachment not found:', attachError);
      return new Response(
        JSON.stringify({ error: 'Attachment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract IDs from nested structure
    const gmailMessageId = (attachment as any).emails?.gmail_id;
    const gmailConnectionId = (attachment as any).emails?.email_visibility?.[0]?.gmail_connection_id;

    if (!gmailMessageId || !gmailConnectionId) {
      return new Response(
        JSON.stringify({ error: 'Missing Gmail message or connection info' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Gmail connection
    const { data: connection, error: connError } = await supabase
      .from('gmail_connection')
      .select('*')
      .eq('id', gmailConnectionId)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: 'Gmail connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh token if needed
    let accessToken = connection.access_token;
    if (isTokenExpired(connection.token_expires_at)) {
      console.log('Refreshing token for attachment download');
      const newTokens = await refreshAccessToken(
        connection.refresh_token,
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET
      );
      accessToken = newTokens.access_token;

      // Update token in database
      const tokenExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
      await supabase
        .from('gmail_connection')
        .update({
          access_token: accessToken,
          token_expires_at: tokenExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);
    }

    // Fetch attachment from Gmail API
    const gmailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMessageId}/attachments/${attachment.gmail_attachment_id}`;

    const gmailResponse = await fetch(gmailUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!gmailResponse.ok) {
      const errorText = await gmailResponse.text();
      console.error('Gmail API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch attachment from Gmail' }),
        { status: gmailResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gmailData = await gmailResponse.json();

    // Gmail returns base64url encoded data
    // Convert to standard base64 and then to binary
    const base64Data = gmailData.data
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Determine content disposition based on mime type
    const isPreviewable = attachment.mime_type?.startsWith('image/') ||
                          attachment.mime_type === 'application/pdf';
    const disposition = isPreviewable ? 'inline' : 'attachment';

    // Return the file
    return new Response(binaryData, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': attachment.mime_type || 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(attachment.filename)}"`,
        'Content-Length': binaryData.length.toString(),
        'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error: any) {
    console.error('Error in get-attachment:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
