import React, { useEffect, useRef, useState } from 'react';
import useDealPackage from '../../hooks/useDealPackage';
import {
  BRAND, PACE_LABEL, isStale, paceOf, paceStyle, shortDate, startPackage,
} from '../../lib/packageTracker';
import PackagePanel from './PackagePanel';

interface PackageBadgeProps {
  dealId: string;
  // 'dark' = on the green/navy sidebar header (white text); 'light' = on a white bar.
  tone?: 'dark' | 'light';
  // Click opens the full panel in a popover (DealHeaderBar, where there is no DATA tab).
  expandable?: boolean;
}

// Sidebar badge (spec §2): Start Package → "Sent to Noree · date" (terracotta
// outline after PACKAGE_STALE_DAYS with nothing started) → progress bar
// "X of Y · N waiting on Mike". Renders nothing for non-Starbucks deals.
export default function PackageBadge({ dealId, tone = 'dark', expandable = false }: PackageBadgeProps) {
  const { info } = useDealPackage(dealId);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!info?.eligible) return null;

  const text = tone === 'dark' ? '#FFFFFF' : BRAND.navy;
  const sub = tone === 'dark' ? 'rgba(255,255,255,0.8)' : BRAND.steel;

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Start the slide package for this deal? This sends Noree her first tasks.')) return;
    setStarting(true);
    setErr(null);
    try { await startPackage(dealId); } catch (x: any) { setErr(x?.message ?? 'Could not start package'); }
    finally { setStarting(false); }
  };

  let body: React.ReactNode;
  if (!info.pkg) {
    body = (
      <button
        type="button"
        onClick={handleStart}
        disabled={starting}
        className="text-xs font-semibold px-2.5 py-1 rounded transition-opacity hover:opacity-90 disabled:opacity-60"
        style={tone === 'dark'
          ? { backgroundColor: '#FFFFFF', color: BRAND.navy }
          : { backgroundColor: BRAND.navy, color: '#FFFFFF' }}
        title="Create the 11-slide package and send Noree her tasks"
      >
        {starting ? 'Starting…' : 'Start Package'}
      </button>
    );
  } else if (info.progress && !info.progress.any_started) {
    const stale = isStale(info.progress);
    body = (
      <span
        className="text-xs px-2 py-0.5 rounded"
        style={{ color: text, border: `1px solid ${stale ? BRAND.terracotta : 'transparent'}` }}
        title={stale ? 'Nothing started yet' : undefined}
      >
        Sent to Noree · {shortDate(info.pkg.started_at)}
      </span>
    );
  } else {
    const p = info.progress;
    const pace = paceOf(p);
    const { fill, track } = paceStyle(pace);
    const pct = p && p.applicable > 0 ? Math.round((p.done / p.applicable) * 100) : 0;
    body = (
      <span className="flex items-center gap-2" title={PACE_LABEL[pace]}>
        <span className="inline-block w-20 h-1.5 rounded-sm overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.25)', ...track }}>
          <span className="block h-full" style={{ width: `${pct}%`, backgroundColor: fill }} />
        </span>
        <span className="text-xs" style={{ color: text }}>
          {p?.done ?? 0} of {p?.applicable ?? 0}
          {p && p.waiting_on_mike > 0 && <span style={{ color: sub }}> · {p.waiting_on_mike} waiting on Mike</span>}
        </span>
      </span>
    );
  }

  return (
    <div ref={ref} className="relative inline-flex items-center gap-2">
      {expandable && info.pkg ? (
        <button type="button" onClick={() => setOpen((v) => !v)} className="hover:opacity-90" aria-expanded={open}>
          {body}
        </button>
      ) : body}
      {expandable && !info.pkg && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs underline" style={{ color: sub }}>
          Gate dates
        </button>
      )}
      {err && <span className="text-xs" style={{ color: BRAND.terracotta }}>{err}</span>}
      {expandable && open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-[440px] max-h-[70vh] overflow-y-auto bg-white rounded shadow-lg"
          style={{ border: `1px solid ${BRAND.slate}` }}
        >
          <PackagePanel dealId={dealId} />
        </div>
      )}
    </div>
  );
}
