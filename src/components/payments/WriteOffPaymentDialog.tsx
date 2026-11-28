import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { STAGE } from '../cashflow/useCashData';

/**
 * Payment write-off flow (docs/CASH_FLOW_DASHBOARD_AUDIT.md "Payment write-off").
 *  1. Reason required → payment.write_off_reason (DB trigger stamps written_off_at / written_off_by).
 *  2. If the payment has a QBO invoice: offer "Void QBO invoice" — Mike confirms each one; never automatic,
 *     never delete.
 *  3. If every active payment on the deal is now received or written off: offer to move the deal to
 *     Closed Paid.
 * Used from the deal slideout (payment row menu) and the Cash tab's past-due cleanup.
 */

export interface WriteOffTarget {
  id: string;
  payment_name: string | null;
  payment_amount: number | null;
  qb_invoice_id: string | null;
  qb_invoice_number: string | null;
  deal_id: string | null;
  deal_name?: string | null;
}

type Step = 'reason' | 'void' | 'closed_paid' | 'done';

const NAVY = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';

function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const money = (n: number | null) =>
  (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * If every active payment on the deal is received or written off and the deal is not already Closed Paid
 * or Lost, return the suggested closed date (latest received date, else today ET). Otherwise null.
 */
export async function closedPaidSuggestion(dealId: string): Promise<{ closedDate: string } | null> {
  const [{ data: deal }, { data: payments }] = await Promise.all([
    supabase.from('deal').select('stage_id').eq('id', dealId).single(),
    supabase
      .from('payment')
      .select('payment_received, payment_received_date, written_off_at')
      .eq('deal_id', dealId)
      .eq('is_active', true),
  ]);
  if (!deal || deal.stage_id === STAGE.closedPaid || deal.stage_id === STAGE.lost) return null;
  if (!payments || payments.length === 0) return null;
  const settled = payments.every((p) => p.payment_received || p.written_off_at);
  if (!settled) return null;
  const received = payments.map((p) => p.payment_received_date).filter(Boolean).sort() as string[];
  return { closedDate: received[received.length - 1] || todayET() };
}

export async function moveDealToClosedPaid(dealId: string, closedDate: string) {
  const { error } = await supabase.from('deal').update({ stage_id: STAGE.closedPaid, closed_date: closedDate }).eq('id', dealId);
  if (error) throw error;
}

/** Inline prompt: "All payments received or written off — move to Closed Paid?" */
export function ClosedPaidPrompt({ dealId, dealName, closedDate, onDone }: { dealId: string; dealName?: string | null; closedDate: string; onDone: (moved: boolean) => void }) {
  const [date, setDate] = useState(closedDate);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm" style={{ color: NAVY }}>
        Every payment on {dealName ? <strong>{dealName}</strong> : 'this deal'} is now received or written off. Move the deal to
        <strong> Closed Paid</strong>?
      </p>
      <label className="flex items-center gap-2 text-sm" style={{ color: STEEL }}>
        Closed date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1 text-sm" style={{ borderColor: SLATE }} />
      </label>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex gap-2">
        <button
          disabled={busy || !date}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await moveDealToClosedPaid(dealId, date);
              onDone(true);
            } catch (e: any) {
              setErr(e?.message || 'Could not move the deal');
              setBusy(false);
            }
          }}
          className="px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: NAVY }}
        >
          {busy ? 'Moving…' : 'Move to Closed Paid'}
        </button>
        <button onClick={() => onDone(false)} className="px-3 py-1.5 rounded text-sm border" style={{ borderColor: SLATE, color: STEEL }}>
          Not now
        </button>
      </div>
    </div>
  );
}

/** Void the QBO invoice of an already written-off payment — one explicit confirm per invoice. */
export async function voidQboInvoice(p: { id: string; qb_invoice_number: string | null; qb_invoice_id: string | null }) {
  const label = p.qb_invoice_number || p.qb_invoice_id;
  if (!window.confirm(`Void QBO invoice #${label}?\n\nQuickBooks keeps the invoice, marked Voided with $0. OVIS does not delete it. This can't be undone from OVIS.`)) {
    return { ok: false, cancelled: true as const };
  }
  const { data, error } = await supabase.functions.invoke('quickbooks-void-invoice', { body: { paymentId: p.id } });
  if (error || !data?.success) {
    let msg = error?.message || data?.error || 'Void failed';
    try {
      const body = await (error as any)?.context?.json?.();
      if (body?.error) msg = body.error;
    } catch { /* ignore */ }
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export default function WriteOffPaymentDialog({ payment, isOpen, onClose, onDone }: { payment: WriteOffTarget | null; isOpen: boolean; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>('reason');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [voidMsg, setVoidMsg] = useState<string | null>(null);
  const [closedDate, setClosedDate] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('reason');
      setReason('');
      setErr(null);
      setVoidMsg(null);
      setClosedDate(null);
    }
  }, [isOpen, payment?.id]);

  if (!isOpen || !payment) return null;

  const afterVoidStep = async () => {
    const s = payment.deal_id ? await closedPaidSuggestion(payment.deal_id) : null;
    if (s) {
      setClosedDate(s.closedDate);
      setStep('closed_paid');
    } else {
      setStep('done');
    }
  };

  const writeOff = async () => {
    if (!reason.trim()) return setErr('A reason is required');
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from('payment').update({ write_off_reason: reason.trim() }).eq('id', payment.id);
    setBusy(false);
    if (error) return setErr(error.message);
    onDone();
    if (payment.qb_invoice_id) setStep('void');
    else await afterVoidStep();
  };

  const doVoid = async () => {
    setBusy(true);
    setErr(null);
    const r = await voidQboInvoice(payment);
    setBusy(false);
    if (r.ok) {
      setVoidMsg(`QBO invoice #${payment.qb_invoice_number || payment.qb_invoice_id} voided.`);
      onDone();
      await afterVoidStep();
    } else if (!('cancelled' in r)) {
      setErr(r.error || 'Void failed');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-lg font-semibold" style={{ color: NAVY }}>Write off payment</h3>
          <p className="text-sm" style={{ color: STEEL }}>
            {payment.deal_name ? `${payment.deal_name} — ` : ''}{payment.payment_name || 'Payment'} · {money(payment.payment_amount)}
          </p>
        </div>

        {step === 'reason' && (
          <>
            <p className="text-sm text-gray-600">
              A written-off payment stays on the deal but drops out of the cash calendar, 12-month projection, past-due
              list and needs-attention. Nothing is deleted.
            </p>
            <label className="block text-sm" style={{ color: NAVY }}>
              Reason <span className="text-red-600">*</span>
              <textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="mt-1 w-full border rounded px-2 py-1 text-sm"
                style={{ borderColor: SLATE }}
                placeholder="e.g. Tenant terminated before opening; landlord won't pay installment 2"
              />
            </label>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-1.5 rounded text-sm border" style={{ borderColor: SLATE, color: STEEL }}>Cancel</button>
              <button disabled={busy || !reason.trim()} onClick={writeOff} className="px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: NAVY }}>
                {busy ? 'Saving…' : 'Write off'}
              </button>
            </div>
          </>
        )}

        {step === 'void' && (
          <>
            <p className="text-sm text-green-700">Written off.</p>
            <p className="text-sm" style={{ color: NAVY }}>
              This payment has QBO invoice <strong>#{payment.qb_invoice_number || payment.qb_invoice_id}</strong>, still open in
              QuickBooks. Void it? (Void keeps the invoice in QBO at $0 — it is never deleted.)
            </p>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={afterVoidStep} className="px-3 py-1.5 rounded text-sm border" style={{ borderColor: SLATE, color: STEEL }}>Leave invoice open</button>
              <button disabled={busy} onClick={doVoid} className="px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#A27B5C' }}>
                {busy ? 'Voiding…' : 'Void QBO invoice'}
              </button>
            </div>
          </>
        )}

        {step === 'closed_paid' && payment.deal_id && closedDate && (
          <>
            {voidMsg && <p className="text-sm text-green-700">{voidMsg}</p>}
            <ClosedPaidPrompt dealId={payment.deal_id} dealName={payment.deal_name} closedDate={closedDate} onDone={() => { onDone(); setStep('done'); }} />
          </>
        )}

        {step === 'done' && (
          <>
            <p className="text-sm text-green-700">{voidMsg || 'Written off.'}</p>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-3 py-1.5 rounded text-sm font-medium text-white" style={{ backgroundColor: NAVY }}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
