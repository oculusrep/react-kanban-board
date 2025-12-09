import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  getQBConnection,
  refreshTokenIfNeeded,
  sendInvoice,
  logSync,
  updateConnectionLastSync,
  postgrestQuery,
  postgrestUpdate
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
    // Verify authorization header is present
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !secretKey) {
      throw new Error('Supabase configuration missing')
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
    let connection = await getQBConnection(supabaseUrl, secretKey)

    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks is not connected. Please connect in Settings.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Refresh token if needed
    connection = await refreshTokenIfNeeded(supabaseUrl, secretKey, connection)

    // Fetch payment with QB invoice info
    const payments = await postgrestQuery(
      supabaseUrl,
      secretKey,
      'payment',
      `select=id,qb_invoice_id,qb_invoice_number,deal_id&id=eq.${paymentId}`
    )

    if (!payments || payments.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const payment = payments[0]

    // Check if invoice exists in QB
    if (!payment.qb_invoice_id) {
      return new Response(
        JSON.stringify({ error: 'No QuickBooks invoice exists for this payment. Create one first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Get the deal to find bill_to_email
    const deals = await postgrestQuery(
      supabaseUrl,
      secretKey,
      'deal',
      `select=bill_to_email&id=eq.${payment.deal_id}`
    )

    if (!deals || deals.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Deal not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const deal = deals[0]

    if (!deal.bill_to_email) {
      return new Response(
        JSON.stringify({ error: 'No bill-to email address configured on the deal. Please add one first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Send the invoice via QuickBooks
    await sendInvoice(connection, payment.qb_invoice_id, deal.bill_to_email)

    // Update payment to mark invoice as sent
    await postgrestUpdate(supabaseUrl, secretKey, 'payment', `id=eq.${paymentId}`, {
      invoice_sent: true,
      sf_invoice_sent_date: new Date().toISOString().split('T')[0]
    })

    // Log successful send
    await logSync(
      supabaseUrl,
      secretKey,
      'invoice',
      'outbound',
      'success',
      paymentId,
      'send_email',
      payment.qb_invoice_id
    )

    // Update last_sync_at on connection
    await updateConnectionLastSync(supabaseUrl, secretKey, connection.id)

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
