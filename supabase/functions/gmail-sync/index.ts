/**
 * Gmail Sync Edge Function
 *
 * Syncs emails from connected Gmail accounts.
 * Can be triggered by:
 * 1. CRON schedule (every 5 minutes for all active connections)
 * 2. Manual trigger for a specific connection
 *
 * Implements:
 * - Incremental sync using Gmail History API
 * - 404 fallback to full sync when history ID expires
 * - Deduplication across multiple user connections
 * - Rate limiting and batch processing
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  GmailConnection,
  refreshAccessToken,
  isTokenExpired,
  syncEmailsForConnection,
  getMessage,
  parseGmailMessage,
  ParsedEmail,
} from '../_shared/gmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const MAX_MESSAGES_PER_SYNC = 50; // Avoid timeouts
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

interface SyncResult {
  connection_id: string;
  google_email: string;
  synced_count: number;
  new_emails: number;
  duplicate_emails: number;
  skipped_deleted: number;
  errors: string[];
  is_full_sync: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: SyncResult[] = [];

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this is a manual trigger for a specific connection
    let targetConnectionId: string | null = null;
    let forceFullSync = false;
    try {
      const body = await req.json();
      targetConnectionId = body.connection_id || null;
      forceFullSync = body.force_full_sync === true;
    } catch {
      // No body - CRON trigger for all connections
    }

    console.log(`Sync request: connection=${targetConnectionId}, forceFullSync=${forceFullSync}`);

    // Fetch active connections
    let query = supabase
      .from('gmail_connection')
      .select('*')
      .eq('is_active', true);

    if (targetConnectionId) {
      query = query.eq('id', targetConnectionId);
    }

    const { data: connections, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch connections: ${fetchError.message}`);
    }

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active connections to sync', results: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting sync for ${connections.length} connection(s)`);

    // Process each connection
    for (const connection of connections as GmailConnection[]) {
      const result: SyncResult = {
        connection_id: connection.id,
        google_email: connection.google_email,
        synced_count: 0,
        new_emails: 0,
        duplicate_emails: 0,
        skipped_deleted: 0,
        errors: [],
        is_full_sync: false,
      };

      try {
        // Refresh token if needed
        let accessToken = connection.access_token;
        if (isTokenExpired(connection.token_expires_at)) {
          console.log(`Refreshing token for ${connection.google_email}`);
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

        // Sync emails (handles 404 fallback internally)
        // If forceFullSync is requested, temporarily clear the history ID
        const connectionForSync = forceFullSync
          ? { ...connection, last_history_id: null }
          : connection;
        const syncResult = await syncEmailsForConnection(connectionForSync, accessToken);
        result.is_full_sync = syncResult.isFullSync;

        // Process messages (limit to avoid timeout)
        const messagesToProcess = syncResult.messages.slice(0, MAX_MESSAGES_PER_SYNC);

        for (const msgRef of messagesToProcess) {
          try {
            // Get full message content
            const fullMessage = await getMessage(accessToken, msgRef.id);
            const parsedEmail = parseGmailMessage(fullMessage, connection.google_email);

            // Check if this message was previously processed/deleted
            const { data: wasProcessed } = await supabase
              .from('processed_message_ids')
              .select('id, action')
              .eq('message_id', parsedEmail.messageId)
              .single();

            if (wasProcessed) {
              // Skip this email - it was previously deleted/processed
              console.log(`Skipping previously ${wasProcessed.action} email: ${parsedEmail.subject}`);
              result.skipped_deleted++;
              continue;
            }

            // Try to insert email (may already exist from another user's sync)
            const { data: existingEmail, error: lookupError } = await supabase
              .from('emails')
              .select('id')
              .eq('message_id', parsedEmail.messageId)
              .single();

            let emailId: string;

            if (existingEmail) {
              // Email already exists - just link visibility
              emailId = existingEmail.id;
              result.duplicate_emails++;
            } else {
              // Insert new email
              const { data: newEmail, error: insertError } = await supabase
                .from('emails')
                .insert({
                  message_id: parsedEmail.messageId,
                  gmail_id: parsedEmail.gmailId,
                  thread_id: parsedEmail.threadId,
                  in_reply_to: parsedEmail.inReplyTo,
                  references_header: parsedEmail.references,
                  direction: parsedEmail.direction,
                  subject: parsedEmail.subject,
                  body_text: parsedEmail.bodyText,
                  body_html: parsedEmail.bodyHtml,
                  snippet: parsedEmail.snippet,
                  sender_email: parsedEmail.senderEmail,
                  sender_name: parsedEmail.senderName,
                  recipient_list: parsedEmail.recipientList,
                  received_at: parsedEmail.receivedAt.toISOString(),
                  ai_processed: false,
                })
                .select('id')
                .single();

              if (insertError) {
                // Check if it's a unique constraint violation (race condition)
                if (insertError.code === '23505') {
                  // Another sync inserted it - fetch the existing one
                  const { data: raceEmail } = await supabase
                    .from('emails')
                    .select('id')
                    .eq('message_id', parsedEmail.messageId)
                    .single();
                  if (raceEmail) {
                    emailId = raceEmail.id;
                    result.duplicate_emails++;
                  } else {
                    throw insertError;
                  }
                } else {
                  throw insertError;
                }
              } else {
                emailId = newEmail!.id;
                result.new_emails++;
              }
            }

            // Add visibility record for this user
            const folderLabel = parsedEmail.labelIds.includes('SENT') ? 'SENT' : 'INBOX';
            await supabase
              .from('email_visibility')
              .upsert(
                {
                  email_id: emailId,
                  user_id: connection.user_id,
                  gmail_connection_id: connection.id,
                  folder_label: folderLabel,
                  is_read: !parsedEmail.labelIds.includes('UNREAD'),
                },
                { onConflict: 'email_id,user_id' }
              );

            // Store attachment metadata (if any)
            if (parsedEmail.attachments && parsedEmail.attachments.length > 0) {
              const attachmentRecords = parsedEmail.attachments.map(att => ({
                email_id: emailId,
                gmail_attachment_id: att.attachmentId,
                filename: att.filename,
                mime_type: att.mimeType,
                size_bytes: att.size,
              }));

              const { error: attachError } = await supabase
                .from('email_attachments')
                .upsert(attachmentRecords, { onConflict: 'email_id,gmail_attachment_id' });

              if (attachError) {
                console.error(`Error storing attachments for email ${emailId}:`, attachError);
                // Don't fail the whole sync for attachment errors
              } else {
                console.log(`Stored ${attachmentRecords.length} attachment(s) for email: ${parsedEmail.subject}`);
              }
            }

            result.synced_count++;
          } catch (msgError: any) {
            console.error(`Error processing message ${msgRef.id}:`, msgError);
            result.errors.push(`Message ${msgRef.id}: ${msgError.message}`);
          }
        }

        // Update connection with new history ID and sync time
        await supabase
          .from('gmail_connection')
          .update({
            last_history_id: syncResult.newHistoryId,
            last_sync_at: new Date().toISOString(),
            sync_error: null,
            sync_error_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        console.log(
          `${connection.google_email}: Synced ${result.synced_count} emails ` +
          `(${result.new_emails} new, ${result.duplicate_emails} duplicates)`
        );
      } catch (connError: any) {
        console.error(`Error syncing ${connection.google_email}:`, connError);
        result.errors.push(connError.message);

        // Update connection with error
        await supabase
          .from('gmail_connection')
          .update({
            sync_error: connError.message,
            sync_error_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);
      }

      results.push(result);
    }

    const duration = Date.now() - startTime;
    const totalSynced = results.reduce((sum, r) => sum + r.synced_count, 0);
    const totalNew = results.reduce((sum, r) => sum + r.new_emails, 0);

    console.log(`Sync complete in ${duration}ms: ${totalSynced} emails (${totalNew} new)`);

    // Automatically trigger email-triage if there are new emails to process
    let triageTriggered = false;
    if (totalNew > 0) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        console.log(`Triggering email-triage for ${totalNew} new emails...`);

        // Call email-triage function (fire and forget - don't wait for completion)
        fetch(`${supabaseUrl}/functions/v1/email-triage`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
        }).catch(err => console.error('Failed to trigger email-triage:', err));

        triageTriggered = true;
      } catch (triageError) {
        console.error('Error triggering email-triage:', triageError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: duration,
        total_synced: totalSynced,
        total_new: totalNew,
        triage_triggered: triageTriggered,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in gmail-sync:', error);
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
