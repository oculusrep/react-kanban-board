// Supabase Edge Function: void the QBO invoice of a written-off payment.
// Admin only. Mike confirms each one in the UI — this is never called automatically.
// Voids (QBO keeps the invoice, zeroed); never deletes. The payment row is never deleted either.
// See docs/CASH_FLOW_DASHBOARD_AUDIT.md ("Payment write-off").
// QBO API: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice#void-an-invoice

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getQBConnection, refreshTokenIfNeeded, getInvoice, voidInvoice, logSync } from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user) return json({ error: 'Invalid token' }, 401)
    const { data: userData } = await supabase.from('user').select('ovis_role').eq('auth_user_id', user.id).single()
    if (userData?.ovis_role !== 'admin') return json({ error: 'Admin access required' }, 403)

    const { paymentId } = await req.json() as { paymentId?: string }
    if (!paymentId) return json({ error: 'paymentId is required' }, 400)

    const { data: payment, error: payErr } = await supabase
      .from('payment')
      .select('id, payment_name, qb_invoice_id, qb_invoice_number, written_off_at, qb_invoice_voided_at, payment_received')
      .eq('id', paymentId)
      .single()
    if (payErr || !payment) return json({ error: 'Payment not found' }, 404)
    if (!payment.qb_invoice_id) return json({ error: 'This payment has no QBO invoice' }, 400)
    if (!payment.written_off_at) return json({ error: 'Write the payment off before voiding its invoice' }, 400)
    if (payment.payment_received) return json({ error: 'Payment is marked received — not voiding' }, 400)
    if (payment.qb_invoice_voided_at) return json({ success: true, alreadyVoided: true })

    let connection = await getQBConnection(supabase)
    if (!connection) return json({ error: 'QuickBooks is not connected. Please connect in Settings.' }, 400)
    connection = await refreshTokenIfNeeded(supabase, connection)

    const invoice = await getInvoice(connection, payment.qb_invoice_id)
    await voidInvoice(connection, invoice.Id, invoice.SyncToken)

    const { error: updErr } = await supabase
      .from('payment')
      .update({ qb_invoice_voided_at: new Date().toISOString(), qb_invoice_voided_by: user.id, qb_sync_status: 'voided' })
      .eq('id', paymentId)
    if (updErr) throw new Error(`Invoice voided in QBO but OVIS update failed: ${updErr.message}`)

    await logSync(supabase, 'invoice', 'outbound', 'success', paymentId, 'payment_write_off_void', invoice.Id)
    return json({ success: true, invoiceId: invoice.Id, docNumber: payment.qb_invoice_number ?? invoice.DocNumber ?? null })
  } catch (error: any) {
    console.error('Void invoice error:', error)
    return json({ success: false, error: error.message || 'Void failed' }, 500)
  }
})
