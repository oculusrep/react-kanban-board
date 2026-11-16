import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * "Recently built only": runs just the recently-built pass (Gemini, once per
 * municipality in the radius) plus its post-run steps, for a site that has
 * already been researched. Shows the estimated cost before confirming.
 * Drop-in: takes the site id; works in a sidebar or a slideout.
 * Doc: docs/MARKET_RESEARCH_RECENTLY_BUILT.md
 */

interface Preview {
  municipalities: { id: string; name: string; kind: string; distance_mi: number }[];
  search_calls: number;
  est_search_cents: number;
  est_locate_cents: number;
  est_total_cents: number;
  basis: string;
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function RecentlyBuiltButton({ siteSubmitId, onStarted }: { siteSubmitId: string; onStarted?: (runId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [radius, setRadius] = useState<number>(5);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Default to the radius the site was last researched at.
  useEffect(() => {
    let cancelled = false;
    supabase.from('research_run').select('radius_miles').eq('site_submit_id', siteSubmitId)
      .order('triggered_at', { ascending: false }).limit(1)
      .then(({ data }) => { if (!cancelled && data?.[0]?.radius_miles) setRadius(data[0].radius_miles); });
    return () => { cancelled = true; };
  }, [siteSubmitId]);

  const loadPreview = async (r: number) => {
    setPreview(null);
    setError(null);
    setBusy('Estimating…');
    try {
      const { data, error: e } = await supabase.functions.invoke('research-recent-built', {
        body: { mode: 'preview', site_id: siteSubmitId, radius_miles: r },
      });
      if (e) throw e;
      if (data?.error) throw new Error(data.detail ?? data.error);
      setPreview(data as Preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    setBusy('Starting…');
    setError(null);
    try {
      const { data, error: e } = await supabase.functions.invoke('research-recent-built', {
        body: { mode: 'run', site_id: siteSubmitId, radius_miles: radius },
      });
      if (e) throw e;
      if (data?.error) throw new Error(data.detail ?? data.error);
      setDone('Started — searching in the background. It appears in the runs list below; Telegram reports when it finishes.');
      setPreview(null);
      onStarted?.(data.research_run_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setDone(null); loadPreview(radius); }}
        className="px-2 py-1 rounded text-xs font-medium border"
        style={{ borderColor: '#4A6B94', color: '#4A6B94', backgroundColor: '#FFFFFF' }}
        title="Ask Gemini (live search) for communities of 25+ homes completed since 2020 in each municipality in the radius, then dedupe, locate and check the radius. No agent run."
      >
        🏘 Recently built only
      </button>
    );
  }

  return (
    <div className="rounded-md border p-2 text-xs space-y-1" style={{ borderColor: '#8FA9C8', backgroundColor: '#F8FAFC', color: '#002147' }}>
      <div className="font-semibold">Recently built only (since 2020)</div>
      {done ? (
        <div style={{ color: '#4A6B94' }}>{done}</div>
      ) : (
        <>
          <label className="flex items-center gap-1">
            Radius
            <input type="number" min={1} max={50} value={radius} disabled={!!busy}
                   onChange={(e) => setRadius(Number(e.target.value))}
                   onBlur={() => loadPreview(radius)}
                   className="w-14 px-1 py-0.5 border rounded" style={{ borderColor: '#8FA9C8' }} />
            mi
          </label>
          {busy && !preview && <div style={{ color: '#4A6B94' }}>{busy}</div>}
          {preview && (
            <div style={{ color: '#4A6B94' }}>
              {preview.search_calls} Gemini search{preview.search_calls === 1 ? '' : 'es'} ({preview.municipalities.map((m) => m.name).join(', ')})
              {' '}≈ {usd(preview.est_search_cents)} + locating ≈ {usd(preview.est_locate_cents)}
              {' '}= <span className="font-semibold" style={{ color: '#002147' }}>~{usd(preview.est_total_cents)}</span>
              <div style={{ color: '#8FA9C8' }}>Estimate ({preview.basis}). Locating depends on how many come back without a precise address.</div>
            </div>
          )}
        </>
      )}
      {error && <div style={{ color: '#A27B5C' }}>{error}</div>}
      <div className="flex gap-2 pt-1">
        {!done && (
          <button type="button" onClick={run} disabled={!!busy || !preview || preview.search_calls === 0}
                  className="px-2 py-1 rounded font-medium"
                  style={{ backgroundColor: busy || !preview ? '#8FA9C8' : '#002147', color: '#FFFFFF' }}>
            {busy && preview ? busy : preview ? `Confirm — ~${usd(preview.est_total_cents)}` : 'Confirm'}
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} disabled={busy === 'Starting…'}
                className="px-2 py-1 rounded border" style={{ borderColor: '#8FA9C8', color: '#4A6B94', backgroundColor: '#FFFFFF' }}>
          {done ? 'Close' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
