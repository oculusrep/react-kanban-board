/**
 * Backfill Gmail Labels - One-time utility function
 *
 * Applies the OVIS-Linked label to all emails that have been
 * successfully tagged to CRM objects (deals, contacts, properties)
 * but don't yet have the Gmail label applied.
 *
 * Run manually via: POST /functions/v1/backfill-gmail-labels
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  applyLabelToMessage,
  refreshAccessToken,
  isTokenExpired,
} from '../_shared/gmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OVIS_LINKED_LABEL = 'OVIS-Linked';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

interface BackfillResult {
  email_id: string;
  gmail_id: string;
  subject: string;
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

    // Find all email IDs that have been linked to CRM objects
    const { data: taggedEmailIds, error: tagsError } = await supabase
      .from('email_object_link')
      .select('email_id')
      .not('email_id', 'is', null);

    if (tagsError) {
      throw new Error(`Failed to query email_object_link: ${tagsError.message}`);
    }

    // Get unique email IDs
    const uniqueEmailIds = [...new Set((taggedEmailIds || []).map(t => t.email_id))];

    if (uniqueEmailIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No tagged emails found',
          results: [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${uniqueEmailIds.length} emails with CRM tags`);

    // Fetch full email details for tagged emails
    const { data: taggedEmails, error: queryError } = await supabase
      .from('emails')
      .select(`
        id,
        gmail_id,
        subject,
        ai_processed,
        email_visibility (
          gmail_connection_id
        )
      `)
      .in('id', uniqueEmailIds)
      .not('gmail_id', 'is', null);

    if (queryError) {
      throw new Error(`Failed to query emails: ${queryError.message}`);
    }

    const emailsWithTags = taggedEmails || [];

    console.log(`Found ${emailsWithTags.length} processed emails with CRM tags`);

    if (emailsWithTags.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No emails need labeling',
          results: [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group emails by gmail_connection_id for efficiency
    const emailsByConnection = new Map<string, any[]>();
    for (const email of emailsWithTags) {
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
    for (const [connectionId, emails] of emailsByConnection) {
      console.log(`Processing ${emails.length} emails for connection ${connectionId}`);

      // Get the Gmail connection
      const { data: connection, error: connError } = await supabase
        .from('gmail_connection')
        .select('*')
        .eq('id', connectionId)
        .single();

      if (connError || !connection) {
        console.error(`Failed to get connection ${connectionId}:`, connError);
        for (const email of emails) {
          results.push({
            email_id: email.id,
            gmail_id: email.gmail_id,
            subject: email.subject || '(No Subject)',
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
          for (const email of emails) {
            results.push({
              email_id: email.id,
              gmail_id: email.gmail_id,
              subject: email.subject || '(No Subject)',
              success: false,
              error: `Token refresh failed: ${tokenError.message}`,
            });
          }
          continue;
        }
      }

      // Apply label to each email
      for (const email of emails) {
        const result: BackfillResult = {
          email_id: email.id,
          gmail_id: email.gmail_id,
          subject: email.subject || '(No Subject)',
          success: false,
        };

        try {
          const labelResult = await applyLabelToMessage(
            accessToken,
            email.gmail_id,
            OVIS_LINKED_LABEL
          );

          result.success = labelResult.success;
          if (!labelResult.success) {
            result.error = labelResult.error;
          }

          if (labelResult.success) {
            console.log(`✓ Labeled: ${email.subject}`);
          } else {
            console.log(`✗ Failed: ${email.subject} - ${labelResult.error}`);
          }
        } catch (err: any) {
          result.error = err.message;
          console.error(`✗ Error labeling ${email.subject}:`, err);
        }

        results.push(result);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`Backfill complete in ${duration}ms: ${successCount} labeled, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: duration,
        total_processed: results.length,
        labels_applied: successCount,
        failures: failCount,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in backfill-gmail-labels:', error);
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
