import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { countyParcelStatus } from '../../services/parcelFabric';
import promptDoc from '../../../docs/PARCEL_ADAPTER_CC_PROMPT.md?raw';

/**
 * Parcel-adapter check for a research run or sweep. For each county the run's
 * municipalities sit in that has records with parcel IDs but no entry in
 * COUNTY_ADAPTERS (and isn't listed as having no public service), it shows
 * "Newton County — no parcel adapter (5 records with parcel IDs)" and a
 * "Copy cc prompt" button. The prompt text lives in
 * docs/PARCEL_ADAPTER_CC_PROMPT.md, so it can be edited without a code change.
 *
 * Informational only: it never blocks a run. Drop-in: takes run ids, no routing.
 */

interface CountyRow {
  county_id: string;
  county_name: string;
  state: string;
  municipalities: string[] | null;
  records_with_parcels: number;
  sample_parcel_ids: string[] | null;
}

function promptTemplate(): string {
  const m = promptDoc.match(/<!-- PROMPT START -->\s*([\s\S]*?)\s*<!-- PROMPT END -->/);
  return m ? m[1] : promptDoc;
}

export function buildParcelAdapterPrompt(c: CountyRow, runRef: string): string {
  const ids = (c.sample_parcel_ids ?? []).map((id) => `   - ${id}`).join('\n') || '   - (no parcel IDs found)';
  return promptTemplate()
    .split('{{COUNTY}}').join(c.county_name)
    .split('{{STATE}}').join(c.state)
    .split('{{MUNICIPALITIES}}').join((c.municipalities ?? []).join(', '))
    .split('{{RECORD_COUNT}}').join(String(c.records_with_parcels))
    .split('{{PARCEL_IDS}}').join(ids)
    .split('{{RUN_REF}}').join(runRef);
}

export function ParcelAdapterNotice({ runIds, runRef }: { runIds: string[]; runRef: string }) {
  const [rows, setRows] = useState<CountyRow[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const key = [...runIds].sort().join(',');

  useEffect(() => {
    if (!key) { setRows([]); return; }
    let cancelled = false;
    supabase.rpc('get_research_parcel_counties', { p_run_ids: key.split(',') }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) { console.warn('get_research_parcel_counties failed', error.message); setRows([]); return; }
      setRows(((data ?? []) as CountyRow[]).filter(
        (c) => c.records_with_parcels > 0 && countyParcelStatus(c.county_name) === 'missing',
      ));
    });
    return () => { cancelled = true; };
  }, [key]);

  if (rows.length === 0) return null;

  const copy = async (c: CountyRow) => {
    try {
      await navigator.clipboard.writeText(buildParcelAdapterPrompt(c, runRef));
      setCopied(c.county_id);
      setTimeout(() => setCopied((v) => (v === c.county_id ? null : v)), 2000);
    } catch (e) {
      console.warn('clipboard write failed', e);
    }
  };

  return (
    <div className="space-y-1">
      {rows.map((c) => (
        <div key={c.county_id} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs"
             style={{ borderColor: '#A27B5C', color: '#A27B5C', backgroundColor: '#FFFFFF' }}>
          <span>
            {c.county_name} — no parcel adapter ({c.records_with_parcels} record{c.records_with_parcels === 1 ? '' : 's'} with parcel IDs)
          </span>
          <button type="button" onClick={() => copy(c)}
                  className="px-2 py-0.5 rounded border whitespace-nowrap"
                  style={{ borderColor: '#4A6B94', color: '#4A6B94' }}
                  title="Copy a ready-to-paste Claude Code prompt that finds this county's parcel layer and adds the adapter">
            {copied === c.county_id ? 'Copied ✓' : 'Copy cc prompt'}
          </button>
        </div>
      ))}
    </div>
  );
}
