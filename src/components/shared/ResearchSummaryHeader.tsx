import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * Summary header for a research run or sweep. Every PENDING record is in
 * exactly one bucket (logic in get_research_summary, the same function the
 * "Sweep ready" Telegram uses):
 *   Ready             - has a unit count, no open dedupe conflict, inside the radius
 *   Needs a decision  - open count conflict, unresolved possible duplicate,
 *                       distance / jurisdiction flag; units as a low–high range
 *   Leads             - no unit count; excluded from unit totals
 *
 * Live: refetches whenever `refreshKey` changes (the parent passes a key built
 * from the staged rows' state, so approve / reject / resolve updates it).
 * Drop-in: takes run ids, no routing.
 */

interface Summary {
  pending: number;
  ready: { records: number; units: number; estimated_units: number; with_boundary?: number; with_precise_pin?: number };
  recent?: { records: number; units: number; without_count: number; outside_radius: number };
  decision: { records: number; groups: number; units_low: number; units_high: number };
  leads: { records: number };
}

const n = (x: number) => Number(x ?? 0).toLocaleString('en-US');

export function ResearchSummaryHeader({ runIds, refreshKey }: { runIds: string[]; refreshKey: string }) {
  const [s, setS] = useState<Summary | null>(null);
  const key = [...runIds].sort().join(',');

  useEffect(() => {
    if (!key) { setS(null); return; }
    let cancelled = false;
    supabase.rpc('get_research_summary', { p_run_ids: key.split(',') }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) { console.warn('get_research_summary failed', error.message); return; }
      setS(data as Summary);
    });
    return () => { cancelled = true; };
  }, [key, refreshKey]);

  if (!s) return null;
  const lo = s.decision.units_low;
  const hi = s.decision.units_high;

  return (
    <div className="rounded-md border px-3 py-2 grid gap-1 sm:grid-cols-3 text-sm"
         style={{ borderColor: '#8FA9C8', backgroundColor: '#FFFFFF', color: '#002147' }}>
      <div title="Has a unit count, no open dedupe conflict, inside the radius">
        <span className="font-semibold">✅ {n(s.ready.records)} ready to approve</span>
        <div className="text-xs" style={{ color: '#4A6B94' }}>
          {n(s.ready.units)} units{s.ready.estimated_units > 0 ? ` (${n(s.ready.estimated_units)} estimated)` : ''}
        </div>
        <div className="text-xs" style={{ color: '#4A6B94' }}
             title="Parcel boundary fetched from the county fabric (post-run step); dashed on the map until reviewed">
          🗺 {n(s.ready.with_boundary ?? 0)} of {n(s.ready.records)} have boundaries
        </div>
        <div className="text-xs" style={{ color: '#4A6B94' }}
             title="Boundary, an address that geocodes precisely (rooftop / interpolated / intersection), or a pin the locate step placed (EST. LOCATION)">
          📍 {n(s.ready.with_precise_pin ?? 0)} of {n(s.ready.records)} have a precise pin
        </div>
      </div>
      <div title="Open count conflicts, possible duplicates the rule couldn't resolve, distance / jurisdiction flags. Units: per group, smallest to largest count.">
        <span className="font-semibold" style={{ color: s.decision.records > 0 ? '#A27B5C' : '#002147' }}>
          ⚠️ {n(s.decision.records)} need a decision
        </span>
        <div className="text-xs" style={{ color: '#4A6B94' }}>
          {s.decision.records === 0 ? '—' : `${lo === hi ? n(lo) : `${n(lo)}–${n(hi)}`} units`}
        </div>
      </div>
      <div title="No unit count; not in the unit totals">
        <span className="font-semibold">📋 {n(s.leads.records)} leads</span>
        <div className="text-xs" style={{ color: '#4A6B94' }}>no count</div>
      </div>
      {s.recent && (s.recent.records > 0 || s.recent.outside_radius > 0) && (
        <div className="sm:col-span-3 text-xs pt-1 border-t" style={{ borderColor: '#E2E8F0', color: '#0F766E' }}
             title="Recently built pass: communities completed since 2020 (Gemini web search). Kept out of the pipeline counts above.">
          <span className="font-semibold">🏘 {n(s.recent.records)} recently built · {n(s.recent.units)} units</span>
          {s.recent.without_count > 0 && <span style={{ color: '#4A6B94' }}> · {n(s.recent.without_count)} without a count</span>}
          {s.recent.outside_radius > 0 && <span style={{ color: '#4A6B94' }}> · {n(s.recent.outside_radius)} outside the radius</span>}
        </div>
      )}
    </div>
  );
}
