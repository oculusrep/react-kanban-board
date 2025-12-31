// Supabase Edge Function: Sync Expenses from QuickBooks
// Pulls Purchase transactions and Bills from QBO and stores them in qb_expense table

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

interface QBPurchaseLine {
  Id?: string  // Line item ID
  LineNum?: number
  Amount: number
  DetailType: string
  AccountBasedExpenseLineDetail?: {
    AccountRef: { value: string; name: string }
  }
  Description?: string
}

interface QBPurchase {
  Id: string
  SyncToken: string  // Required for updates
  TxnDate: string
  TotalAmt: number
  EntityRef?: { name: string; value: string }
  Line: QBPurchaseLine[]
  PrivateNote?: string
  PaymentType?: string
}

interface QBBill {
  Id: string
  SyncToken: string  // Required for updates
  TxnDate: string
  TotalAmt: number
  VendorRef?: { name: string; value: string }
  Line: QBPurchaseLine[]
  PrivateNote?: string
}

interface QBQueryResponse<T> {
  QueryResponse: {
    Purchase?: T[]
    Bill?: T[]
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

    // Parse request body for options
    let startDate = '2025-01-01'  // Default to 2025
    let fullSync = false

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body.startDate) startDate = body.startDate
        if (body.fullSync) fullSync = body.fullSync
      } catch {
        // Ignore JSON parse errors, use defaults
      }
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

    console.log(`Syncing expenses from QuickBooks since ${startDate}...`)

    let totalExpenses = 0
    let errorCount = 0
    const now = new Date().toISOString()
    const PAGE_SIZE = 1000

    // Helper function to process purchase line items
    const processPurchase = async (purchase: QBPurchase) => {
      let lineIndex = 0
      for (const line of purchase.Line) {
        if (line.DetailType === 'AccountBasedExpenseLineDetail' && line.AccountBasedExpenseLineDetail) {
          const accountRef = line.AccountBasedExpenseLineDetail.AccountRef
          // Use LineNum (1-based, unique per transaction) for stable ID, fall back to Id or index
          const lineId = line.LineNum?.toString() || line.Id || String(lineIndex)
          const transactionId = `purchase_${purchase.Id}_line${lineId}`

          const { error: upsertError } = await supabaseClient
            .from('qb_expense')
            .upsert({
              qb_transaction_id: transactionId,
              transaction_type: 'Purchase',
              transaction_date: purchase.TxnDate,
              vendor_name: purchase.EntityRef?.name || null,
              category: accountRef.name,
              account_id: accountRef.value,
              account_name: accountRef.name,
              description: line.Description || purchase.PrivateNote || null,
              amount: line.Amount,
              imported_at: now,
              sync_token: purchase.SyncToken,
              qb_entity_type: 'Purchase',
              qb_entity_id: purchase.Id,
              qb_line_id: lineId
            }, {
              onConflict: 'qb_transaction_id'
            })

          if (upsertError) {
            console.error(`Error upserting purchase expense:`, upsertError)
            errorCount++
          } else {
            totalExpenses++
          }
          lineIndex++
        }
      }
    }

    // Helper function to process bill line items
    const processBill = async (bill: QBBill) => {
      let lineIndex = 0
      for (const line of bill.Line) {
        if (line.DetailType === 'AccountBasedExpenseLineDetail' && line.AccountBasedExpenseLineDetail) {
          const accountRef = line.AccountBasedExpenseLineDetail.AccountRef
          // Use LineNum (1-based, unique per transaction) for stable ID, fall back to Id or index
          const lineId = line.LineNum?.toString() || line.Id || String(lineIndex)
          const transactionId = `bill_${bill.Id}_line${lineId}`

          const { error: upsertError } = await supabaseClient
            .from('qb_expense')
            .upsert({
              qb_transaction_id: transactionId,
              transaction_type: 'Bill',
              transaction_date: bill.TxnDate,
              vendor_name: bill.VendorRef?.name || null,
              category: accountRef.name,
              account_id: accountRef.value,
              account_name: accountRef.name,
              description: line.Description || bill.PrivateNote || null,
              amount: line.Amount,
              imported_at: now,
              sync_token: bill.SyncToken,
              qb_entity_type: 'Bill',
              qb_entity_id: bill.Id,
              qb_line_id: lineId
            }, {
              onConflict: 'qb_transaction_id'
            })

          if (upsertError) {
            console.error(`Error upserting bill expense:`, upsertError)
            errorCount++
          } else {
            totalExpenses++
          }
          lineIndex++
        }
      }
    }

    // ============================================
    // Fetch Purchase transactions with pagination
    // ============================================
    console.log('Fetching Purchase transactions...')
    let purchaseStartPosition = 1
    let totalPurchases = 0

    try {
      while (true) {
        const purchaseQuery = `SELECT * FROM Purchase WHERE TxnDate >= '${startDate}' ORDERBY TxnDate DESC STARTPOSITION ${purchaseStartPosition} MAXRESULTS ${PAGE_SIZE}`

        const purchaseResult = await qbApiRequest<QBQueryResponse<QBPurchase>>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(purchaseQuery)}`
        )

        const purchases = purchaseResult.QueryResponse.Purchase || []
        console.log(`Fetched ${purchases.length} Purchase transactions (starting at ${purchaseStartPosition})`)

        if (purchases.length === 0) break

        for (const purchase of purchases) {
          await processPurchase(purchase)
        }

        totalPurchases += purchases.length

        // If we got fewer than PAGE_SIZE, we've reached the end
        if (purchases.length < PAGE_SIZE) break

        purchaseStartPosition += PAGE_SIZE
      }
      console.log(`Total Purchase transactions fetched: ${totalPurchases}`)
    } catch (err: any) {
      console.error('Error fetching purchases:', err.message)
    }

    // ============================================
    // Fetch Bills with pagination
    // ============================================
    console.log('Fetching Bill transactions...')
    let billStartPosition = 1
    let totalBills = 0

    try {
      while (true) {
        const billQuery = `SELECT * FROM Bill WHERE TxnDate >= '${startDate}' ORDERBY TxnDate DESC STARTPOSITION ${billStartPosition} MAXRESULTS ${PAGE_SIZE}`

        const billResult = await qbApiRequest<QBQueryResponse<QBBill>>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(billQuery)}`
        )

        const bills = billResult.QueryResponse.Bill || []
        console.log(`Fetched ${bills.length} Bill transactions (starting at ${billStartPosition})`)

        if (bills.length === 0) break

        for (const bill of bills) {
          await processBill(bill)
        }

        totalBills += bills.length

        // If we got fewer than PAGE_SIZE, we've reached the end
        if (bills.length < PAGE_SIZE) break

        billStartPosition += PAGE_SIZE
      }
      console.log(`Total Bill transactions fetched: ${totalBills}`)
    } catch (err: any) {
      console.error('Error fetching bills:', err.message)
    }

    // Log the sync
    await logSync(
      supabaseClient,
      'expense',
      'inbound',
      errorCount === 0 ? 'success' : 'failed',
      undefined,
      'qb_expense',
      undefined,
      errorCount > 0 ? `${errorCount} expenses failed to sync` : undefined
    )

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${totalExpenses} expense transactions from QuickBooks`,
        expenseCount: totalExpenses,
        errors: errorCount,
        startDate: startDate
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Sync expenses error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to sync expenses'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
