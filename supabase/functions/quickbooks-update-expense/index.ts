// Supabase Edge Function: Update Expense Category in QuickBooks
// Allows recategorizing an expense and syncing the change back to QBO

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

interface QBPurchase {
  Id: string
  SyncToken: string
  TxnDate: string
  PaymentType: string
  AccountRef: { value: string; name: string }
  EntityRef?: { value: string; name: string }
  TotalAmt: number
  Line: Array<{
    Id?: string
    LineNum?: number
    Amount: number
    DetailType: string
    AccountBasedExpenseLineDetail?: {
      AccountRef: { value: string; name: string }
      BillableStatus?: string
      TaxCodeRef?: { value: string }
    }
    Description?: string
  }>
  PrivateNote?: string
  sparse?: boolean
}

interface QBBill {
  Id: string
  SyncToken: string
  TxnDate: string
  VendorRef: { value: string; name: string }
  TotalAmt: number
  Line: Array<{
    Id?: string
    LineNum?: number
    Amount: number
    DetailType: string
    AccountBasedExpenseLineDetail?: {
      AccountRef: { value: string; name: string }
      BillableStatus?: string
      TaxCodeRef?: { value: string }
    }
    Description?: string
  }>
  PrivateNote?: string
  APAccountRef?: { value: string; name: string }
  DueDate?: string
  sparse?: boolean
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

    // Parse request body
    const { expenseId, newAccountId, newAccountName } = await req.json()

    if (!expenseId || !newAccountId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: expenseId, newAccountId' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
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

    // Get the expense record from our database
    const { data: expense, error: expenseError } = await supabaseClient
      .from('qb_expense')
      .select('*')
      .eq('id', expenseId)
      .single()

    if (expenseError || !expense) {
      return new Response(
        JSON.stringify({ error: 'Expense not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Check if expense has the required fields for updating
    if (!expense.qb_entity_type || !expense.qb_entity_id) {
      return new Response(
        JSON.stringify({
          error: 'This expense cannot be recategorized. Please sync expenses first to get the required metadata.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
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

    console.log(`Updating expense ${expense.qb_entity_type} ${expense.qb_entity_id} to account ${newAccountId}`)

    // Fetch the current entity from QuickBooks to get latest SyncToken
    const entityType = expense.qb_entity_type.toLowerCase()
    const entityId = expense.qb_entity_id
    const lineId = expense.qb_line_id

    let updatedSyncToken: string

    if (expense.qb_entity_type === 'Purchase') {
      // Fetch current Purchase from QBO
      const fetchResult = await qbApiRequest<{ Purchase: QBPurchase }>(
        connection,
        'GET',
        `purchase/${entityId}`
      )

      const purchase = fetchResult.Purchase
      console.log(`Fetched Purchase with SyncToken ${purchase.SyncToken}`)

      // Find and update the line item
      let lineUpdated = false
      for (const line of purchase.Line) {
        // Match by line ID or index
        const currentLineId = line.Id || String(line.LineNum)
        if (currentLineId === lineId && line.DetailType === 'AccountBasedExpenseLineDetail') {
          if (line.AccountBasedExpenseLineDetail) {
            line.AccountBasedExpenseLineDetail.AccountRef = {
              value: newAccountId,
              name: newAccountName || newAccountId
            }
            lineUpdated = true
            console.log(`Updated line ${lineId} to account ${newAccountId}`)
          }
        }
      }

      if (!lineUpdated) {
        // If no exact match, try to match by amount and old account
        for (const line of purchase.Line) {
          if (line.DetailType === 'AccountBasedExpenseLineDetail' &&
              line.AccountBasedExpenseLineDetail?.AccountRef.value === expense.account_id &&
              Math.abs(line.Amount - expense.amount) < 0.01) {
            line.AccountBasedExpenseLineDetail.AccountRef = {
              value: newAccountId,
              name: newAccountName || newAccountId
            }
            lineUpdated = true
            console.log(`Updated line by amount match to account ${newAccountId}`)
            break
          }
        }
      }

      if (!lineUpdated) {
        return new Response(
          JSON.stringify({ error: 'Could not find the line item to update in QuickBooks' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Update Purchase in QBO (send full entity)
      const updateResult = await qbApiRequest<{ Purchase: QBPurchase }>(
        connection,
        'POST',
        'purchase',
        purchase
      )

      updatedSyncToken = updateResult.Purchase.SyncToken
      console.log(`Purchase updated successfully, new SyncToken: ${updatedSyncToken}`)

    } else if (expense.qb_entity_type === 'Bill') {
      // Fetch current Bill from QBO
      const fetchResult = await qbApiRequest<{ Bill: QBBill }>(
        connection,
        'GET',
        `bill/${entityId}`
      )

      const bill = fetchResult.Bill
      console.log(`Fetched Bill with SyncToken ${bill.SyncToken}`)

      // Find and update the line item
      let lineUpdated = false
      for (const line of bill.Line) {
        // Match by line ID or index
        const currentLineId = line.Id || String(line.LineNum)
        if (currentLineId === lineId && line.DetailType === 'AccountBasedExpenseLineDetail') {
          if (line.AccountBasedExpenseLineDetail) {
            line.AccountBasedExpenseLineDetail.AccountRef = {
              value: newAccountId,
              name: newAccountName || newAccountId
            }
            lineUpdated = true
            console.log(`Updated line ${lineId} to account ${newAccountId}`)
          }
        }
      }

      if (!lineUpdated) {
        // If no exact match, try to match by amount and old account
        for (const line of bill.Line) {
          if (line.DetailType === 'AccountBasedExpenseLineDetail' &&
              line.AccountBasedExpenseLineDetail?.AccountRef.value === expense.account_id &&
              Math.abs(line.Amount - expense.amount) < 0.01) {
            line.AccountBasedExpenseLineDetail.AccountRef = {
              value: newAccountId,
              name: newAccountName || newAccountId
            }
            lineUpdated = true
            console.log(`Updated line by amount match to account ${newAccountId}`)
            break
          }
        }
      }

      if (!lineUpdated) {
        return new Response(
          JSON.stringify({ error: 'Could not find the line item to update in QuickBooks' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Update Bill in QBO (send full entity)
      const updateResult = await qbApiRequest<{ Bill: QBBill }>(
        connection,
        'POST',
        'bill',
        bill
      )

      updatedSyncToken = updateResult.Bill.SyncToken
      console.log(`Bill updated successfully, new SyncToken: ${updatedSyncToken}`)

    } else {
      return new Response(
        JSON.stringify({ error: `Unsupported entity type: ${expense.qb_entity_type}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Update our local expense record
    const { error: updateError } = await supabaseClient
      .from('qb_expense')
      .update({
        account_id: newAccountId,
        account_name: newAccountName || newAccountId,
        category: newAccountName || newAccountId,
        sync_token: updatedSyncToken,
        updated_at: new Date().toISOString()
      })
      .eq('id', expenseId)

    if (updateError) {
      console.error('Failed to update local expense record:', updateError)
      // Don't fail the request - QBO was already updated
    }

    // Log the sync
    await logSync(
      supabaseClient,
      'expense',
      'outbound',
      'success',
      expenseId,
      'qb_expense',
      expense.qb_entity_id,
      undefined
    )

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Expense category updated successfully',
        newAccountId,
        newAccountName: newAccountName || newAccountId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Update expense error:', error)

    // Check for stale object error (concurrent modification)
    if (error.message?.includes('Stale Object')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'This transaction was modified in QuickBooks. Please sync expenses and try again.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      )
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to update expense'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
