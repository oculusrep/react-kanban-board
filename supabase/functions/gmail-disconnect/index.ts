/**
 * Gmail Disconnect Edge Function
 *
 * Disconnects a user's Gmail account by:
 * 1. Revoking the Google OAuth tokens
 * 2. Marking the connection as inactive
 * 3. Optionally deleting synced emails for that user
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { revokeToken } from '../_shared/gmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Parse request body for options
    let deleteEmails = false;
    try {
      const body = await req.json();
      deleteEmails = body.delete_emails === true;
    } catch {
      // No body or invalid JSON - use defaults
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

    // Get Gmail connection
    const { data: connection, error: connectionError } = await supabase
      .from('gmail_connection')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (connectionError || !connection) {
      return new Response(
        JSON.stringify({ error: 'No Gmail connection found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to revoke the Google token (don't fail if this errors)
    try {
      await revokeToken(connection.access_token);
      console.log(`Revoked access token for ${connection.google_email}`);
    } catch (e) {
      console.warn('Failed to revoke access token:', e);
    }

    try {
      await revokeToken(connection.refresh_token);
      console.log(`Revoked refresh token for ${connection.google_email}`);
    } catch (e) {
      console.warn('Failed to revoke refresh token:', e);
    }

    // If requested, delete user's email visibility records
    // This will cascade and clean up orphaned emails
    if (deleteEmails) {
      const { error: deleteVisibilityError } = await supabase
        .from('email_visibility')
        .delete()
        .eq('user_id', user.id);

      if (deleteVisibilityError) {
        console.error('Error deleting email visibility:', deleteVisibilityError);
      } else {
        console.log(`Deleted email visibility records for user ${user.id}`);
      }

      // Delete unmatched queue items
      const { error: deleteQueueError } = await supabase
        .from('unmatched_email_queue')
        .delete()
        .eq('gmail_connection_id', connection.id);

      if (deleteQueueError) {
        console.error('Error deleting unmatched queue:', deleteQueueError);
      }

      // Clean up orphaned emails (emails with no visibility records)
      // This is a bit expensive, so only do it if explicitly requested
      const { error: cleanupError } = await supabase.rpc('cleanup_orphaned_emails');
      if (cleanupError) {
        console.warn('Error cleaning up orphaned emails:', cleanupError);
      }
    }

    // Mark connection as inactive (keep record for audit trail)
    const { error: updateError } = await supabase
      .from('gmail_connection')
      .update({
        is_active: false,
        access_token: '[REVOKED]',
        refresh_token: '[REVOKED]',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    if (updateError) {
      console.error('Error updating connection:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update connection' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Gmail disconnected: ${connection.google_email} for user ${user.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Gmail account ${connection.google_email} disconnected`,
        emails_deleted: deleteEmails,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in gmail-disconnect:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
