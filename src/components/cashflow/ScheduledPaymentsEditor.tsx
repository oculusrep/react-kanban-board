import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BalanceRow, ScheduledPayment } from './useCashData';
import { fmt } from './cashEvents';

interface Props {
  rows: ScheduledPayment[];
  accounts: BalanceRow[];
  onChanged: () => void;
}

interface Draft {
  id?: string;
  name: string;
  kind: 'bill' | 'draw';
  when: 'monthly' | 'date';
  day_of_month: string;
  scheduled_date: string;
  source: 'amount' | 'qbo';
  amount: string;
  qb_account_id: string;
  payees: string;
  active: boolean;
}

const emptyDraft: Draft = {
  name: '',
  kind: 'bill',
  when: 'monthly',
  day_of_month: '1',
  scheduled_date: '',
  source: 'amount',
  amount: '',
  qb_account_id: '',
  payees: '',
  active: true,
};

function toDraft(r: ScheduledPayment): Draft {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    when: r.day_of_month ? 'monthly' : 'date',
    day_of_month: String(r.day_of_month ?? 1),
    scheduled_date: r.scheduled_date ?? '',
    source: r.qb_account_id ? 'qbo' : 'amount',
    amount: r.amount === null ? '' : String(r.amount),
    qb_account_id: r.qb_account_id ?? '',
    payees: (r.qb_payee_names || []).join(', '),
    active: r.active,
  };
}

export function ScheduledPaymentsEditor({ rows, accounts, onChanged }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const accountName = (id: string | null) => {
    const a = accounts.find((x) => x.qb_account_id === id);
    return a ? a.fully_qualified_name || a.name : null;
  };

  const save = async () => {
    if (!draft) return;
    setErr(null);
    if (!draft.name.trim()) return setErr('Name is required');
    const dom = parseInt(draft.day_of_month, 10);
    if (draft.when === 'monthly' && !(dom >= 1 && dom <= 31)) return setErr('Day of month must be 1–31');
    if (draft.when === 'date' && !draft.scheduled_date) return setErr('Pick a date');
    if (draft.source === 'qbo' && !draft.qb_account_id) return setErr('Pick a QBO account');
    const amount = draft.amount.trim() === '' ? null : Number(draft.amount);
    if (draft.source === 'amount' && amount !== null && !(amount >= 0)) return setErr('Amount must be a positive number');

    const row = {
      name: draft.name.trim(),
      kind: draft.kind,
      day_of_month: draft.when === 'monthly' ? dom : null,
      scheduled_date: draft.when === 'date' ? draft.scheduled_date : null,
      amount: draft.source === 'amount' ? amount : null,
      qb_account_id: draft.source === 'qbo' ? draft.qb_account_id : null,
      qb_payee_names: (() => {
        const list = draft.payees.split(',').map((x) => x.trim()).filter(Boolean);
        return list.length ? list : null;
      })(),
      active: draft.active,
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    const { error } = draft.id
      ? await supabase.from('scheduled_payment').update(row).eq('id', draft.id)
      : await supabase.from('scheduled_payment').insert(row);
    setSaving(false);
    if (error) return setErr(error.message);
    setDraft(null);
    onChanged();
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this scheduled payment?')) return;
    const { error } = await supabase.from('scheduled_payment').delete().eq('id', id);
    if (error) return setErr(error.message);
    onChanged();
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#8FA9C8' }}>
        <div>
          <h3 className="font-semibold" style={{ color: '#002147' }}>Scheduled payments &amp; draws</h3>
          <p className="text-xs text-gray-500">Recurring bills (AMEX, rent, payroll draws) and planned owner draws.</p>
        </div>
        <button
          onClick={() => setDraft({ ...emptyDraft })}
          className="px-3 py-1.5 rounded text-sm font-medium text-white"
          style={{ backgroundColor: '#002147' }}
        >
          Add
        </button>
      </div>

      {err && <div className="mx-4 mt-3 p-2 text-sm rounded bg-red-50 text-red-700">{err}</div>}

      {draft && (
        <div className="m-4 p-3 rounded border space-y-3 text-sm" style={{ borderColor: '#8FA9C8', backgroundColor: '#F8FAFC' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-600">Name</span>
              <input className="mt-1 w-full border rounded px-2 py-1" value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600">Type</span>
              <select className="mt-1 w-full border rounded px-2 py-1" value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })}>
                <option value="bill">Bill / recurring payment</option>
                <option value="draw">Planned owner draw</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <select className="border rounded px-2 py-1" value={draft.when}
              onChange={(e) => setDraft({ ...draft, when: e.target.value as Draft['when'] })}>
              <option value="monthly">Every month on day</option>
              <option value="date">Once on date</option>
            </select>
            {draft.when === 'monthly' ? (
              <input type="number" min={1} max={31} className="w-20 border rounded px-2 py-1" value={draft.day_of_month}
                onChange={(e) => setDraft({ ...draft, day_of_month: e.target.value })} />
            ) : (
              <input type="date" className="border rounded px-2 py-1" value={draft.scheduled_date}
                onChange={(e) => setDraft({ ...draft, scheduled_date: e.target.value })} />
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <select className="border rounded px-2 py-1" value={draft.source}
              onChange={(e) => setDraft({ ...draft, source: e.target.value as Draft['source'] })}>
              <option value="amount">Fixed amount</option>
              <option value="qbo">Use QBO account balance</option>
            </select>
            {draft.source === 'amount' ? (
              <input type="number" min={0} step="0.01" placeholder="Amount" className="w-36 border rounded px-2 py-1"
                value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            ) : (
              <select className="border rounded px-2 py-1" value={draft.qb_account_id}
                onChange={(e) => setDraft({ ...draft, qb_account_id: e.target.value })}>
                <option value="">— QBO account —</option>
                {accounts.map((a) => (
                  <option key={a.qb_account_id} value={a.qb_account_id}>
                    {a.fully_qualified_name || a.name} ({a.account_type})
                  </option>
                ))}
              </select>
            )}
            {draft.source === 'qbo' && accounts.length === 0 && (
              <span className="text-xs" style={{ color: '#A27B5C' }}>No QBO balances yet — Refresh now after QBO reconnects.</span>
            )}
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Active
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-gray-600">
              QBO payee name(s), comma-separated — an occurrence already entered in QBO for this payee is not counted twice
            </span>
            <input className="mt-1 w-full border rounded px-2 py-1" value={draft.payees} placeholder="e.g. Santos Real Estate Partners LLC"
              onChange={(e) => setDraft({ ...draft, payees: e.target.value })} />
          </label>
          <div className="flex gap-2">
            <button disabled={saving} onClick={save} className="px-3 py-1.5 rounded text-white text-sm" style={{ backgroundColor: '#002147' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setDraft(null); setErr(null); }} className="px-3 py-1.5 rounded text-sm border" style={{ borderColor: '#8FA9C8', color: '#4A6B94' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y">
        {rows.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">None yet.</li>}
        {rows.map((r) => {
          const linked = accountName(r.qb_account_id);
          return (
            <li key={r.id} className={`px-4 py-2 flex items-center justify-between gap-3 text-sm ${r.active ? '' : 'opacity-50'}`}>
              <div className="min-w-0">
                <div className="font-medium truncate" style={{ color: '#002147' }}>
                  {r.name}
                  {r.kind === 'draw' && <span className="ml-2 text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: '#8FA9C8', color: '#4A6B94' }}>draw</span>}
                </div>
                <div className="text-xs text-gray-500">
                  {r.day_of_month ? `Monthly on day ${r.day_of_month}` : `Once on ${r.scheduled_date}`}
                  {' · '}
                  {r.qb_account_id
                    ? `QBO balance: ${linked ?? 'account ' + r.qb_account_id}`
                    : r.amount !== null
                      ? fmt(Number(r.amount))
                      : <span style={{ color: '#A27B5C' }}>no amount yet</span>}
                  {r.qb_payee_names && r.qb_payee_names.length > 0 && ` · QBO payee: ${r.qb_payee_names.join(', ')}`}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setDraft(toDraft(r))} className="text-xs underline" style={{ color: '#4A6B94' }}>Edit</button>
                <button onClick={() => remove(r.id)} className="text-xs underline text-gray-400">Delete</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
