// Cash flow dashboard v1 — QBO reads that feed /admin/budget/forecast?tab=cash.
// See docs/CASH_FLOW_DASHBOARD_AUDIT.md ("v1 revision").
//
// QBO API references:
//  Account (CurrentBalance): https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account
//  Bill (Balance — 0 once paid): https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/bill

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { QBConnection, qbApiRequest } from './quickbooks.ts'

interface QBBalanceAccount {
  Id: string
  Name: string
  FullyQualifiedName?: string
  AccountType: string
  AccountSubType?: string
  Active: boolean
  CurrentBalance?: number
}

const AMEX_NAME = /amex|american express/i

/**
 * Fetch all active Bank and Credit Card accounts with their current balance and append one
 * qb_balance_snapshot row per account. Also links the seeded "AMEX" scheduled payment to the
 * QBO AMEX account the first time one is found.
 */
export async function snapshotCashBalances(
  supabase: SupabaseClient,
  connection: QBConnection
): Promise<{ saved: number; fetchedAt: string; amexLinked: string | null }> {
  const query = `SELECT * FROM Account WHERE Active = true AND AccountType IN ('Bank', 'Credit Card') MAXRESULTS 1000`
  const result = await qbApiRequest<{ QueryResponse: { Account?: QBBalanceAccount[] } }>(
    connection,
    'GET',
    `query?query=${encodeURIComponent(query)}`
  )
  const accounts = result.QueryResponse.Account || []
  const fetchedAt = new Date().toISOString()

  if (accounts.length > 0) {
    const { error } = await supabase.from('qb_balance_snapshot').insert(
      accounts.map((a) => ({
        qb_account_id: a.Id,
        name: a.Name,
        fully_qualified_name: a.FullyQualifiedName || null,
        account_type: a.AccountType,
        account_sub_type: a.AccountSubType || null,
        current_balance: a.CurrentBalance ?? 0,
        fetched_at: fetchedAt,
      }))
    )
    if (error) throw new Error(`Failed to save balance snapshot: ${error.message}`)
  }

  // Link the seeded AMEX scheduled payment (no account, no manual amount yet).
  let amexLinked: string | null = null
  const amex = accounts.find(
    (a) => a.AccountType === 'Credit Card' && AMEX_NAME.test(a.FullyQualifiedName || a.Name)
  )
  if (amex) {
    const { data } = await supabase
      .from('scheduled_payment')
      .update({ qb_account_id: amex.Id, updated_at: fetchedAt })
      .eq('name', 'AMEX')
      .is('qb_account_id', null)
      .is('amount', null)
      .select('id')
    if (data && data.length > 0) amexLinked = amex.Name
  }

  return { saved: accounts.length, fetchedAt, amexLinked }
}

/**
 * Read the open balance of every OVIS-created QBO Bill (broker splits and referral/BOR Bills)
 * and store it on qb_commission_entry. Bills Mike has paid in QBO come back with Balance 0.
 * A Bill missing from QBO (deleted there) is recorded as 0 open.
 */
export async function refreshOvisBillBalances(
  supabase: SupabaseClient,
  connection: QBConnection
): Promise<{ checked: number; open: number }> {
  const { data: entries, error } = await supabase
    .from('qb_commission_entry')
    .select('id, qb_entity_id')
    .eq('qb_entity_type', 'Bill')
    .eq('status', 'created')
  if (error) throw new Error(`Failed to load OVIS bills: ${error.message}`)
  if (!entries || entries.length === 0) return { checked: 0, open: 0 }

  const balances = new Map<string, number>()
  const ids = [...new Set(entries.map((e) => e.qb_entity_id))]
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const q = `SELECT Id, Balance FROM Bill WHERE Id IN (${chunk.map((id) => `'${id.replace(/'/g, '')}'`).join(', ')}) MAXRESULTS 100`
    const res = await qbApiRequest<{ QueryResponse: { Bill?: { Id: string; Balance?: number }[] } }>(
      connection,
      'GET',
      `query?query=${encodeURIComponent(q)}`
    )
    for (const b of res.QueryResponse.Bill || []) balances.set(b.Id, Number(b.Balance ?? 0))
  }

  const checkedAt = new Date().toISOString()
  let open = 0
  for (const e of entries) {
    const bal = balances.get(e.qb_entity_id) ?? 0
    if (bal > 0) open++
    await supabase
      .from('qb_commission_entry')
      .update({ qb_open_balance: bal, qb_balance_checked_at: checkedAt })
      .eq('id', e.id)
  }
  return { checked: entries.length, open }
}
