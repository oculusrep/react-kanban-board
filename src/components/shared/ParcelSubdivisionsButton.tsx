import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * "Parcel subdivisions": groups the county parcel layer's residential parcels
 * within the radius by subdivision name (25+ parcels), asks Gemini when each
 * was built, and stages 2020+ build-outs (Recently Completed) and still-building
 * ones (Under Construction); pre-2020 ones go to the Established layer.
 * Drop-in: takes the site id; works in a sidebar or a slideout.
 * Doc: docs/MARKET_RESEARCH_PARCEL_SUBDIVISIONS.md
 */

interface Preview {
  municipalities: string[];
  layers: string[];
  no_layer: string[];
  cents_per_subdivision: number;
  basis: string;
}

export function ParcelSubdivisionsButton({ siteSubmitId, radiusMiles = 5, onStarted }: {
  siteSubmitId: string; radiusMiles?: number; onStarted?: (runId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [radius, setRadius] = useState(radiusMiles);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const call = async (mode: 'parcel_preview' | 'parcel_run', r: number) => {
    const { data, error: e } = await supabase.functions.invoke('research-recent-built', {
      body: { mode, site_id: siteSubmitId, radius_miles: r },
    });
    if (e) throw e;
    if (data?.error) throw new Error(data.detail ?? data.error);
    return data;
  };

  const loadPreview = async (r: number) => {
    setPreview(null); setError(null); setBusy('Checking parcel layers…');
    try { setPreview(await call('parcel_preview', r) as Preview); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const run = async () => {
    setBusy('Starting…'); setError(null);
    try {
      const data = await call('parcel_run', radius);
      setDone('Started — reading the parcel layer and searching in the background. It appears in the runs list below; Telegram reports when it finishes.');
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
      <button type="button" onClick={() => { setOpen(true); setDone(null); void loadPreview(radius); }}
              className="px-2 py-1 rounded text-xs font-medium border"
              style={{ borderColor: '#4A6B94', color: '#4A6B94', backgroundColor: '#FFFFFF' }}
              title="Group the county parcel layer by subdivision (25+ parcels), ask Gemini when each was built, stage 2020+ ones; pre-2020 ones go to the Established layer.">
        🧱 Parcel subdivisions
      </button>
    );
  }

  return (
    <div className="rounded-md border p-2 text-xs space-y-1" style={{ borderColor: '#8FA9C8', backgroundColor: '#F8FAFC', color: '#002147' }}>
      <div className="font-semibold">Parcel subdivisions (built-out neighborhoods)</div>
      {done ? <div style={{ color: '#4A6B94' }}>{done}</div> : (
        <>
          <label className="flex items-center gap-1">
            Radius
            <input type="number" min={1} max={50} value={radius} disabled={!!busy}
                   onChange={(e) => setRadius(Number(e.target.value))} onBlur={() => loadPreview(radius)}
                   className="w-14 px-1 py-0.5 border rounded" style={{ borderColor: '#8FA9C8' }} />
            mi
          </label>
          {busy && !preview && <div style={{ color: '#4A6B94' }}>{busy}</div>}
          {preview && (
            <div style={{ color: '#4A6B94' }}>
              {preview.layers.length
                ? <>Layers: {preview.layers.join(', ')}. ~{preview.cents_per_subdivision}¢ per subdivision not already in OVIS.</>
                : <span style={{ color: '#A27B5C' }}>No parcel layer with subdivision names covers this radius.</span>}
              {preview.no_layer.length > 0 && <div style={{ color: '#8FA9C8' }}>No layer for: {preview.no_layer.join(', ')}</div>}
            </div>
          )}
        </>
      )}
      {error && <div style={{ color: '#A27B5C' }}>{error}</div>}
      <div className="flex gap-2 pt-1">
        {!done && (
          <button type="button" onClick={run} disabled={!!busy || !preview || preview.layers.length === 0}
                  className="px-2 py-1 rounded font-medium"
                  style={{ backgroundColor: busy || !preview?.layers.length ? '#8FA9C8' : '#002147', color: '#FFFFFF' }}>
            {busy && preview ? busy : 'Confirm'}
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
