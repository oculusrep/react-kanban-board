// QuickBooks Reconciliation Report
// Exports invoices from both OVIS and QBO for comparison

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
  EmailStatus: string
  Line: Array<{
    Description?: string
    Amount: number
  }>
}

interface OVISPayment {
  id: string
  payment_name: string
  ovis_invoice_number: string
  qb_invoice_number: string | null
  qb_invoice_id: string | null
  payment_amount: number
  payment_received: boolean
  invoice_sent: boolean
  deal_name: string
  client_name: string
  bill_to_company: string | null
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ============================================
    // 1. EXPORT OVIS PAYMENTS
    // ============================================
    console.log('Fetching OVIS payments...')

    const { data: ovisPayments, error: ovisError } = await supabase
      .from('payment')
      .select(`
        id,
        payment_name,
        orep_invoice,
        qb_invoice_number,
        qb_invoice_id,
        payment_amount,
        payment_received,
        invoice_sent,
        deal:deal_id (
          deal_name,
          bill_to_company_name,
          client:client_id (
            client_name
          )
        )
      `)
      .eq('is_active', true)
      .is('deleted_at', null)
      .or('invoice_sent.eq.true,payment_received.eq.true,orep_invoice.not.is.null')
      .order('created_at', { ascending: false })

    if (ovisError) {
      throw new Error(`Failed to fetch OVIS payments: ${ovisError.message}`)
    }

    // Transform OVIS data
    const ovisInvoices: OVISPayment[] = (ovisPayments || []).map((p: any) => ({
      id: p.id,
      payment_name: p.payment_name || '',
      ovis_invoice_number: p.orep_invoice || '',
      qb_invoice_number: p.qb_invoice_number,
      qb_invoice_id: p.qb_invoice_id,
      payment_amount: parseFloat(p.payment_amount) || 0,
      payment_received: p.payment_received || false,
      invoice_sent: p.invoice_sent || false,
      deal_name: p.deal?.deal_name || '',
      client_name: p.deal?.client?.client_name || '',
      bill_to_company: p.deal?.bill_to_company_name || null,
    }))

    console.log(`Found ${ovisInvoices.length} OVIS payments with invoices`)

    // ============================================
    // 2. EXPORT QBO INVOICES
    // ============================================
    console.log('Fetching QBO invoices...')

    let connection = await getQBConnection(supabase)
    if (!connection) {
      return new Response(
        JSON.stringify({
          error: 'No active QuickBooks connection',
          ovis_invoices: ovisInvoices,
          qbo_invoices: [],
          comparison: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Refresh token if needed
    connection = await refreshTokenIfNeeded(supabase, connection)

    // Query all invoices from QBO
    const query = `SELECT * FROM Invoice MAXRESULTS 1000`
    const qboResult = await qbApiRequest<{ QueryResponse: { Invoice?: QBOInvoice[] } }>(
      connection,
      'GET',
      `query?query=${encodeURIComponent(query)}`
    )

    const qboInvoices = qboResult.QueryResponse.Invoice || []
    console.log(`Found ${qboInvoices.length} QBO invoices`)

    // Also get all customers for name matching
    const customerQuery = `SELECT * FROM Customer MAXRESULTS 1000`
    const customerResult = await qbApiRequest<{ QueryResponse: { Customer?: Array<{ Id: string; DisplayName: string; CompanyName?: string }> } }>(
      connection,
      'GET',
      `query?query=${encodeURIComponent(customerQuery)}`
    )

    const qboCustomers = customerResult.QueryResponse.Customer || []
    console.log(`Found ${qboCustomers.length} QBO customers`)

    // ============================================
    // 3. COMPARE AND GENERATE REPORT
    // ============================================

    // Build lookup maps
    const qboByDocNumber = new Map<string, QBOInvoice>()
    const qboById = new Map<string, QBOInvoice>()
    qboInvoices.forEach(inv => {
      qboByDocNumber.set(inv.DocNumber, inv)
      qboById.set(inv.Id, inv)
    })

    const customerNameById = new Map<string, string>()
    qboCustomers.forEach(c => {
      customerNameById.set(c.Id, c.DisplayName)
    })

    // Categorize OVIS payments
    const alreadyLinked: Array<{
      ovis: OVISPayment
      qbo: QBOInvoice | null
      match_type: string
    }> = []

    const needsLinking: Array<{
      ovis: OVISPayment
      potential_qbo_matches: Array<{
        invoice: QBOInvoice
        match_reason: string
        confidence: 'high' | 'medium' | 'low'
      }>
    }> = []

    const noMatch: OVISPayment[] = []

    for (const ovisPayment of ovisInvoices) {
      // Check if already linked by qb_invoice_id
      if (ovisPayment.qb_invoice_id) {
        const qboMatch = qboById.get(ovisPayment.qb_invoice_id)
        alreadyLinked.push({
          ovis: ovisPayment,
          qbo: qboMatch || null,
          match_type: 'linked_by_id'
        })
        continue
      }

      // Check if already linked by qb_invoice_number
      if (ovisPayment.qb_invoice_number) {
        const qboMatch = qboByDocNumber.get(ovisPayment.qb_invoice_number)
        alreadyLinked.push({
          ovis: ovisPayment,
          qbo: qboMatch || null,
          match_type: 'linked_by_doc_number'
        })
        continue
      }

      // Try to find potential matches
      const potentialMatches: Array<{
        invoice: QBOInvoice
        match_reason: string
        confidence: 'high' | 'medium' | 'low'
      }> = []

      for (const qboInv of qboInvoices) {
        const qboCustomerName = qboInv.CustomerRef.name || customerNameById.get(qboInv.CustomerRef.value) || ''

        // Check amount match (within $1)
        const amountMatch = Math.abs(qboInv.TotalAmt - ovisPayment.payment_amount) < 1

        // Check customer name similarity
        const ovisClientLower = ovisPayment.client_name.toLowerCase()
        const ovisBillToLower = (ovisPayment.bill_to_company || '').toLowerCase()
        const qboCustomerLower = qboCustomerName.toLowerCase()

        const exactNameMatch = qboCustomerLower === ovisClientLower || qboCustomerLower === ovisBillToLower
        const partialNameMatch =
          qboCustomerLower.includes(ovisClientLower.split(' ')[0]) ||
          ovisClientLower.includes(qboCustomerLower.split(' ')[0]) ||
          (ovisBillToLower && qboCustomerLower.includes(ovisBillToLower.split(' ')[0]))

        // Check OVIS invoice number in QBO DocNumber
        const docNumberMatch = ovisPayment.ovis_invoice_number &&
          qboInv.DocNumber === ovisPayment.ovis_invoice_number

        // Score the match
        if (docNumberMatch && amountMatch) {
          potentialMatches.push({
            invoice: qboInv,
            match_reason: `DocNumber "${qboInv.DocNumber}" matches OVIS invoice, amount matches`,
            confidence: 'high'
          })
        } else if (amountMatch && exactNameMatch) {
          potentialMatches.push({
            invoice: qboInv,
            match_reason: `Amount matches ($${qboInv.TotalAmt}), customer "${qboCustomerName}" exact match`,
            confidence: 'high'
          })
        } else if (amountMatch && partialNameMatch) {
          potentialMatches.push({
            invoice: qboInv,
            match_reason: `Amount matches ($${qboInv.TotalAmt}), customer "${qboCustomerName}" partial match`,
            confidence: 'medium'
          })
        } else if (exactNameMatch && !amountMatch) {
          potentialMatches.push({
            invoice: qboInv,
            match_reason: `Customer "${qboCustomerName}" exact match, amount differs (QBO: $${qboInv.TotalAmt}, OVIS: $${ovisPayment.payment_amount})`,
            confidence: 'low'
          })
        }
      }

      if (potentialMatches.length > 0) {
        // Sort by confidence
        potentialMatches.sort((a, b) => {
          const order = { high: 0, medium: 1, low: 2 }
          return order[a.confidence] - order[b.confidence]
        })
        needsLinking.push({
          ovis: ovisPayment,
          potential_qbo_matches: potentialMatches.slice(0, 5) // Top 5 matches
        })
      } else {
        noMatch.push(ovisPayment)
      }
    }

    // Find QBO invoices not in OVIS
    const linkedQboIds = new Set<string>()
    alreadyLinked.forEach(item => {
      if (item.qbo) linkedQboIds.add(item.qbo.Id)
    })
    needsLinking.forEach(item => {
      item.potential_qbo_matches.forEach(m => linkedQboIds.add(m.invoice.Id))
    })

    const qboOnlyInvoices = qboInvoices.filter(inv => !linkedQboIds.has(inv.Id))

    // ============================================
    // 4. BUILD REPORT
    // ============================================
    const report = {
      generated_at: new Date().toISOString(),
      summary: {
        ovis_total: ovisInvoices.length,
        qbo_total: qboInvoices.length,
        already_linked: alreadyLinked.length,
        needs_linking: needsLinking.length,
        no_match_in_qbo: noMatch.length,
        qbo_only: qboOnlyInvoices.length,
      },
      already_linked: alreadyLinked.map(item => ({
        ovis_id: item.ovis.id,
        ovis_invoice: item.ovis.ovis_invoice_number,
        ovis_amount: item.ovis.payment_amount,
        ovis_client: item.ovis.client_name,
        ovis_deal: item.ovis.deal_name,
        qbo_id: item.qbo?.Id,
        qbo_doc_number: item.qbo?.DocNumber,
        qbo_amount: item.qbo?.TotalAmt,
        qbo_customer: item.qbo?.CustomerRef.name,
        qbo_balance: item.qbo?.Balance,
        match_type: item.match_type,
      })),
      needs_linking: needsLinking.map(item => ({
        ovis_id: item.ovis.id,
        ovis_invoice: item.ovis.ovis_invoice_number,
        ovis_amount: item.ovis.payment_amount,
        ovis_client: item.ovis.client_name,
        ovis_deal: item.ovis.deal_name,
        ovis_received: item.ovis.payment_received,
        potential_matches: item.potential_qbo_matches.map(m => ({
          qbo_id: m.invoice.Id,
          qbo_doc_number: m.invoice.DocNumber,
          qbo_amount: m.invoice.TotalAmt,
          qbo_customer: m.invoice.CustomerRef.name,
          qbo_balance: m.invoice.Balance,
          qbo_date: m.invoice.TxnDate,
          match_reason: m.match_reason,
          confidence: m.confidence,
        }))
      })),
      no_match_in_qbo: noMatch.map(item => ({
        ovis_id: item.id,
        ovis_invoice: item.ovis_invoice_number,
        ovis_amount: item.payment_amount,
        ovis_client: item.client_name,
        ovis_deal: item.deal_name,
        ovis_received: item.payment_received,
        ovis_sent: item.invoice_sent,
      })),
      qbo_only: qboOnlyInvoices.map(inv => ({
        qbo_id: inv.Id,
        qbo_doc_number: inv.DocNumber,
        qbo_amount: inv.TotalAmt,
        qbo_customer: inv.CustomerRef.name,
        qbo_balance: inv.Balance,
        qbo_date: inv.TxnDate,
        qbo_status: inv.Balance === 0 ? 'Paid' : 'Open',
      })),
      customer_name_differences: [] as Array<{
        ovis_client: string
        qbo_customer: string
        suggestion: string
      }>,
    }

    // Identify customer name differences that might need updating in QBO
    const uniqueNameMismatches = new Map<string, { ovis: string; qbo: string }>()
    needsLinking.forEach(item => {
      item.potential_qbo_matches.forEach(match => {
        if (match.confidence === 'high' || match.confidence === 'medium') {
          const qboName = match.invoice.CustomerRef.name
          const ovisName = item.ovis.client_name
          if (qboName !== ovisName && !uniqueNameMismatches.has(ovisName)) {
            uniqueNameMismatches.set(ovisName, { ovis: ovisName, qbo: qboName })
          }
        }
      })
    })

    report.customer_name_differences = Array.from(uniqueNameMismatches.values()).map(item => ({
      ovis_client: item.ovis,
      qbo_customer: item.qbo,
      suggestion: `Update QBO customer "${item.qbo}" to "${item.ovis}" to match OVIS`
    }))

    return new Response(
      JSON.stringify(report, null, 2),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="qbo-ovis-reconciliation.json"'
        }
      }
    )

  } catch (error) {
    console.error('Reconciliation error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
