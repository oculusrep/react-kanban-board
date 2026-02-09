import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  getBill,
  deleteBill,
  getJournalEntry,
  deleteJournalEntry,
  logSync
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeleteCommissionEntryRequest {
  paymentSplitId: string
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
    const { paymentSplitId } = await req.json() as DeleteCommissionEntryRequest

    if (!paymentSplitId) {
      return new Response(
        JSON.stringify({ error: 'paymentSplitId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Deleting commission entry for payment split:', paymentSplitId)

    // Find the existing commission entry for this payment split
    const { data: existingEntry, error: findError } = await supabaseClient
      .from('qb_commission_entry')
      .select('id, qb_entity_id, qb_entity_type, qb_doc_number')
      .eq('payment_split_id', paymentSplitId)
      .neq('status', 'voided')
      .single()

    if (findError || !existingEntry) {
      console.log('No active commission entry found for payment split:', paymentSplitId)
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No commission entry to delete',
          notFound: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Found commission entry to delete:', existingEntry)

    // Get the QBO connection
    let connection = await getQBConnection(supabaseClient)
    if (!connection) {
      // No QBO connection - just mark the entry as voided in our database
      console.log('QuickBooks not connected - marking entry as voided locally only')

      const { error: updateError } = await supabaseClient
        .from('qb_commission_entry')
        .update({ status: 'voided', updated_at: new Date().toISOString() })
        .eq('id', existingEntry.id)

      if (updateError) {
        console.error('Failed to void commission entry:', updateError)
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Commission entry voided (QBO not connected)',
          qbEntityId: existingEntry.qb_entity_id,
          qbEntityType: existingEntry.qb_entity_type,
          localOnly: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Refresh token if needed
    connection = await refreshTokenIfNeeded(supabaseClient, connection)

    // Delete from QuickBooks based on entity type
    try {
      if (existingEntry.qb_entity_type === 'Bill') {
        // Get the bill to retrieve its SyncToken
        const bill = await getBill(connection, existingEntry.qb_entity_id)
        if (bill) {
          await deleteBill(connection, bill.Id, bill.SyncToken)
          console.log(`Deleted QBO Bill ${existingEntry.qb_entity_id}`)
        } else {
          console.log(`Bill ${existingEntry.qb_entity_id} not found in QBO - may have been deleted manually`)
        }

        // Log sync
        await logSync(
          supabaseClient,
          'bill',
          'outbound',
          'success',
          paymentSplitId,
          'payment_split',
          existingEntry.qb_entity_id
        )

      } else if (existingEntry.qb_entity_type === 'JournalEntry') {
        // Get the journal entry to retrieve its SyncToken
        const journalEntry = await getJournalEntry(connection, existingEntry.qb_entity_id)
        if (journalEntry) {
          await deleteJournalEntry(connection, journalEntry.Id, journalEntry.SyncToken)
          console.log(`Deleted QBO Journal Entry ${existingEntry.qb_entity_id}`)
        } else {
          console.log(`Journal Entry ${existingEntry.qb_entity_id} not found in QBO - may have been deleted manually`)
        }

        // Log sync
        await logSync(
          supabaseClient,
          'journal_entry',
          'outbound',
          'success',
          paymentSplitId,
          'payment_split',
          existingEntry.qb_entity_id
        )
      }
    } catch (qbError: any) {
      console.error('Error deleting from QBO:', qbError.message)

      // Log the failure
      await logSync(
        supabaseClient,
        existingEntry.qb_entity_type === 'Bill' ? 'bill' : 'journal_entry',
        'outbound',
        'failed',
        paymentSplitId,
        'payment_split',
        existingEntry.qb_entity_id,
        qbError.message
      )

      // Still mark as voided in our database even if QBO delete fails
      // This prevents duplicate entries and allows manual cleanup in QBO if needed
    }

    // Mark the commission entry as voided in our database
    const { error: updateError } = await supabaseClient
      .from('qb_commission_entry')
      .update({ status: 'voided', updated_at: new Date().toISOString() })
      .eq('id', existingEntry.id)

    if (updateError) {
      console.error('Failed to void commission entry:', updateError)
      // Don't fail the request - the QBO entity was deleted
    }

    // Update last_sync_at on connection
    await supabaseClient
      .from('qb_connection')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Deleted ${existingEntry.qb_entity_type} #${existingEntry.qb_doc_number || existingEntry.qb_entity_id}`,
        qbEntityId: existingEntry.qb_entity_id,
        qbEntityType: existingEntry.qb_entity_type,
        qbDocNumber: existingEntry.qb_doc_number
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Delete commission entry error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete commission entry'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
