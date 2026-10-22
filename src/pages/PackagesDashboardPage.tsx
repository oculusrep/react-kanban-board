import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SiteSubmitSidebar from '../components/shared/SiteSubmitSidebar';
import usePackagesDashboard, { PackageRowView } from '../hooks/usePackagesDashboard';
import {
  BRAND, GateState, INPUT_LABEL, PACE_LABEL, ProgressRow, paceStyle, shortDate, startPackageForCard,
} from '../lib/packageTracker';

// Starbucks Packages dashboard (decisions 2026-10-22). Read-only except Start
// Package. Rows = board cards in Pre-Submittal, Submitted-Reviewing and
// Negotiating LOI; not-started rows first, then by pace. Row click opens the
// same sidebar the map and pipeline report open. Board colours, no green.
// The first column is reserved for drag-to-prioritize (later).

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function currentGate(p: ProgressRow): { label: string; unknown: boolean } | null {
  const gates: [number, string | null, GateState][] = [
    [3, p.gate3_at, p.gate3_state], [2, p.gate2_at, p.gate2_state], [1, p.gate1_at, p.gate1_state],
  ];
  for (const [n, at, st] of gates) if (st === 'reached') return { label: `Gate ${n} · ${shortDate(at)}`, unknown: false };
  if (p.gate1_state === 'unknown') return { label: 'Gate 1 date unknown', unknown: true };
  if (p.gate2_state === 'unknown') return { label: 'Gate 2 date unknown', unknown: true };
  return { label: 'Before Gate 1', unknown: false };
}

const STAGE_SHORT: Record<string, string> = {
  'Pre-Submittal': 'Pre-Submittal',
  'Submitted-Reviewing': 'Submitted',
  'Negotiating LOI': 'LOI',
};

export default function PackagesDashboardPage() {
  const navigate = useNavigate();
  const { rows, loading, error, refresh } = usePackagesDashboard();
  const [sidebar, setSidebar] = useState<{ siteSubmitId: string | null; dealId: string | null } | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const notStarted = rows.filter((r) => !r.progress).length;

  const start = async (r: PackageRowView) => {
    if (!window.confirm(`Start the slide package for ${r.card.name}? Noree gets tasks for the slides whose inputs are already in.`)) return;
    setStarting(r.card.id);
    setStartError(null);
    try {
      await startPackageForCard(r.card.siteSubmitId, r.card.dealId);
      refresh();
    } catch (e: any) {
      setStartError(`${r.card.name}: ${e?.message ?? 'could not start package'}`);
    } finally {
      setStarting(null);
    }
  };

  const th = 'px-3 py-2 text-left font-semibold whitespace-nowrap';
  const td = 'px-3 py-2 align-middle';

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: BRAND.page }}>
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: BRAND.navy }}>Starbucks Packages</h1>
            <p className="text-sm" style={{ color: BRAND.steel }}>
              {rows.length} sites in Pre-Submittal, Submitted and LOI · {notStarted} not started
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <button type="button" onClick={() => navigate('/starbucks-board')} className="px-3 py-1.5 rounded"
                    style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.navy, backgroundColor: '#FFFFFF' }}>Deal Board</button>
            <button type="button" onClick={() => navigate('/reports/starbucks-pipeline')} className="px-3 py-1.5 rounded"
                    style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.navy, backgroundColor: '#FFFFFF' }}>Pipeline Report</button>
          </div>
        </div>

        {(error || startError) && (
          <p className="text-sm mb-3" style={{ color: BRAND.terracotta }}>{startError ?? error}</p>
        )}

        <div className="bg-white rounded overflow-x-auto" style={{ border: `1px solid ${BRAND.slate}` }}>
          <table className="w-full text-sm" style={{ color: BRAND.navy }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BRAND.slate}`, backgroundColor: BRAND.page }}>
                <th className="w-6" aria-label="Priority (drag — coming later)" />
                <th className={th}>Site / deal</th>
                <th className={th}>Stage</th>
                <th className={th}>Progress</th>
                <th className={th}>Waiting on Mike</th>
                <th className={th}>Missing inputs</th>
                <th className={th}>Tour-ready</th>
                <th className={th}>Gate</th>
                <th className={th}>Pace</th>
                <th className={th}>Days</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={10} className={td} style={{ color: BRAND.steel }}>Loading…</td></tr>
              )}
              {rows.map((r) => (
                <Row
                  key={r.card.id}
                  r={r}
                  td={td}
                  starting={starting === r.card.id}
                  onOpen={() => setSidebar({ siteSubmitId: r.card.siteSubmitId, dealId: r.card.dealId })}
                  onStart={() => start(r)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-2" style={{ color: BRAND.slate }}>
          Tour-ready = Market Aerial, Demo Map and Site Plan done. Pace follows the LOI gates; pre-LOI packages read on pace.
          Start Package isn’t offered on cards still waiting to be classified on the board.
        </p>
      </div>

      <SiteSubmitSidebar
        siteSubmitId={sidebar?.siteSubmitId ?? null}
        dealId={sidebar?.dealId ?? null}
        isOpen={sidebar !== null}
        onClose={() => setSidebar(null)}
        context="deal"
        onStatusChange={() => refresh()}
        onDataUpdate={() => refresh()}
      />
    </div>
  );
}

function Row({ r, td, starting, onOpen, onStart }: {
  r: PackageRowView; td: string; starting: boolean; onOpen: () => void; onStart: () => void;
}) {
  const p = r.progress;
  const pct = p && p.applicable > 0 ? Math.round((p.done / p.applicable) * 100) : 0;
  const style = r.pace ? paceStyle(r.pace) : null;
  const gate = p && r.card.stageLabel === 'Negotiating LOI' ? currentGate(p) : null;

  return (
    <tr onClick={onOpen} className="cursor-pointer hover:bg-slate-50" style={{ borderBottom: `1px solid ${BRAND.page}` }}>
      <td className="w-6" />
      <td className={td}>
        <div className="font-medium">{r.card.name}</div>
        <div className="flex items-center gap-2 text-xs" style={{ color: BRAND.slate }}>
          {r.card.city && <span>{r.card.city}</span>}
          <span>{r.card.accountToken}</span>
          {!r.card.dealId && (
            <span className="px-1.5 rounded" style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.steel }}>no deal yet</span>
          )}
          {r.parked && <span>parked</span>}
        </div>
      </td>
      <td className={`${td} whitespace-nowrap`} style={{ color: BRAND.steel }}>{STAGE_SHORT[r.card.stageLabel] ?? r.card.stageLabel}</td>
      <td className={td}>
        {p ? (
          <div className="flex items-center gap-2 min-w-[140px]">
            <div className="w-24 h-2 rounded-sm overflow-hidden" style={{ backgroundColor: BRAND.page, ...style!.track }}>
              <div className="h-full" style={{ width: `${pct}%`, backgroundColor: style!.fill }} />
            </div>
            <span className="text-xs whitespace-nowrap">{p.done} of {p.applicable}</span>
          </div>
        ) : r.toClassify ? (
          <span className="text-xs" style={{ color: BRAND.slate }} title="Classify this card on the deal board first">
            Not started · classify first
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: BRAND.slate }}>Not started</span>
            <button
              type="button"
              disabled={starting}
              onClick={(e) => { e.stopPropagation(); onStart(); }}
              className="text-xs font-semibold px-2 py-0.5 rounded text-white disabled:opacity-60"
              style={{ backgroundColor: BRAND.navy }}
            >
              {starting ? 'Starting…' : 'Start Package'}
            </button>
          </div>
        )}
      </td>
      <td className={td}>
        {p && p.waiting_on_mike > 0 ? <b>{p.waiting_on_mike}</b> : <span style={{ color: BRAND.slate }}>{p ? '0' : '—'}</span>}
      </td>
      <td className={`${td} text-xs`}>
        {r.missing.length
          ? <span style={{ color: BRAND.terracotta }}>{r.missing.map((k) => INPUT_LABEL[k]).join(', ')}</span>
          : <span style={{ color: BRAND.slate }}>—</span>}
      </td>
      <td className={`${td} text-xs whitespace-nowrap`}>
        {!p ? <span style={{ color: BRAND.slate }}>—</span>
          : p.tour_ready
            ? <span className="px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: BRAND.steel }}>Tour-ready</span>
            : <span style={{ color: BRAND.steel }}>{p.tour_ready_done} of 3</span>}
      </td>
      <td className={`${td} text-xs whitespace-nowrap`}>
        {gate ? <span style={{ color: gate.unknown ? BRAND.terracotta : BRAND.navy }}>{gate.label}</span>
              : <span style={{ color: BRAND.slate }}>—</span>}
      </td>
      <td className={`${td} text-xs whitespace-nowrap`}>
        {r.pace
          ? <span style={{ color: r.pace === 'on_pace' ? BRAND.steel : BRAND.terracotta, fontWeight: r.pace === 'late' ? 600 : 400 }}>{PACE_LABEL[r.pace]}</span>
          : <span style={{ color: BRAND.slate }}>—</span>}
      </td>
      <td className={`${td} text-xs`} style={{ color: BRAND.steel }}>{p ? daysSince(p.started_at) : '—'}</td>
    </tr>
  );
}
