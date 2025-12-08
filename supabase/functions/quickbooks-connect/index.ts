import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getUserIdFromAuthHeader } from '../_shared/jwt.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// QuickBooks OAuth endpoints
const QBO_SANDBOX_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'
const QBO_PRODUCTION_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID')
    const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox'
    const supabaseUrl = Deno.env.get('SUPABASE_URL')

    if (!clientId) {
      throw new Error('QUICKBOOKS_CLIENT_ID not configured')
    }

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL not configured')
    }

    // Verify user is authenticated and is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const authUserId = await getUserIdFromAuthHeader(authHeader)
    if (!authUserId) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Check if user is admin
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: userData, error: userError } = await supabaseClient
      .from('user')
      .select('id, ovis_role')
      .eq('auth_user_id', authUserId)
      .single()

    if (userError || !userData) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    if (userData.ovis_role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required to connect QuickBooks' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Build the redirect URI (the callback function URL)
    const redirectUri = `${supabaseUrl}/functions/v1/quickbooks-callback`

    // Generate a random state parameter for CSRF protection
    // Include the user ID so we know who initiated the connection
    const stateData = {
      userId: userData.id,
      nonce: crypto.randomUUID(),
      timestamp: Date.now()
    }
    const state = btoa(JSON.stringify(stateData))

    // Store state temporarily for validation (expires in 10 minutes)
    await supabaseClient
      .from('qb_sync_log')
      .insert({
        sync_type: 'customer', // Using customer as placeholder for auth flow
        direction: 'outbound',
        status: 'pending',
        entity_type: 'oauth_state',
        qb_entity_id: state,
        error_message: null
      })

    // QuickBooks OAuth scopes needed for our integration
    // - com.intuit.quickbooks.accounting: Full access to accounting data (invoices, payments, expenses, etc.)
    const scopes = [
      'com.intuit.quickbooks.accounting'
    ].join(' ')

    // Build the authorization URL
    const authUrl = environment === 'production' ? QBO_PRODUCTION_AUTH_URL : QBO_SANDBOX_AUTH_URL
    const authorizationUrl = new URL(authUrl)
    authorizationUrl.searchParams.set('client_id', clientId)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('scope', scopes)
    authorizationUrl.searchParams.set('redirect_uri', redirectUri)
    authorizationUrl.searchParams.set('state', state)

    return new Response(
      JSON.stringify({
        success: true,
        authorizationUrl: authorizationUrl.toString(),
        message: 'Redirect user to this URL to authorize QuickBooks connection'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error initiating QuickBooks OAuth:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
