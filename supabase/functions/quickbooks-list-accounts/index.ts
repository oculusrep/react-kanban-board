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

    // Helper function to fetch all results with pagination
    const fetchAllWithPagination = async <T>(
      baseQuery: string,
      entityName: string
    ): Promise<T[]> => {
      const allResults: T[] = []
      const pageSize = 1000  // QBO max is 1000
      let startPosition = 1
      let hasMore = true

      while (hasMore) {
        const paginatedQuery = `${baseQuery} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`
        const result = await qbApiRequest<{ QueryResponse: { [key: string]: T[] } }>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(paginatedQuery)}`
        )

        const items = result.QueryResponse[entityName] || []
        allResults.push(...items)

        if (items.length < pageSize) {
          hasMore = false
        } else {
          startPosition += pageSize
        }
      }

      return allResults
    }

    // Fetch expense accounts (for debit side)
    const expenseQuery = `SELECT * FROM Account WHERE Active = true AND (AccountType = 'Expense' OR AccountType = 'Cost of Goods Sold' OR AccountType = 'Other Expense') ORDER BY FullyQualifiedName`
    const expenseAccountsRaw = await fetchAllWithPagination<QBAccount>(expenseQuery, 'Account')
    const expenseAccounts = expenseAccountsRaw.map(acc => ({
      id: acc.Id,
      name: acc.Name,
      fullName: acc.FullyQualifiedName,
      type: acc.AccountType,
      subType: acc.AccountSubType
    }))

    // Fetch all asset/equity accounts (for credit side - draw accounts, etc.)
    // This includes: Bank, Other Current Asset, Fixed Asset, Other Asset, Equity
    const assetQuery = `SELECT * FROM Account WHERE Active = true AND (AccountType = 'Bank' OR AccountType = 'Other Current Asset' OR AccountType = 'Fixed Asset' OR AccountType = 'Other Asset' OR AccountType = 'Equity') ORDER BY FullyQualifiedName`
    const assetAccountsRaw = await fetchAllWithPagination<QBAccount>(assetQuery, 'Account')
    const assetAccounts = assetAccountsRaw.map(acc => ({
      id: acc.Id,
      name: acc.Name,
      fullName: acc.FullyQualifiedName,
      type: acc.AccountType,
      subType: acc.AccountSubType
    }))

    // Combine for full accounts list
    const accounts = [...expenseAccounts, ...assetAccounts]

    // Fetch all active vendors with pagination
    const vendorQuery = `SELECT * FROM Vendor WHERE Active = true ORDER BY DisplayName`
    const vendorsRaw = await fetchAllWithPagination<QBVendor>(vendorQuery, 'Vendor')
    const vendors = vendorsRaw.map(v => ({
      id: v.Id,
      displayName: v.DisplayName,
      companyName: v.CompanyName
    }))

    console.log(`Fetched ${expenseAccounts.length} expense accounts, ${assetAccounts.length} asset accounts, ${vendors.length} vendors`)

    // Log asset account types for debugging
    const assetTypes = [...new Set(assetAccounts.map(a => a.type))]
    console.log('Asset account types:', assetTypes)

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
