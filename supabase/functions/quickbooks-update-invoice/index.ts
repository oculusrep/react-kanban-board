import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  getInvoice,
  updateInvoice,
  logSync
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UpdateInvoiceRequest {
  paymentId: string
  dueDate?: string  // YYYY-MM-DD format
}

serve(async (req) => {
  // Handle CORS preflight requests
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

    // Use service role client for database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Verify user token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { paymentId, dueDate } = await req.json() as UpdateInvoiceRequest

    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: 'paymentId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Get the payment and its linked QBO invoice ID
    const { data: payment, error: paymentError } = await supabaseClient
      .from('payment')
      .select('id, qb_invoice_id, qb_invoice_number, payment_date_estimated')
      .eq('id', paymentId)
      .single()

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    if (!payment.qb_invoice_id) {
      return new Response(
        JSON.stringify({ error: 'Payment is not linked to a QuickBooks invoice. Sync to QB first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

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

    // Get current invoice from QBO to get SyncToken
    const currentInvoice = await getInvoice(connection, payment.qb_invoice_id)
    console.log('Current QBO invoice:', currentInvoice)

    // Use provided dueDate or fall back to payment's estimated date
    const newDueDate = dueDate || payment.payment_date_estimated

    if (!newDueDate) {
      return new Response(
        JSON.stringify({ error: 'No due date provided and payment has no estimated date' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Update the invoice in QBO - both DueDate and TxnDate (invoice date) should match
    const updatedInvoice = await updateInvoice(
      connection,
      payment.qb_invoice_id,
      currentInvoice.SyncToken,
      { DueDate: newDueDate, TxnDate: newDueDate }
    )

    console.log('Updated QBO invoice:', updatedInvoice)

    // Update sync timestamp on payment
    await supabaseClient
      .from('payment')
      .update({ qb_last_sync: new Date().toISOString() })
      .eq('id', paymentId)

    // Log successful sync
    await logSync(
      supabaseClient,
      'invoice',
      'outbound',
      'success',
      paymentId,
      'payment',
      payment.qb_invoice_id
    )

    // Update last_sync_at on connection
    await supabaseClient
      .from('qb_connection')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Updated QuickBooks invoice #${payment.qb_invoice_number} invoice date and due date to ${newDueDate}`,
        qbInvoiceId: payment.qb_invoice_id,
        qbInvoiceNumber: payment.qb_invoice_number,
        newDueDate,
        newTxnDate: newDueDate
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Invoice update error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to update invoice'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
