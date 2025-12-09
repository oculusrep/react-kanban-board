import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  getQBConnection,
  refreshTokenIfNeeded,
  findOrCreateCustomer,
  findOrCreateServiceItem,
  createInvoice,
  sendInvoice,
  logSync,
  updateConnectionLastSync,
  postgrestQuery,
  postgrestUpdate,
  QBInvoice,
  QBInvoiceLine
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SyncInvoiceRequest {
  paymentId: string
  sendEmail?: boolean  // If true, also send the invoice via QBO email
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authorization header is present
    const authHeader = req.headers.get('Authorization')
    console.log('Auth header present:', !!authHeader)

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Get environment variables for direct PostgREST calls
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    console.log('SUPABASE_URL:', supabaseUrl)
    console.log('SUPABASE_SERVICE_ROLE_KEY present:', !!secretKey)

    if (!supabaseUrl || !secretKey) {
      throw new Error('Supabase configuration missing')
    }

    // Get request body
    const { paymentId, sendEmail } = await req.json() as SyncInvoiceRequest

    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: 'paymentId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Get the QBO connection using direct PostgREST
    console.log('Attempting to get QBO connection...')
    let connection = await getQBConnection(supabaseUrl, secretKey)
    console.log('getQBConnection result:', connection ? 'found' : 'null')

    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks is not connected. Please connect in Settings.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Refresh token if needed
    connection = await refreshTokenIfNeeded(supabaseUrl, secretKey, connection)

    // Fetch payment with related data using PostgREST
    // Note: PostgREST uses different syntax for nested selects
    const paymentSelect = 'id,payment_name,payment_amount,payment_date_estimated,payment_invoice_date,qb_invoice_id,qb_invoice_number,deal_id'
    const payments = await postgrestQuery(
      supabaseUrl,
      secretKey,
      'payment',
      `select=${paymentSelect}&id=eq.${paymentId}`
    )

    if (!payments || payments.length === 0) {
      console.error('Payment not found')
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const payment = payments[0]

    // Check if already synced
    if (payment.qb_invoice_id) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Invoice already synced to QuickBooks',
          qbInvoiceId: payment.qb_invoice_id,
          qbInvoiceNumber: payment.qb_invoice_number
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch the deal with client and property
    if (!payment.deal_id) {
      return new Response(
        JSON.stringify({ error: 'Payment must have a deal associated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const dealSelect = 'id,deal_name,bill_to_contact_name,bill_to_company_name,bill_to_email,bill_to_address_street,bill_to_address_city,bill_to_address_state,bill_to_address_zip,bill_to_phone,client_id,property_id'
    const deals = await postgrestQuery(
      supabaseUrl,
      secretKey,
      'deal',
      `select=${dealSelect}&id=eq.${payment.deal_id}`
    )

    if (!deals || deals.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Deal not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const deal = deals[0]

    // Fetch the client
    if (!deal.client_id) {
      return new Response(
        JSON.stringify({ error: 'Payment must have a client associated via deal' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Fetch client with qb_customer_id
    const clients = await postgrestQuery(
      supabaseUrl,
      secretKey,
      'client',
      `select=id,client_name,qb_customer_id&id=eq.${deal.client_id}`
    )

    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const client = clients[0]

    // Optionally fetch property if exists
    let property = null
    if (deal.property_id) {
      const properties = await postgrestQuery(
        supabaseUrl,
        secretKey,
        'property',
        `select=id,property_name,address,city,state,zip&id=eq.${deal.property_id}`
      )
      if (properties && properties.length > 0) {
        property = properties[0]
      }
    }

    // Get or create customer in QuickBooks
    let customerId: string

    if (client.qb_customer_id) {
      // Use the stored QB customer ID
      customerId = client.qb_customer_id
      console.log('Using stored QB customer ID:', customerId)
    } else {
      // Find or create customer in QuickBooks (legacy behavior)
      customerId = await findOrCreateCustomer(
        connection,
        client.client_name,
        deal.bill_to_email,
        {
          companyName: deal.bill_to_company_name || client.client_name,
          contactName: deal.bill_to_contact_name,
          email: deal.bill_to_email,
          street: deal.bill_to_address_street,
          city: deal.bill_to_address_city,
          state: deal.bill_to_address_state,
          zip: deal.bill_to_address_zip,
          phone: deal.bill_to_phone
        }
      )

      // Store the QB customer ID for future use
      await postgrestUpdate(supabaseUrl, secretKey, 'client', `id=eq.${client.id}`, {
        qb_customer_id: customerId
      })
      console.log('Created/found and stored QB customer ID:', customerId)
    }

    // Find or create the service item (Brokerage Fee)
    const serviceItemId = await findOrCreateServiceItem(connection, 'Brokerage Fee')

    // Build invoice line
    const invoiceLine: QBInvoiceLine = {
      Amount: Number(payment.payment_amount),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: { value: serviceItemId, name: 'Brokerage Fee' },
        Qty: 1,
        UnitPrice: Number(payment.payment_amount)
      },
      Description: deal.deal_name || `Brokerage services - ${client.client_name}`
    }

    // Build property address memo if available
    let propertyMemo = ''
    if (property) {
      propertyMemo = [property.property_name, property.address, property.city, property.state]
        .filter(Boolean)
        .join(', ')
    }

    // Build the invoice
    const invoice: QBInvoice = {
      CustomerRef: { value: customerId, name: client.client_name },
      Line: [invoiceLine],
      TxnDate: payment.payment_invoice_date || new Date().toISOString().split('T')[0],
      DueDate: payment.payment_date_estimated || undefined
    }

    // Add bill-to address if available
    if (deal.bill_to_address_street || deal.bill_to_address_city) {
      invoice.BillAddr = {
        Line1: deal.bill_to_address_street,
        City: deal.bill_to_address_city,
        CountrySubDivisionCode: deal.bill_to_address_state,
        PostalCode: deal.bill_to_address_zip
      }
    }

    // Add bill-to email for sending
    if (deal.bill_to_email) {
      invoice.BillEmail = { Address: deal.bill_to_email }
    }

    // Add memo with deal/property info
    if (propertyMemo || deal.deal_name) {
      invoice.CustomerMemo = {
        value: [deal.deal_name, propertyMemo].filter(Boolean).join(' - ')
      }
    }

    // Create the invoice in QuickBooks
    const qbInvoice = await createInvoice(connection, invoice)

    console.log('Created QBO invoice:', qbInvoice)

    // Update payment with QBO invoice info
    try {
      await postgrestUpdate(supabaseUrl, secretKey, 'payment', `id=eq.${paymentId}`, {
        qb_invoice_id: qbInvoice.Id,
        qb_invoice_number: qbInvoice.DocNumber,
        qb_sync_status: 'synced',
        qb_last_sync: new Date().toISOString()
      })
    } catch (updateError: any) {
      console.error('Failed to update payment with QBO info:', updateError)
      // Log sync but don't fail - invoice was created
    }

    // Log successful sync
    await logSync(
      supabaseUrl,
      secretKey,
      'invoice',
      'outbound',
      'success',
      paymentId,
      'payment',
      qbInvoice.Id
    )

    // Optionally send the invoice via email
    let emailSent = false
    if (sendEmail && deal.bill_to_email) {
      try {
        await sendInvoice(connection, qbInvoice.Id, deal.bill_to_email)
        emailSent = true

        // Update payment to mark invoice as sent
        await postgrestUpdate(supabaseUrl, secretKey, 'payment', `id=eq.${paymentId}`, {
          invoice_sent: true,
          sf_invoice_sent_date: new Date().toISOString().split('T')[0]
        })
      } catch (emailError: any) {
        console.error('Failed to send invoice email:', emailError)
        // Don't fail the whole operation, just log it
        await logSync(
          supabaseUrl,
          secretKey,
          'invoice',
          'outbound',
          'failed',
          paymentId,
          'send_email',
          qbInvoice.Id,
          emailError.message
        )
      }
    }

    // Update last_sync_at on connection
    await updateConnectionLastSync(supabaseUrl, secretKey, connection.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: emailSent
          ? 'Invoice created and sent via QuickBooks'
          : 'Invoice created in QuickBooks',
        qbInvoiceId: qbInvoice.Id,
        qbInvoiceNumber: qbInvoice.DocNumber,
        emailSent
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Invoice sync error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to sync invoice'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
