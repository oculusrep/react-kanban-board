import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// QuickBooks OAuth endpoints
const QBO_SANDBOX_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'
const QBO_PRODUCTION_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'

// Helper function to make PostgREST API calls with new format secret key
async function postgrestQuery(supabaseUrl: string, secretKey: string, table: string, params: string): Promise<any> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey': secretKey,
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`PostgREST error: ${response.status} - ${error}`)
  }
  return response.json()
}

async function postgrestInsert(supabaseUrl: string, secretKey: string, table: string, data: any): Promise<any> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': secretKey,
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`PostgREST insert error: ${response.status} - ${error}`)
  }
  return response.json()
}

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
    // Use the new format secret key for database operations
    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!clientId) {
      throw new Error('QUICKBOOKS_CLIENT_ID not configured')
    }

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL not configured')
    }

    if (!secretKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
    }

    console.log('Secret key present:', !!secretKey, 'starts with sb_:', secretKey?.startsWith('sb_'))

    // Verify user is authenticated and is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Extract and decode the JWT to get user ID
    const token = authHeader.replace('Bearer ', '')
    console.log('User token present:', !!token, 'starts with eyJ:', token?.startsWith('eyJ'))

    let authUserId: string | null = null
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]))
        authUserId = payload.sub
        console.log('Decoded user ID from token:', authUserId)
      }
    } catch (e) {
      console.error('Failed to decode token:', e)
    }

    if (!authUserId) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Query user from database using PostgREST API with new format key
    console.log('Looking up user with auth_user_id:', authUserId)
    const users = await postgrestQuery(
      supabaseUrl,
      secretKey,
      'user',
      `select=id,ovis_role&auth_user_id=eq.${authUserId}`
    )

    console.log('User lookup result:', JSON.stringify(users))

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    const userData = users[0]

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
    await postgrestInsert(supabaseUrl, secretKey, 'qb_sync_log', {
      sync_type: 'customer',
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
