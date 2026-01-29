import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  qbApiRequest
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface QBAccount {
  Id: string
  Name: string
  FullyQualifiedName: string
  AccountType: string
  AccountSubType?: string
  Active: boolean
}

interface QBVendor {
  Id: string
  DisplayName: string
  CompanyName?: string
  Active: boolean
}

/**
 * Lists accounts and vendors from QuickBooks for use in commission mapping configuration.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Get the QBO connection
    let connection = await getQBConnection(supabaseClient)
    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks is not connected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    connection = await refreshTokenIfNeeded(supabaseClient, connection)

    // Fetch all active accounts
    const accountQuery = `SELECT * FROM Account WHERE Active = true ORDER BY FullyQualifiedName`
    const accountResult = await qbApiRequest<{ QueryResponse: { Account?: QBAccount[] } }>(
      connection,
      'GET',
      `query?query=${encodeURIComponent(accountQuery)}`
    )

    const accounts = (accountResult.QueryResponse.Account || []).map(acc => ({
      id: acc.Id,
      name: acc.Name,
      fullName: acc.FullyQualifiedName,
      type: acc.AccountType,
      subType: acc.AccountSubType
    }))

    // Fetch all active vendors
    const vendorQuery = `SELECT * FROM Vendor WHERE Active = true ORDER BY DisplayName`
    const vendorResult = await qbApiRequest<{ QueryResponse: { Vendor?: QBVendor[] } }>(
      connection,
      'GET',
      `query?query=${encodeURIComponent(vendorQuery)}`
    )

    const vendors = (vendorResult.QueryResponse.Vendor || []).map(v => ({
      id: v.Id,
      displayName: v.DisplayName,
      companyName: v.CompanyName
    }))

    // Group accounts by type for easier selection
    const expenseAccounts = accounts.filter(a =>
      a.type === 'Expense' || a.type === 'Cost of Goods Sold' || a.type === 'Other Expense'
    )
    const assetAccounts = accounts.filter(a =>
      a.type === 'Other Current Asset' || a.type === 'Other Asset' || a.type === 'Fixed Asset'
    )

    return new Response(
      JSON.stringify({
        accounts,
        expenseAccounts,
        assetAccounts,
        vendors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('List accounts error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to fetch accounts' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
