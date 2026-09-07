/**
 * Email Triage Edge Function - Autonomous Agent Version
 *
 * Uses Gemini as an autonomous agent with tool access to:
 * 1. Search the OVIS CRM database
 * 2. Decide which objects each email relates to
 * 3. Tag emails appropriately
 *
 * The AI makes all semantic decisions - this code just orchestrates.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { runEmailTriageAgent } from '../_shared/gemini-agent.ts';
import {
  applyLabelToMessage,
  refreshAccessToken,
  isTokenExpired,
  GmailConnection,
} from '../_shared/gmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const BATCH_SIZE = 5; // Smaller batch since agent calls are more expensive
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

// Gmail label applied to successfully processed emails
const OVIS_LINKED_LABEL = 'OVIS-Linked';

interface TriageResult {
  email_id: string;
  subject: string;
  tags_added: number;
  flagged_for_review: boolean;
  is_relevant: boolean;
  action: 'keep' | 'delete';
  rule_override: boolean;
  tool_calls: number;
  summary: string;
  gmail_label_applied: boolean;
  /** Gemini loop was skipped by a short-circuit. Measures the cost effect. */
  model_skipped: boolean;
  gmail_label_error?: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: TriageResult[] = [];

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch unprocessed emails
    const { data: emails, error: fetchError } = await supabase
      .from('emails')
      .select(`
        id,
        message_id,
        gmail_id,
        thread_id,
        subject,
        body_text,
        snippet,
        sender_email,
        sender_name,
        recipient_list,
        direction,
        received_at,
        email_visibility (
          user_id,
          gmail_connection_id
        )
      `)
      .eq('ai_processed', false)
      .order('received_at', { ascending: false })
      .limit(BATCH_SIZE);

    if (fetchError) {
      throw new Error(`Failed to fetch emails: ${fetchError.message}`);
    }

    if (!emails || emails.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No unprocessed emails', results: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${emails.length} unprocessed emails with AI agent`);

    // Get the Email activity type ID for creating activities
    const { data: emailActivityType } = await supabase
      .from('activity_type')
      .select('id')
      .eq('name', 'Email')
      .single();

    const emailActivityTypeId = emailActivityType?.id;

    // Process each email with the AI agent
    for (const email of emails) {
      const result: TriageResult = {
        email_id: email.id,
        subject: email.subject || '(No Subject)',
        tags_added: 0,
        flagged_for_review: false,
        is_relevant: true,
        action: 'keep',
        rule_override: false,
        tool_calls: 0,
        summary: '',
        gmail_label_applied: false,
        model_skipped: false,
      };

      try {
        // Extract gmail_connection_id from email_visibility for RLS
        const gmailConnectionId = email.email_visibility?.[0]?.gmail_connection_id;

        // Run the autonomous AI agent
        // The agent will:
        // 1. Search for relevant CRM objects
        // 2. Link the email to objects it finds
        // 3. Flag for review if uncertain
        // 4. Mark as not relevant if spam/marketing
        const agentResult = await runEmailTriageAgent(
          supabase,
          {
            id: email.id,
            thread_id: email.thread_id || null,
            subject: email.subject || '',
            body_text: email.body_text || '',
            snippet: email.snippet || '',
            sender_email: email.sender_email,
            sender_name: email.sender_name,
            recipient_list: email.recipient_list || [],
            direction: email.direction || 'INBOUND',
            gmail_connection_id: gmailConnectionId,
          },
          GEMINI_API_KEY
        );

        // Record results from agent
        result.tool_calls = agentResult.tool_calls;
        result.summary = agentResult.summary;
        result.tags_added = agentResult.links_created;
        result.flagged_for_review = agentResult.flagged_for_review;
        result.is_relevant = agentResult.is_relevant;
        result.action = agentResult.action;
        result.rule_override = agentResult.rule_override;
        result.model_skipped = agentResult.model_skipped;

        // DEMOTE (was HARD DELETE until 2026-09-06).
        //
        // The agent judging an email non-business used to DELETE the row --
        // roughly 84/day, 2,534 in the trailing 30 days. That is irreversible
        // and unmeasurable: a deleted row cannot be corrected when the agent is
        // wrong, and cannot be counted when sizing tier-1 rules. It is also why
        // those 2,534 deletions cannot be analysed retrospectively.
        //
        // Now the row is KEPT and marked is_relevant = false. Queue and UI
        // filter on that column. This ships enforced immediately, NOT behind
        // tier-1's log-only week: it is strictly safer than deleting, and every
        // week it waits destroys another ~2,500 rows of evidence.
        if (agentResult.action === 'delete') {
          console.log(`[DEMOTE] Marking non-business (row kept): ${email.subject}`);

          // Stub so Gmail sync does not re-ingest it. action='demoted' now --
          // 'deleted' is legacy and no longer written.
          if (email.message_id) {
            try {
              await supabase.from('processed_message_ids').upsert(
                {
                  message_id: email.message_id,
                  gmail_connection_id: gmailConnectionId,
                  action: 'demoted',
                  sender_email: email.sender_email,
                  tier1_reason: agentResult.rule_override
                    ? 'agent:rule-override'
                    : 'agent:not-business',
                  processed_at: new Date().toISOString(),
                },
                { onConflict: 'message_id' }
              );
            } catch (hashErr) {
              console.log('[DEMOTE] Could not store message_id stub:', hashErr);
            }
          }

          const { error: demoteError } = await supabase
            .from('emails')
            .update({
              is_relevant: false,
              demoted_at: new Date().toISOString(),
              demoted_reason: agentResult.summary || 'Agent judged non-business',
              ai_processed: true,
              ai_processed_at: new Date().toISOString(),
            })
            .eq('id', email.id);

          if (demoteError) {
            console.error('[DEMOTE] Failed to demote email:', demoteError.message);
          } else {
            console.log(`[DEMOTE] Email demoted, row retained: ${email.subject}`);
          }
        } else {
          // KEEP: Create activity records if tags were added
          // Create one activity per deal (so email shows in each deal's timeline)
          if (agentResult.tags.length > 0 && emailActivityTypeId) {
            const dealTags = agentResult.tags.filter((t) => t.object_type === 'deal');
            const contactTag = agentResult.tags.find((t) => t.object_type === 'contact');
            const propertyTag = agentResult.tags.find((t) => t.object_type === 'property');

            // If we have deal tags, create an activity for EACH deal
            if (dealTags.length > 0) {
              for (const dealTag of dealTags) {
                const activityData: any = {
                  activity_type_id: emailActivityTypeId,
                  subject: email.subject || 'Email',
                  description: email.snippet || email.body_text?.substring(0, 500),
                  activity_date: email.received_at,
                  email_id: email.id,
                  direction: email.direction,
                  sf_status: 'Completed',
                  deal_id: dealTag.object_id,
                };

                if (contactTag) activityData.contact_id = contactTag.object_id;
                if (propertyTag) activityData.property_id = propertyTag.object_id;

                try {
                  await supabase.from('activity').insert(activityData);
                  console.log(`[Activity] Created email activity for deal: ${dealTag.object_id}`);
                } catch (actError: any) {
                  // Ignore duplicate key errors (activity might already exist)
                  if (actError.code !== '23505') {
                    console.error('Error creating activity:', actError);
                  }
                }
              }
            } else {
              // No deals - create a single activity linked to contact/property only
              const activityData: any = {
                activity_type_id: emailActivityTypeId,
                subject: email.subject || 'Email',
                description: email.snippet || email.body_text?.substring(0, 500),
                activity_date: email.received_at,
                email_id: email.id,
                direction: email.direction,
                sf_status: 'Completed',
              };

              if (contactTag) activityData.contact_id = contactTag.object_id;
              if (propertyTag) activityData.property_id = propertyTag.object_id;

              try {
                await supabase.from('activity').insert(activityData);
              } catch (actError: any) {
                if (actError.code !== '23505') {
                  console.error('Error creating activity:', actError);
                }
              }
            }
          }

          // Mark email as processed
          await supabase
            .from('emails')
            .update({
              ai_processed: true,
              ai_processed_at: new Date().toISOString(),
            })
            .eq('id', email.id);

          // Apply Gmail label if email was successfully linked (has tags)
          // This provides visual feedback in Gmail that OVIS has processed the email
          if (agentResult.links_created > 0 && email.gmail_id && gmailConnectionId) {
            try {
              // Get the Gmail connection to get access token
              const { data: connection } = await supabase
                .from('gmail_connection')
                .select('*')
                .eq('id', gmailConnectionId)
                .single();

              if (connection) {
                // Refresh token if needed
                let accessToken = connection.access_token;
                if (isTokenExpired(connection.token_expires_at)) {
                  console.log(`[Gmail Label] Refreshing token for label application`);
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

                // Apply the OVIS-Linked label
                const labelResult = await applyLabelToMessage(
                  accessToken,
                  email.gmail_id,
                  OVIS_LINKED_LABEL
                );

                result.gmail_label_applied = labelResult.success;
                if (!labelResult.success) {
                  result.gmail_label_error = labelResult.error;
                  console.log(`[Gmail Label] Could not apply label: ${labelResult.error}`);

                  // ============================================================
                  // 404 INSTRUMENTATION -- dependency (f), added 2026-09-06.
                  //
                  // ~25% of label applies fail with 404 notFound. Two possible
                  // causes and they need opposite fixes:
                  //
                  //   WRONG MAILBOX  gmail_id is per-mailbox, but emails stores
                  //                  exactly one, from whichever account synced
                  //                  first, while email_visibility fans out to
                  //                  both. Retryable against the right mailbox.
                  //                  Fix = gmail_id per visibility row.
                  //   GONE           the message was deleted from Gmail between
                  //                  sync and triage. Permanent; stop retrying.
                  //
                  // Only distinguishable AT THE MOMENT OF FAILURE -- probing the
                  // other mailbox days later cannot tell them apart, because a
                  // message deleted in the meantime looks identical. So probe
                  // now, log the verdict, and design the retry queue on 09-13
                  // against measured causes instead of my inference.
                  //
                  // Read-only probe (messages.get), one extra call, only on the
                  // failure path.
                  // ============================================================
                  if ((labelResult.error || '').includes('404')) {
                    let verdict = 'unknown';
                    try {
                      const { data: others } = await supabase
                        .from('gmail_connection')
                        .select('id, google_email, access_token')
                        .neq('id', gmailConnectionId)
                        .eq('is_active', true);

                      if (!others || others.length === 0) {
                        verdict = 'gone:no-other-mailbox';
                      } else {
                        verdict = 'gone:not-in-any-mailbox';
                        for (const other of others) {
                          const probe = await fetch(
                            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${email.gmail_id}?format=minimal`,
                            { headers: { Authorization: `Bearer ${other.access_token}` } }
                          );
                          if (probe.ok) {
                            verdict = `wrong-mailbox:resolves-in:${other.google_email}`;
                            break;
                          }
                          if (probe.status !== 404) {
                            verdict = `probe-inconclusive:${probe.status}`;
                          }
                        }
                      }
                    } catch (probeErr: any) {
                      verdict = `probe-failed:${probeErr.message}`;
                    }
                    console.log(
                      `[Gmail 404] gmail_id=${email.gmail_id} ` +
                      `attempted_mailbox=${connection.google_email} ` +
                      `visibility_rows=${email.email_visibility?.length ?? 0} ` +
                      `verdict=${verdict} subject="${email.subject}"`
                    );
                  }
                } else {
                  console.log(`[Gmail Label] Applied "${OVIS_LINKED_LABEL}" to: ${email.subject}`);
                }
              }
            } catch (labelError: any) {
              // Don't fail the whole triage for label errors
              console.error(`[Gmail Label] Error applying label:`, labelError);
              result.gmail_label_error = labelError.message;
            }
          }
        }

        console.log(
          `Processed: ${email.subject} - ${result.tags_added} tags, ` +
          `${result.tool_calls} tool calls, flagged=${result.flagged_for_review}, ` +
          `relevant=${result.is_relevant}, action=${result.action}, rule_override=${result.rule_override}`
        );
      } catch (emailError: any) {
        console.error(`Error processing email ${email.id}:`, emailError);
        result.error = emailError.message;

        // Still mark as processed to avoid infinite retries
        await supabase
          .from('emails')
          .update({
            ai_processed: true,
            ai_processed_at: new Date().toISOString(),
          })
          .eq('id', email.id);
      }

      results.push(result);
    }

    const duration = Date.now() - startTime;
    const totalTags = results.reduce((sum, r) => sum + r.tags_added, 0);
    const totalToolCalls = results.reduce((sum, r) => sum + r.tool_calls, 0);
    const flaggedCount = results.filter((r) => r.flagged_for_review).length;
    const deletedCount = results.filter((r) => r.action === 'delete').length;
    const ruleOverrideCount = results.filter((r) => r.rule_override).length;
    const labelsApplied = results.filter((r) => r.gmail_label_applied).length;
    const modelSkipped = results.filter((r) => r.model_skipped).length;

    console.log(
      `Agent triage complete in ${duration}ms: ${results.length} emails, ` +
      `${totalTags} tags, ${totalToolCalls} tool calls, ${flaggedCount} flagged, ` +
      `${deletedCount} demoted, ${ruleOverrideCount} rule overrides, ${labelsApplied} labeled, ` +
      `${modelSkipped} model-skipped`
    );

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: duration,
        processed: results.length,
        total_tags: totalTags,
        total_tool_calls: totalToolCalls,
        flagged_for_review: flaggedCount,
        deleted: deletedCount,
        rule_overrides: ruleOverrideCount,
        gmail_labels_applied: labelsApplied,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in email-triage:', error);
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
