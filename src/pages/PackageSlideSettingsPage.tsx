import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  BRAND, Handoff, INPUT_LABEL, InputKey, TemplateRow, fetchTemplate, updateTemplate,
} from '../lib/packageTracker';

// Package slide defaults (spec §3): owner, handoff, inputs, N/A and gate
// requirements are Mike's settings, edited here as he trains Noree. Changes
// apply to packages started afterwards — packages in flight keep the snapshot
// they started with. Admin-only (route guard + RLS).

const HANDOFF_LABEL: Record<Handoff, string> = {
  none: 'Owner completes',
  approve: 'Owner completes, Mike approves',
  finish: 'Owner sets up, Mike finishes',
};
const INPUTS: InputKey[] = ['market_research', 'site_story', 'site_plan', 'dot_study', 'final_loi'];

interface UserOpt { id: string; label: string }

export default function PackageSlideSettingsPage() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [tpl, usr] = await Promise.all([
          fetchTemplate(),
          supabase.from('user').select('id, first_name, last_name, ovis_role, active')
            .in('ovis_role', ['admin', 'broker_full', 'broker_lite', 'va']).eq('active', true),
        ]);
        setRows(tpl);
        setUsers(((usr.data as any[]) ?? []).map((u) => ({ id: u.id, label: [u.first_name, u.last_name].filter(Boolean).join(' ') })));
      } catch (e: any) {
        setMsg({ text: e?.message ?? 'Failed to load', error: true });
      }
    })();
  }, []);

  const save = async (key: string, patch: Partial<TemplateRow>) => {
    setSaving(key);
    setMsg(null);
    const before = rows;
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    try {
      await updateTemplate(key, patch);
      setMsg({ text: 'Saved. Applies to packages started from now on.' });
    } catch (e: any) {
      setRows(before);
      setMsg({ text: e?.message ?? 'Save failed', error: true });
    } finally {
      setSaving(null);
    }
  };

  const cell = 'px-2 py-1.5 align-top';
  const select = 'text-xs px-1.5 py-1 rounded bg-white';
  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: BRAND.page }}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-xl font-semibold mb-1" style={{ color: BRAND.navy }}>Package slide settings</h1>
        <p className="text-sm mb-4" style={{ color: BRAND.steel }}>
          Defaults for new Starbucks slide packages. Packages already started keep the settings they started with.
        </p>
        {msg && (
          <p className="text-sm mb-3" style={{ color: msg.error ? BRAND.terracotta : BRAND.steel }}>{msg.text}</p>
        )}
        <div className="bg-white rounded overflow-x-auto" style={{ border: `1px solid ${BRAND.slate}` }}>
          <table className="w-full text-xs" style={{ color: BRAND.navy }}>
            <thead>
              <tr className="text-left" style={{ borderBottom: `1px solid ${BRAND.slate}` }}>
                <th className={cell}>#</th>
                <th className={cell}>Slide</th>
                <th className={cell}>Owner</th>
                <th className={cell}>Handoff</th>
                <th className={cell}>Inputs</th>
                <th className={cell}>Done by gate</th>
                <th className={cell}>Started by gate</th>
                <th className={cell}>N/A allowed</th>
                <th className={cell}>Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} style={{ borderBottom: `1px solid ${BRAND.page}`, opacity: saving === r.key ? 0.6 : 1 }}>
                  <td className={cell} style={{ color: BRAND.slate }}>{r.position}</td>
                  <td className={cell}>
                    <div className="font-medium">{r.label}</div>
                    {r.note && <div style={{ color: BRAND.slate }}>{r.note}</div>}
                  </td>
                  <td className={cell}>
                    <select className={select} style={{ border: `1px solid ${BRAND.slate}` }} value={r.owner_user_id}
                            onChange={(e) => save(r.key, { owner_user_id: e.target.value })}>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                    </select>
                  </td>
                  <td className={cell}>
                    <select className={select} style={{ border: `1px solid ${BRAND.slate}` }} value={r.handoff}
                            onChange={(e) => save(r.key, { handoff: e.target.value as Handoff })}>
                      {(Object.keys(HANDOFF_LABEL) as Handoff[]).map((h) => <option key={h} value={h}>{HANDOFF_LABEL[h]}</option>)}
                    </select>
                  </td>
                  <td className={cell}>
                    <div className="flex flex-col gap-0.5">
                      {INPUTS.map((k) => (
                        <label key={k} className="inline-flex items-center gap-1">
                          <input type="checkbox" checked={r.inputs.includes(k)}
                                 onChange={(e) => save(r.key, {
                                   inputs: e.target.checked ? [...r.inputs, k] : r.inputs.filter((x) => x !== k),
                                 })} />
                          {INPUT_LABEL[k]}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className={cell}>
                    <select className={select} style={{ border: `1px solid ${BRAND.slate}` }} value={r.done_by_gate}
                            onChange={(e) => {
                              const g = Number(e.target.value);
                              save(r.key, { done_by_gate: g, ...(r.started_by_gate && r.started_by_gate > g ? { started_by_gate: null } : {}) });
                            }}>
                      {[1, 2, 3].map((g) => <option key={g} value={g}>Gate {g}</option>)}
                    </select>
                  </td>
                  <td className={cell}>
                    <select className={select} style={{ border: `1px solid ${BRAND.slate}` }} value={r.started_by_gate ?? ''}
                            onChange={(e) => save(r.key, { started_by_gate: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">—</option>
                      {[1, 2, 3].filter((g) => g <= r.done_by_gate).map((g) => <option key={g} value={g}>Gate {g}</option>)}
                    </select>
                  </td>
                  <td className={cell}>
                    <input type="checkbox" checked={r.allows_na} onChange={(e) => save(r.key, { allows_na: e.target.checked })} />
                  </td>
                  <td className={cell}>
                    <input type="checkbox" checked={r.active} onChange={(e) => save(r.key, { active: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-3" style={{ color: BRAND.slate }}>
          Gate 1 = first LOI draft sent · Gate 2 = landlord’s first response · Gate 3 = final LOI in (ready for Adam to sign).
          A Gate 1 slide whose inputs aren’t in yet slips to Gate 2. Adding a new slide needs a migration.
        </p>
      </div>
    </div>
  );
}
