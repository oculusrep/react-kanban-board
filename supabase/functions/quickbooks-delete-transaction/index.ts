import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  getBill,
  deleteBill,
  getJournalEntry,
  deleteJournalEntry,
  qbApiRequest,
  logSync
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeleteTransactionRequest {
  entityType: 'JournalEntry' | 'Bill' | 'Check' | 'Purchase'
  entityId: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')

    // Use service role client for database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Verify the token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token', details: userError?.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Get request body
    const { entityType, entityId } = await req.json() as DeleteTransactionRequest

    if (!entityType || !entityId) {
      return new Response(
        JSON.stringify({ error: 'entityType and entityId are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log(`Deleting QBO ${entityType} with ID: ${entityId}`)

    // Get the QBO connection
    let connection = await getQBConnection(supabaseClient)
    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks is not connected. Please connect in Settings.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Refresh token if needed
    connection = await refreshTokenIfNeeded(supabaseClient, connection)

    // Delete based on entity type
    let deletedDocNumber: string | undefined

    try {
      if (entityType === 'JournalEntry') {
        const journalEntry = await getJournalEntry(connection, entityId)
        if (!journalEntry) {
          return new Response(
            JSON.stringify({ error: `Journal Entry ${entityId} not found in QuickBooks` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          )
        }
        deletedDocNumber = journalEntry.DocNumber
        await deleteJournalEntry(connection, journalEntry.Id, journalEntry.SyncToken)
        console.log(`Deleted Journal Entry ${entityId}`)

      } else if (entityType === 'Bill') {
        const bill = await getBill(connection, entityId)
        if (!bill) {
          return new Response(
            JSON.stringify({ error: `Bill ${entityId} not found in QuickBooks` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          )
        }
        deletedDocNumber = bill.DocNumber
        await deleteBill(connection, bill.Id, bill.SyncToken)
        console.log(`Deleted Bill ${entityId}`)

      } else if (entityType === 'Check') {
        // Get check to retrieve SyncToken
        const checkResult = await qbApiRequest<{ Check: { Id: string; SyncToken: string; DocNumber?: string } }>(
          connection,
          'GET',
          `check/${entityId}`
        )
        if (!checkResult?.Check) {
          return new Response(
            JSON.stringify({ error: `Check ${entityId} not found in QuickBooks` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          )
        }
        deletedDocNumber = checkResult.Check.DocNumber
        await qbApiRequest(
          connection,
          'POST',
          'check?operation=delete',
          { Id: checkResult.Check.Id, SyncToken: checkResult.Check.SyncToken }
        )
        console.log(`Deleted Check ${entityId}`)

      } else if (entityType === 'Purchase') {
        // Get purchase to retrieve SyncToken
        const purchaseResult = await qbApiRequest<{ Purchase: { Id: string; SyncToken: string; DocNumber?: string } }>(
          connection,
          'GET',
          `purchase/${entityId}`
        )
        if (!purchaseResult?.Purchase) {
          return new Response(
            JSON.stringify({ error: `Purchase ${entityId} not found in QuickBooks` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          )
        }
        deletedDocNumber = purchaseResult.Purchase.DocNumber
        await qbApiRequest(
          connection,
          'POST',
          'purchase?operation=delete',
          { Id: purchaseResult.Purchase.Id, SyncToken: purchaseResult.Purchase.SyncToken }
        )
        console.log(`Deleted Purchase ${entityId}`)

      } else {
        return new Response(
          JSON.stringify({ error: `Unsupported entity type: ${entityType}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
    } catch (qbError: any) {
      console.error('QBO API error:', qbError.message)
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to delete ${entityType}: ${qbError.message}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Log the sync
    await logSync(
      supabaseClient,
      entityType === 'JournalEntry' ? 'journal_entry' : entityType.toLowerCase() as any,
      'outbound',
      'success',
      undefined,
      entityType,
      entityId
    )

    // Update last_sync_at on connection
    await supabaseClient
      .from('qb_connection')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Deleted ${entityType} ${deletedDocNumber ? `#${deletedDocNumber}` : entityId}`,
        entityType,
        entityId,
        docNumber: deletedDocNumber
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Delete transaction error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete transaction'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
