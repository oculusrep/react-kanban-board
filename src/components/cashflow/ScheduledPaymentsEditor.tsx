import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BalanceRow, ScheduledPayment } from './useCashData';
import { Money } from './cfTheme';

interface Props {
  rows: ScheduledPayment[];
  accounts: BalanceRow[];
  onChanged: () => void;
}

interface Draft {
  id?: string;
  name: string;
  kind: 'bill' | 'draw';
  when: 'monthly' | 'date' | 'weeks';
  every_n_weeks: string;
  end_date: string;
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
  every_n_weeks: '2',
  end_date: '',
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
    when: r.every_n_weeks ? 'weeks' : r.day_of_month ? 'monthly' : 'date',
    every_n_weeks: String(r.every_n_weeks ?? 2),
    end_date: r.end_date ?? '',
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
    if (draft.when !== 'monthly' && !draft.scheduled_date) return setErr(draft.when === 'weeks' ? 'Pick the first date' : 'Pick a date');
    const weeks = parseInt(draft.every_n_weeks, 10);
    if (draft.when === 'weeks' && !(weeks >= 1 && weeks <= 52)) return setErr('Every N weeks must be 1–52');
    if (draft.source === 'qbo' && !draft.qb_account_id) return setErr('Pick a QBO account');
    const amount = draft.amount.trim() === '' ? null : Number(draft.amount);
    if (draft.source === 'amount' && amount !== null && !(amount >= 0)) return setErr('Amount must be a positive number');

    const row = {
      name: draft.name.trim(),
      kind: draft.kind,
      day_of_month: draft.when === 'monthly' ? dom : null,
      scheduled_date: draft.when !== 'monthly' ? draft.scheduled_date : null,
      every_n_weeks: draft.when === 'weeks' ? weeks : null,
      end_date: draft.when !== 'date' && draft.end_date ? draft.end_date : null,
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
    <div className="cf-panel">
      <div className="cf-ph">
        <span className="cf-title">Scheduled payments &amp; draws</span>
        <button onClick={() => setDraft({ ...emptyDraft })} className="cf-btn">Add</button>
      </div>

      {err && <div className="cf-msg err m-1.5">{err}</div>}

      {draft && (
        <div className="cf-pb space-y-1.5" style={{ borderBottom: '1px solid var(--cf-border)' }}>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="cf-label">Name</span>
              <input type="text" className="w-full" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="cf-label">Type</span>
              <select className="w-full" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })}>
                <option value="bill">Bill / recurring</option>
                <option value="draw">Planned owner draw</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={draft.when} onChange={(e) => setDraft({ ...draft, when: e.target.value as Draft['when'] })}>
              <option value="monthly">Monthly on day</option>
              <option value="weeks">Every N weeks from</option>
              <option value="date">Once on date</option>
            </select>
            {draft.when === 'monthly' && (
              <input type="number" min={1} max={31} className="w-14" value={draft.day_of_month} onChange={(e) => setDraft({ ...draft, day_of_month: e.target.value })} />
            )}
            {draft.when === 'weeks' && (
              <input type="number" min={1} max={52} className="w-12" title="Weeks" value={draft.every_n_weeks} onChange={(e) => setDraft({ ...draft, every_n_weeks: e.target.value })} />
            )}
            {draft.when !== 'monthly' && (
              <input type="date" value={draft.scheduled_date} onChange={(e) => setDraft({ ...draft, scheduled_date: e.target.value })} />
            )}
            {draft.when !== 'date' && (
              <label className="cf-note flex items-center gap-1">until
                <input type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
              </label>
            )}
            <select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value as Draft['source'] })}>
              <option value="amount">Fixed amount</option>
              <option value="qbo">QBO account balance</option>
            </select>
            {draft.source === 'amount' ? (
              <input type="number" min={0} step="0.01" placeholder="Amount" className="w-24 cf-num" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            ) : (
              <select value={draft.qb_account_id} onChange={(e) => setDraft({ ...draft, qb_account_id: e.target.value })}>
                <option value="">QBO account</option>
                {accounts.map((a) => (
                  <option key={a.qb_account_id} value={a.qb_account_id}>{a.fully_qualified_name || a.name} ({a.account_type})</option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-1 cf-note">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active
            </label>
          </div>
          <label className="block">
            <span className="cf-label">QBO payee name(s), comma-separated — skips occurrences already entered in QBO</span>
            <input type="text" className="w-full" value={draft.payees} placeholder="Santos Real Estate Partners LLC" onChange={(e) => setDraft({ ...draft, payees: e.target.value })} />
          </label>
          <div className="flex gap-1.5">
            <button disabled={saving} onClick={save} className="cf-btn">{saving ? 'Saving' : 'Save'}</button>
            <button onClick={() => { setDraft(null); setErr(null); }} className="cf-btn" style={{ color: 'var(--cf-muted)' }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="cf-scroll" style={{ maxHeight: 300 }}>
        <table className="cf-table">
          <thead>
            <tr><th>Name</th><th>When</th><th className="r">Amount</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="cf-muted">None yet.</td></tr>}
            {rows.map((r) => {
              const linked = accountName(r.qb_account_id);
              return (
                <tr key={r.id} className={r.active ? '' : 'dim'}>
                  <td>
                    <div className="cf-strong">{r.name}{r.kind === 'draw' && <span className="cf-label ml-1.5">draw</span>}</div>
                    {r.qb_payee_names && r.qb_payee_names.length > 0 && <div className="cf-faint">QBO payee: {r.qb_payee_names.join(', ')}</div>}
                  </td>
                  <td className="cf-num whitespace-nowrap">
                    {r.every_n_weeks ? `every ${r.every_n_weeks}w from ${r.scheduled_date}` : r.day_of_month ? `day ${r.day_of_month}` : r.scheduled_date}
                    {r.end_date && <div className="cf-faint">until {r.end_date}</div>}
                    {r.payoff_qb_account_id && <div className="cf-faint">until paid off</div>}
                  </td>
                  <td className="r">
                    {r.qb_account_id
                      ? <span className="cf-muted">QBO bal: {linked ?? r.qb_account_id}</span>
                      : r.amount !== null ? <Money v={Number(r.amount)} cents /> : <span className="cf-warn">no amount</span>}
                  </td>
                  <td className="r whitespace-nowrap">
                    <button onClick={() => setDraft(toDraft(r))} className="cf-link mr-2">Edit</button>
                    <button onClick={() => remove(r.id)} className="cf-link" style={{ color: 'var(--cf-muted)' }}>Delete</button>
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
