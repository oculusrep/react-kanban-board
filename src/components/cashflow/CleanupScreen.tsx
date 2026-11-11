import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { daysBetween } from '../../lib/cashCalendar';
import { CashData, DealLite, PaymentRow, STAGE } from './useCashData';
import { isOpenPayment } from './cashEvents';
import { Money, money, OutsideCf } from './cfTheme';
import WriteOffPaymentDialog, { WriteOffTarget } from '../payments/WriteOffPaymentDialog';

/**
 * Pipeline cleanup screen (/admin/budget/forecast?tab=cleanup). One row per deal, grouped by problem:
 * Past due · Missing payout date · Missing fee · No payments. Inline edits save on blur.
 * See docs/CASH_FLOW_DASHBOARD_AUDIT.md ("Cleanup screen").
 */

export type GroupId = 'pastDue' | 'missingDate' | 'missingFee' | 'noPayments';

export const GROUPS: { id: GroupId; title: string; hint: string }[] = [
  { id: 'pastDue', title: 'Past due', hint: 'Unreceived payments estimated before today' },
  { id: 'missingDate', title: 'Missing payout date', hint: 'Unreceived payments with no estimated date' },
  { id: 'missingFee', title: 'Missing fee', hint: 'Open deals with no fee' },
  { id: 'noPayments', title: 'No payments', hint: 'Open deals with a fee but no payment rows' },
];

export interface CleanupRow {
  deal: DealLite;
  stage: string;
  client: string;
  team: string[];
  fee: number;
  payments: PaymentRow[];
  open: PaymentRow[];
  earliest: PaymentRow | null;
  earliestDate: string | null;
  maxOverdue: number;
  groups: Set<GroupId>;
}

/** Deals with at least one cleanup problem, each tagged with the groups it falls in. */
export function buildCleanupRows(data: CashData, today: string): CleanupRow[] {
  const byDeal = new Map<string, PaymentRow[]>();
  const dealById = new Map<string, DealLite>();
  for (const d of data.openDeals) dealById.set(d.id, d);
  for (const p of data.payments) {
    if (!p.deal_id) continue;
    if (!byDeal.has(p.deal_id)) byDeal.set(p.deal_id, []);
    byDeal.get(p.deal_id)!.push(p);
    if (p.deal && !dealById.has(p.deal_id) && isOpenPayment(p)) dealById.set(p.deal_id, { ...p.deal, id: p.deal_id });
  }
  const rows: CleanupRow[] = [];
  for (const deal of dealById.values()) {
    if (deal.stage_id === STAGE.lost) continue;
    const payments = (byDeal.get(deal.id) || []).sort((a, b) => (a.payment_name || '').localeCompare(b.payment_name || ''));
    const open = payments.filter(isOpenPayment);
    const dated = open.filter((p) => p.payment_date_estimated).sort((a, b) => a.payment_date_estimated!.localeCompare(b.payment_date_estimated!));
    const groups = new Set<GroupId>();
    const pastDue = dated.filter((p) => p.payment_date_estimated! < today);
    if (pastDue.length) groups.add('pastDue');
    if (open.some((p) => !p.payment_date_estimated)) groups.add('missingDate');
    const isOpenDeal = deal.stage_id !== STAGE.closedPaid;
    if (isOpenDeal && !(Number(deal.fee) > 0) && !(Number(deal.gci) > 0)) groups.add('missingFee');
    if (isOpenDeal && Number(deal.fee) > 0 && payments.length === 0) groups.add('noPayments');
    if (groups.size === 0) continue;
    rows.push({
      deal,
      stage: (deal.stage_id && data.stageLabels.get(deal.stage_id)) || '—',
      client: deal.client?.client_name || '',
      team: data.dealTeam.get(deal.id) || [],
      fee: Number(deal.fee) || 0,
      payments,
      open,
      earliest: dated[0] ?? open[0] ?? null,
      earliestDate: dated[0]?.payment_date_estimated ?? null,
      maxOverdue: pastDue.length ? daysBetween(pastDue[0].payment_date_estimated!, today) : 0,
      groups,
    });
  }
  return rows;
}

/** Compact counts for the Cash tab, linking to the full screen. */
export function CleanupSummary({ data, today }: { data: CashData; today: string }) {
  const rows = useMemo(() => buildCleanupRows(data, today), [data, today]);
  return (
    <div className="cf-panel">
      <div className="cf-ph">
        <span className="cf-title">Needs attention</span>
        <Link to="/admin/budget/forecast?tab=cleanup" className="cf-btn">Open cleanup →</Link>
      </div>
      <table className="cf-table">
        <tbody>
          {GROUPS.map((g) => {
            const n = rows.filter((r) => r.groups.has(g.id)).length;
            return (
              <tr key={g.id}>
                <td>
                  <Link to={`/admin/budget/forecast?tab=cleanup&group=${g.id}`} className="cf-link">{g.title}</Link>
                  <div className="cf-faint">{g.hint}</div>
                </td>
                <td className={`r cf-num ${n ? 'cf-warn' : 'cf-faint'}`}>{n}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type SortKey = 'deal' | 'client' | 'stage' | 'team' | 'fee' | 'payments' | 'earliest' | 'probability' | 'overdue';

interface Props {
  data: CashData;
  today: string;
  initialGroup?: GroupId | 'all';
  onOpenDeal: (dealId: string) => void;
  onChanged: () => void;
}

export function CleanupScreen({ data, today, initialGroup = 'all', onOpenDeal, onChanged }: Props) {
  const rows = useMemo(() => buildCleanupRows(data, today), [data, today]);
  const [group, setGroup] = useState<GroupId | 'all'>(initialGroup);
  const [stage, setStage] = useState('');
  const [broker, setBroker] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'overdue', asc: false });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [writeOff, setWriteOff] = useState<WriteOffTarget | null>(null);
  const [losing, setLosing] = useState<CleanupRow | null>(null);

  const stages = useMemo(() => [...new Set(rows.map((r) => r.stage))].sort(), [rows]);
  const brokers = useMemo(() => [...new Set(rows.flatMap((r) => r.team))].sort(), [rows]);

  const visible = useMemo(() => {
    const list = rows.filter(
      (r) => (group === 'all' || r.groups.has(group)) && (!stage || r.stage === stage) && (!broker || r.team.includes(broker))
    );
    const val = (r: CleanupRow): string | number => {
      switch (sort.key) {
        case 'deal': return r.deal.deal_name || '';
        case 'client': return r.client;
        case 'stage': return r.stage;
        case 'team': return r.team.join(', ');
        case 'fee': return r.fee;
        case 'payments': return r.payments.length;
        case 'earliest': return r.earliestDate || '9999';
        case 'probability': return Number(r.deal.probability) || 0;
        case 'overdue': return r.maxOverdue;
      }
    };
    const dir = sort.asc ? 1 : -1;
    return list.sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, group, stage, broker, sort]);

  const run = async (key: string, fn: () => Promise<{ error: { message: string } | null } | void>, ok?: string) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      if (r && r.error) throw new Error(r.error.message);
      if (ok) setMsg({ ok: true, text: ok });
      onChanged();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Save failed' });
    } finally {
      setBusy(null);
    }
  };

  // Fee is computed by a DB trigger (fee = flat_fee_override ?? deal_value × commission %), so an inline
  // fee edit writes flat_fee_override.
  const saveFee = (r: CleanupRow, raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw.replace(/[$,\s]/g, ''));
    if (v !== null && !(v >= 0)) return setMsg({ ok: false, text: 'Fee must be a positive number' });
    if ((v ?? null) === (r.deal.flat_fee_override ?? null) && (v === null || v === r.fee)) return;
    run(`fee-${r.deal.id}`, async () => await supabase.from('deal').update({ flat_fee_override: v }).eq('id', r.deal.id));
  };
  const saveProbability = (r: CleanupRow, raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw);
    if (v !== null && !(v >= 0 && v <= 100)) return setMsg({ ok: false, text: 'Probability must be 0–100' });
    if (v === (r.deal.probability ?? null)) return;
    run(`prob-${r.deal.id}`, async () => await supabase.from('deal').update({ probability: v }).eq('id', r.deal.id));
  };
  const saveDate = (p: PaymentRow, value: string) => {
    if (!value || value === p.payment_date_estimated) return;
    run(`date-${p.id}`, async () => await supabase.from('payment').update({ payment_date_estimated: value }).eq('id', p.id));
  };
  const generate = (r: CleanupRow) => {
    if (!(Number(r.deal.number_of_payments) >= 1)) {
      return setMsg({ ok: false, text: `${r.deal.deal_name}: set "Number of payments" on the deal first (Payments tab).` });
    }
    run(`gen-${r.deal.id}`, async () => {
      const { data: res, error } = await supabase.rpc('generate_payments_for_deal', { deal_uuid: r.deal.id });
      if (error) return { error };
      if (typeof res === 'string' && res.startsWith('Error')) return { error: { message: res } };
    }, `${r.deal.deal_name}: generated ${r.deal.number_of_payments} payment${Number(r.deal.number_of_payments) > 1 ? 's' : ''}.`);
  };
  const writeOffTarget = (p: PaymentRow, r: CleanupRow): WriteOffTarget => ({
    id: p.id, payment_name: p.payment_name, payment_amount: p.payment_amount, qb_invoice_id: p.qb_invoice_id,
    qb_invoice_number: p.qb_invoice_number, deal_id: r.deal.id, deal_name: r.deal.deal_name,
  });

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const th = (key: SortKey, label: string, right = false) => (
    <th
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : ['deal', 'client', 'stage', 'team', 'earliest'].includes(key) }))}
      className={`cursor-pointer select-none ${right ? 'r' : ''}`}
      style={sort.key === key ? { color: 'var(--cf-cyan)' } : undefined}
    >
      {label}{sort.key === key ? (sort.asc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div className="cf-panel">
      <div className="cf-ph flex-wrap">
        <div className="flex flex-wrap items-center gap-1">
          {[{ id: 'all' as const, title: 'All issues' }, ...GROUPS].map((g) => {
            const n = g.id === 'all' ? rows.length : rows.filter((r) => r.groups.has(g.id)).length;
            return (
              <button key={g.id} onClick={() => setGroup(g.id)} className={`cf-tab ${group === g.id ? 'on' : ''}`} style={{ marginBottom: 0 }}>
                {g.title} <span className={`cf-num ${n ? 'cf-warn' : 'cf-faint'}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All stages</option>
            {stages.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={broker} onChange={(e) => setBroker(e.target.value)}>
            <option value="">All brokers</option>
            {brokers.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
      </div>
      {msg && <div className={`cf-msg ${msg.ok ? 'ok' : 'err'} m-1.5`}>{msg.text}</div>}

      <div className="cf-scroll" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        <table className="cf-table">
          <thead>
            <tr>
              <th style={{ width: 18 }}></th>
              {th('deal', 'Deal')}
              {th('client', 'Client')}
              {th('stage', 'Stage')}
              {th('team', 'Deal team')}
              {th('fee', 'Fee', true)}
              {th('payments', 'Pmts', true)}
              {th('earliest', 'Earliest est.')}
              {th('overdue', 'Overdue', true)}
              {th('probability', 'Prob %', true)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={11} className="cf-muted">Nothing to clean up here.</td></tr>}
            {visible.map((r) => {
              const id = r.deal.id;
              const open = expanded.has(id);
              const isBusy = busy?.endsWith(id) ?? false;
              return (
                <Fragment key={id}>
                  <tr className={isBusy ? 'dim' : ''}>
                    <td>
                      {r.payments.length > 0 && (
                        <button className="cf-link cf-faint" onClick={() => toggle(id)} aria-label="Show payments">{open ? '▾' : '▸'}</button>
                      )}
                    </td>
                    <td>
                      <button onClick={() => onOpenDeal(id)} className="cf-link">{r.deal.deal_name || 'Unknown deal'}</button>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {GROUPS.filter((g) => r.groups.has(g.id)).map((g) => (
                          <span key={g.id} className="cf-label cf-warn" style={{ fontSize: 9 }}>{g.title}</span>
                        ))}
                      </div>
                    </td>
                    <td className="cf-muted">{r.client}</td>
                    <td className="cf-muted whitespace-nowrap">{r.stage}</td>
                    <td className="cf-muted">{r.team.length ? r.team.join(', ') : <span className="cf-warn">No team</span>}</td>
                    <td className="r">
                      <input
                        key={`fee-${id}-${r.fee}`}
                        type="text"
                        inputMode="decimal"
                        defaultValue={r.fee ? String(Math.round(r.fee * 100) / 100) : ''}
                        placeholder="0"
                        title={r.deal.flat_fee_override !== null ? 'Flat fee override' : 'Edits set a flat fee override'}
                        className="cf-num w-24"
                        style={{ textAlign: 'right' }}
                        onBlur={(e) => saveFee(r, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      />
                    </td>
                    <td className="r cf-num">{r.payments.length}</td>
                    <td>
                      {r.earliest ? (
                        <input
                          key={`d-${r.earliest.id}-${r.earliest.payment_date_estimated}`}
                          type="date"
                          defaultValue={r.earliest.payment_date_estimated ?? ''}
                          title={r.earliest.payment_name || undefined}
                          onBlur={(e) => saveDate(r.earliest!, e.target.value)}
                        />
                      ) : <span className="cf-faint">—</span>}
                    </td>
                    <td className={`r cf-num ${r.maxOverdue ? 'cf-neg' : 'cf-faint'}`}>{r.maxOverdue ? `${r.maxOverdue}d` : '—'}</td>
                    <td className="r">
                      <input
                        key={`p-${id}-${r.deal.probability}`}
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={r.deal.probability ?? ''}
                        className="cf-num w-14"
                        style={{ textAlign: 'right' }}
                        onBlur={(e) => saveProbability(r, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      />
                    </td>
                    <td className="r whitespace-nowrap">
                      {r.groups.has('noPayments') && (
                        <button className="cf-btn mr-1" disabled={isBusy} onClick={() => generate(r)}
                          title={`Generate ${r.deal.number_of_payments ?? '?'} payment(s) from the deal's commission splits`}>
                          Generate payments
                        </button>
                      )}
                      {r.open.length === 1 && (
                        <button className="cf-btn mr-1" onClick={() => setWriteOff(writeOffTarget(r.open[0], r))}>Write off</button>
                      )}
                      {r.open.length > 1 && (
                        <button className="cf-btn mr-1" onClick={() => toggle(id)} title="Pick which payment to write off">Write off…</button>
                      )}
                      <button className="cf-btn" style={{ color: 'var(--cf-red)' }} onClick={() => setLosing(r)}>Mark Lost</button>
                    </td>
                  </tr>
                  {open && r.payments.map((p) => {
                    const openPay = isOpenPayment(p);
                    const overdue = openPay && p.payment_date_estimated && p.payment_date_estimated < today ? daysBetween(p.payment_date_estimated, today) : 0;
                    return (
                      <tr key={p.id} className={`sub ${openPay ? '' : 'dim'}`}>
                        <td></td>
                        <td colSpan={4} className="pl-4">
                          {p.payment_name || 'Payment'}
                          {p.payment_received && <span className="cf-pos ml-1.5">received {p.payment_received_date}</span>}
                          {p.written_off_at && <span className="cf-faint ml-1.5">written off — {p.write_off_reason}</span>}
                        </td>
                        <td className="r"><Money v={Number(p.payment_amount) || 0} /></td>
                        <td></td>
                        <td>
                          {openPay ? (
                            <input key={`pd-${p.id}-${p.payment_date_estimated}`} type="date" defaultValue={p.payment_date_estimated ?? ''} onBlur={(e) => saveDate(p, e.target.value)} />
                          ) : <span className="cf-num">{p.payment_date_estimated || '—'}</span>}
                        </td>
                        <td className={`r cf-num ${overdue ? 'cf-neg' : 'cf-faint'}`}>{overdue ? `${overdue}d` : ''}</td>
                        <td></td>
                        <td className="r">
                          {openPay && <button className="cf-btn" onClick={() => setWriteOff(writeOffTarget(p, r))}>Write off</button>}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="cf-pb cf-faint">
        Edits save when you leave the field. Fee edits set the deal's flat fee override. "Generate payments" uses the deal's
        number of payments and commission splits (same as the Payments tab). Total {money(visible.reduce((t, r) => t + r.fee, 0))} in fees across {visible.length} deals shown.
      </div>

      <OutsideCf><WriteOffPaymentDialog payment={writeOff} isOpen={!!writeOff} onClose={() => setWriteOff(null)} onDone={onChanged} /></OutsideCf>
      {losing && (
        <MarkLostDialog
          row={losing}
          onClose={() => setLosing(null)}
          onDone={(name) => { setLosing(null); setMsg({ ok: true, text: `${name} moved to Lost; its unpaid payments were archived.` }); onChanged(); }}
        />
      )}
    </div>
  );
}

/** Lost needs a loss reason (same rule as the Kanban). The DB trigger archives the deal's unpaid payments. */
function MarkLostDialog({ row, onClose, onDone }: { row: CleanupRow; onClose: () => void; onDone: (dealName: string) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!reason.trim()) return setErr('A loss reason is required');
    setBusy(true);
    const { error } = await supabase.from('deal').update({ stage_id: STAGE.lost, loss_reason: reason.trim() }).eq('id', row.deal.id);
    setBusy(false);
    if (error) return setErr(error.message);
    onDone(row.deal.deal_name || 'Deal');
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="cf-panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="cf-ph"><span className="cf-title">Mark Lost — {row.deal.deal_name}</span></div>
        <div className="cf-pb space-y-2">
          <div className="cf-note">
            {row.open.length > 0
              ? `${row.open.length} unpaid payment${row.open.length > 1 ? 's' : ''} (${money(row.open.reduce((t, p) => t + (Number(p.payment_amount) || 0), 0))}) will be archived.`
              : 'No unpaid payments.'}
          </div>
          <label className="block">
            <span className="cf-label">Loss reason</span>
            <textarea autoFocus rows={3} className="w-full cf-input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {err && <div className="cf-msg err">{err}</div>}
          <div className="flex justify-end gap-1.5">
            <button className="cf-btn" style={{ color: 'var(--cf-muted)' }} onClick={onClose}>Cancel</button>
            <button className="cf-btn" style={{ color: 'var(--cf-red)' }} disabled={busy || !reason.trim()} onClick={save}>{busy ? 'Saving' : 'Mark Lost'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
