// Supabase Edge Function: "Refresh now" on the cash flow page (/admin/budget/forecast?tab=cash).
// 1. Snapshots QBO Bank + Credit Card balances into qb_balance_snapshot.
// 2. Reads the open balance of every OVIS-created QBO Bill into qb_commission_entry.
// Admin only. See docs/CASH_FLOW_DASHBOARD_AUDIT.md ("v1 revision").

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getQBConnection, refreshTokenIfNeeded, logSync } from '../_shared/quickbooks.ts'
import { snapshotCashBalances, refreshOvisBillBalances } from '../_shared/cash-refresh.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

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

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) return json({ error: 'Invalid token' }, 401)

    const { data: userData } = await supabase
      .from('user')
      .select('ovis_role')
      .eq('auth_user_id', user.id)
      .single()
    if (userData?.ovis_role !== 'admin') return json({ error: 'Admin access required' }, 403)

    let connection = await getQBConnection(supabase)
    if (!connection) return json({ error: 'QuickBooks is not connected. Please connect in Settings.' }, 400)
    connection = await refreshTokenIfNeeded(supabase, connection)

    const balances = await snapshotCashBalances(supabase, connection)
    const bills = await refreshOvisBillBalances(supabase, connection)

    await logSync(supabase, 'expense', 'inbound', 'success', undefined, 'cash_refresh')

    return json({ success: true, balances, bills })
  } catch (error: any) {
    console.error('Cash refresh error:', error)
    return json({ success: false, error: error.message || 'Cash refresh failed' }, 500)
  }
})
