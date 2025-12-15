/**
 * Backfill Attachments - One-time utility function
 *
 * Re-fetches emails from Gmail to extract attachment metadata
 * for emails that were synced before attachment extraction was added.
 *
 * Run manually via: POST /functions/v1/backfill-attachments
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  getMessage,
  parseGmailMessage,
  refreshAccessToken,
  isTokenExpired,
} from '../_shared/gmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

interface BackfillResult {
  email_id: string;
  gmail_id: string;
  subject: string;
  attachments_found: number;
  success: boolean;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: BackfillResult[] = [];

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find all emails that have a gmail_id but no attachments recorded
    // We'll check each one to see if it has attachments
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select(`
        id,
        gmail_id,
        subject,
        email_visibility (
          gmail_connection_id
        )
      `)
      .not('gmail_id', 'is', null)
      .order('received_at', { ascending: false });

    if (emailsError) {
      throw new Error(`Failed to query emails: ${emailsError.message}`);
    }

    if (!emails || emails.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No emails found',
          results: [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter to emails that don't have attachments recorded yet
    const emailIds = emails.map(e => e.id);
    const { data: existingAttachments } = await supabase
      .from('email_attachments')
      .select('email_id')
      .in('email_id', emailIds);

    const emailsWithAttachments = new Set((existingAttachments || []).map(a => a.email_id));
    const emailsToProcess = emails.filter(e => !emailsWithAttachments.has(e.id));

    console.log(`Found ${emailsToProcess.length} emails without attachment records (out of ${emails.length} total)`);

    if (emailsToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'All emails already have attachment records checked',
          results: [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group emails by gmail_connection_id for efficiency
    const emailsByConnection = new Map<string, typeof emailsToProcess>();
    for (const email of emailsToProcess) {
      const connectionId = email.email_visibility?.[0]?.gmail_connection_id;
      if (connectionId) {
        if (!emailsByConnection.has(connectionId)) {
          emailsByConnection.set(connectionId, []);
        }
        emailsByConnection.get(connectionId)!.push(email);
      }
    }

    console.log(`Emails grouped into ${emailsByConnection.size} Gmail connection(s)`);

    // Process each connection
    for (const [connectionId, connectionEmails] of emailsByConnection) {
      console.log(`Processing ${connectionEmails.length} emails for connection ${connectionId}`);

      // Get the Gmail connection
      const { data: connection, error: connError } = await supabase
        .from('gmail_connection')
        .select('*')
        .eq('id', connectionId)
        .single();

      if (connError || !connection) {
        console.error(`Failed to get connection ${connectionId}:`, connError);
        for (const email of connectionEmails) {
          results.push({
            email_id: email.id,
            gmail_id: email.gmail_id,
            subject: email.subject || '(No Subject)',
            attachments_found: 0,
            success: false,
            error: 'Gmail connection not found',
          });
        }
        continue;
      }

      // Refresh token if needed
      let accessToken = connection.access_token;
      if (isTokenExpired(connection.token_expires_at)) {
        console.log(`Refreshing token for ${connection.google_email}`);
        try {
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
        } catch (tokenError: any) {
          console.error(`Failed to refresh token:`, tokenError);
          for (const email of connectionEmails) {
            results.push({
              email_id: email.id,
              gmail_id: email.gmail_id,
              subject: email.subject || '(No Subject)',
              attachments_found: 0,
              success: false,
              error: `Token refresh failed: ${tokenError.message}`,
            });
          }
          continue;
        }
      }

      // Process each email
      for (const email of connectionEmails) {
        const result: BackfillResult = {
          email_id: email.id,
          gmail_id: email.gmail_id,
          subject: email.subject || '(No Subject)',
          attachments_found: 0,
          success: false,
        };

        try {
          // Fetch full message from Gmail
          const fullMessage = await getMessage(accessToken, email.gmail_id);
          const parsedEmail = parseGmailMessage(fullMessage, connection.google_email);

          if (parsedEmail.attachments && parsedEmail.attachments.length > 0) {
            // Store attachment metadata
            const attachmentRecords = parsedEmail.attachments.map(att => ({
              email_id: email.id,
              gmail_attachment_id: att.attachmentId,
              filename: att.filename,
              mime_type: att.mimeType,
              size_bytes: att.size,
            }));

            const { error: attachError } = await supabase
              .from('email_attachments')
              .upsert(attachmentRecords, { onConflict: 'email_id,gmail_attachment_id' });

            if (attachError) {
              result.error = `Failed to store attachments: ${attachError.message}`;
              console.error(`Error storing attachments for ${email.subject}:`, attachError);
            } else {
              result.success = true;
              result.attachments_found = attachmentRecords.length;
              console.log(`✓ Found ${attachmentRecords.length} attachment(s): ${email.subject}`);
            }
          } else {
            result.success = true;
            result.attachments_found = 0;
            // Don't log for emails without attachments (too noisy)
          }
        } catch (err: any) {
          result.error = err.message;
          console.error(`✗ Error processing ${email.subject}:`, err);
        }

        results.push(result);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const totalAttachments = results.reduce((sum, r) => sum + r.attachments_found, 0);
    const emailsWithAttachmentsFound = results.filter(r => r.attachments_found > 0).length;

    console.log(`Backfill complete in ${duration}ms: ${successCount} processed, ${failCount} failed, ${totalAttachments} attachments found across ${emailsWithAttachmentsFound} emails`);

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: duration,
        total_processed: results.length,
        successful: successCount,
        failures: failCount,
        total_attachments_found: totalAttachments,
        emails_with_attachments: emailsWithAttachmentsFound,
        results: results.filter(r => r.attachments_found > 0 || !r.success), // Only return interesting results
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in backfill-attachments:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        results,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
