/**
 * Email Triage Edge Function
 *
 * Processes untagged emails to:
 * 1. Match sender/recipients against known contacts
 * 2. Use Gemini AI to identify references to CRM objects
 * 3. Create email_object_link records
 * 4. Add unmatched but relevant emails to the suggestions queue
 * 5. Create activity records for tagged emails
 *
 * Can be triggered by CRON or manually after gmail-sync
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  analyzeEmailForTags,
  checkBusinessRelevance,
  extractContactInfo,
  CRMContext,
  EmailForAnalysis,
  AICorrection,
} from '../_shared/gemini.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const BATCH_SIZE = 10; // Process 10 emails at a time to avoid timeout
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;

interface TriageResult {
  email_id: string;
  subject: string;
  tags_added: number;
  matched_by_email: boolean;
  matched_by_ai: boolean;
  added_to_queue: boolean;
  discarded: boolean;
  activity_created: boolean;
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

    console.log(`Processing ${emails.length} unprocessed emails`);

    // Load CRM context (contacts, clients, deals, properties)
    const crmContext = await loadCRMContext(supabase);

    // Load recent AI corrections for learning
    const { data: corrections } = await supabase
      .from('ai_correction_log')
      .select('correction_type, object_type, email_snippet, sender_email, reasoning_hint')
      .order('created_at', { ascending: false })
      .limit(10);

    const aiCorrections: AICorrection[] = (corrections || []).map((c) => ({
      correction_type: c.correction_type,
      object_type: c.object_type,
      email_snippet: c.email_snippet,
      sender_email: c.sender_email,
      reasoning_hint: c.reasoning_hint,
    }));

    // Get the Email activity type ID
    const { data: emailActivityType } = await supabase
      .from('activity_type')
      .select('id')
      .eq('name', 'Email')
      .single();

    const emailActivityTypeId = emailActivityType?.id;

    // Process each email
    for (const email of emails) {
      const result: TriageResult = {
        email_id: email.id,
        subject: email.subject || '(No Subject)',
        tags_added: 0,
        matched_by_email: false,
        matched_by_ai: false,
        added_to_queue: false,
        discarded: false,
        activity_created: false,
      };

      try {
        const linksToCreate: Array<{
          email_id: string;
          object_type: string;
          object_id: string;
          link_source: string;
          confidence_score?: number;
        }> = [];

        // STEP 1: Email Address Matching
        const contactMatches = await matchEmailToContacts(
          supabase,
          email.sender_email,
          email.recipient_list,
          crmContext.contacts
        );

        for (const match of contactMatches) {
          linksToCreate.push({
            email_id: email.id,
            object_type: 'contact',
            object_id: match.contact_id,
            link_source: 'email_match',
            confidence_score: 1.0,
          });

          // Also link to contact's client if exists
          if (match.client_id) {
            linksToCreate.push({
              email_id: email.id,
              object_type: 'client',
              object_id: match.client_id,
              link_source: 'email_match',
              confidence_score: 1.0,
            });
          }

          result.matched_by_email = true;
        }

        // STEP 2: AI Content Analysis
        const emailForAnalysis: EmailForAnalysis = {
          subject: email.subject || '',
          bodyText: email.body_text || '',
          senderEmail: email.sender_email,
          senderName: email.sender_name,
          snippet: email.snippet || '',
        };

        const aiResult = await analyzeEmailForTags(
          emailForAnalysis,
          crmContext,
          aiCorrections,
          GEMINI_API_KEY
        );

        // Add AI-identified tags (excluding contacts already matched by email)
        for (const tag of aiResult.tags) {
          // Skip if already added via email match
          const alreadyLinked = linksToCreate.some(
            (l) => l.object_type === tag.object_type && l.object_id === tag.object_id
          );

          if (!alreadyLinked && tag.confidence >= 0.5) {
            linksToCreate.push({
              email_id: email.id,
              object_type: tag.object_type,
              object_id: tag.object_id,
              link_source: 'ai_tag',
              confidence_score: tag.confidence,
            });
            result.matched_by_ai = true;
          }
        }

        // STEP 3: Handle Unmatched Emails
        if (linksToCreate.length === 0) {
          // No matches found - check if business relevant
          if (!aiResult.is_business_relevant) {
            // Not relevant - discard (mark as processed but don't store links)
            result.discarded = true;
            console.log(`Discarding non-relevant email: ${email.subject}`);
          } else {
            // Relevant but no contacts - add to suggestions queue
            const visibility = email.email_visibility?.[0];

            // Extract contact info from email
            const contactInfo = await extractContactInfo(emailForAnalysis, GEMINI_API_KEY);

            await supabase.from('unmatched_email_queue').insert({
              email_id: email.id,
              gmail_connection_id: visibility?.gmail_connection_id,
              sender_email: email.sender_email,
              sender_name: email.sender_name,
              subject: email.subject,
              snippet: email.snippet,
              received_at: email.received_at,
              suggested_contact_name: contactInfo.name || aiResult.suggested_contact_name,
              suggested_company: contactInfo.company || aiResult.suggested_company,
              status: 'pending',
            });

            result.added_to_queue = true;
            console.log(`Added to queue: ${email.sender_email} - ${email.subject}`);
          }
        }

        // STEP 4: Insert Links
        if (linksToCreate.length > 0) {
          for (const link of linksToCreate) {
            try {
              await supabase.from('email_object_link').upsert(link, {
                onConflict: 'email_id,object_type,object_id',
              });
              result.tags_added++;
            } catch (linkError: any) {
              console.error(`Error creating link:`, linkError);
            }
          }
        }

        // STEP 5: Create Activity Record
        if (result.tags_added > 0 && emailActivityTypeId) {
          // Find the primary object to link activity to (prefer deal > contact)
          const dealLink = linksToCreate.find((l) => l.object_type === 'deal');
          const contactLink = linksToCreate.find((l) => l.object_type === 'contact');
          const propertyLink = linksToCreate.find((l) => l.object_type === 'property');

          const activityData: any = {
            activity_type_id: emailActivityTypeId,
            subject: email.subject || 'Email',
            description: email.snippet || email.body_text?.substring(0, 500),
            activity_date: email.received_at,
            email_id: email.id,
            direction: email.direction,
            sf_status: 'Completed', // Emails are always "completed"
          };

          if (dealLink) {
            activityData.deal_id = dealLink.object_id;
          }
          if (contactLink) {
            activityData.contact_id = contactLink.object_id;
          }
          if (propertyLink) {
            activityData.property_id = propertyLink.object_id;
          }

          try {
            await supabase.from('activity').insert(activityData);
            result.activity_created = true;
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
          `email_match=${result.matched_by_email}, ai=${result.matched_by_ai}, ` +
          `queue=${result.added_to_queue}, discarded=${result.discarded}`
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

    console.log(`Triage complete in ${duration}ms: ${results.length} emails, ${totalTags} tags`);

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: duration,
        processed: results.length,
        total_tags: totalTags,
        queued: results.filter((r) => r.added_to_queue).length,
        discarded: results.filter((r) => r.discarded).length,
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

/**
 * Load CRM context for AI analysis
 */
async function loadCRMContext(supabase: any): Promise<CRMContext> {
  // Fetch contacts with emails
  const { data: contacts } = await supabase
    .from('contact')
    .select('id, email, personal_email, first_name, last_name, company, client_id')
    .not('email', 'is', null)
    .limit(500);

  // Fetch clients
  const { data: clients } = await supabase
    .from('client')
    .select('id, client_name')
    .limit(200);

  // Fetch active deals
  const { data: deals } = await supabase
    .from('deal')
    .select('id, name, property_id, client_id')
    .in('stage', ['Active', 'Pending', 'Negotiating', 'Under Contract'])
    .limit(200);

  // Fetch properties
  const { data: properties } = await supabase
    .from('property')
    .select('id, property_name, address, city, state')
    .limit(500);

  return {
    contacts: contacts || [],
    clients: clients || [],
    deals: deals || [],
    properties: properties || [],
  };
}

/**
 * Match email addresses to known contacts
 */
async function matchEmailToContacts(
  supabase: any,
  senderEmail: string,
  recipientList: any,
  contacts: CRMContext['contacts']
): Promise<Array<{ contact_id: string; client_id?: string }>> {
  const matches: Array<{ contact_id: string; client_id?: string }> = [];
  const emailsToCheck = new Set<string>();

  // Add sender
  emailsToCheck.add(senderEmail.toLowerCase());

  // Add recipients
  if (Array.isArray(recipientList)) {
    for (const recipient of recipientList) {
      if (recipient.email) {
        emailsToCheck.add(recipient.email.toLowerCase());
      }
    }
  }

  // Match against contacts
  for (const contact of contacts) {
    const contactEmail = contact.email?.toLowerCase();
    const personalEmail = contact.personal_email?.toLowerCase();

    if (
      (contactEmail && emailsToCheck.has(contactEmail)) ||
      (personalEmail && emailsToCheck.has(personalEmail))
    ) {
      matches.push({
        contact_id: contact.id,
        client_id: contact.client_id,
      });
    }
  }

  return matches;
}
