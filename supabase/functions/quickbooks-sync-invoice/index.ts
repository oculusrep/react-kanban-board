import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  getQBConnection,
  refreshTokenIfNeeded,
  findOrCreateCustomer,
  findOrCreateServiceItem,
  createInvoice,
  updateInvoice,
  getInvoice,
  sendInvoice,
  uploadAttachment,
  logSync,
  updateConnectionLastSync,
  postgrestQuery,
  postgrestUpdate,
  QBInvoice,
  QBInvoiceLine,
  QBDescriptionLine
} from '../_shared/quickbooks.ts'
import { downloadInvoiceAttachments } from '../_shared/dropbox.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SyncInvoiceRequest {
  paymentId: string
  sendEmail?: boolean  // If true, also send the invoice via QBO email
  forceResync?: boolean  // If true, update existing invoice instead of skipping
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

    // Get environment variables for Supabase client
    // Using SUPABASE_SERVICE_ROLE_KEY (new sb_secret_* format) with Supabase JS client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    console.log('SUPABASE_URL:', supabaseUrl)
    console.log('SUPABASE_SERVICE_ROLE_KEY present:', !!secretKey)

    if (!supabaseUrl || !secretKey) {
      throw new Error('Supabase configuration missing')
    }

    // Get request body
    const { paymentId, sendEmail, forceResync } = await req.json() as SyncInvoiceRequest

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
    const paymentSelect = 'id,payment_name,payment_amount,payment_date_estimated,payment_invoice_date,qb_invoice_id,qb_invoice_number,deal_id,payment_sequence'
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

    // Check if already synced - if forceResync is not set, return existing invoice info
    const existingInvoiceId = payment.qb_invoice_id
    if (existingInvoiceId && !forceResync) {
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

    // If resyncing, log that we're updating
    if (existingInvoiceId && forceResync) {
      console.log('Resyncing existing invoice:', existingInvoiceId)
    }

    // Fetch the deal with client and property
    if (!payment.deal_id) {
      return new Response(
        JSON.stringify({ error: 'Payment must have a deal associated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Count total payments for this deal (to display "Payment X of Y")
    const allDealPayments = await postgrestQuery(
      supabaseUrl,
      secretKey,
      'payment',
      `select=id&deal_id=eq.${payment.deal_id}`
    )
    const totalPayments = allDealPayments?.length || 1

    // Fetch deal with all bill-to fields including CC/BCC emails and contract_signed_date
    const dealSelect = 'id,deal_name,contract_signed_date,bill_to_contact_name,bill_to_company_name,bill_to_email,bill_to_cc_emails,bill_to_bcc_emails,bill_to_address_street,bill_to_address_city,bill_to_address_state,bill_to_address_zip,bill_to_phone,client_id,property_id'
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

    // Fetch client with qb_customer_id (client table doesn't have email column)
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

    // Fetch commission splits and broker names for the deal team
    // Only includes brokers from THIS deal's commission_split records
    let brokerNames: string[] = []
    try {
      console.log('Fetching commission splits for deal_id:', payment.deal_id)
      const commissionSplits = await postgrestQuery(
        supabaseUrl,
        secretKey,
        'commission_split',
        `select=broker_id&deal_id=eq.${payment.deal_id}`
      )
      console.log('Commission splits found:', JSON.stringify(commissionSplits))

      if (commissionSplits && commissionSplits.length > 0) {
        const brokerIds = commissionSplits.map((cs: { broker_id: string }) => cs.broker_id)
        console.log('Broker IDs from splits:', brokerIds)

        // Fetch broker names - use 'in' filter for multiple IDs
        // Note: broker table uses 'name' column, not 'broker_name'
        const brokerQuery = `select=id,name&id=in.(${brokerIds.join(',')})`
        console.log('Broker query:', brokerQuery)
        const brokers = await postgrestQuery(
          supabaseUrl,
          secretKey,
          'broker',
          brokerQuery
        )
        console.log('Brokers fetched:', JSON.stringify(brokers))

        if (brokers && brokers.length > 0) {
          // Filter out any null/empty names or placeholder "Unknown Broker" entries
          brokerNames = brokers
            .map((b: { name: string }) => b.name)
            .filter((name: string) => name && name.trim() && name !== 'Unknown Broker')
          console.log('Final broker names for invoice:', brokerNames)
        }
      } else {
        console.log('No commission splits found for this deal')
      }
    } catch (brokerErr: any) {
      console.error('Error fetching brokers:', brokerErr.message)
      // Continue without broker info - not critical
    }

    // Find or create customer hierarchy in QuickBooks (Parent Client + Sub-customer Deal)
    // The sub-customer will be named "Client - Deal" and will have the bill-to company info
    // Note: client table doesn't have email - use deal.bill_to_email for all email needs
    const customerId = await findOrCreateCustomer(
      connection,
      client.client_name,
      deal.deal_name || 'Deal',  // Deal name for sub-customer
      deal.bill_to_email,  // Use deal's bill-to email (client table has no email column)
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

    console.log('Using QB customer ID (sub-customer):', customerId)

    // Find or create the service item (Brokerage Fee)
    const serviceItemId = await findOrCreateServiceItem(connection, 'Brokerage Fee')

    // Build invoice description
    // Format: "Payment X of Y Now Due for Commission related to procuring cause of Lease Agreement with {client_name} - in {property.city}, {property.state}."
    const propertyLocation = property
      ? `${property.city || ''}${property.city && property.state ? ', ' : ''}${property.state || ''}`
      : ''
    // Use "Payment X of Y" format matching the frontend display
    const paymentLabel = payment.payment_sequence
      ? `Payment ${payment.payment_sequence} of ${totalPayments}`
      : payment.payment_name || 'Payment'
    const invoiceDescription = `${paymentLabel} Now Due for Commission related to procuring cause of Lease Agreement with ${client.client_name}${propertyLocation ? ` - in ${propertyLocation}` : ''}.`

    // Invoice date - use payment_invoice_date or today
    const invoiceDate = payment.payment_invoice_date || new Date().toISOString().split('T')[0]

    // Service date - use deal's contract_signed_date
    const serviceDate = deal.contract_signed_date || undefined
    console.log('Invoice date:', invoiceDate)
    console.log('Service date (contract_signed_date):', serviceDate)

    // Build invoice line with service date
    const invoiceLine: QBInvoiceLine = {
      Amount: Number(payment.payment_amount),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: { value: serviceItemId, name: 'Brokerage Fee' },
        Qty: 1,
        UnitPrice: Number(payment.payment_amount),
        ServiceDate: serviceDate  // Contract signed date as service date
      },
      Description: invoiceDescription
    }

    // Build invoice lines array
    const invoiceLines: (QBInvoiceLine | QBDescriptionLine)[] = [invoiceLine]

    // Add broker attribution line if we have broker names
    if (brokerNames.length > 0) {
      // Format: "Brokers: Name1 and Name2" or "Brokers: Name1, Name2, and Name3"
      let brokerText: string
      if (brokerNames.length === 1) {
        brokerText = `Brokers: ${brokerNames[0]}`
      } else if (brokerNames.length === 2) {
        brokerText = `Brokers: ${brokerNames[0]} and ${brokerNames[1]}`
      } else {
        const lastBroker = brokerNames[brokerNames.length - 1]
        const otherBrokers = brokerNames.slice(0, -1).join(', ')
        brokerText = `Brokers: ${otherBrokers}, and ${lastBroker}`
      }

      const brokerLine: QBDescriptionLine = {
        Amount: 0,
        DetailType: 'DescriptionOnly',
        DescriptionLineDetail: {},
        Description: brokerText
      }
      invoiceLines.push(brokerLine)
      console.log('Added broker line:', brokerText)
    }

    // Build the invoice
    // CustomerRef uses the sub-customer ID (Client - Deal format)
    const subCustomerDisplayName = `${client.client_name} - ${deal.deal_name || 'Deal'}`
    const invoice: QBInvoice = {
      CustomerRef: { value: customerId, name: subCustomerDisplayName },
      Line: invoiceLines,
      TxnDate: invoiceDate,  // Invoice date from payment
      DueDate: invoiceDate,  // Due date = Invoice date (Due on receipt)
      SalesTermRef: { value: '1', name: 'Due on receipt' }  // Standard QBO term ID for "Due on receipt"
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

    // Add bill-to email for sending (primary TO recipients)
    if (deal.bill_to_email) {
      invoice.BillEmail = { Address: deal.bill_to_email }
    }

    // Add CC emails if provided
    if (deal.bill_to_cc_emails) {
      invoice.BillEmailCc = { Address: deal.bill_to_cc_emails }
    }

    // Add BCC emails if provided (always ensure mike@oculusrep.com is included)
    if (deal.bill_to_bcc_emails) {
      invoice.BillEmailBcc = { Address: deal.bill_to_bcc_emails }
    }

    // Add standard customer memo (Note to Customer) - always the same on every invoice
    invoice.CustomerMemo = {
      value: `Thank you for your business!
Please make checks payable to:
Oculus Real Estate Partners, LLC`
    }

    // Either create new invoice or update existing one
    let qbInvoice: { Id: string; DocNumber: string }
    let isUpdate = false
    let attachmentsUploaded = 0

    if (existingInvoiceId) {
      // Update existing invoice - get current SyncToken first
      const existingQbInvoice = await getInvoice(connection, existingInvoiceId)
      console.log('Updating existing invoice, SyncToken:', existingQbInvoice.SyncToken)

      const updateResult = await updateInvoice(
        connection,
        existingInvoiceId,
        existingQbInvoice.SyncToken,
        invoice
      )
      qbInvoice = { Id: updateResult.Id, DocNumber: updateResult.DocNumber }
      isUpdate = true
      console.log('Updated QBO invoice:', qbInvoice)
    } else {
      // Create new invoice
      qbInvoice = await createInvoice(connection, invoice)
      console.log('Created QBO invoice:', qbInvoice)

      // Attach standard documents to newly created invoices only
      // Downloads W9, wiring instructions, and ACH instructions from Dropbox
      try {
        console.log('Downloading invoice attachments from Dropbox...')
        const attachments = await downloadInvoiceAttachments()

        for (const attachment of attachments) {
          try {
            console.log(`Uploading attachment to QuickBooks: ${attachment.name}`)
            await uploadAttachment(
              connection,
              attachment.data,
              attachment.name,
              'application/pdf',
              'Invoice',
              qbInvoice.Id
            )
            attachmentsUploaded++
            console.log(`Successfully attached ${attachment.name} to invoice ${qbInvoice.Id}`)
          } catch (attachErr: any) {
            console.error(`Failed to attach ${attachment.name}:`, attachErr.message)
            // Continue with other attachments - don't fail the whole operation
          }
        }

        console.log(`Attached ${attachmentsUploaded}/${attachments.length} documents to invoice`)
      } catch (dropboxErr: any) {
        console.error('Failed to download attachments from Dropbox:', dropboxErr.message)
        // Don't fail invoice creation - attachments are optional
      }
    }

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
      // Log sync but don't fail - invoice was created/updated
    }

    // Log successful sync
    await logSync(
      supabaseUrl,
      secretKey,
      'invoice',
      'outbound',
      'success',
      paymentId,
      isUpdate ? 'payment_update' : 'payment',
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

    // Build response message
    let message = `Invoice ${isUpdate ? 'updated' : 'created'} in QuickBooks`
    if (attachmentsUploaded > 0) {
      message += ` with ${attachmentsUploaded} attachment${attachmentsUploaded > 1 ? 's' : ''}`
    }
    if (emailSent) {
      message += ' and sent via email'
    }

    return new Response(
      JSON.stringify({
        success: true,
        message,
        qbInvoiceId: qbInvoice.Id,
        qbInvoiceNumber: qbInvoice.DocNumber,
        emailSent,
        wasUpdate: isUpdate,
        attachmentsUploaded
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
