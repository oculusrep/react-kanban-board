import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { CASH_CONFIG } from '../../lib/cashCalendar';
import { usePaymentDisbursement } from '../../hooks/usePaymentDisbursement';
import { OwedItem, fmt } from './cashEvents';

interface Props {
  owed: OwedItem[];
  /** Operating account balance today (the "cash in the bank" the owed total is compared to). */
  operatingBalance: number | null;
  today: string;
  onOpenDeal: (dealId: string) => void;
  onChanged: () => void;
}

const URGENCY = {
  green: { color: '#15803D', label: 'OK' },
  amber: { color: '#B45309', label: 'Due soon' },
  red: { color: '#B91C1C', label: 'Overdue' },
} as const;

export function owedUrgency(days: number | null): keyof typeof URGENCY {
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
    <div className="bg-white rounded-lg shadow border-l-4" style={{ borderColor: total > 0 ? '#A27B5C' : '#8FA9C8' }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: '#8FA9C8' }}>
        <h3 className="font-semibold" style={{ color: '#002147' }}>Money owed out</h3>
        <p className="text-sm" style={{ color: '#4A6B94' }}>
          <span className="font-semibold" style={{ color: '#002147' }}>{fmt(total)} owed</span>
          {pct !== null && <> — {pct}% of cash in the bank (Operating {fmt(operatingBalance!)})</>}
        </p>
        <p className="text-xs text-gray-500">
          Referral fees and Arty/Greg splits on client payments already received (last {CASH_CONFIG.OWED_LOOKBACK_DAYS} days),
          plus OVIS split Bills still open in QBO. Green &lt; {CASH_CONFIG.OWED_AMBER_DAYS} days held, amber{' '}
          {CASH_CONFIG.OWED_AMBER_DAYS}–{CASH_CONFIG.OWED_RED_DAYS}, red &gt; {CASH_CONFIG.OWED_RED_DAYS}.
        </p>
      </div>
      {err && <div className="mx-4 mt-3 p-2 text-sm rounded bg-red-50 text-red-700">{err}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead style={{ backgroundColor: '#F8FAFC' }}>
            <tr className="text-xs uppercase tracking-wide" style={{ color: '#4A6B94' }}>
              <th className="px-3 py-2 text-left">Payee</th>
              <th className="px-3 py-2 text-left">Deal</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Client paid</th>
              <th className="px-3 py-2 text-right">Days held</th>
              <th className="px-3 py-2 text-left">Planned pay date</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {owed.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-gray-500">Nothing owed out.</td></tr>
            )}
            {owed.map((o) => {
              const u = URGENCY[owedUrgency(o.daysHeld)];
              return (
                <tr key={o.key} className={busy === o.key ? 'opacity-50' : ''}>
                  <td className="px-3 py-2">
                    <div style={{ color: '#002147' }}>{o.payee}</div>
                    <div className="text-xs text-gray-500">{TYPE_LABEL[o.type]}{o.qbBillId ? ` ${o.qbBillId}` : ''}</div>
                  </td>
                  <td className="px-3 py-2">
                    {o.dealId ? (
                      <button onClick={() => onOpenDeal(o.dealId!)} className="text-left hover:underline" style={{ color: '#002147' }}>{o.deal}</button>
                    ) : o.deal}
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: '#4A6B94' }}>{fmt(o.amount)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{o.receivedDate || '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold" style={{ border: `1px solid ${u.color}`, color: u.color }}>
                      {o.daysHeld ?? '?'}d
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      min={today}
                      value={o.plannedDate ?? ''}
                      disabled={busy === o.key}
                      onChange={(e) => setPlanned(o, e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                      style={{ borderColor: '#8FA9C8' }}
                    />
                    {!o.plannedDate && <div className="text-xs text-gray-400">Default: {o.effectiveDate === today ? 'today' : o.effectiveDate}</div>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {o.type === 'split_bill' ? (
                      <span className="text-xs text-gray-500">Pay the Bill in QBO</span>
                    ) : (
                      <button
                        disabled={busy === o.key}
                        onClick={() => markPaid(o)}
                        className="px-2 py-1 rounded text-xs font-medium text-white"
                        style={{ backgroundColor: '#002147' }}
                      >
                        Mark paid
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
