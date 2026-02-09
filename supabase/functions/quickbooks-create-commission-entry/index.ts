import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  findOrCreateVendor,
  createBill,
  createJournalEntry,
  logSync,
  QBBill,
  QBBillLine,
  QBJournalEntry,
  QBJournalEntryLine
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateCommissionEntryRequest {
  paymentSplitId: string
  paidDate?: string  // YYYY-MM-DD format, defaults to today
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
    const { paymentSplitId, paidDate } = await req.json() as CreateCommissionEntryRequest

    if (!paymentSplitId) {
      return new Response(
        JSON.stringify({ error: 'paymentSplitId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Creating commission entry for payment split:', paymentSplitId)

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

    // Fetch the payment split with related data
    const { data: paymentSplit, error: splitError } = await supabaseClient
      .from('payment_split')
      .select(`
        id,
        broker_id,
        split_broker_total,
        paid,
        paid_date,
        payment:payment_id (
          id,
          payment_name,
          payment_date_estimated,
          sf_payment_date_actual,
          deal:deal_id (
            id,
            deal_name,
            referral_payee_client_id,
            referral_fee_usd
          )
        ),
        broker:broker_id (
          id,
          name,
          qb_vendor_id,
          qb_vendor_name
        )
      `)
      .eq('id', paymentSplitId)
      .single()

    if (splitError || !paymentSplit) {
      console.error('Payment split not found:', splitError)
      return new Response(
        JSON.stringify({ error: 'Payment split not found', details: splitError?.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Check if a QBO entry already exists for this payment split
    const { data: existingEntry } = await supabaseClient
      .from('qb_commission_entry')
      .select('id, qb_entity_id, qb_entity_type')
      .eq('payment_split_id', paymentSplitId)
      .neq('status', 'voided')
      .single()

    if (existingEntry) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Commission entry already exists',
          qbEntityId: existingEntry.qb_entity_id,
          qbEntityType: existingEntry.qb_entity_type,
          alreadyExists: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const broker = paymentSplit.broker as any
    const payment = paymentSplit.payment as any
    const deal = payment?.deal as any

    if (!broker) {
      return new Response(
        JSON.stringify({ error: 'Payment split must have a broker' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Get the commission mapping for this broker
    const { data: mapping, error: mappingError } = await supabaseClient
      .from('qb_commission_mapping')
      .select('*')
      .eq('broker_id', broker.id)
      .eq('entity_type', 'broker')
      .eq('is_active', true)
      .single()

    if (mappingError || !mapping) {
      console.log('No commission mapping found for broker:', broker.name)
      return new Response(
        JSON.stringify({
          error: `No QuickBooks commission mapping configured for broker: ${broker.name}. Please set up the mapping in Settings.`,
          brokerId: broker.id,
          brokerName: broker.name
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const transactionDate = paidDate || paymentSplit.paid_date || new Date().toISOString().split('T')[0]
    const amount = Number(paymentSplit.split_broker_total) || 0

    if (amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Payment split amount must be greater than 0' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Build description from template
    let description = mapping.description_template || 'Commission payment'
    description = description.replace('{deal_name}', deal?.deal_name || 'Unknown Deal')
    description = description.replace('{payment_name}', payment?.payment_name || 'Payment')
    description = description.replace('{broker_name}', broker.name || 'Broker')
    description = description.replace('{payment_date}', transactionDate)

    let qbEntityId: string
    let qbDocNumber: string | undefined
    let qbEntityType: 'Bill' | 'JournalEntry'

    // Generate next OVIS doc number for journal entries
    const generateNextDocNumber = async (): Promise<string> => {
      // Get the highest OVIS doc number from existing entries
      const { data: maxEntry } = await supabaseClient
        .from('qb_commission_entry')
        .select('qb_doc_number')
        .like('qb_doc_number', 'OVIS-%')
        .order('qb_doc_number', { ascending: false })
        .limit(1)
        .single()

      let nextNumber = 100  // Start at 100
      if (maxEntry?.qb_doc_number) {
        const match = maxEntry.qb_doc_number.match(/OVIS-(\d+)/)
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1
        }
      }

      return `OVIS-${nextNumber}`
    }

    if (mapping.payment_method === 'bill') {
      // Create a Bill for this broker payment
      console.log('Creating QBO Bill for broker:', broker.name)

      // Ensure vendor exists in QBO
      let vendorId = mapping.qb_vendor_id
      let vendorName = mapping.qb_vendor_name

      if (!vendorId) {
        // Try to find or create the vendor
        const vendor = await findOrCreateVendor(connection, vendorName || broker.name)
        vendorId = vendor.Id
        vendorName = vendor.DisplayName

        // Update the mapping with the vendor ID for future use
        await supabaseClient
          .from('qb_commission_mapping')
          .update({ qb_vendor_id: vendorId, qb_vendor_name: vendorName })
          .eq('id', mapping.id)
      }

      const billLine: QBBillLine = {
        Amount: amount,
        DetailType: 'AccountBasedExpenseLineDetail',
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: mapping.qb_debit_account_id, name: mapping.qb_debit_account_name }
        },
        Description: description
      }

      const bill: QBBill = {
        VendorRef: { value: vendorId, name: vendorName },
        Line: [billLine],
        TxnDate: transactionDate,
        PrivateNote: `OVIS Payment Split: ${paymentSplitId}`
      }

      const result = await createBill(connection, bill)
      qbEntityId = result.Id
      qbDocNumber = result.DocNumber
      qbEntityType = 'Bill'

      // Log sync
      await logSync(
        supabaseClient,
        'bill',
        'outbound',
        'success',
        paymentSplitId,
        'payment_split',
        qbEntityId
      )

    } else {
      // Create a Journal Entry for this broker payment (e.g., commission draw)
      console.log('Creating QBO Journal Entry for broker:', broker.name)

      if (!mapping.qb_credit_account_id) {
        return new Response(
          JSON.stringify({ error: 'Journal entry requires a credit account. Please configure the commission mapping.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Get vendor ID for entity reference on journal entry lines
      let vendorId = mapping.qb_vendor_id
      let vendorName = mapping.qb_vendor_name

      if (!vendorId && vendorName) {
        // Try to find or create the vendor
        const vendor = await findOrCreateVendor(connection, vendorName)
        vendorId = vendor.Id
        vendorName = vendor.DisplayName

        // Update the mapping with the vendor ID for future use
        await supabaseClient
          .from('qb_commission_mapping')
          .update({ qb_vendor_id: vendorId, qb_vendor_name: vendorName })
          .eq('id', mapping.id)
      }

      // Build entity reference if we have a vendor
      const entityRef = vendorId ? {
        Type: 'Vendor' as const,
        EntityRef: { value: vendorId, name: vendorName }
      } : undefined

      const journalLines: QBJournalEntryLine[] = [
        // Debit line (expense account)
        {
          Amount: amount,
          DetailType: 'JournalEntryLineDetail',
          JournalEntryLineDetail: {
            PostingType: 'Debit',
            AccountRef: { value: mapping.qb_debit_account_id, name: mapping.qb_debit_account_name },
            Entity: entityRef
          },
          Description: description
        },
        // Credit line (asset/draw account)
        {
          Amount: amount,
          DetailType: 'JournalEntryLineDetail',
          JournalEntryLineDetail: {
            PostingType: 'Credit',
            AccountRef: { value: mapping.qb_credit_account_id, name: mapping.qb_credit_account_name },
            Entity: entityRef
          },
          Description: description
        }
      ]

      // Generate a unique doc number for this journal entry
      const docNumber = await generateNextDocNumber()

      const journalEntry: QBJournalEntry = {
        DocNumber: docNumber,
        TxnDate: transactionDate,
        Line: journalLines,
        PrivateNote: `OVIS Payment Split: ${paymentSplitId}`
      }

      const result = await createJournalEntry(connection, journalEntry)
      qbEntityId = result.Id
      qbDocNumber = result.DocNumber
      qbEntityType = 'JournalEntry'

      // Log sync
      await logSync(
        supabaseClient,
        'journal_entry',
        'outbound',
        'success',
        paymentSplitId,
        'payment_split',
        qbEntityId
      )
    }

    // Record the commission entry in our tracking table
    const { error: insertError } = await supabaseClient
      .from('qb_commission_entry')
      .insert({
        payment_split_id: paymentSplitId,
        commission_mapping_id: mapping.id,
        qb_entity_type: qbEntityType,
        qb_entity_id: qbEntityId,
        qb_doc_number: qbDocNumber,
        amount: amount,
        transaction_date: transactionDate,
        status: 'created',
        created_by_id: user.id
      })

    if (insertError) {
      console.error('Failed to record commission entry:', insertError)
      // Don't fail - the QBO entry was created, just log the issue
    }

    // Update last_sync_at on connection
    await supabaseClient
      .from('qb_connection')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Created ${qbEntityType} for ${broker.name}`,
        qbEntityId,
        qbDocNumber,
        qbEntityType,
        amount,
        brokerName: broker.name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Commission entry error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to create commission entry'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
