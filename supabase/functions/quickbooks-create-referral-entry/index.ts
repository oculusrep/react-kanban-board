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
  QBJournalEntry
} from '../_shared/quickbooks.ts'

// transaction_type.id for "BOR Referral Fee" (see src/lib/bor.ts + migration)
const BOR_TRANSACTION_TYPE_ID = '71c1b4eb-d468-44b6-a52a-f5f9b1bbf7da'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateReferralEntryRequest {
  paymentId: string
  paidDate?: string  // YYYY-MM-DD format, defaults to today
}

/**
 * Creates a QBO Bill for referral fee payment when a payment is marked as received.
 * The referral payee is determined from the deal's referral_payee_client_id.
 */
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
    const { paymentId, paidDate } = await req.json() as CreateReferralEntryRequest

    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: 'paymentId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Creating referral entry for payment:', paymentId)

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

    // Fetch the payment with related deal and referral payee data
    const { data: payment, error: paymentError } = await supabaseClient
      .from('payment')
      .select(`
        id,
        payment_name,
        payment_amount,
        bor_fee_usd,
        payment_date_estimated,
        sf_payment_date_actual,
        deal:deal_id (
          id,
          deal_name,
          transaction_type_id,
          bor_fee_usd,
          referral_fee_percent,
          referral_fee_usd,
          referral_payee_client_id,
          referral_payee:referral_payee_client_id (
            id,
            client_name,
            qb_vendor_id,
            qb_vendor_name
          ),
          client:client_id (
            id,
            client_name,
            qb_vendor_id,
            qb_vendor_name
          )
        )
      `)
      .eq('id', paymentId)
      .single()

    if (paymentError || !payment) {
      console.error('Payment not found:', paymentError)
      return new Response(
        JSON.stringify({ error: 'Payment not found', details: paymentError?.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const deal = payment.deal as any
    // Broker of Record deals: the referral partner IS the deal's Client, and the
    // pass-through is the payment amount minus the flat BOR Fee (not a percentage).
    const isBor = deal?.transaction_type_id === BOR_TRANSACTION_TYPE_ID
    const referralPayee = (deal?.referral_payee || (isBor ? deal?.client : null)) as any

    if (!referralPayee) {
      return new Response(
        JSON.stringify({
          error: 'No referral payee set on this deal',
          message: isBor
            ? 'This BOR deal has no Client set to remit the pass-through to'
            : 'This payment does not have a referral fee to pay out'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const paymentAmount = Number(payment.payment_amount) || 0

    // BOR fee kept by Oculus for this installment (defaults from the deal-level fee)
    const borFee = isBor ? (Number(payment.bor_fee_usd ?? deal.bor_fee_usd) || 0) : 0

    // Amount remitted to the partner:
    //  - BOR: full commission installment minus the BOR Fee (pass-through)
    //  - normal referral: a percentage of this payment
    const referralFeePercent = Number(deal.referral_fee_percent) || 0
    const referralAmount = isBor
      ? paymentAmount - borFee
      : paymentAmount * (referralFeePercent / 100)

    if (referralAmount <= 0) {
      return new Response(
        JSON.stringify({
          error: isBor ? 'Pass-through amount is 0' : 'Referral fee amount is 0',
          message: isBor
            ? 'Payment amount minus the BOR Fee is 0 — check the payment amount and BOR Fee'
            : 'No referral fee to pay for this payment'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Prevent duplicates: a referral records one Bill; a BOR disbursement records
    // a Bill + a Journal Entry. If any non-voided entry already exists for this
    // payment, don't create another set (uncheck Paid to void them first).
    const { data: existingEntries } = await supabaseClient
      .from('qb_commission_entry')
      .select('id, qb_entity_id, qb_entity_type')
      .eq('payment_id', paymentId)  // referral/BOR entries key off the payment
      .neq('status', 'voided')

    if (existingEntries && existingEntries.length > 0) {
      return new Response(
        JSON.stringify({
          success: true,
          alreadyExists: true,
          message: 'QuickBooks entries already exist for this payment — not creating duplicates. Uncheck Paid to void them first.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the commission mapping for this referral partner
    const { data: mapping, error: mappingError } = await supabaseClient
      .from('qb_commission_mapping')
      .select('*')
      .eq('client_id', referralPayee.id)
      .eq('entity_type', 'referral_partner')
      .eq('is_active', true)
      .single()

    // If no specific mapping exists, use the default referral fee account
    let debitAccountId: string
    let debitAccountName: string
    let vendorId: string
    let vendorName: string

    if (mapping) {
      debitAccountId = mapping.qb_debit_account_id
      debitAccountName = mapping.qb_debit_account_name
      vendorId = mapping.qb_vendor_id
      vendorName = mapping.qb_vendor_name
    } else {
      // Use default referral fee account - look up from a system config or use hardcoded default
      // In production, you'd want this to be configurable
      console.log('No specific mapping for referral partner, using default account')

      // For now, we'll require a mapping
      return new Response(
        JSON.stringify({
          error: `No QuickBooks commission mapping configured for referral partner: ${referralPayee.client_name}. Please set up the mapping in Settings.`,
          clientId: referralPayee.id,
          clientName: referralPayee.client_name
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // BOR requires a credit account (BOR Referral Income) to recognize the kept fee.
    // Validate before creating the Bill so we never leave a Bill without its income JE.
    if (isBor && borFee > 0 && !mapping?.qb_credit_account_id) {
      return new Response(
        JSON.stringify({
          error: 'No BOR Referral Income account configured',
          message: `Set the Credit Account (BOR Referral Income) on the commission mapping for ${referralPayee.client_name}.`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const transactionDate = paidDate || payment.sf_payment_date_actual || new Date().toISOString().split('T')[0]

    // Build description
    const description = isBor
      ? `BOR pass-through for ${deal?.deal_name || 'Deal'} - ${payment.payment_name || 'Payment'}`
      : `Referral fee for ${deal?.deal_name || 'Deal'} - ${payment.payment_name || 'Payment'}`

    // Ensure vendor exists in QBO
    if (!vendorId) {
      const vendor = await findOrCreateVendor(
        connection,
        vendorName || referralPayee.client_name,
        {
          companyName: referralPayee.client_name
        }
      )
      vendorId = vendor.Id
      vendorName = vendor.DisplayName

      // Update the client with the vendor ID for future use
      await supabaseClient
        .from('client')
        .update({ qb_vendor_id: vendorId, qb_vendor_name: vendorName })
        .eq('id', referralPayee.id)

      // Also update the mapping if it exists
      if (mapping) {
        await supabaseClient
          .from('qb_commission_mapping')
          .update({ qb_vendor_id: vendorId, qb_vendor_name: vendorName })
          .eq('id', mapping.id)
      }
    }

    // Create the Bill
    const billLine: QBBillLine = {
      Amount: referralAmount,
      DetailType: 'AccountBasedExpenseLineDetail',
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: debitAccountId, name: debitAccountName }
      },
      Description: description
    }

    const bill: QBBill = {
      VendorRef: { value: vendorId, name: vendorName },
      Line: [billLine],
      TxnDate: transactionDate,
      PrivateNote: `OVIS Referral Fee - Payment: ${paymentId}, Deal: ${deal?.id}`
    }

    const result = await createBill(connection, bill)

    // Log sync
    await logSync(
      supabaseClient,
      'bill',
      'outbound',
      'success',
      paymentId,
      'payment_referral',
      result.Id
    )

    // BOR: recognize the retained BOR Fee as income via a journal entry.
    //   Dr clearing liability (draw down the held pass-through) / Cr BOR Referral Income
    let jeResult: { Id: string; DocNumber?: string } | null = null
    if (isBor && borFee > 0 && mapping?.qb_credit_account_id) {
      const journalEntry: QBJournalEntry = {
        TxnDate: transactionDate,
        PrivateNote: `OVIS BOR Fee income - Payment: ${paymentId}, Deal: ${deal?.id}`,
        Line: [
          {
            Amount: borFee,
            DetailType: 'JournalEntryLineDetail',
            JournalEntryLineDetail: {
              PostingType: 'Debit',
              AccountRef: { value: debitAccountId, name: debitAccountName }
            },
            Description: `BOR Fee retained - ${deal?.deal_name || 'Deal'}`
          },
          {
            Amount: borFee,
            DetailType: 'JournalEntryLineDetail',
            JournalEntryLineDetail: {
              PostingType: 'Credit',
              AccountRef: { value: mapping.qb_credit_account_id, name: mapping.qb_credit_account_name }
            },
            Description: `BOR Referral Income - ${deal?.deal_name || 'Deal'}`
          }
        ]
      }
      jeResult = await createJournalEntry(connection, journalEntry)
      await logSync(
        supabaseClient,
        'journal_entry',
        'outbound',
        'success',
        paymentId,
        'payment_bor_income',
        jeResult.Id
      )

      // Record the JE so it can be voided when "Paid" is unchecked
      await supabaseClient
        .from('qb_commission_entry')
        .insert({
          payment_id: paymentId,  // referral/BOR entries key off the payment
          commission_mapping_id: mapping?.id || null,
          qb_entity_type: 'JournalEntry',
          qb_entity_id: jeResult.Id,
          qb_doc_number: jeResult.DocNumber,
          amount: borFee,
          transaction_date: transactionDate,
          status: 'created',
          created_by_id: user.id
        })
    }

    // Record the entry (using qb_commission_entry table with special handling)
    // Note: In production, you might want a separate table for referral entries
    const { error: insertError } = await supabaseClient
      .from('qb_commission_entry')
      .insert({
        payment_id: paymentId,  // referral/BOR entries key off the payment
        commission_mapping_id: mapping?.id || null,
        qb_entity_type: 'Bill',
        qb_entity_id: result.Id,
        qb_doc_number: result.DocNumber,
        amount: referralAmount,
        transaction_date: transactionDate,
        status: 'created',
        created_by_id: user.id
      })

    if (insertError) {
      console.error('Failed to record referral entry:', insertError)
    }

    // Update last_sync_at on connection
    await supabaseClient
      .from('qb_connection')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: isBor
          ? `Created BOR pass-through Bill ($${referralAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}) for ${referralPayee.client_name}${jeResult ? ` and recognized $${borFee.toLocaleString('en-US', { minimumFractionDigits: 2 })} BOR Fee as income` : ''}`
          : `Created referral fee Bill for ${referralPayee.client_name}`,
        qbEntityId: result.Id,
        qbDocNumber: result.DocNumber,
        amount: referralAmount,
        borFee: isBor ? borFee : undefined,
        journalEntryId: jeResult?.Id,
        referralPayee: referralPayee.client_name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Referral entry error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to create referral entry'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
