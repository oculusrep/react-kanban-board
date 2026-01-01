// Supabase Edge Function: Sync Items from QuickBooks
// Pulls Item definitions to map invoice line items to income accounts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  qbApiRequest,
  logSync
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface QBItem {
  Id: string
  Name: string
  FullyQualifiedName: string
  Type: string  // 'Service', 'Inventory', 'NonInventory', etc.
  Active: boolean
  IncomeAccountRef?: { value: string; name: string }
  ExpenseAccountRef?: { value: string; name: string }
  Description?: string
}

interface QBQueryResponse {
  QueryResponse: {
    Item?: QBItem[]
    startPosition?: number
    maxResults?: number
    totalCount?: number
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify user is authenticated and is admin
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Check admin role
    const { data: userData, error: roleError } = await supabaseClient
      .from('user')
      .select('ovis_role')
      .eq('auth_user_id', user.id)
      .single()

    if (roleError || userData?.ovis_role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Get QB connection
    let connection = await getQBConnection(supabaseClient)
    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks not connected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Refresh token if needed
    connection = await refreshTokenIfNeeded(supabaseClient, connection)

    console.log('Fetching Items from QuickBooks...')

    const PAGE_SIZE = 1000
    let allItems: QBItem[] = []
    let startPosition = 1

    // Fetch all items with pagination
    try {
      while (true) {
        const query = `SELECT * FROM Item STARTPOSITION ${startPosition} MAXRESULTS ${PAGE_SIZE}`

        const result = await qbApiRequest<QBQueryResponse>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(query)}`
        )

        const items = result.QueryResponse.Item || []
        console.log(`Fetched ${items.length} items (starting at ${startPosition})`)

        if (items.length === 0) break

        allItems = allItems.concat(items)

        if (items.length < PAGE_SIZE) break

        startPosition += PAGE_SIZE
      }
    } catch (err: any) {
      console.error('Error fetching items:', err.message)
    }

    console.log(`Total items fetched: ${allItems.length}`)

    // Upsert items into database
    const now = new Date().toISOString()
    let upsertedCount = 0
    let errorCount = 0

    for (const item of allItems) {
      const { error: upsertError } = await supabaseClient
        .from('qb_item')
        .upsert({
          qb_item_id: item.Id,
          name: item.Name,
          fully_qualified_name: item.FullyQualifiedName,
          item_type: item.Type,
          active: item.Active,
          income_account_id: item.IncomeAccountRef?.value || null,
          income_account_name: item.IncomeAccountRef?.name || null,
          expense_account_id: item.ExpenseAccountRef?.value || null,
          expense_account_name: item.ExpenseAccountRef?.name || null,
          description: item.Description || null,
          last_synced_at: now
        }, {
          onConflict: 'qb_item_id'
        })

      if (upsertError) {
        console.error(`Error upserting item ${item.Name}:`, upsertError)
        errorCount++
      } else {
        upsertedCount++
      }
    }

    // Log the sync
    await logSync(
      supabaseClient,
      'customer',  // Using 'customer' as closest type
      'inbound',
      errorCount === 0 ? 'success' : 'failed',
      undefined,
      'qb_item',
      undefined,
      errorCount > 0 ? `${errorCount} items failed to sync` : undefined
    )

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${upsertedCount} items from QuickBooks`,
        itemCount: upsertedCount,
        errors: errorCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Sync items error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to sync items'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
