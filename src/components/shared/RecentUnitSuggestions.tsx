import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * Recently built pass: pending "replace" suggestions — an existing OVIS record
 * where Gemini found a higher unit count (beyond 5%). Shows "OVIS X → Gemini Y
 * (source)" with one-click Replace, or Dismiss. Nothing changes until clicked.
 * Drop-in: takes run ids; works in the approval modal or any panel.
 * Doc: docs/MARKET_RESEARCH_RECENTLY_BUILT.md
 */

interface Suggestion {
  id: string;
  name: string;
  known_kind: 'committed' | 'staged';
  known_name: string | null;
  ovis_units: number | null;
  gemini_units: number;
  gemini_source: string | null;
  year_completed: number | null;
  basis: 'gemini' | 'parcels';
  parcel_count: number | null;
}

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };

export function RecentUnitSuggestions({ runIds, canApprove, onChanged }: {
  runIds: string[]; canApprove: boolean; onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (runIds.length === 0) { setRows([]); return; }
    const { data, error: e } = await supabase.from('research_recent_log')
      .select('id, name, known_kind, known_name, ovis_units, gemini_units, gemini_source, year_completed, basis, parcel_count')
      .in('research_run_id', runIds).eq('state', 'pending').order('name');
    if (e) { setError(e.message); return; }
    setRows((data ?? []) as Suggestion[]);
  }, [runIds]);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, fn: 'research_recent_apply_replace' | 'research_recent_dismiss') => {
    setBusy(id);
    setError(null);
    const { error: e } = await supabase.rpc(fn, { p_log_id: id });
    setBusy(null);
    if (e) { setError(e.message); return; }
    setRows((r) => r.filter((x) => x.id !== id));
    onChanged?.();
  };

  if (rows.length === 0 && !error) return null;
  return (
    <div className="rounded-lg border p-3 text-sm" style={{ borderColor: '#0F766E', backgroundColor: '#F0FDFA', color: '#002147' }}>
      <div className="font-semibold mb-1" style={{ color: '#0F766E' }}>
        🔁 Unit count — existing records ({rows.length})
      </div>
      <div className="text-xs mb-2" style={{ color: '#4A6B94' }}>
        The recently built pass (Gemini) or the parcel subdivisions pass (county parcel count) found a higher count for these records already in OVIS. Nothing changes unless you click Replace.
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-medium">{r.known_name ?? r.name}</span>
              <span className="text-xs" style={{ color: '#8FA9C8' }}> {r.known_kind === 'staged' ? '(pending record)' : '(project)'}</span>
              {': '}
              <span>OVIS {r.ovis_units ?? '—'} → <span className="font-semibold">{r.basis === 'parcels' ? 'Parcels' : 'Gemini'} {r.gemini_units}</span></span>
              {r.basis === 'parcels' && r.name !== r.known_name && (
                <span className="text-xs" style={{ color: '#4A6B94' }}> (subdivision “{r.name}”)</span>
              )}
              {r.gemini_source && r.basis !== 'parcels' && (
                <> (<a href={r.gemini_source} target="_blank" rel="noreferrer" className="underline" style={{ color: '#4A6B94' }}>{host(r.gemini_source)}</a>)</>
              )}
            </div>
            {canApprove && (
              <div className="flex gap-1 flex-shrink-0">
                <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'research_recent_apply_replace')}
                        className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: '#002147', color: '#FFFFFF' }}>
                  Replace
                </button>
                <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'research_recent_dismiss')}
                        className="px-2 py-0.5 rounded text-xs border" style={{ borderColor: '#8FA9C8', color: '#4A6B94', backgroundColor: '#FFFFFF' }}>
                  Dismiss
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <div className="text-xs mt-1" style={{ color: '#A27B5C' }}>{error}</div>}
    </div>
  );
}
