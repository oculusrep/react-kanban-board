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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const BATCH_SIZE = 5; // Smaller batch since agent calls are more expensive
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;

interface TriageResult {
  email_id: string;
  subject: string;
  tags_added: number;
  flagged_for_review: boolean;
  is_relevant: boolean;
  tool_calls: number;
  summary: string;
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
        tool_calls: 0,
        summary: '',
      };

      try {
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
            subject: email.subject || '',
            body_text: email.body_text || '',
            snippet: email.snippet || '',
            sender_email: email.sender_email,
            sender_name: email.sender_name,
            recipient_list: email.recipient_list || [],
            direction: email.direction || 'INBOUND',
          },
          GEMINI_API_KEY
        );

        // Record results from agent
        result.tool_calls = agentResult.tool_calls;
        result.summary = agentResult.summary;
        result.tags_added = agentResult.links_created;
        result.flagged_for_review = agentResult.flagged_for_review;
        result.is_relevant = agentResult.is_relevant;

        // Create activity record if tags were added
        if (agentResult.tags.length > 0 && emailActivityTypeId) {
          const dealTag = agentResult.tags.find((t) => t.object_type === 'deal');
          const contactTag = agentResult.tags.find((t) => t.object_type === 'contact');
          const propertyTag = agentResult.tags.find((t) => t.object_type === 'property');

          const activityData: any = {
            activity_type_id: emailActivityTypeId,
            subject: email.subject || 'Email',
            description: email.snippet || email.body_text?.substring(0, 500),
            activity_date: email.received_at,
            email_id: email.id,
            direction: email.direction,
            sf_status: 'Completed',
          };

          if (dealTag) activityData.deal_id = dealTag.object_id;
          if (contactTag) activityData.contact_id = contactTag.object_id;
          if (propertyTag) activityData.property_id = propertyTag.object_id;

          try {
            await supabase.from('activity').insert(activityData);
          } catch (actError: any) {
            console.error('Error creating activity:', actError);
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

        console.log(
          `Processed: ${email.subject} - ${result.tags_added} tags, ` +
          `${result.tool_calls} tool calls, flagged=${result.flagged_for_review}, relevant=${result.is_relevant}`
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
    const irrelevantCount = results.filter((r) => !r.is_relevant).length;

    console.log(
      `Agent triage complete in ${duration}ms: ${results.length} emails, ` +
      `${totalTags} tags, ${totalToolCalls} tool calls, ${flaggedCount} flagged, ${irrelevantCount} irrelevant`
    );

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: duration,
        processed: results.length,
        total_tags: totalTags,
        total_tool_calls: totalToolCalls,
        flagged_for_review: flaggedCount,
        not_relevant: irrelevantCount,
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
