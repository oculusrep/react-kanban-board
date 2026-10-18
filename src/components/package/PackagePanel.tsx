import React, { useState } from 'react';
import useDealPackage from '../../hooks/useDealPackage';
import {
  BRAND, GateState, INPUT_LABEL, InputKey, ManualInput, PACE_LABEL, ProgressRow, STATUS_LABEL,
  SlideRow, SlideStatus, nextAction, paceOf, paceStyle, setPackageInput, setSlideStatus, shortDate, startPackage,
} from '../../lib/packageTracker';
import GateDatesForm from './GateDatesForm';

interface PackagePanelProps {
  dealId: string;
}

const CHIP: Record<SlideStatus, React.CSSProperties> = {
  not_started:     { color: BRAND.slate, border: `1px solid ${BRAND.slate}` },
  in_progress:     { color: BRAND.steel, border: `1px solid ${BRAND.steel}` },
  waiting_on_mike: { color: BRAND.navy,  border: `1px solid ${BRAND.navy}`, fontWeight: 600 },
  done:            { color: '#FFFFFF',   backgroundColor: BRAND.steel },
  na:              { color: BRAND.slate, border: `1px dashed ${BRAND.slate}` },
};

const MANUAL_INPUTS: { key: InputKey; field: ManualInput; label: string }[] = [
  { key: 'site_plan', field: 'site_plan_received_at', label: 'Site plan received' },
  { key: 'dot_study', field: 'dot_study_received_at', label: 'DOT study in' },
  { key: 'final_loi', field: 'final_loi_at',          label: 'Final LOI in (Gate 3)' },
];

function gateText(at: string | null, state: GateState): string {
  if (state === 'reached') return shortDate(at);
  if (state === 'unknown') return 'date unknown';
  return 'not yet';
}

// Full package section (spec §2–§5): progress + pace, gates, inputs, slide list.
// Overlay-first: takes a dealId, works in the sidebar DATA tab or a popover.
export default function PackagePanel({ dealId }: PackagePanelProps) {
  const { info, error } = useDealPackage(dealId);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editingGates, setEditingGates] = useState(false);

  if (error) return <div className="px-4 py-3 text-xs" style={{ color: BRAND.terracotta }}>Package: {error}</div>;
  if (!info?.eligible) return null;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try { await fn(); } catch (e: any) { setErr(e?.message ?? 'Save failed'); } finally { setBusy(null); }
  };

  const { pkg, slides, progress, gateDates, owners } = info;
  const atOrPastLoi = ['Negotiating LOI', 'At Lease/PSA'].includes(info.dealStage ?? '');
  // Once-only entry is offered unprompted only when history can't answer and Mike hasn't yet.
  const showGateForm = editingGates || (!!progress?.gates_unknown && !gateDates);

  return (
    <div className="px-4 pb-4 pt-3 border-t mt-4 text-xs" style={{ borderColor: BRAND.slate, color: BRAND.navy }}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold">Slide package</h4>
        {pkg && <span style={{ color: BRAND.steel }}>Started {shortDate(pkg.started_at)}</span>}
      </div>

      {err && <p className="mb-2" style={{ color: BRAND.terracotta }}>{err}</p>}

      {!pkg ? (
        <div className="space-y-2">
          <p style={{ color: BRAND.steel }}>No package yet. Starting it creates the 11 slides and sends Noree her first tasks.</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy === 'start'}
              onClick={() => {
                if (!window.confirm('Start the slide package for this deal? This sends Noree her first tasks.')) return;
                run('start', () => startPackage(dealId));
              }}
              className="px-2.5 py-1 rounded text-white disabled:opacity-60"
              style={{ backgroundColor: BRAND.navy }}
            >
              {busy === 'start' ? 'Starting…' : 'Start Package'}
            </button>
            {atOrPastLoi && !editingGates && (
              <button type="button" onClick={() => setEditingGates(true)} className="underline" style={{ color: BRAND.steel }}>
                {gateDates ? 'Edit gate dates' : 'Enter gate dates'}
              </button>
            )}
          </div>
          {gateDates && !editingGates && (
            <p style={{ color: BRAND.steel }}>
              Gate dates on file: draft sent {gateDates.first_draft_sent_on ? shortDate(gateDates.first_draft_sent_on) : 'not yet'},
              first response {gateDates.first_response_on ? shortDate(gateDates.first_response_on) : 'not yet'}.
            </p>
          )}
          {editingGates && (
            <GateDatesForm dealId={dealId} current={gateDates} onDone={() => setEditingGates(false)} />
          )}
        </div>
      ) : (
        <>
          <ProgressSummary progress={progress} />

          {/* Gates */}
          {progress && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: BRAND.steel }}>
              <span>Draft sent: <b style={{ color: progress.gate1_state === 'unknown' ? BRAND.terracotta : BRAND.navy }}>{gateText(progress.gate1_at, progress.gate1_state)}</b></span>
              <span>LL response: <b style={{ color: progress.gate2_state === 'unknown' ? BRAND.terracotta : BRAND.navy }}>{gateText(progress.gate2_at, progress.gate2_state)}</b></span>
              <span>Ready to sign: <b style={{ color: BRAND.navy }}>{gateText(progress.gate3_at, progress.gate3_state)}</b></span>
              {!showGateForm && (
                <button type="button" onClick={() => setEditingGates(true)} className="underline">Edit</button>
              )}
            </div>
          )}
          {showGateForm && (
            <div className="mt-2 p-2 rounded" style={{ border: `1px dashed ${BRAND.slate}` }}>
              {progress?.gates_unknown && !gateDates && (
                <p className="mb-1 font-semibold">Gate dates can’t be recovered from history — enter them once.</p>
              )}
              <GateDatesForm
                dealId={dealId}
                current={gateDates}
                derivedFirstDraft={progress?.gate1_state === 'reached' ? progress.gate1_at : null}
                derivedFirstResponse={progress?.gate2_state === 'reached' ? progress.gate2_at : null}
                onDone={editingGates ? () => setEditingGates(false) : undefined}
              />
            </div>
          )}

          {/* Inputs */}
          <div className="mt-3">
            <div className="font-semibold mb-1">Inputs</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(['market_research', 'site_story'] as InputKey[]).map((k) => (
                <span key={k} style={{ color: autoInputReady(slides, k) ? BRAND.navy : BRAND.terracotta }}>
                  {autoInputReady(slides, k) ? '✓' : '○'} {INPUT_LABEL[k]}
                </span>
              ))}
              {MANUAL_INPUTS.map(({ field, label }) => (
                <label key={field} className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!pkg[field]}
                    disabled={busy === field}
                    onChange={(e) => run(field, () => setPackageInput(dealId, pkg.id, field, e.target.checked))}
                  />
                  <span>{label}{pkg[field] ? ` · ${shortDate(pkg[field])}` : ''}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Slides */}
          <ul className="mt-3 divide-y" style={{ borderColor: BRAND.slate }}>
            {slides.map((s) => (
              <SlideItem
                key={s.id}
                slide={s}
                owner={owners[s.owner_user_id] ?? ''}
                busy={busy === s.id}
                onSet={(to) => run(s.id, () => setSlideStatus(dealId, s, to))}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Market Research / Site Story are resolved by the database per slide; the
// input is "in" when no slide that needs it reports it missing.
function autoInputReady(slides: SlideRow[], key: InputKey): boolean {
  const needing = slides.filter((s) => s.inputs.includes(key));
  return needing.length > 0 && needing.every((s) => !s.missing_inputs.includes(key));
}

function ProgressSummary({ progress }: { progress: ProgressRow | null }) {
  if (!progress) return null;
  const pace = paceOf(progress);
  const { fill, track } = paceStyle(pace);
  const pct = progress.applicable > 0 ? Math.round((progress.done / progress.applicable) * 100) : 0;
  return (
    <div>
      <div className="w-full h-2 rounded-sm overflow-hidden" style={{ backgroundColor: BRAND.page, ...track }}>
        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: fill }} />
      </div>
      <div className="mt-1 flex justify-between">
        <span>
          {progress.done} of {progress.applicable} done
          {progress.waiting_on_mike > 0 && <> · <b>{progress.waiting_on_mike} waiting on Mike</b></>}
        </span>
        <span style={{ color: pace === 'on_pace' ? BRAND.steel : BRAND.terracotta }}>{PACE_LABEL[pace]}</span>
      </div>
    </div>
  );
}

function SlideItem({ slide, owner, busy, onSet }: {
  slide: SlideRow; owner: string; busy: boolean; onSet: (to: SlideStatus) => void;
}) {
  const action = nextAction(slide);
  const eff = slide.effective_status;
  return (
    <li className="py-1.5 flex items-start gap-2">
      <span className="w-4 text-right" style={{ color: BRAND.slate }}>{slide.position}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{slide.label}</span>
          {owner && <span style={{ color: BRAND.slate }}>{owner}</span>}
        </div>
        {slide.missing_inputs.length > 0 && eff !== 'done' && eff !== 'na' && (
          <div style={{ color: BRAND.terracotta }}>Needs {slide.missing_inputs.map((k) => INPUT_LABEL[k]).join(' + ')}</div>
        )}
      </div>
      <span className="px-1.5 py-0.5 rounded whitespace-nowrap" style={CHIP[eff]}>{STATUS_LABEL[eff]}</span>
      <div className="flex gap-1 whitespace-nowrap">
        {action && (
          <button type="button" disabled={busy} onClick={() => onSet(action.to)}
                  className="px-1.5 py-0.5 rounded disabled:opacity-60" style={{ border: `1px solid ${BRAND.steel}`, color: BRAND.steel }}>
            {action.label}
          </button>
        )}
        {(slide.status === 'done' || slide.status === 'na') && (
          <button type="button" disabled={busy} onClick={() => onSet(slide.status === 'na' ? 'not_started' : 'in_progress')}
                  className="px-1.5 py-0.5 rounded disabled:opacity-60" style={{ color: BRAND.steel }}>
            Reopen
          </button>
        )}
        {slide.allows_na && slide.status !== 'na' && slide.status !== 'done' && (
          <button type="button" disabled={busy} onClick={() => onSet('na')}
                  className="px-1.5 py-0.5 rounded disabled:opacity-60" style={{ color: BRAND.slate }}>
            N/A
          </button>
        )}
      </div>
    </li>
  );
}
