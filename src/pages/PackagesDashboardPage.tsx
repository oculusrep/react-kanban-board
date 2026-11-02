import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SiteSubmitSidebar from '../components/shared/SiteSubmitSidebar';
import usePackagesDashboard, { PackageRowView } from '../hooks/usePackagesDashboard';
import useTourPackageRows, { TourRowView } from '../hooks/useTourPackageRows';
import { TourOption, fetchTourOptions } from '../lib/packageTours';
import {
  BRAND, GateState, INPUT_LABEL, PACE_LABEL, ProgressRow, STATUS_LABEL, SlideRow, paceStyle, shortDate, startPackageForCard,
} from '../lib/packageTracker';

// Starbucks Packages dashboard (decisions 2026-10-22). Read-only except Start
// Package. Rows = board cards in Pre-Submittal, Submitted-Reviewing and
// Negotiating LOI; not-started rows first, then by pace. Row click opens the
// same sidebar the map and pipeline report open. Board colours, no green.
// The first column is reserved for drag-to-prioritize (later); in a tour view it
// holds the stop number.
//
// Tour filter (2026-10-30): a tour shows every stop, in stop order, packaged or
// not and in any stage. Closed stops (Pass, Lost / Killed, Use Declined, Not
// Available) sit dimmed at the bottom, hidden by default, and stay out of the
// header counts.

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
const LOI_STAGES = ['Negotiating LOI', 'LOI'];

export default function PackagesDashboardPage() {
  const navigate = useNavigate();
  const dash = usePackagesDashboard();
  const { slides, names, toggleDone, refresh } = dash;
  const [params, setParams] = useSearchParams();
  const tourId = params.get('tour');
  const [tours, setTours] = useState<TourOption[]>([]);
  const [hideClosed, setHideClosed] = useState(true);
  const tour = useTourPackageRows(tourId, dash);
  const tourName = tours.find((t) => t.id === tourId)?.tour_name ?? 'Tour';

  useEffect(() => {
    fetchTourOptions().then(setTours).catch(() => setTours([]));
  }, []);

  const setTour = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('tour', id); else next.delete('tour');
    setParams(next, { replace: true });
  };

  const rows: (PackageRowView | TourRowView)[] = tourId
    ? tour.rows.filter((r) => !(hideClosed && r.closed))
    : dash.rows;
  const loading = tourId ? tour.loading || dash.loading : dash.loading;
  const error = tourId ? tour.error ?? dash.error : dash.error;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpanded((cur) => {
    const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
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
            <h1 className="text-xl font-semibold" style={{ color: BRAND.navy }}>
              Starbucks Packages{tourId ? <span style={{ color: BRAND.steel }}> · {tourName}</span> : null}
            </h1>
            <p className="text-sm" style={{ color: BRAND.steel }}>
              {tourId ? (
                <>
                  {tour.summary.sites} sites · {tour.summary.tourReady} Tour-ready · {tour.summary.notStarted} not started
                  {tour.summary.closed > 0 && <span style={{ color: BRAND.slate }}> · {tour.summary.closed} closed</span>}
                </>
              ) : (
                <>{rows.length} sites in Pre-Submittal, Submitted and LOI · {notStarted} not started</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {tourId && tour.summary.closed > 0 && (
              <label className="flex items-center gap-1.5 text-xs mr-1" style={{ color: BRAND.steel }}>
                <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
                Hide closed
              </label>
            )}
            <select
              value={tourId ?? ''}
              onChange={(e) => setTour(e.target.value)}
              className="px-2 py-1.5 rounded bg-white"
              style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.navy }}
              aria-label="Tour"
            >
              <option value="">All packages</option>
              {tours.map((t) => (
                <option key={t.id} value={t.id}>{t.tour_name}{t.is_archived ? ' (archived)' : ''}</option>
              ))}
            </select>
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
                {tourId
                  ? <th className={th}>Stop</th>
                  : <th className="w-6" aria-label="Priority (drag — coming later)" />}
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
              {tourId && !loading && rows.length === 0 && (
                <tr><td colSpan={10} className={td} style={{ color: BRAND.steel }}>
                  {tour.rows.length ? 'Every stop on this tour is closed.' : 'No stops on this tour yet.'}
                </td></tr>
              )}
              {rows.map((r) => (
                <Fragment key={r.card.id}>
                  <Row
                    r={r}
                    td={td}
                    stopLabel={'stopLabel' in r ? r.stopLabel : undefined}
                    closed={'closed' in r ? r.closed : false}
                    starting={starting === r.card.id}
                    expanded={expanded.has(r.card.id)}
                    onToggle={r.progress ? () => toggleExpand(r.card.id) : undefined}
                    onOpen={() => setSidebar({ siteSubmitId: r.card.siteSubmitId, dealId: r.card.dealId })}
                    onStart={() => start(r)}
                  />
                  {r.progress && expanded.has(r.card.id) && (
                    <SlidesRow
                      slides={slides.get(r.progress.package_id) ?? []}
                      names={names}
                      onDone={(slideId, done) => toggleDone(r.progress!.package_id, slideId, done)}
                    />
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-2" style={{ color: BRAND.slate }}>
          Tour-ready = Market Aerial, Demo Map and Site Plan done. Pace follows the LOI gates; pre-LOI packages read on pace.
          Start Package isn’t offered on cards still waiting to be classified on the board
          {tourId ? ', or on closed stops (Pass, Lost / Killed, Use Declined, Not Available). Stops are numbered per tour day, as on the tour map; — = unscheduled.' : '.'}
        </p>
      </div>

      <SiteSubmitSidebar
        siteSubmitId={sidebar?.siteSubmitId ?? null}
        dealId={sidebar?.dealId ?? null}
        isOpen={sidebar !== null}
        onClose={() => { setSidebar(null); refresh(); }}
        context="deal"
        onStatusChange={() => refresh()}
        onDataUpdate={() => refresh()}
      />
    </div>
  );
}

// Expanded package: every slide with the quick-complete Done checkbox (any owner,
// skips approval and missing inputs; uncheck → Not started). Counts update at once.
function SlidesRow({ slides, names, onDone }: {
  slides: SlideRow[]; names: Record<string, string>; onDone: (slideId: string, done: boolean) => void;
}) {
  return (
    <tr style={{ backgroundColor: BRAND.page }}>
      <td />
      <td colSpan={9} className="px-3 py-2">
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs" style={{ color: BRAND.navy }}>
          {slides.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.status === 'done'}
                onChange={(e) => onDone(s.id, e.target.checked)}
                aria-label={`Mark ${s.label} done`}
                title={s.status === 'done' ? 'Uncheck to set back to Not started' : 'Mark done (any owner; skips approval and missing inputs)'}
              />
              <span className="w-4 text-right" style={{ color: BRAND.slate }}>{s.position}</span>
              <span className={s.status === 'done' ? 'line-through' : ''} style={{ color: s.status === 'done' ? BRAND.steel : BRAND.navy }}>{s.label}</span>
              <span style={{ color: BRAND.slate }}>{names[s.owner_user_id] ?? ''}</span>
              <span className="ml-auto" style={{ color: s.effective_status === 'waiting_on_mike' ? BRAND.navy : BRAND.slate }}>
                {s.status === 'done'
                  ? `Done${s.done_by && names[s.done_by] ? ` · ${names[s.done_by]}` : ''}${s.done_at ? ` · ${shortDate(s.done_at)}` : ''}`
                  : STATUS_LABEL[s.effective_status]}
              </span>
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}

function Row({ r, td, stopLabel, closed, starting, expanded, onToggle, onOpen, onStart }: {
  r: PackageRowView; td: string; stopLabel?: string; closed: boolean; starting: boolean; expanded: boolean;
  onToggle?: () => void; onOpen: () => void; onStart: () => void;
}) {
  const p = r.progress;
  const pct = p && p.applicable > 0 ? Math.round((p.done / p.applicable) * 100) : 0;
  const style = r.pace ? paceStyle(r.pace) : null;
  const gate = p && LOI_STAGES.includes(r.card.stageLabel) ? currentGate(p) : null;

  return (
    <tr onClick={onOpen} className="cursor-pointer hover:bg-slate-50"
        style={{ borderBottom: `1px solid ${BRAND.page}`, opacity: closed ? 0.5 : 1 }}>
      {stopLabel !== undefined
        ? <td className={`${td} text-xs whitespace-nowrap font-semibold`} style={{ color: BRAND.steel }}>{stopLabel}</td>
        : <td className="w-6" />}
      <td className={td}>
        <div className="font-medium flex items-center gap-1">
          {onToggle && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="w-4 text-xs"
              style={{ color: BRAND.steel }}
              aria-expanded={expanded}
              title={expanded ? 'Hide slides' : 'Show slides'}
            >{expanded ? '▾' : '▸'}</button>
          )}
          {r.card.name}
        </div>
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
        ) : closed ? (
          <span className="text-xs" style={{ color: BRAND.slate }}>Not started · closed</span>
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
