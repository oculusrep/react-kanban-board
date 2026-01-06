import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  findOrCreateCustomer,
  findOrCreateServiceItem,
  createInvoice,
  getInvoice,
  updateInvoice,
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
  forceResync?: boolean // If true, update existing invoice with current OVIS data
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
    const { paymentId, sendEmail, forceResync } = await req.json() as SyncInvoiceRequest

    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: 'paymentId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Looking up payment with ID:', paymentId, 'Type:', typeof paymentId, 'Length:', paymentId?.length)

    // Quick test: try to count all payments first
    const { count: paymentCount, error: countError } = await supabaseClient
      .from('payment')
      .select('*', { count: 'exact', head: true })
    console.log('Total payments in database:', paymentCount, 'Count error:', countError?.message)

    // Get the QBO connection
    let connection = await getQBConnection(supabaseClient)
    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks is not connected. Please connect in Settings.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Log which QBO environment we're using
    const qbEnv = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox'
    const qbApiBaseUrl = qbEnv === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com'
    console.log('QuickBooks environment:', qbEnv, '| API URL:', qbApiBaseUrl, '| Realm ID:', connection.realm_id)

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
          deal_team_id,
          contract_signed_date,
          bill_to_contact_name,
          bill_to_company_name,
          bill_to_email,
          bill_to_cc_emails,
          bill_to_bcc_emails,
          bill_to_address_street,
          bill_to_address_city,
          bill_to_address_state,
          bill_to_address_zip,
          bill_to_phone,
          client:client_id (
            id,
            client_name
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
      console.error('Payment not found - ID:', paymentId, 'Error:', paymentError?.message, 'Code:', paymentError?.code)
      return new Response(
        JSON.stringify({
          error: 'Payment not found',
          details: paymentError?.message || 'No payment with this ID exists',
          paymentId: paymentId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Check if already synced by qb_invoice_id
    if (payment.qb_invoice_id && !forceResync) {
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

    // If forceResync is true and invoice exists, update it
    if (payment.qb_invoice_id && forceResync) {
      console.log('Force resync requested - updating existing invoice:', payment.qb_invoice_id)

      const deal = payment.deal as any
      const client = deal?.client
      const property = deal?.property

      if (!client) {
        return new Response(
          JSON.stringify({ error: 'Payment must have a client associated via deal' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Get current invoice to get SyncToken
      const currentInvoice = await getInvoice(connection, payment.qb_invoice_id)
      console.log('Current QBO invoice SyncToken:', currentInvoice.SyncToken)

      // Find or create the service item (Brokerage Fee)
      const serviceItemId = await findOrCreateServiceItem(connection, 'Brokerage Fee')

      // Build invoice line with updated amount
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

      // Build update payload - full invoice update requires all fields
      const updatePayload: any = {
        Id: payment.qb_invoice_id,
        SyncToken: currentInvoice.SyncToken,
        sparse: false, // Full update to ensure all fields are updated
        Line: [invoiceLine],
        DueDate: payment.payment_date_estimated || undefined,
        TxnDate: payment.payment_invoice_date || new Date().toISOString().split('T')[0]
      }

      // Find or create customer (in case bill-to info changed)
      const customerId = await findOrCreateCustomer(
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

      updatePayload.CustomerRef = { value: customerId, name: client.client_name }

      // Add bill-to address if available
      if (deal.bill_to_address_street || deal.bill_to_address_city) {
        updatePayload.BillAddr = {
          Line1: deal.bill_to_address_street,
          City: deal.bill_to_address_city,
          CountrySubDivisionCode: deal.bill_to_address_state,
          PostalCode: deal.bill_to_address_zip
        }
      }

      // Add bill-to email for sending
      if (deal.bill_to_email) {
        updatePayload.BillEmail = { Address: deal.bill_to_email }
      }

      // Add memo with deal/property info
      if (propertyMemo || deal.deal_name) {
        updatePayload.CustomerMemo = {
          value: [deal.deal_name, propertyMemo].filter(Boolean).join(' - ')
        }
      }

      // Update the invoice in QuickBooks using full update
      const updatedInvoice = await qbApiRequest<{ Invoice: { Id: string; DocNumber: string; SyncToken: string } }>(
        connection,
        'POST',
        'invoice',
        updatePayload
      )

      console.log('Updated QBO invoice:', updatedInvoice.Invoice)

      // Update sync timestamp on payment and clear pending flag
      const { error: updateError } = await supabaseClient
        .from('payment')
        .update({
          qb_sync_status: 'synced',
          qb_last_sync: new Date().toISOString(),
          qb_sync_pending: false  // Clear the pending flag after successful sync
        })
        .eq('id', paymentId)

      if (updateError) {
        console.error('Failed to update payment sync timestamp:', updateError)
      }

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

      // Optionally send the invoice via email
      let emailSent = false
      if (sendEmail && deal.bill_to_email) {
        try {
          await sendInvoice(connection, payment.qb_invoice_id, deal.bill_to_email)
          emailSent = true

          await supabaseClient
            .from('payment')
            .update({
              invoice_sent: true,
              sf_invoice_sent_date: new Date().toISOString().split('T')[0]
            })
            .eq('id', paymentId)
        } catch (emailError: any) {
          console.error('Failed to send invoice email:', emailError)
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: emailSent
            ? `Invoice #${payment.qb_invoice_number} updated and sent`
            : `Invoice #${payment.qb_invoice_number} updated in QuickBooks`,
          qbInvoiceId: payment.qb_invoice_id,
          qbInvoiceNumber: payment.qb_invoice_number,
          wasUpdate: true,
          emailSent,
          qbEnvironment: qbEnv
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
              qb_last_sync: new Date().toISOString(),
              qb_sync_pending: false
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
              linked: true,
              qbEnvironment: qbEnv
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

    // Fetch deal_team separately (no FK constraint in DB)
    let dealTeamLabel: string | null = null
    if (deal?.deal_team_id) {
      const { data: dealTeam } = await supabaseClient
        .from('deal_team')
        .select('label')
        .eq('id', deal.deal_team_id)
        .single()
      dealTeamLabel = dealTeam?.label || null
    }

    if (!client) {
      return new Response(
        JSON.stringify({ error: 'Payment must have a client associated via deal' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Require contract_signed_date for service date
    if (!deal.contract_signed_date) {
      return new Response(
        JSON.stringify({ error: 'Deal must have a contract signed date to create an invoice. Please set the contract signed date on the deal first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Find or create customer in QuickBooks
    const customerId = await findOrCreateCustomer(
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

    // Find or create the service item (Brokerage Fee)
    const serviceItemId = await findOrCreateServiceItem(connection, 'Brokerage Fee')

    // Get the next invoice number by querying QBO for the highest DocNumber
    let nextDocNumber: string | undefined
    try {
      const invoiceQuery = `SELECT DocNumber FROM Invoice ORDER BY MetaData.CreateTime DESC MAXRESULTS 50`
      const invoiceResult = await qbApiRequest<{ QueryResponse: { Invoice?: Array<{ DocNumber?: string }> } }>(
        connection,
        'GET',
        `query?query=${encodeURIComponent(invoiceQuery)}`
      )

      // Find the highest numeric DocNumber
      let maxDocNumber = 0
      if (invoiceResult.QueryResponse.Invoice) {
        for (const inv of invoiceResult.QueryResponse.Invoice) {
          if (inv.DocNumber) {
            const num = parseInt(inv.DocNumber, 10)
            if (!isNaN(num) && num > maxDocNumber) {
              maxDocNumber = num
            }
          }
        }
      }

      if (maxDocNumber > 0) {
        nextDocNumber = String(maxDocNumber + 1)
        console.log(`Next invoice DocNumber will be: ${nextDocNumber} (after highest: ${maxDocNumber})`)
      }
    } catch (queryError: any) {
      console.error('Failed to query for next DocNumber, will let QBO auto-assign:', queryError.message)
    }

    // Build invoice line with service date from contract_signed_date
    // Description format: "Payment 1 of 2 Now Due for Commission related to procuring cause of Contract Agreement with Deal Name"
    const description = `${payment.payment_name || 'Payment'} Now Due for Commission related to procuring cause of Contract Agreement with ${deal.deal_name || client.client_name}`

    const invoiceLine: QBInvoiceLine = {
      Amount: Number(payment.payment_amount),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: { value: serviceItemId, name: 'Brokerage Fee' },
        Qty: 1,
        UnitPrice: Number(payment.payment_amount),
        ServiceDate: deal.contract_signed_date  // Service date = contract signed date
      },
      Description: description
    }

    // Build broker line (description-only, $0 amount)
    const dealTeamToFullNames: Record<string, string> = {
      'Mike': 'Mike Minihan',
      'Arty': 'Arty Santos',
      'Greg': 'Greg Bennett',
      'Mike & Arty': 'Mike Minihan and Arty Santos',
      'Mike & Greg': 'Mike Minihan and Greg Bennett',
      'Arty & Greg': 'Arty Santos and Greg Bennett',
      'Mike, Arty & Greg': 'Mike Minihan, Arty Santos, and Greg Bennett'
    }
    const brokerNames = dealTeamLabel ? (dealTeamToFullNames[dealTeamLabel] || dealTeamLabel) : null
    const brokerLine: QBInvoiceLine | null = brokerNames ? {
      Amount: 0,
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: { value: serviceItemId, name: 'Brokerage Fee' },
        Qty: 0,
        UnitPrice: 0
      },
      Description: `Broker(s): ${brokerNames}`
    } : null

    // Build invoice lines array
    const invoiceLines: QBInvoiceLine[] = [invoiceLine]
    if (brokerLine) {
      invoiceLines.push(brokerLine)
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
      Line: invoiceLines,
      TxnDate: payment.payment_date_estimated || new Date().toISOString().split('T')[0],
      DueDate: payment.payment_date_estimated || undefined,
      DocNumber: nextDocNumber,  // Explicitly set invoice number for custom numbering
      SalesTermRef: { value: '1', name: 'Due on receipt' }  // Terms: Due on receipt
    }

    // Add bill-to address if available
    // Line1 = Contact Name, Line2 = Company Name, Line3 = Street Address
    if (deal.bill_to_contact_name || deal.bill_to_company_name || deal.bill_to_address_street || deal.bill_to_address_city) {
      invoice.BillAddr = {
        Line1: deal.bill_to_contact_name || undefined,
        Line2: deal.bill_to_company_name || undefined,
        Line3: deal.bill_to_address_street || undefined,
        City: deal.bill_to_address_city,
        CountrySubDivisionCode: deal.bill_to_address_state,
        PostalCode: deal.bill_to_address_zip
      }
    }

    // Add bill-to email for sending
    if (deal.bill_to_email) {
      invoice.BillEmail = { Address: deal.bill_to_email }
    }

    // Add CC email (QBO only supports one CC email, use the first one if multiple)
    if (deal.bill_to_cc_emails) {
      const ccEmail = deal.bill_to_cc_emails.split(',')[0]?.trim()
      if (ccEmail) {
        invoice.BillEmailCc = { Address: ccEmail }
      }
    }

    // Add BCC email (QBO only supports one BCC email, use the first one if multiple)
    if (deal.bill_to_bcc_emails) {
      const bccEmail = deal.bill_to_bcc_emails.split(',')[0]?.trim()
      if (bccEmail) {
        invoice.BillEmailBcc = { Address: bccEmail }
      }
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
        qb_last_sync: new Date().toISOString(),
        qb_sync_pending: false
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
    if (sendEmail && deal.bill_to_email) {
      try {
        await sendInvoice(connection, qbInvoice.Id, deal.bill_to_email)
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
        emailSent,
        qbEnvironment: qbEnv,
        qbApiBaseUrl,
        realmId: connection.realm_id
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
