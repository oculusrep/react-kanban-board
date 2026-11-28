/**
 * get_cash_position (read-only) — the OVIS cash model for Claude.
 * Runs the same shared code as the Cash tab: supabase/functions/_shared/cashflow/.
 * Admin-only: an OAuth caller must pass public.is_admin() (checked AS the caller); the static token
 * acts for the owner. See docs/CASH_FLOW_DASHBOARD_AUDIT.md (v1.6 item 7).
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { loadCashData } from '../_shared/cashflow/data.ts';
import { todayET } from '../_shared/cashflow/calendar.ts';
import { getCashPosition } from '../_shared/cashflow/position.ts';

export const CASH_TOOLS = [
  {
    name: 'get_cash_position',
    description:
      "Read-only snapshot of Oculus's cash position from OVIS (same numbers as the Cash tab / planner). Returns: Operating balance today and after entered future items; the 45-day calendar (low point, date it first drops below the cushion, events, with scheduled payments already entered in QBO flagged); the 12-month projection for committed (deals ≥90%) and with-pipeline (probability-weighted) scenarios — per-month ending cash, LOC draws/paydowns, owner take-home, steady flat monthly owner pay (and the month it could start if $0 now), and each LOC draw with the inflow that repays it; LOC available and loan payoff date; money owed out (referral fees, Arty/Greg splits, open QBO split Bills, with days held); Arty's advance balance; past-due expected payments; cushion; placeholder tax reserve. All dates are Eastern; amounts in dollars. Admin only.",
    inputSchema: { type: 'object', properties: {} },
  },
] as const;

type Caller = { kind: 'static' } | { kind: 'user'; authUserId: string; bearer: string };

export async function toolGetCashPosition(
  _args: unknown,
  caller: Caller,
  service: SupabaseClient,
  supabaseUrl: string,
  anonKey: string,
  fail: (msg: string) => Error,
) {
  if (caller.kind === 'user') {
    const asUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${caller.bearer}` } },
      auth: { persistSession: false },
    });
    const { data: admin, error } = await asUser.rpc('is_admin');
    if (error || admin !== true) throw fail('get_cash_position is admin-only.');
  }
  const data = await loadCashData(service);
  return getCashPosition(data, todayET());
}
