// QuickBooks Invoice Linking
// Links existing OVIS payments to QBO invoices by matching orep_invoice to QBO DocNumber
// For use during production migration - links invoices from 2025 onwards

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  qbApiRequest,
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface QBOInvoice {
  Id: string
  DocNumber: string
  CustomerRef: { value: string; name: string }
  TotalAmt: number
  Balance: number
  DueDate: string
  TxnDate: string
}

interface LinkResult {
  ovis_id: string
  ovis_invoice: string
  ovis_amount: number
  ovis_client: string
  qbo_id: string
  qbo_doc_number: string
  qbo_amount: number
  qbo_customer: string
  status: 'linked' | 'already_linked' | 'amount_mismatch' | 'not_found'
  note?: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body for options
    let dryRun = true // Default to dry run for safety
    let minInvoiceNumber = 1662
    let maxInvoiceNumber = 1774

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body.dryRun !== undefined) dryRun = body.dryRun
        if (body.minInvoiceNumber) minInvoiceNumber = body.minInvoiceNumber
        if (body.maxInvoiceNumber) maxInvoiceNumber = body.maxInvoiceNumber
      } catch {
        // Use defaults
      }
    }

    // Get Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ============================================
    // 1. FETCH QBO INVOICES (2025+)
    // ============================================
    console.log('Fetching QBO invoices from 2025...')

    let connection = await getQBConnection(supabase)
    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'No active QuickBooks connection' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Refresh token if needed
    connection = await refreshTokenIfNeeded(supabase, connection)

    // Query invoices from 2025 onwards
    const query = `SELECT * FROM Invoice WHERE TxnDate >= '2025-01-01' MAXRESULTS 1000`
    const qboResult = await qbApiRequest<{ QueryResponse: { Invoice?: QBOInvoice[] } }>(
      connection,
      'GET',
      `query?query=${encodeURIComponent(query)}`
    )

    const qboInvoices = qboResult.QueryResponse.Invoice || []
    console.log(`Found ${qboInvoices.length} QBO invoices from 2025`)

    // Build lookup by DocNumber
    const qboByDocNumber = new Map<string, QBOInvoice>()
    qboInvoices.forEach(inv => {
      qboByDocNumber.set(inv.DocNumber, inv)
    })

    // ============================================
    // 2. FETCH OVIS PAYMENTS WITH INVOICE NUMBERS
    // ============================================
    console.log('Fetching OVIS payments with orep_invoice...')

    // Get payments that have orep_invoice but NOT already linked to QBO
    const { data: ovisPayments, error: ovisError } = await supabase
      .from('payment')
      .select(`
        id,
        payment_name,
        orep_invoice,
        qb_invoice_number,
        qb_invoice_id,
        payment_amount,
        deal:deal_id (
          deal_name,
          client:client_id (
            client_name
          )
        )
      `)
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('orep_invoice', 'is', null)
      .order('orep_invoice', { ascending: true })

    if (ovisError) {
      throw new Error(`Failed to fetch OVIS payments: ${ovisError.message}`)
    }

    console.log(`Found ${ovisPayments?.length || 0} OVIS payments with orep_invoice`)

    // ============================================
    // 3. MATCH AND LINK
    // ============================================
    const results: LinkResult[] = []
    const toUpdate: Array<{ id: string; qb_invoice_id: string; qb_invoice_number: string }> = []

    for (const payment of ovisPayments || []) {
      const ovisInvoice = payment.orep_invoice?.trim()
      if (!ovisInvoice) continue

      // Check if invoice number is in our target range
      const invoiceNum = parseInt(ovisInvoice, 10)
      if (isNaN(invoiceNum) || invoiceNum < minInvoiceNumber || invoiceNum > maxInvoiceNumber) {
        continue // Skip invoices outside our range
      }

      const deal = payment.deal as any
      const clientName = deal?.client?.client_name || ''
      const ovisAmount = parseFloat(payment.payment_amount) || 0

      // Check if already linked
      if (payment.qb_invoice_id) {
        results.push({
          ovis_id: payment.id,
          ovis_invoice: ovisInvoice,
          ovis_amount: ovisAmount,
          ovis_client: clientName,
          qbo_id: payment.qb_invoice_id,
          qbo_doc_number: payment.qb_invoice_number || '',
          qbo_amount: 0,
          qbo_customer: '',
          status: 'already_linked',
          note: 'Already linked via qb_invoice_id'
        })
        continue
      }

      // Try to find matching QBO invoice by DocNumber
      const qboMatch = qboByDocNumber.get(ovisInvoice)

      if (!qboMatch) {
        results.push({
          ovis_id: payment.id,
          ovis_invoice: ovisInvoice,
          ovis_amount: ovisAmount,
          ovis_client: clientName,
          qbo_id: '',
          qbo_doc_number: '',
          qbo_amount: 0,
          qbo_customer: '',
          status: 'not_found',
          note: `No QBO invoice with DocNumber "${ovisInvoice}" found`
        })
        continue
      }

      // Check if amounts match (within $1)
      const amountDiff = Math.abs(qboMatch.TotalAmt - ovisAmount)
      if (amountDiff > 1) {
        results.push({
          ovis_id: payment.id,
          ovis_invoice: ovisInvoice,
          ovis_amount: ovisAmount,
          ovis_client: clientName,
          qbo_id: qboMatch.Id,
          qbo_doc_number: qboMatch.DocNumber,
          qbo_amount: qboMatch.TotalAmt,
          qbo_customer: qboMatch.CustomerRef.name,
          status: 'amount_mismatch',
          note: `Amount differs by $${amountDiff.toFixed(2)} (OVIS: $${ovisAmount}, QBO: $${qboMatch.TotalAmt})`
        })
        continue
      }

      // Match found!
      results.push({
        ovis_id: payment.id,
        ovis_invoice: ovisInvoice,
        ovis_amount: ovisAmount,
        ovis_client: clientName,
        qbo_id: qboMatch.Id,
        qbo_doc_number: qboMatch.DocNumber,
        qbo_amount: qboMatch.TotalAmt,
        qbo_customer: qboMatch.CustomerRef.name,
        status: 'linked'
      })

      toUpdate.push({
        id: payment.id,
        qb_invoice_id: qboMatch.Id,
        qb_invoice_number: qboMatch.DocNumber
      })
    }

    // ============================================
    // 4. UPDATE DATABASE (if not dry run)
    // ============================================
    let updatedCount = 0
    if (!dryRun && toUpdate.length > 0) {
      console.log(`Updating ${toUpdate.length} payments in database...`)

      for (const update of toUpdate) {
        const { error: updateError } = await supabase
          .from('payment')
          .update({
            qb_invoice_id: update.qb_invoice_id,
            qb_invoice_number: update.qb_invoice_number,
            qb_sync_status: 'synced',
            qb_last_sync: new Date().toISOString()
          })
          .eq('id', update.id)

        if (updateError) {
          console.error(`Failed to update payment ${update.id}:`, updateError)
        } else {
          updatedCount++
        }
      }
    }

    // ============================================
    // 5. BUILD REPORT
    // ============================================
    const summary = {
      qbo_invoices_2025: qboInvoices.length,
      ovis_payments_with_invoice: ovisPayments?.length || 0,
      in_target_range: results.length,
      already_linked: results.filter(r => r.status === 'already_linked').length,
      to_link: results.filter(r => r.status === 'linked').length,
      not_found: results.filter(r => r.status === 'not_found').length,
      amount_mismatch: results.filter(r => r.status === 'amount_mismatch').length,
      dry_run: dryRun,
      updated_count: updatedCount
    }

    const report = {
      generated_at: new Date().toISOString(),
      config: {
        dry_run: dryRun,
        min_invoice_number: minInvoiceNumber,
        max_invoice_number: maxInvoiceNumber
      },
      summary,
      results: results.sort((a, b) => {
        // Sort by invoice number
        const aNum = parseInt(a.ovis_invoice, 10) || 0
        const bNum = parseInt(b.ovis_invoice, 10) || 0
        return aNum - bNum
      }),
      // Group by status for easier review
      by_status: {
        linked: results.filter(r => r.status === 'linked'),
        already_linked: results.filter(r => r.status === 'already_linked'),
        not_found: results.filter(r => r.status === 'not_found'),
        amount_mismatch: results.filter(r => r.status === 'amount_mismatch')
      }
    }

    return new Response(
      JSON.stringify(report, null, 2),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )

  } catch (error) {
    console.error('Linking error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
