import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { daysBetween } from '../../lib/cashCalendar';
import { CashData } from './useCashData';
import { isOpenPayment } from './cashEvents';
import WriteOffPaymentDialog, { WriteOffTarget } from '../payments/WriteOffPaymentDialog';
import { Money, money } from './cfTheme';

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
  const [writeOff, setWriteOff] = useState<WriteOffTarget | null>(null);

  const rows = useMemo(() => {
    const list = data.payments
      .filter((p) => isOpenPayment(p) && p.payment_date_estimated && p.payment_date_estimated < today)
      .map((p) => ({
        id: p.id,
        dealId: p.deal_id,
        deal: p.deal?.deal_name || 'Unknown deal',
        payment: p.payment_name || 'Payment',
        client: p.deal?.client?.client_name || '',
        team: ((p.deal_id && data.dealTeam.get(p.deal_id)) || []).join(', '),
        probability: Number(p.deal?.probability) || 0,
        amount: Number(p.payment_amount) || 0,
        qbInvoiceId: p.qb_invoice_id,
        qbInvoiceNumber: p.qb_invoice_number,
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
      className={`cursor-pointer select-none ${right ? 'r' : ''}`}
      style={sort.key === key ? { color: 'var(--cf-cyan)' } : undefined}
    >
      {label}{sort.key === key ? (sort.asc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const total = rows.reduce((t, r) => t + r.amount, 0);

  return (
    <div className="cf-panel">
      <div className="cf-ph">
        <span className="cf-title">Past-due cleanup</span>
        <span className="cf-note">
          <span className="cf-num">{rows.length}</span> unreceived payments dated before today (<span className="cf-num">{money(total)}</span>) — pick a realistic date, it saves on change
        </span>
      </div>
      {err && <div className="cf-msg err m-1.5">{err}</div>}
      <div className="cf-scroll" style={{ maxHeight: 420 }}>
        <table className="cf-table">
          <thead>
            <tr>
              {header('deal', 'Deal')}
              {header('team', 'Deal team')}
              {header('probability', 'Prob', true)}
              {header('amount', 'Amount', true)}
              {header('date', 'Estimated')}
              {header('days', 'Overdue', true)}
              <th>New date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <button onClick={() => r.dealId && onOpenDeal(r.dealId)} className="cf-link">{r.deal}</button>
                  <div className="cf-faint">{r.payment}{r.client && ` · ${r.client}`}</div>
                </td>
                <td>{r.team || <span className="cf-warn">No team</span>}</td>
                <td className="r cf-num">{r.probability}%</td>
                <td className="r"><Money v={r.amount} /></td>
                <td className="cf-num whitespace-nowrap">{r.date}</td>
                <td className="r cf-num cf-neg">{r.days}d</td>
                <td>
                  <input type="date" min={today} disabled={saving === r.id} onChange={(e) => saveDate(r.id, e.target.value)} />
                  {saved.has(r.id) && <span className="cf-pos ml-1">saved</span>}
                </td>
                <td className="r">
                  <button
                    className="cf-btn"
                    onClick={() => setWriteOff({
                      id: r.id, payment_name: r.payment, payment_amount: r.amount, qb_invoice_id: r.qbInvoiceId,
                      qb_invoice_number: r.qbInvoiceNumber, deal_id: r.dealId, deal_name: r.deal,
                    })}
                  >
                    Write off
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="cf-muted">No past-due payments.</td></tr>}
          </tbody>
        </table>
      </div>
      <WriteOffPaymentDialog
        payment={writeOff}
        isOpen={!!writeOff}
        onClose={() => setWriteOff(null)}
        onDone={onChanged}
      />
    </div>
  );
}
