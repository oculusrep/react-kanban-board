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

interface DeleteReferralEntryRequest {
  paymentId: string
}

/**
 * Voids the QBO entries created for a referral / Broker of Record disbursement
 * when "Paid" is unchecked. A referral disbursement records ONE Bill; a BOR
 * disbursement records a Bill (pass-through) AND a Journal Entry (fee income).
 * This voids every non-voided qb_commission_entry linked to the payment.
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
        JSON.stringify({ error: 'Invalid authorization token', details: userError?.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { paymentId } = await req.json() as DeleteReferralEntryRequest

    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: 'paymentId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Voiding referral/BOR entries for payment:', paymentId)

    // Referral/BOR entries store the payment id in payment_split_id.
    const { data: entries } = await supabaseClient
      .from('qb_commission_entry')
      .select('id, qb_entity_id, qb_entity_type, qb_doc_number')
      .eq('payment_split_id', paymentId)
      .neq('status', 'voided')

    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No QuickBooks entries to void', notFound: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let connection = await getQBConnection(supabaseClient)
    const qboConnected = !!connection
    if (connection) {
      connection = await refreshTokenIfNeeded(supabaseClient, connection)
    }

    const voided: string[] = []

    for (const entry of entries) {
      if (qboConnected && connection) {
        try {
          if (entry.qb_entity_type === 'Bill') {
            const bill = await getBill(connection, entry.qb_entity_id)
            if (bill) await deleteBill(connection, bill.Id, bill.SyncToken)
            await logSync(supabaseClient, 'bill', 'outbound', 'success', paymentId, 'payment_referral', entry.qb_entity_id)
          } else if (entry.qb_entity_type === 'JournalEntry') {
            const je = await getJournalEntry(connection, entry.qb_entity_id)
            if (je) await deleteJournalEntry(connection, je.Id, je.SyncToken)
            await logSync(supabaseClient, 'journal_entry', 'outbound', 'success', paymentId, 'payment_bor_income', entry.qb_entity_id)
          }
        } catch (qbError: any) {
          // Void locally even if QBO delete fails, so the checkbox stays consistent
          // and QBO can be cleaned up manually. Log the failure for visibility.
          console.error(`Error deleting QBO ${entry.qb_entity_type} ${entry.qb_entity_id}:`, qbError.message)
          await logSync(
            supabaseClient,
            entry.qb_entity_type === 'Bill' ? 'bill' : 'journal_entry',
            'outbound',
            'failed',
            paymentId,
            'payment_referral',
            entry.qb_entity_id,
            qbError.message
          )
        }
      }

      await supabaseClient
        .from('qb_commission_entry')
        .update({ status: 'voided', updated_at: new Date().toISOString() })
        .eq('id', entry.id)

      voided.push(`${entry.qb_entity_type} #${entry.qb_doc_number || entry.qb_entity_id}`)
    }

    if (connection) {
      await supabaseClient
        .from('qb_connection')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', connection.id)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: qboConnected
          ? `Voided ${voided.length} QuickBooks entr${voided.length === 1 ? 'y' : 'ies'}: ${voided.join(', ')}`
          : `Voided ${voided.length} entr${voided.length === 1 ? 'y' : 'ies'} locally (QuickBooks not connected)`,
        voided,
        localOnly: !qboConnected
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Delete referral entry error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Failed to void referral entries' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
