import { Fragment, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '../../lib/supabaseClient';
import DealDetailsSlideout from '../DealDetailsSlideout';
import { CASH_CONFIG, CashEventKind, buildCalendar, todayET } from '../../lib/cashCalendar';
import { useCashData } from './useCashData';
import { buildCashEvents } from './cashEvents';
import { ScheduledPaymentsEditor } from './ScheduledPaymentsEditor';
import { CleanupSummary } from './CleanupScreen';
import { OwedOutPanel, owedUrgency } from './OwedOutPanel';
import { ProjectionPanel } from './ProjectionPanel';
import { CreditFacilityEditor } from './CreditFacilityEditor';
import { CF, Money, money, OutsideCf, useCfFonts } from './cfTheme';

const KIND_LABEL: Record<CashEventKind, string> = {
  scheduled: 'Scheduled',
  draw: 'Draw',
  referral_owed: 'Referral',
  split_owed: 'Split owed',
  split_bill: 'QBO Bill',
  commission: 'Commission',
  tax: 'Tax reserve',
};

function formatDay(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function shortDay(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatET(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' ET';
}

/**
 * Cash tab on /admin/budget/forecast (?tab=cash). Dark "mission control" layout (cf.css).
 * Logic per docs/CASH_FLOW_DASHBOARD_AUDIT.md.
 */
export default function CashTab() {
  useCfFonts();
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
    setRefreshMsg({
      ok: true,
      text: `Saved ${res.balances?.saved ?? 0} QBO balances and ${res.balances?.transactions ?? 0} register lines; checked ${res.bills?.checked ?? 0} OVIS Bills (${res.bills?.open ?? 0} open).`,
    });
    reload();
  };

  const toggle = (d: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(d)) n.delete(d); else n.add(d);
      return n;
    });

  if (loading && !data) return <div className="cf cf-muted p-2">Loading cash data…</div>;
  if (error) return <div className="cf p-2"><div className="cf-msg err">{error}</div></div>;
  if (!data || !summary || !calendar) return null;

  const hasBal = !!data.balancesFetchedAt;
  const cushion = data.cushion;
  const owedTotal = summary.owed.reduce((t, o) => t + o.amount, 0);
  const owedRed = summary.owed.filter((o) => owedUrgency(o.daysHeld) === 'red').length;
  const locAvailable = data.credit.filter((c) => c.active).reduce((t, c) => t + (Number(c.available) || 0), 0);
  const low = calendar.lowest;
  const firstBelow = calendar.days.find((d) => d.balance < cushion);
  const creditCards = data.balances.filter((b) => b.account_type === 'Credit Card');
  const nc = summary.notCounted;
  const chartRows = calendar.days.map((d) => ({ label: shortDay(d.date), balance: Math.round(d.balance) }));

  const kpis: { label: string; value: React.ReactNode; sub: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' }[] = [
    {
      label: 'Operating balance',
      value: hasBal ? <Money v={summary.balanceToday} /> : '—',
      sub: 'QBO register through today',
    },
    {
      label: 'Book balance',
      value: hasBal ? <Money v={summary.startBalance} /> : '—',
      sub: `After ${summary.futureTxns.length} entered future item${summary.futureTxns.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Owed out',
      value: <Money v={owedTotal} tone={owedRed ? 'bad' : 'plain'} />,
      sub: `${summary.owed.length} item${summary.owed.length === 1 ? '' : 's'}${owedRed ? ` · ${owedRed} >${CASH_CONFIG.OWED_RED_DAYS}d` : ''}`,
      tone: owedRed ? 'bad' : summary.owed.length ? 'warn' : undefined,
    },
    {
      label: `${CASH_CONFIG.CALENDAR_DAYS}-day low`,
      value: low && hasBal ? <Money v={low.balance} tone={low.balance < cushion ? 'bad' : 'plain'} /> : '—',
      sub: low ? shortDay(low.date) : '',
      tone: low && low.balance < cushion ? 'bad' : 'ok',
    },
    {
      label: 'Credit available',
      value: <Money v={locAvailable} />,
      sub: data.credit.filter((c) => c.active).map((c) => c.name).join(', ') || 'No credit lines',
    },
    {
      label: 'Cushion status',
      value: firstBelow ? <span className="cf-neg">BELOW</span> : <span className="cf-pos">CLEAR</span>,
      sub: firstBelow
        ? `Under ${money(cushion)} from ${shortDay(firstBelow.date)}`
        : `Stays ≥ ${money(cushion)} for ${CASH_CONFIG.CALENDAR_DAYS} days`,
      tone: firstBelow ? 'bad' : 'ok',
    },
  ];

  return (
    <div className="cf space-y-1.5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="cf-note">
          {hasBal ? <>QBO as of <span className="cf-num cf-strong">{formatET(data.balancesFetchedAt!)}</span></> : 'No QBO balances yet — reconnect QuickBooks, then Refresh.'}
          {summary.bankAccounts.length > 0 && <> · Calendar account: {summary.bankAccounts.map((b) => b.name).join(', ')}</>}
          {summary.otherAccounts.map((b) => (
            <span key={b.name} className="cf-faint"> · {b.name} <span className="cf-num">{money(b.balance)}</span> (info)</span>
          ))}
          {creditCards.filter((c) => Number(c.current_balance)).map((c) => (
            <span key={c.qb_account_id} className="cf-faint"> · {c.fully_qualified_name || c.name} owed <span className="cf-num">{money(Math.abs(Number(c.current_balance)))}</span></span>
          ))}
        </div>
        <button onClick={refreshNow} disabled={refreshing} className="cf-btn">
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing' : 'Refresh QBO'}
        </button>
      </div>
      {refreshMsg && <div className={`cf-msg ${refreshMsg.ok ? 'ok' : 'err'}`}>{refreshMsg.text}</div>}

      {/* KPI strip */}
      <div className="cf-kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`cf-kpi ${k.tone || ''}`}>
            <div className="cf-label">{k.label}</div>
            <div className="v">{k.value}</div>
            <div className="s">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="cf-grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* 45-day calendar */}
        <div className="cf-panel flex flex-col">
          <div className="cf-ph">
            <span className="cf-title">{CASH_CONFIG.CALENDAR_DAYS}-day cash calendar</span>
            <span className="cf-note">from book balance · click a day for detail</span>
          </div>
          <div style={{ height: 150 }} className="px-1 pt-1">
            <ResponsiveContainer>
              <LineChart data={chartRows} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CF.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: CF.muted }} tickLine={false} axisLine={{ stroke: CF.border }} interval={6} />
                <YAxis tickFormatter={(v) => `${v < 0 ? '−' : ''}${Math.round(Math.abs(v) / 1000)}k`} tick={{ fontSize: 9, fill: CF.muted, fontFamily: 'IBM Plex Mono, monospace' }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: CF.panel, border: `1px solid ${CF.border}`, borderRadius: 2, fontSize: 11 }}
                  labelStyle={{ color: CF.muted }}
                  itemStyle={{ color: CF.text, fontFamily: 'IBM Plex Mono, monospace' }}
                  formatter={(v) => [money(Number(v)), 'Balance']}
                />
                <ReferenceLine y={cushion} stroke={CF.amber} strokeDasharray="4 3" strokeWidth={1} />
                <ReferenceLine y={0} stroke={CF.faint} strokeWidth={1} />
                <ReferenceLine x={chartRows[0]?.label} stroke={CF.cyan} strokeWidth={1} label={{ value: 'TODAY', fontSize: 8, fill: CF.cyan, position: 'insideTopRight' }} />
                <Line type="stepAfter" dataKey="balance" stroke={CF.text} strokeWidth={1.25} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="cf-scroll" style={{ maxHeight: 520 }}>
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="r">In</th>
                  <th className="r">Out</th>
                  <th className="r">Balance</th>
                </tr>
              </thead>
              <tbody>
                {calendar.days.map((d) => {
                  const isLowest = low?.date === d.date;
                  const has = d.events.length > 0;
                  const skipped = d.events.filter((e) => e.skipped).length;
                  return (
                    <Fragment key={d.date}>
                      <tr
                        onClick={() => has && toggle(d.date)}
                        className={`${has ? 'cursor-pointer' : 'dim'} ${isLowest ? 'mark' : ''}`}
                      >
                        <td className="whitespace-nowrap">
                          <span className={has ? 'cf-strong' : ''}>{formatDay(d.date)}</span>
                          {has && <span className="cf-faint ml-1.5">{expanded.has(d.date) ? '▾' : '▸'}{d.events.length}</span>}
                          {skipped > 0 && <span className="cf-faint ml-1.5">{skipped} in QBO</span>}
                          {isLowest && <span className="cf-label cf-neg ml-1.5">low</span>}
                        </td>
                        <td className="r">{d.inflow ? <Money v={d.inflow} tone="in" /> : ''}</td>
                        <td className="r">{d.outflow ? <Money v={d.outflow} /> : ''}</td>
                        <td className="r">
                          <Money v={d.balance} tone={d.balance < cushion ? 'bad' : 'plain'} />
                        </td>
                      </tr>
                      {expanded.has(d.date) && d.events.map((e, i) => (
                        <tr key={i} className={`sub ${e.skipped ? 'dim' : ''}`}>
                          <td colSpan={3} className="pl-6">
                            <span className="cf-label inline-block w-20">{e.skipped ? 'In QBO' : KIND_LABEL[e.kind]}</span>
                            {e.dealId && !e.skipped ? (
                              <button onClick={() => setSlideoutDealId(e.dealId!)} className="cf-link">{e.label}</button>
                            ) : (
                              <span style={e.skipped ? { textDecoration: 'line-through' } : undefined}>{e.label}</span>
                            )}
                            {e.detail && <span className="cf-faint ml-1.5">{e.detail}</span>}
                            {e.warning && <span className="cf-warn ml-1.5">{e.warning}</span>}
                          </td>
                          <td className="r">
                            {e.skipped ? (
                              <span className="cf-num" style={{ textDecoration: 'line-through' }}>{money(e.amount)}</span>
                            ) : (
                              <Money v={e.amount} tone="in" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="cf-pb cf-note space-y-0.5" style={{ borderTop: `1px solid ${CF.border}` }}>
            <div className="cf-label">Not counted</div>
            <div><span className="cf-num">{nc.pastDueCommitted.count}</span> past-due payments on ≥{CASH_CONFIG.COMMITTED_PROBABILITY_MIN}% deals (<span className="cf-num">{money(nc.pastDueCommitted.total)}</span> net) — fix in Past-due cleanup</div>
            <div><span className="cf-num">{nc.belowThreshold.count}</span> payments in the window below {CASH_CONFIG.COMMITTED_PROBABILITY_MIN}% (<span className="cf-num">{money(nc.belowThreshold.total)}</span> upside)</div>
            <div><span className="cf-num">{nc.legacyReferral}</span> referral fees / <span className="cf-num">{nc.legacySplit}</span> splits flagged unpaid on payments received &gt;{CASH_CONFIG.OWED_LOOKBACK_DAYS}d ago (legacy)</div>
            {nc.excludedBills.count > 0 && (
              <div><span className="cf-num">{nc.excludedBills.count}</span> open QBO split Bills (<span className="cf-num">{money(nc.excludedBills.total)}</span>) excluded — paid outside the Bill</div>
            )}
            <div className="cf-faint">
              Scheduled payments already entered in QBO (same payee, ±{CASH_CONFIG.DEDUPE_DAYS}d, ±${CASH_CONFIG.DEDUPE_DOLLARS}) are struck through and not counted.
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="cf-grid content-start">
          <OwedOutPanel
            owed={summary.owed}
            operatingBalance={hasBal ? summary.balanceToday : null}
            today={today}
            artyAdvance={summary.arty.advanceNow}
            onOpenDeal={setSlideoutDealId}
            onChanged={reload}
          />
          <ProjectionPanel data={data} today={today} />
        </div>
      </div>

      <div className="cf-grid grid-cols-1 lg:grid-cols-3">
        <ScheduledPaymentsEditor rows={data.scheduled} accounts={data.balances} onChanged={reload} />
        <CleanupSummary data={data} today={today} />
        <CreditFacilityEditor rows={data.credit} onChanged={reload} />
      </div>

      <OutsideCf><DealDetailsSlideout
        dealId={slideoutDealId}
        isOpen={!!slideoutDealId}
        onClose={() => setSlideoutDealId(null)}
        onDealUpdated={reload}
      /></OutsideCf>
    </div>
  );
}
