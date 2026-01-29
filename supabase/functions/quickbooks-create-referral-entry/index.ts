import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  findOrCreateVendor,
  createBill,
  logSync,
  QBBill,
  QBBillLine
} from '../_shared/quickbooks.ts'

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
        payment_date_estimated,
        sf_payment_date_actual,
        deal:deal_id (
          id,
          deal_name,
          referral_fee_percent,
          referral_fee_usd,
          referral_payee_client_id,
          referral_payee:referral_payee_client_id (
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
    const referralPayee = deal?.referral_payee as any

    if (!referralPayee) {
      return new Response(
        JSON.stringify({
          error: 'No referral payee set on this deal',
          message: 'This payment does not have a referral fee to pay out'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Calculate the referral fee for this specific payment
    // If the deal has multiple payments, the referral fee should be proportional
    const dealReferralFeeUsd = Number(deal.referral_fee_usd) || 0
    const paymentAmount = Number(payment.payment_amount) || 0

    // For simplicity, we'll calculate the referral fee as a proportion of this payment
    // based on the deal's referral fee percentage
    const referralFeePercent = Number(deal.referral_fee_percent) || 0
    const referralAmount = paymentAmount * (referralFeePercent / 100)

    if (referralAmount <= 0) {
      return new Response(
        JSON.stringify({
          error: 'Referral fee amount is 0',
          message: 'No referral fee to pay for this payment'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Check if we already have a commission entry for this payment + referral
    // We use a composite check since referral entries are tied to payments, not payment_splits
    const { data: existingEntry } = await supabaseClient
      .from('qb_commission_entry')
      .select('id, qb_entity_id, qb_entity_type')
      .eq('payment_split_id', paymentId)  // Using payment_split_id field to store payment_id for referrals
      .neq('status', 'voided')
      .single()

    // Note: This is a workaround. In a production system, you'd want a separate
    // qb_referral_entry table or add a field to distinguish referral entries.
    // For now, we'll check for entries linked to this deal's referral payee.

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

    const transactionDate = paidDate || payment.sf_payment_date_actual || new Date().toISOString().split('T')[0]

    // Build description
    const description = `Referral fee for ${deal?.deal_name || 'Deal'} - ${payment.payment_name || 'Payment'}`

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

    // Record the entry (using qb_commission_entry table with special handling)
    // Note: In production, you might want a separate table for referral entries
    const { error: insertError } = await supabaseClient
      .from('qb_commission_entry')
      .insert({
        payment_split_id: paymentId,  // Re-using this field for payment_id
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
        message: `Created referral fee Bill for ${referralPayee.client_name}`,
        qbEntityId: result.Id,
        qbDocNumber: result.DocNumber,
        amount: referralAmount,
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
