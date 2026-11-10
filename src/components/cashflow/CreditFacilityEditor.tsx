import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { CreditFacility } from './useCashData';
import { money } from './cfTheme';

interface Props {
  rows: CreditFacility[];
  onChanged: () => void;
}

type Field = 'available' | 'credit_limit' | 'apr';

/** Debt panel (v1.5): lines of credit the projection may draw on. Inline edit of available / limit / APR. */
export function CreditFacilityEditor({ rows, onChanged }: Props) {
  const [edit, setEdit] = useState<{ id: string; field: Field; value: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!edit) return;
    const v = edit.value.trim() === '' ? null : Number(edit.value);
    if (v !== null && !(v >= 0)) return setErr('Enter a positive number');
    if (edit.field === 'available' && v === null) return setErr('Available is required');
    const { error } = await supabase
      .from('credit_facility')
      .update({ [edit.field]: v, updated_at: new Date().toISOString() })
      .eq('id', edit.id);
    if (error) return setErr(error.message);
    setErr(null);
    setEdit(null);
    onChanged();
  };

  const cell = (r: CreditFacility, field: Field, display: React.ReactNode) =>
    edit && edit.id === r.id && edit.field === field ? (
      <input
        autoFocus
        type="number"
        step="0.01"
        className="w-24 cf-num"
        style={{ textAlign: 'right' }}
        value={edit.value}
        onChange={(e) => setEdit({ ...edit, value: e.target.value })}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(null); }}
      />
    ) : (
      <button className="cf-link" onClick={() => setEdit({ id: r.id, field, value: r[field] === null ? '' : String(r[field]) })}>
        {display}
      </button>
    );

  return (
    <div className="cf-panel">
      <div className="cf-ph">
        <span className="cf-title">Credit lines</span>
        <span className="cf-note">click a value to edit</span>
      </div>
      {err && <div className="cf-msg err m-1.5">{err}</div>}
      <table className="cf-table">
        <thead>
          <tr><th>Line</th><th className="r">Available</th><th className="r">Limit</th><th className="r">APR</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="cf-muted">None.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className={r.active ? '' : 'dim'}>
              <td>
                <div className="cf-strong">{r.name}</div>
                <div className="cf-faint">updated {r.updated_at ? new Date(r.updated_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' }) : '—'}</div>
              </td>
              <td className="r">{cell(r, 'available', <span className="cf-num">{money(Number(r.available))}</span>)}</td>
              <td className="r">{cell(r, 'credit_limit', <span className="cf-num">{r.credit_limit === null ? '—' : money(Number(r.credit_limit))}</span>)}</td>
              <td className="r">{cell(r, 'apr', <span className="cf-num">{r.apr === null ? '—' : `${r.apr}%`}</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cf-pb cf-faint">Available credit the 12-month projection draws on to stay above the cushion.</div>
    </div>
  );
}
