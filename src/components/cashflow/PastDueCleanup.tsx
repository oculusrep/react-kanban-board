import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { daysBetween } from '../../lib/cashCalendar';
import { CashData, STAGE } from './useCashData';
import { fmt } from './cashEvents';

interface Props {
  data: CashData;
  today: string;
  onOpenDeal: (dealId: string) => void;
  onChanged: () => void;
}

type SortKey = 'date' | 'days' | 'amount' | 'deal' | 'team' | 'probability';

/** One-time backlog cleanup: every past-due payment, sortable, with inline date edit. */
export function PastDueCleanup({ data, today, onOpenDeal, onChanged }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'days', asc: false });
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = data.payments
      .filter((p) => !p.payment_received && p.deal?.stage_id !== STAGE.lost && p.payment_date_estimated && p.payment_date_estimated < today)
      .map((p) => ({
        id: p.id,
        dealId: p.deal_id,
        deal: p.deal?.deal_name || 'Unknown deal',
        payment: p.payment_name || 'Payment',
        client: p.deal?.client?.client_name || '',
        team: ((p.deal_id && data.dealTeam.get(p.deal_id)) || []).join(', '),
        probability: Number(p.deal?.probability) || 0,
        amount: Number(p.payment_amount) || 0,
        date: p.payment_date_estimated!,
        days: daysBetween(p.payment_date_estimated!, today),
      }));
    const dir = sort.asc ? 1 : -1;
    return list.sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      return (typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y))) * dir;
    });
  }, [data, today, sort]);

  const saveDate = async (paymentId: string, date: string) => {
    if (!date) return;
    setErr(null);
    setSaving(paymentId);
    const { error } = await supabase.from('payment').update({ payment_date_estimated: date }).eq('id', paymentId);
    setSaving(null);
    if (error) return setErr(error.message);
    setSaved((s) => new Set(s).add(paymentId));
    onChanged();
  };

  const header = (key: SortKey, label: string, right = false) => (
    <th
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : key === 'deal' || key === 'team' }))}
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
      style={{ color: sort.key === key ? '#002147' : '#4A6B94' }}
    >
      {label}{sort.key === key ? (sort.asc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const total = rows.reduce((t, r) => t + r.amount, 0);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b" style={{ borderColor: '#8FA9C8' }}>
        <h3 className="font-semibold" style={{ color: '#002147' }}>Past-due cleanup</h3>
        <p className="text-xs text-gray-500">
          {rows.length} unreceived payments with an estimated date before today ({fmt(total)}). Set a realistic date —
          it saves when you pick it.
        </p>
      </div>
      {err && <div className="mx-4 mt-3 p-2 text-sm rounded bg-red-50 text-red-700">{err}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead style={{ backgroundColor: '#F8FAFC' }}>
            <tr>
              {header('deal', 'Deal')}
              {header('team', 'Deal team')}
              {header('probability', 'Prob.', true)}
              {header('amount', 'Amount', true)}
              {header('date', 'Estimated')}
              {header('days', 'Overdue', true)}
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#4A6B94' }}>New date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className={saved.has(r.id) ? 'bg-green-50' : ''}>
                <td className="px-3 py-2">
                  <button onClick={() => r.dealId && onOpenDeal(r.dealId)} className="text-left hover:underline" style={{ color: '#002147' }}>
                    {r.deal}
                  </button>
                  <div className="text-xs text-gray-500">{r.payment}{r.client && ` · ${r.client}`}</div>
                </td>
                <td className="px-3 py-2 text-xs">{r.team || <span style={{ color: '#A27B5C' }}>No team</span>}</td>
                <td className="px-3 py-2 text-right">{r.probability}%</td>
                <td className="px-3 py-2 text-right" style={{ color: '#4A6B94' }}>{fmt(r.amount)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                <td className="px-3 py-2 text-right" style={{ color: '#A27B5C' }}>{r.days}d</td>
                <td className="px-3 py-2">
                  <input
                    type="date"
                    min={today}
                    disabled={saving === r.id}
                    className="border rounded px-2 py-1 text-sm"
                    style={{ borderColor: '#8FA9C8' }}
                    onChange={(e) => saveDate(r.id, e.target.value)}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-sm text-gray-500">No past-due payments.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
