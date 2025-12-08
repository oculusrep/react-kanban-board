import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// QuickBooks OAuth token endpoint
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

// Frontend URL to redirect after OAuth completion
const FRONTEND_URL = Deno.env.get('FRONTEND_URL') || 'https://ovis.oculusrep.com'

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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!clientId || !clientSecret) {
      throw new Error('QuickBooks credentials not configured')
    }

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing')
    }

    // Create Supabase client with service role
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey)

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
    const { data: stateRecord } = await supabaseClient
      .from('qb_sync_log')
      .select('id')
      .eq('entity_type', 'oauth_state')
      .eq('qb_entity_id', state)
      .eq('status', 'pending')
      .single()

    if (!stateRecord) {
      return Response.redirect(
        `${FRONTEND_URL}/admin/quickbooks?qb_error=${encodeURIComponent('Invalid or expired authorization request')}`,
        302
      )
    }

    // Delete the used state record
    await supabaseClient
      .from('qb_sync_log')
      .delete()
      .eq('id', stateRecord.id)

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
    const { data: existingConnection } = await supabaseClient
      .from('qb_connection')
      .select('id')
      .eq('realm_id', realmId)
      .single()

    if (existingConnection) {
      // Update existing connection
      const { error: updateError } = await supabaseClient
        .from('qb_connection')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          access_token_expires_at: accessTokenExpiresAt.toISOString(),
          refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
          connected_by: stateData.userId,
          connected_at: now.toISOString(),
          status: 'connected'
        })
        .eq('id', existingConnection.id)

      if (updateError) {
        console.error('Failed to update QBO connection:', updateError)
        return Response.redirect(
          `${FRONTEND_URL}/admin/quickbooks?qb_error=${encodeURIComponent('Failed to save connection')}`,
          302
        )
      }
    } else {
      // Insert new connection
      const { error: insertError } = await supabaseClient
        .from('qb_connection')
        .insert({
          realm_id: realmId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          access_token_expires_at: accessTokenExpiresAt.toISOString(),
          refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
          connected_by: stateData.userId,
          connected_at: now.toISOString(),
          status: 'connected'
        })

      if (insertError) {
        console.error('Failed to save QBO connection:', insertError)
        return Response.redirect(
          `${FRONTEND_URL}/admin/quickbooks?qb_error=${encodeURIComponent('Failed to save connection')}`,
          302
        )
      }
    }

    // Log successful connection
    await supabaseClient
      .from('qb_sync_log')
      .insert({
        sync_type: 'customer', // Using customer as placeholder for connection events
        direction: 'inbound',
        status: 'success',
        entity_id: stateData.userId,
        entity_type: 'oauth_connect',
        qb_entity_id: realmId,
        error_message: null
      })

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
