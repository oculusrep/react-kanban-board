// Supabase Edge Function: Sync Chart of Accounts from QuickBooks
// Pulls expense-related accounts and caches them in qb_account table

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

interface QBAccount {
  Id: string
  Name: string
  AccountType: string
  AccountSubType?: string
  FullyQualifiedName: string
  Active: boolean
  CurrentBalance?: number
}

interface QBQueryResponse {
  QueryResponse: {
    Account?: QBAccount[]
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

    // Query all accounts from QBO - focus on Expense and COGS types
    // We'll fetch all accounts so users can see the full chart
    console.log('Fetching Chart of Accounts from QuickBooks...')

    const accountTypes = ['Expense', 'Cost of Goods Sold', 'Other Expense']
    let allAccounts: QBAccount[] = []

    for (const accountType of accountTypes) {
      const query = `SELECT * FROM Account WHERE AccountType = '${accountType}'`

      try {
        const result = await qbApiRequest<QBQueryResponse>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(query)}`
        )

        if (result.QueryResponse.Account) {
          allAccounts = allAccounts.concat(result.QueryResponse.Account)
        }
      } catch (err: any) {
        console.error(`Error fetching ${accountType} accounts:`, err.message)
      }
    }

    console.log(`Found ${allAccounts.length} expense-related accounts`)

    // Upsert accounts into database
    const now = new Date().toISOString()
    let upsertedCount = 0
    let errorCount = 0

    for (const account of allAccounts) {
      const { error: upsertError } = await supabaseClient
        .from('qb_account')
        .upsert({
          qb_account_id: account.Id,
          name: account.Name,
          account_type: account.AccountType,
          account_sub_type: account.AccountSubType || null,
          fully_qualified_name: account.FullyQualifiedName,
          active: account.Active,
          current_balance: account.CurrentBalance || 0,
          last_synced_at: now
        }, {
          onConflict: 'qb_account_id'
        })

      if (upsertError) {
        console.error(`Error upserting account ${account.Name}:`, upsertError)
        errorCount++
      } else {
        upsertedCount++
      }
    }

    // Mark inactive any accounts no longer in QBO
    const activeQbIds = allAccounts.map(a => a.Id)
    if (activeQbIds.length > 0) {
      await supabaseClient
        .from('qb_account')
        .update({ active: false })
        .not('qb_account_id', 'in', `(${activeQbIds.join(',')})`)
    }

    // Log the sync
    await logSync(
      supabaseClient,
      'expense',
      'inbound',
      errorCount === 0 ? 'success' : 'failed',
      undefined,
      'qb_account',
      undefined,
      errorCount > 0 ? `${errorCount} accounts failed to sync` : undefined
    )

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${upsertedCount} accounts from QuickBooks`,
        accountCount: upsertedCount,
        errors: errorCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Sync accounts error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to sync accounts'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
