import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// QuickBooks OAuth token endpoint
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

// Frontend URL to redirect after OAuth completion
const FRONTEND_URL = Deno.env.get('FRONTEND_URL') || 'https://ovis.oculusrep.com'

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

async function postgrestUpdate(supabaseUrl: string, secretKey: string, table: string, params: string, data: any): Promise<any> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
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
    throw new Error(`PostgREST update error: ${response.status} - ${error}`)
  }
  return response.json()
}

async function postgrestDelete(supabaseUrl: string, secretKey: string, table: string, params: string): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
    method: 'DELETE',
    headers: {
      'apikey': secretKey,
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json'
    }
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`PostgREST delete error: ${response.status} - ${error}`)
  }
}

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const realmId = url.searchParams.get('realmId') // QBO Company ID
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    // Handle OAuth errors from QuickBooks
    if (error) {
      console.error('QuickBooks OAuth error:', error, errorDescription)
      return Response.redirect(
        `${FRONTEND_URL}/admin/quickbooks?qb_error=${encodeURIComponent(errorDescription || error)}`,
        302
      )
    }

    // Validate required parameters
    if (!code || !state || !realmId) {
      console.error('Missing required OAuth parameters:', { code: !!code, state: !!state, realmId: !!realmId })
      return Response.redirect(
        `${FRONTEND_URL}/admin/quickbooks?qb_error=${encodeURIComponent('Missing required OAuth parameters')}`,
        302
      )
    }

    // Get environment variables
    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID')
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    // Use the new format secret key for database operations
    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!clientId || !clientSecret) {
      throw new Error('QuickBooks credentials not configured')
    }

    if (!supabaseUrl || !secretKey) {
      console.error('Missing config - URL:', !!supabaseUrl, 'Key:', !!secretKey)
      throw new Error('Supabase configuration missing')
    }

    console.log('Secret key present:', !!secretKey, 'starts with sb_:', secretKey?.startsWith('sb_'))

    // Decode and validate state parameter
    let stateData: { userId: string; nonce: string; timestamp: number }
    try {
      stateData = JSON.parse(atob(state))
    } catch {
      return Response.redirect(
        `${FRONTEND_URL}/admin/quickbooks?qb_error=${encodeURIComponent('Invalid state parameter')}`,
        302
      )
    }

    // Check if state is not too old (10 minute window)
    const stateAge = Date.now() - stateData.timestamp
    if (stateAge > 10 * 60 * 1000) {
      return Response.redirect(
        `${FRONTEND_URL}/admin/quickbooks?qb_error=${encodeURIComponent('Authorization request expired. Please try again.')}`,
        302
      )
    }

    // Verify state exists in our database (CSRF protection)
    const stateRecords = await postgrestQuery(
      supabaseUrl,
      secretKey,
      'qb_sync_log',
      `select=id&entity_type=eq.oauth_state&qb_entity_id=eq.${encodeURIComponent(state)}&status=eq.pending`
    )

    if (!stateRecords || stateRecords.length === 0) {
      return Response.redirect(
        `${FRONTEND_URL}/admin/quickbooks?qb_error=${encodeURIComponent('Invalid or expired authorization request')}`,
        302
      )
    }

    const stateRecord = stateRecords[0]

    // Delete the used state record
    await postgrestDelete(supabaseUrl, secretKey, 'qb_sync_log', `id=eq.${stateRecord.id}`)

    // Build the redirect URI (must match what was sent in the authorization request)
    const redirectUri = `${supabaseUrl}/functions/v1/quickbooks-callback`

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(QBO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Token exchange failed:', errorText)
      return Response.redirect(
        `${FRONTEND_URL}/admin/quickbooks?qb_error=${encodeURIComponent('Failed to complete QuickBooks authorization')}`,
        302
      )
    }

    const tokens = await tokenResponse.json()

    // Calculate token expiration times
    // access_token expires in ~1 hour (tokens.expires_in seconds)
    // refresh_token is valid for 100 days if unused
    const now = new Date()
    const accessTokenExpiresAt = new Date(now.getTime() + (tokens.expires_in * 1000))
    const refreshTokenExpiresAt = new Date(now.getTime() + (100 * 24 * 60 * 60 * 1000)) // 100 days

    // Check if there's an existing connection and update or insert
    const existingConnections = await postgrestQuery(
      supabaseUrl,
      secretKey,
      'qb_connection',
      `select=id&realm_id=eq.${realmId}`
    )

    const connectionData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: accessTokenExpiresAt.toISOString(),
      refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
      connected_by: stateData.userId,
      connected_at: now.toISOString(),
      status: 'connected'
    }

    try {
      if (existingConnections && existingConnections.length > 0) {
        // Update existing connection
        await postgrestUpdate(
          supabaseUrl,
          secretKey,
          'qb_connection',
          `id=eq.${existingConnections[0].id}`,
          connectionData
        )
      } else {
        // Insert new connection
        await postgrestInsert(supabaseUrl, secretKey, 'qb_connection', {
          realm_id: realmId,
          ...connectionData
        })
      }
    } catch (dbError: any) {
      console.error('Failed to save QBO connection:', dbError)
      return Response.redirect(
        `${FRONTEND_URL}/admin/quickbooks?qb_error=${encodeURIComponent('Failed to save connection: ' + dbError.message)}`,
        302
      )
    }

    // Log successful connection
    try {
      await postgrestInsert(supabaseUrl, secretKey, 'qb_sync_log', {
        sync_type: 'customer',
        direction: 'inbound',
        status: 'success',
        entity_id: stateData.userId,
        entity_type: 'oauth_connect',
        qb_entity_id: realmId,
        error_message: null
      })
    } catch (logError) {
      console.error('Failed to log connection:', logError)
      // Don't fail the whole operation for logging errors
    }

    // Redirect to frontend with success
    return Response.redirect(
      `${FRONTEND_URL}/admin/quickbooks?qb_connected=true`,
      302
    )

  } catch (error) {
    console.error('QuickBooks callback error:', error)
    return Response.redirect(
      `${FRONTEND_URL}/admin/quickbooks?qb_error=${encodeURIComponent('An unexpected error occurred')}`,
      302
    )
  }
})
