/**
 * Email Correction Edge Function
 *
 * Handles user corrections to email tags:
 * 1. Remove incorrect tags
 * 2. Add missing tags
 * 3. Log corrections for AI learning
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CorrectionRequest {
  email_id: string;
  action: 'remove_tag' | 'add_tag';
  object_type: 'contact' | 'client' | 'deal' | 'property';
  object_id: string;
  reasoning_hint?: string;
}

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

    // Parse request body
    const body: CorrectionRequest = await req.json();

    if (!body.email_id || !body.action || !body.object_type || !body.object_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email_id, action, object_type, object_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
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

    // Get email details for logging
    const { data: email } = await supabase
      .from('emails')
      .select('snippet, sender_email')
      .eq('id', body.email_id)
      .single();

    if (body.action === 'remove_tag') {
      // Delete the tag link
      const { error: deleteError } = await supabase
        .from('email_object_link')
        .delete()
        .eq('email_id', body.email_id)
        .eq('object_type', body.object_type)
        .eq('object_id', body.object_id);

      if (deleteError) {
        throw new Error(`Failed to remove tag: ${deleteError.message}`);
      }

      // Log the correction for AI learning
      await supabase.from('ai_correction_log').insert({
        user_id: user.id,
        email_id: body.email_id,
        correction_type: 'removed_tag',
        object_type: body.object_type,
        incorrect_object_id: body.object_id,
        email_snippet: email?.snippet,
        sender_email: email?.sender_email,
        reasoning_hint: body.reasoning_hint,
      });

      // Also remove activity record if this was the only/primary link
      // Check if there are any remaining links
      const { count: remainingLinks } = await supabase
        .from('email_object_link')
        .select('*', { count: 'exact', head: true })
        .eq('email_id', body.email_id);

      if (remainingLinks === 0) {
        // No more links - remove the activity record
        await supabase
          .from('activity')
          .delete()
          .eq('email_id', body.email_id);
      }

      console.log(`Removed ${body.object_type} tag from email ${body.email_id}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Tag removed successfully',
          action: 'removed_tag',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (body.action === 'add_tag') {
      // Add the tag link
      const { error: insertError } = await supabase
        .from('email_object_link')
        .upsert(
          {
            email_id: body.email_id,
            object_type: body.object_type,
            object_id: body.object_id,
            link_source: 'manual',
            confidence_score: 1.0,
            created_by_user_id: user.id,
          },
          { onConflict: 'email_id,object_type,object_id' }
        );

      if (insertError) {
        throw new Error(`Failed to add tag: ${insertError.message}`);
      }

      // Log the correction for AI learning
      await supabase.from('ai_correction_log').insert({
        user_id: user.id,
        email_id: body.email_id,
        correction_type: 'added_tag',
        object_type: body.object_type,
        correct_object_id: body.object_id,
        email_snippet: email?.snippet,
        sender_email: email?.sender_email,
        reasoning_hint: body.reasoning_hint,
      });

      // Create activity record if one doesn't exist
      const { data: existingActivity } = await supabase
        .from('activity')
        .select('id')
        .eq('email_id', body.email_id)
        .single();

      if (!existingActivity) {
        // Get email details for activity
        const { data: fullEmail } = await supabase
          .from('emails')
          .select('subject, snippet, received_at, direction')
          .eq('id', body.email_id)
          .single();

        // Get Email activity type
        const { data: emailActivityType } = await supabase
          .from('activity_type')
          .select('id')
          .eq('name', 'Email')
          .single();

        if (fullEmail && emailActivityType) {
          const activityData: any = {
            activity_type_id: emailActivityType.id,
            subject: fullEmail.subject || 'Email',
            description: fullEmail.snippet,
            activity_date: fullEmail.received_at,
            email_id: body.email_id,
            direction: fullEmail.direction,
            sf_status: 'Completed',
          };

          // Link to the added object
          if (body.object_type === 'deal') {
            activityData.deal_id = body.object_id;
          } else if (body.object_type === 'contact') {
            activityData.contact_id = body.object_id;
          } else if (body.object_type === 'property') {
            activityData.property_id = body.object_id;
          }

          await supabase.from('activity').insert(activityData);
        }
      }

      console.log(`Added ${body.object_type} tag to email ${body.email_id}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Tag added successfully',
          action: 'added_tag',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "remove_tag" or "add_tag"' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in email-correction:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
