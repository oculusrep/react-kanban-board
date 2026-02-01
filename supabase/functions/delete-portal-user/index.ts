// Delete Portal User Edge Function
//
// This function deletes the auth user associated with a portal contact.
// Called before deleting a contact that has portal access enabled.
//
// To deploy:
// npx supabase functions deploy delete-portal-user

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

interface DeleteRequest {
  contactId: string;
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { contactId }: DeleteRequest = await req.json();

    if (!contactId) {
      return new Response(
        JSON.stringify({ error: 'Missing contactId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the contact to find the auth user ID
    const { data: contact, error: contactError } = await supabase
      .from('contact')
      .select('portal_auth_user_id, portal_access_enabled, email')
      .eq('id', contactId)
      .single();

    if (contactError) {
      console.error('Error fetching contact:', contactError);
      return new Response(
        JSON.stringify({ error: 'Contact not found', details: contactError.message }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // If no auth user linked, nothing to delete
    if (!contact.portal_auth_user_id) {
      console.log('No auth user linked to contact, nothing to delete');
      return new Response(
        JSON.stringify({ success: true, message: 'No auth user to delete' }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }

    // Delete the auth user using admin API
    const { error: deleteError } = await supabase.auth.admin.deleteUser(
      contact.portal_auth_user_id
    );

    if (deleteError) {
      console.error('Error deleting auth user:', deleteError);
      // Don't fail the whole operation - the contact can still be deleted
      // The orphaned auth user won't have access to anything
      return new Response(
        JSON.stringify({
          success: true,
          warning: 'Auth user deletion failed, but contact can still be deleted',
          details: deleteError.message
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }

    // Clear portal fields on contact (optional - contact will be deleted anyway)
    await supabase
      .from('contact')
      .update({
        portal_auth_user_id: null,
        portal_access_enabled: false,
        portal_invite_status: null,
        portal_invite_token: null,
      })
      .eq('id', contactId);

    console.log(`Successfully deleted auth user for contact ${contactId}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Auth user deleted successfully' }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
