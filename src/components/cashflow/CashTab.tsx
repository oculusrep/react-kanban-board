import { Fragment, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import DealDetailsSlideout from '../DealDetailsSlideout';
import { CASH_CONFIG, CashEventKind, buildCalendar, todayET } from '../../lib/cashCalendar';
import { useCashData } from './useCashData';
import { buildCashEvents, fmt } from './cashEvents';
import { ScheduledPaymentsEditor } from './ScheduledPaymentsEditor';
import { NeedsAttentionPanel } from './NeedsAttentionPanel';
import { PastDueCleanup } from './PastDueCleanup';

const KIND_LABEL: Record<CashEventKind, string> = {
  scheduled: 'Scheduled',
  draw: 'Draw',
  referral_owed: 'Referral owed',
  split_owed: 'Split owed',
  split_bill: 'Open QBO Bill',
  commission: 'Commission',
};

function formatDay(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function formatET(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' ET';
}

/**
 * Cash tab on /admin/budget/forecast (?tab=cash). v1 per docs/CASH_FLOW_DASHBOARD_AUDIT.md.
 */
export default function CashTab() {
  const { data, loading, error, reload } = useCashData();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [slideoutDealId, setSlideoutDealId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const today = todayET();

  const summary = useMemo(() => (data ? buildCashEvents(data, today) : null), [data, today]);
  const calendar = useMemo(
    () => (summary ? buildCalendar(summary.startBalance, today, summary.events) : null),
    [summary, today]
  );

  const refreshNow = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    const { data: res, error: fnErr } = await supabase.functions.invoke('quickbooks-cash-refresh', { body: {} });
    setRefreshing(false);
    if (fnErr || !res?.success) {
      let msg = fnErr?.message || res?.error || 'Refresh failed';
      try {
        const body = await (fnErr as any)?.context?.json?.();
        if (body?.error) msg = body.error;
      } catch { /* ignore */ }
      setRefreshMsg({ ok: false, text: msg });
      return;
    }
    const linked = res.balances?.amexLinked ? ` AMEX linked to ${res.balances.amexLinked}.` : '';
    setRefreshMsg({
      ok: true,
      text: `Saved ${res.balances?.saved ?? 0} QBO balances; checked ${res.bills?.checked ?? 0} OVIS Bills (${res.bills?.open ?? 0} open).${linked}`,
    });
    reload();
  };

  const toggle = (d: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(d)) n.delete(d); else n.add(d);
      return n;
    });

  if (loading && !data) return <div className="p-6 text-sm text-gray-500">Loading cash data…</div>;
  if (error) return <div className="p-4 rounded bg-red-50 text-red-700 text-sm">{error}</div>;
  if (!data || !summary || !calendar) return null;

  const creditCards = data.balances.filter((b) => b.account_type === 'Credit Card');
  const nc = summary.notCounted;

  return (
    <div className="space-y-6">
      {/* Balances */}
      <div className="bg-white rounded-lg shadow border-l-4" style={{ borderColor: '#002147' }}>
        <div className="px-6 py-5 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#4A6B94' }}>QBO bank balance (book)</p>
            <p className="text-4xl font-bold mt-1" style={{ color: '#002147' }}>
              {data.balancesFetchedAt ? fmt(summary.startBalance) : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {data.balancesFetchedAt
                ? `As of ${formatET(data.balancesFetchedAt)}`
                : 'No QBO balances saved yet. Reconnect QuickBooks, then Refresh now.'}
            </p>
            {summary.bankAccounts.length > 1 && (
              <ul className="mt-2 text-xs text-gray-600 space-y-0.5">
                {summary.bankAccounts.map((b) => <li key={b.name}>{b.name}: {fmt(b.balance)}</li>)}
              </ul>
            )}
            {creditCards.length > 0 && (
              <ul className="mt-2 text-xs text-gray-600 space-y-0.5">
                {creditCards.map((c) => (
                  <li key={c.qb_account_id}>{c.fully_qualified_name || c.name} (card owed): {fmt(Math.abs(Number(c.current_balance)))}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="md:text-right">
            <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#4A6B94' }}>
              Lowest point, next {CASH_CONFIG.CALENDAR_DAYS} days
            </p>
            <p className="text-3xl font-bold mt-1" style={{ color: calendar.lowest && calendar.lowest.balance < 0 ? '#A27B5C' : '#002147' }}>
              {calendar.lowest ? fmt(calendar.lowest.balance) : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">{calendar.lowest ? `on ${formatDay(calendar.lowest.date)}` : ''}</p>
            <button
              onClick={refreshNow}
              disabled={refreshing}
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#002147' }}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh now'}
            </button>
          </div>
        </div>
        {refreshMsg && (
          <div className={`mx-6 mb-4 p-2 text-sm rounded ${refreshMsg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
            {refreshMsg.text}
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b" style={{ borderColor: '#8FA9C8' }}>
          <h3 className="font-semibold" style={{ color: '#002147' }}>{CASH_CONFIG.CALENDAR_DAYS}-day cash calendar</h3>
          <p className="text-xs text-gray-500">
            Start = QBO bank book balance. Out: scheduled payments, draws, referral fees and broker splits owed, open
            broker-split Bills. In: commissions on deals ≥ {CASH_CONFIG.COMMITTED_PROBABILITY_MIN}% probability, net of
            referral and other brokers' splits, on their estimated date. Click a day for detail.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead style={{ backgroundColor: '#F8FAFC' }}>
              <tr className="text-xs uppercase tracking-wide" style={{ color: '#4A6B94' }}>
                <th className="px-3 py-2 text-left">Day</th>
                <th className="px-3 py-2 text-right">In</th>
                <th className="px-3 py-2 text-right">Out</th>
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {calendar.days.map((d) => {
                const isLowest = calendar.lowest?.date === d.date;
                const has = d.events.length > 0;
                return (
                  <Fragment key={d.date}>
                    <tr
                      onClick={() => has && toggle(d.date)}
                      className={`border-t ${has ? 'cursor-pointer hover:bg-gray-50' : 'text-gray-400'}`}
                      style={isLowest ? { outline: '2px solid #A27B5C', outlineOffset: '-2px' } : undefined}
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {formatDay(d.date)}
                        {isLowest && <span className="ml-2 text-xs font-semibold" style={{ color: '#A27B5C' }}>lowest</span>}
                        {has && <span className="ml-2 text-xs text-gray-400">{d.events.length}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right" style={{ color: d.inflow ? '#4A6B94' : undefined }}>{d.inflow ? fmt(d.inflow) : ''}</td>
                      <td className="px-3 py-1.5 text-right">{d.outflow ? fmt(d.outflow) : ''}</td>
                      <td className="px-3 py-1.5 text-right font-medium" style={{ color: d.balance < 0 ? '#A27B5C' : '#002147' }}>{fmt(d.balance)}</td>
                    </tr>
                    {expanded.has(d.date) && d.events.map((e, i) => (
                      <tr key={i} className="text-xs" style={{ backgroundColor: '#F8FAFC' }}>
                        <td className="pl-8 pr-3 py-1" colSpan={3}>
                          <span className="inline-block w-24 text-gray-500">{KIND_LABEL[e.kind]}</span>
                          {e.dealId ? (
                            <button onClick={() => setSlideoutDealId(e.dealId!)} className="hover:underline text-left" style={{ color: '#002147' }}>{e.label}</button>
                          ) : (
                            <span style={{ color: '#002147' }}>{e.label}</span>
                          )}
                          {e.detail && <span className="ml-2 text-gray-500">{e.detail}</span>}
                          {e.warning && <span className="ml-2" style={{ color: '#A27B5C' }}>⚠ {e.warning}</span>}
                        </td>
                        <td className="px-3 py-1 text-right" style={{ color: e.amount >= 0 ? '#4A6B94' : undefined }}>{fmt(e.amount)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t text-xs text-gray-600 space-y-1" style={{ borderColor: '#8FA9C8' }}>
          <p className="font-semibold" style={{ color: '#4A6B94' }}>Not counted</p>
          <p>{nc.pastDueCommitted.count} past-due payments on ≥{CASH_CONFIG.COMMITTED_PROBABILITY_MIN}% deals ({fmt(nc.pastDueCommitted.total)} net) — give them real dates in Past-due cleanup.</p>
          <p>{nc.belowThreshold.count} payments due in the window on deals below {CASH_CONFIG.COMMITTED_PROBABILITY_MIN}% ({fmt(nc.belowThreshold.total)} net possible upside).</p>
          <p>
            {nc.legacyReferral} referral fees and {nc.legacySplit} broker splits flagged unpaid on payments received more than{' '}
            {CASH_CONFIG.OWED_LOOKBACK_DAYS} days ago (legacy data; not treated as owed).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NeedsAttentionPanel data={data} today={today} onOpenDeal={setSlideoutDealId} />
        <ScheduledPaymentsEditor rows={data.scheduled} accounts={data.balances} onChanged={reload} />
      </div>

      <PastDueCleanup data={data} today={today} onOpenDeal={setSlideoutDealId} onChanged={reload} />

      <DealDetailsSlideout
        dealId={slideoutDealId}
        isOpen={!!slideoutDealId}
        onClose={() => setSlideoutDealId(null)}
        onDealUpdated={reload}
      />
    </div>
  );
}
