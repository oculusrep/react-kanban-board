import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  getQBConnection,
  refreshTokenIfNeeded,
  getInvoice,
  deleteInvoice,
  logSync,
  updateConnectionLastSync,
  postgrestQuery,
  postgrestUpdate
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeleteInvoiceRequest {
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
    const { paymentId } = await req.json() as DeleteInvoiceRequest

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
      `select=id,qb_invoice_id,qb_invoice_number&id=eq.${paymentId}`
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
        JSON.stringify({ error: 'No QuickBooks invoice exists for this payment.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const invoiceNumber = payment.qb_invoice_number

    // Get the invoice from QuickBooks to get the SyncToken (required for delete)
    const qbInvoice = await getInvoice(connection, payment.qb_invoice_id)

    // Delete (void) the invoice in QuickBooks
    await deleteInvoice(connection, payment.qb_invoice_id, qbInvoice.SyncToken)

    // Clear the QB invoice info from the payment record
    await postgrestUpdate(supabaseUrl, secretKey, 'payment', `id=eq.${paymentId}`, {
      qb_invoice_id: null,
      qb_invoice_number: null,
      qb_sync_status: null,
      qb_last_sync: null,
      invoice_sent: false
    })

    // Log successful deletion
    await logSync(
      supabaseUrl,
      secretKey,
      'invoice',
      'outbound',
      'success',
      paymentId,
      'delete',
      payment.qb_invoice_id
    )

    // Update last_sync_at on connection
    await updateConnectionLastSync(supabaseUrl, secretKey, connection.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invoice ${invoiceNumber} deleted from QuickBooks`,
        deletedInvoiceNumber: invoiceNumber
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Delete invoice error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete invoice'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
