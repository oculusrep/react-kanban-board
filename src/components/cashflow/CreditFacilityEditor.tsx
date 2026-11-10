import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { CreditFacility } from './useCashData';
import { fmt } from './cashEvents';

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

  const cell = (r: CreditFacility, field: Field, display: string) =>
    edit && edit.id === r.id && edit.field === field ? (
      <input
        autoFocus
        type="number"
        step="0.01"
        className="w-28 border rounded px-1 py-0.5 text-sm text-right"
        style={{ borderColor: '#8FA9C8' }}
        value={edit.value}
        onChange={(e) => setEdit({ ...edit, value: e.target.value })}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(null); }}
      />
    ) : (
      <button
        className="hover:underline"
        style={{ color: '#002147' }}
        onClick={() => setEdit({ id: r.id, field, value: r[field] === null ? '' : String(r[field]) })}
      >
        {display}
      </button>
    );

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b" style={{ borderColor: '#8FA9C8' }}>
        <h3 className="font-semibold" style={{ color: '#002147' }}>Credit lines</h3>
        <p className="text-xs text-gray-500">Available credit the 12-month projection can draw on to stay above the cushion. Click a value to edit.</p>
      </div>
      {err && <div className="mx-4 mt-3 p-2 text-sm rounded bg-red-50 text-red-700">{err}</div>}
      <table className="min-w-full text-sm">
        <thead style={{ backgroundColor: '#F8FAFC' }}>
          <tr className="text-xs uppercase tracking-wide" style={{ color: '#4A6B94' }}>
            <th className="px-3 py-2 text-left">Line</th>
            <th className="px-3 py-2 text-right">Available</th>
            <th className="px-3 py-2 text-right">Limit</th>
            <th className="px-3 py-2 text-right">APR %</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-gray-500">None.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className={r.active ? '' : 'opacity-50'}>
              <td className="px-3 py-2" style={{ color: '#002147' }}>
                {r.name}
                <div className="text-xs text-gray-400">Updated {r.updated_at ? new Date(r.updated_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' }) : '—'}</div>
              </td>
              <td className="px-3 py-2 text-right">{cell(r, 'available', fmt(Number(r.available)))}</td>
              <td className="px-3 py-2 text-right">{cell(r, 'credit_limit', r.credit_limit === null ? '—' : fmt(Number(r.credit_limit)))}</td>
              <td className="px-3 py-2 text-right">{cell(r, 'apr', r.apr === null ? '—' : `${r.apr}%`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
