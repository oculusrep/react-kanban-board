import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { CASH_CONFIG } from '../../lib/cashCalendar';
import { usePaymentDisbursement } from '../../hooks/usePaymentDisbursement';
import { OwedItem, fmt } from './cashEvents';
import { Money, money } from './cfTheme';

interface Props {
  owed: OwedItem[];
  /** Operating account balance today (the "cash in the bank" the owed total is compared to). */
  operatingBalance: number | null;
  today: string;
  onOpenDeal: (dealId: string) => void;
  onChanged: () => void;
}

export function owedUrgency(days: number | null): 'green' | 'amber' | 'red' {
  if (days === null) return 'amber';
  if (days > CASH_CONFIG.OWED_RED_DAYS) return 'red';
  if (days >= CASH_CONFIG.OWED_AMBER_DAYS) return 'amber';
  return 'green';
}

const TYPE_LABEL: Record<OwedItem['type'], string> = {
  referral: 'Referral fee',
  split: 'Broker split',
  split_bill: 'Open QBO Bill',
};

/** "Money owed out": referral fees + broker splits on payments already received. */
export function OwedOutPanel({ owed, operatingBalance, today, onOpenDeal, onChanged }: Props) {
  const { updateReferralPaid, updatePaymentSplitPaid } = usePaymentDisbursement();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const total = owed.reduce((t, o) => t + o.amount, 0);
  const pct = operatingBalance && operatingBalance > 0 ? Math.round((total / operatingBalance) * 100) : null;

  const setPlanned = async (o: OwedItem, date: string) => {
    setErr(null);
    setBusy(o.key);
    const value = date || null;
    const { error } =
      o.type === 'referral'
        ? await supabase.from('payment').update({ referral_fee_planned_pay_date: value }).eq('id', o.paymentId)
        : await supabase.from('payment_split').update({ planned_pay_date: value }).eq('id', o.splitId!);
    setBusy(null);
    if (error) return setErr(error.message);
    onChanged();
  };

  const markPaid = async (o: OwedItem) => {
    const what = o.type === 'referral' ? `the ${fmt(o.amount)} referral fee to ${o.payee}` : `${o.payee}'s ${fmt(o.amount)} split`;
    if (!window.confirm(`Mark ${what} as paid today? This creates the QBO entry, same as the Payments tab.`)) return;
    setErr(null);
    setBusy(o.key);
    try {
      if (o.type === 'referral') await updateReferralPaid(o.paymentId, true);
      else await updatePaymentSplitPaid(o.splitId!, true);
      onChanged();
    } catch (e: any) {
      setErr(e?.message || 'Could not mark paid');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="cf-panel">
      <div className="cf-ph">
        <span className="cf-title">Money owed out</span>
        <span className="cf-note">
          <Money v={total} tone={total > 0 ? 'warn' : 'plain'} /> owed
          {pct !== null && <> — <span className="cf-num cf-strong">{pct}%</span> of cash in the bank (Operating <span className="cf-num">{money(operatingBalance!)}</span>)</>}
        </span>
      </div>
      {err && <div className="cf-msg err m-1.5">{err}</div>}
      <div className="cf-scroll" style={{ maxHeight: 240 }}>
        <table className="cf-table">
          <thead>
            <tr>
              <th>Payee</th>
              <th>Deal</th>
              <th className="r">Amount</th>
              <th>Client paid</th>
              <th className="r">Held</th>
              <th>Planned pay</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {owed.length === 0 && (
              <tr><td colSpan={7} className="cf-muted">Nothing owed out.</td></tr>
            )}
            {owed.map((o) => {
              const u = owedUrgency(o.daysHeld);
              const cls = u === 'red' ? 'cf-neg' : u === 'amber' ? 'cf-warn' : 'cf-pos';
              return (
                <tr key={o.key} className={busy === o.key ? 'dim' : ''}>
                  <td>
                    <div className="cf-strong">{o.payee}</div>
                    <div className="cf-faint">{TYPE_LABEL[o.type]}{o.qbBillId ? ` ${o.qbBillId}` : ''}</div>
                  </td>
                  <td>
                    {o.dealId ? <button onClick={() => onOpenDeal(o.dealId!)} className="cf-link">{o.deal}</button> : o.deal}
                  </td>
                  <td className="r"><Money v={o.amount} cents /></td>
                  <td className="cf-num">{o.receivedDate || '—'}</td>
                  <td className={`r cf-num ${cls}`}>{o.daysHeld ?? '?'}d</td>
                  <td>
                    <input
                      type="date"
                      min={today}
                      value={o.plannedDate ?? ''}
                      disabled={busy === o.key}
                      onChange={(e) => setPlanned(o, e.target.value)}
                    />
                    {!o.plannedDate && <div className="cf-faint">default {o.effectiveDate === today ? 'today' : o.effectiveDate}</div>}
                  </td>
                  <td className="r">
                    {o.type === 'split_bill' ? (
                      <span className="cf-faint">pay in QBO</span>
                    ) : (
                      <button disabled={busy === o.key} onClick={() => markPaid(o)} className="cf-btn">Mark paid</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="cf-pb cf-faint">
        Referral fees and Arty/Greg splits on client payments received in the last {CASH_CONFIG.OWED_LOOKBACK_DAYS} days, plus open
        OVIS split Bills. Held: <span className="cf-pos">&lt;{CASH_CONFIG.OWED_AMBER_DAYS}d</span> · <span className="cf-warn">{CASH_CONFIG.OWED_AMBER_DAYS}–{CASH_CONFIG.OWED_RED_DAYS}d</span> · <span className="cf-neg">&gt;{CASH_CONFIG.OWED_RED_DAYS}d</span>.
      </div>
    </div>
  );
}
