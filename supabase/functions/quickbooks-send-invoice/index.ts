import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  sendInvoice,
  logSync,
  updateConnectionLastSync,
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SendInvoiceRequest {
  paymentId: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with the user's auth token for RLS
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '')

    // Use service role client for all database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Verify the token by checking if it's a valid JWT and getting user info
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token', details: userError?.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Get request body
    const { paymentId } = await req.json() as SendInvoiceRequest

    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: 'paymentId is required' }),
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

    // Fetch payment with QB invoice info
    const { data: payment, error: paymentError } = await supabaseClient
      .from('payment')
      .select('id, qb_invoice_id, qb_invoice_number, deal_id')
      .eq('id', paymentId)
      .single()

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Check if invoice exists in QB
    if (!payment.qb_invoice_id) {
      return new Response(
        JSON.stringify({ error: 'No QuickBooks invoice exists for this payment. Create one first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Get the deal to find bill_to_email
    const { data: deal, error: dealError } = await supabaseClient
      .from('deal')
      .select('bill_to_email')
      .eq('id', payment.deal_id)
      .single()

    if (dealError || !deal) {
      return new Response(
        JSON.stringify({ error: 'Deal not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    if (!deal.bill_to_email) {
      return new Response(
        JSON.stringify({ error: 'No bill-to email address configured on the deal. Please add one first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Send the invoice via QuickBooks
    await sendInvoice(connection, payment.qb_invoice_id, deal.bill_to_email)

    // Update payment to mark invoice as sent and set invoice date
    const today = new Date().toISOString().split('T')[0]
    const { error: updateError } = await supabaseClient
      .from('payment')
      .update({
        invoice_sent: true,
        payment_invoice_date: today
      })
      .eq('id', paymentId)

    if (updateError) {
      console.error('Error updating payment after send:', updateError)
    }

    // Log successful send
    await logSync(
      supabaseClient,
      'invoice',
      'outbound',
      'success',
      paymentId,
      'send_email',
      payment.qb_invoice_id
    )

    // Update last_sync_at on connection
    await updateConnectionLastSync(supabaseClient, connection.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invoice ${payment.qb_invoice_number} sent to ${deal.bill_to_email}`,
        qbInvoiceId: payment.qb_invoice_id,
        qbInvoiceNumber: payment.qb_invoice_number,
        sentTo: deal.bill_to_email
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Send invoice error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to send invoice'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
