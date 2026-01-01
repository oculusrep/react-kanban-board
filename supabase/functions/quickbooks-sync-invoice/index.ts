import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  findOrCreateCustomer,
  findOrCreateServiceItem,
  createInvoice,
  sendInvoice,
  logSync,
  qbApiRequest,
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
    // Create Supabase client with the user's auth token for RLS
    const authHeader = req.headers.get('Authorization')
    console.log('Auth header present:', !!authHeader)

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
    // Use the service role client to verify the token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    console.log('User verified:', !!user, 'Error:', userError?.message)

    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token', details: userError?.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Get request body
    const { paymentId, sendEmail } = await req.json() as SyncInvoiceRequest

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

    // Fetch payment with related data
    const { data: payment, error: paymentError } = await supabaseClient
      .from('payment')
      .select(`
        id,
        payment_name,
        payment_amount,
        payment_date_estimated,
        payment_invoice_date,
        qb_invoice_id,
        qb_invoice_number,
        orep_invoice,
        deal:deal_id (
          id,
          deal_name,
          bill_to_contact_name,
          bill_to_company_name,
          bill_to_email,
          bill_to_address_street,
          bill_to_address_city,
          bill_to_address_state,
          bill_to_address_zip,
          bill_to_phone,
          client:client_id (
            id,
            client_name,
            email
          ),
          property:property_id (
            id,
            property_name,
            address,
            city,
            state,
            zip
          )
        )
      `)
      .eq('id', paymentId)
      .single()

    if (paymentError || !payment) {
      console.error('Payment not found:', paymentError)
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Check if already synced by qb_invoice_id
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

    // Check if orep_invoice matches an existing QBO invoice (for linking legacy invoices)
    // This handles the case where invoices were created in QBO manually before OVIS integration
    if (payment.orep_invoice) {
      console.log(`Checking if orep_invoice "${payment.orep_invoice}" exists in QBO...`)

      const searchQuery = `SELECT * FROM Invoice WHERE DocNumber = '${payment.orep_invoice}'`
      try {
        const searchResult = await qbApiRequest<{ QueryResponse: { Invoice?: Array<{ Id: string; DocNumber: string; TotalAmt: number }> } }>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(searchQuery)}`
        )

        const existingInvoice = searchResult.QueryResponse.Invoice?.[0]

        if (existingInvoice) {
          console.log(`Found existing QBO invoice ${existingInvoice.DocNumber} (ID: ${existingInvoice.Id}) - linking instead of creating new`)

          // Link the existing invoice to this payment
          const { error: linkError } = await supabaseClient
            .from('payment')
            .update({
              qb_invoice_id: existingInvoice.Id,
              qb_invoice_number: existingInvoice.DocNumber,
              qb_sync_status: 'synced',
              qb_last_sync: new Date().toISOString()
            })
            .eq('id', paymentId)

          if (linkError) {
            console.error('Failed to link payment to existing QBO invoice:', linkError)
          }

          // Log the link
          await logSync(
            supabaseClient,
            'invoice',
            'outbound',
            'success',
            paymentId,
            'payment',
            existingInvoice.Id
          )

          return new Response(
            JSON.stringify({
              success: true,
              message: `Linked to existing QuickBooks invoice #${existingInvoice.DocNumber}`,
              qbInvoiceId: existingInvoice.Id,
              qbInvoiceNumber: existingInvoice.DocNumber,
              linked: true
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } catch (searchError: any) {
        // Log but continue - we'll create a new invoice if search fails
        console.error('Error searching for existing QBO invoice:', searchError.message)
      }
    }

    const deal = payment.deal as any
    const client = deal?.client
    const property = deal?.property

    if (!client) {
      return new Response(
        JSON.stringify({ error: 'Payment must have a client associated via deal' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Find or create customer in QuickBooks
    const customerId = await findOrCreateCustomer(
      connection,
      client.client_name,
      client.email,
      {
        companyName: deal.bill_to_company_name || client.client_name,
        contactName: deal.bill_to_contact_name,
        email: deal.bill_to_email || client.email,
        street: deal.bill_to_address_street,
        city: deal.bill_to_address_city,
        state: deal.bill_to_address_state,
        zip: deal.bill_to_address_zip,
        phone: deal.bill_to_phone
      }
    )

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
    if (deal.bill_to_email || client.email) {
      invoice.BillEmail = { Address: deal.bill_to_email || client.email }
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
    const { error: updateError } = await supabaseClient
      .from('payment')
      .update({
        qb_invoice_id: qbInvoice.Id,
        qb_invoice_number: qbInvoice.DocNumber,
        qb_sync_status: 'synced',
        qb_last_sync: new Date().toISOString()
      })
      .eq('id', paymentId)

    if (updateError) {
      console.error('Failed to update payment with QBO info:', updateError)
      // Log sync but don't fail - invoice was created
    }

    // Log successful sync
    await logSync(
      supabaseClient,
      'invoice',
      'outbound',
      'success',
      paymentId,
      'payment',
      qbInvoice.Id
    )

    // Optionally send the invoice via email
    let emailSent = false
    if (sendEmail && (deal.bill_to_email || client.email)) {
      try {
        await sendInvoice(connection, qbInvoice.Id, deal.bill_to_email || client.email)
        emailSent = true

        // Update payment to mark invoice as sent
        await supabaseClient
          .from('payment')
          .update({
            invoice_sent: true,
            sf_invoice_sent_date: new Date().toISOString().split('T')[0]
          })
          .eq('id', paymentId)
      } catch (emailError: any) {
        console.error('Failed to send invoice email:', emailError)
        // Don't fail the whole operation, just log it
        await logSync(
          supabaseClient,
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
    await supabaseClient
      .from('qb_connection')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection.id)

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
