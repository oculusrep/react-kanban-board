import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface StartResearchModalProps {
  siteSubmitId: string;
  siteSubmitLabel: string;
  onClose: () => void;
  onStarted: (response: { research_run_id: string; selected_count: number }) => void;
}

interface PreviewMuni {
  boundary_municipality_id: string;
  kind: 'city' | 'county';
  name: string;
  geoid: string;
  distance_mi: number;
}

// One segment of the per-(municipality, record_type) coverage-depth map returned
// by get_research_coverage. Deep passes only; quick runs never appear here.
interface CoverageSegment {
  boundary_municipality_id: string;
  municipality_name: string | null;
  record_type: 'pz' | 'permit';
  segment_start: string;   // YYYY-MM-DD, inclusive
  segment_end: string;     // YYYY-MM-DD, inclusive
  pass_count: number;
  last_searched_at: string | null;
}

type Tier = 'quick' | 'deep' | 'custom';
type Mode = 'quick' | 'deep';

const RADIUS_PRESETS = [3, 5, 10, 15];

const TIERS: { key: Tier; label: string; cost: string; blurb: string }[] = [
  { key: 'quick',  label: 'Quick',  cost: 'Sniff test · ~$5',
    blurb: 'Sampled scan — is there a growth story here at all? Makes no completeness claim. Run early on every prospect.' },
  { key: 'deep',   label: 'Deep',   cost: 'Package run · ~$30',
    blurb: 'Full enumeration of every P&Z agenda + development-scale permit in the window, with a coverage report. Run once on the pitched site.' },
  { key: 'custom', label: 'Custom', cost: 'Pick mode + window',
    blurb: 'Choose the protocol and an explicit date range — e.g. to reach further back than the recent default.' },
];

// ---- Date helpers: Eastern local dates, mirroring the edge function so the
// windows shown here match what OVIS will send/store (per the OVIS timezone rule).
function easternToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}
function subtractYearsISO(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const ty = y - years;
  const lastDay = new Date(ty, m, 0).getDate();
  const dd = Math.min(d, lastDay);
  return `${ty}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
function fmtMonthYear(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * supabase-js's FunctionsHttpError exposes the raw Response on `.context`.
 * If we don't parse it, the user only sees "Edge Function returned a non-2xx
 * status code" — useless for diagnosis. This helper reads the body and pulls
 * the function's own `detail` / `error` field.
 */
async function extractInvokeError(err: unknown): Promise<string> {
  const ctx = (err as { context?: unknown }).context;
  if (ctx && typeof ctx === 'object' && 'json' in ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json();
      const detail = (body as { detail?: string; error?: string })?.detail
                   ?? (body as { detail?: string; error?: string })?.error;
      if (detail) return detail;
    } catch { /* fall through */ }
  }
  return err instanceof Error ? err.message : String(err);
}

export default function StartResearchModal({
  siteSubmitId,
  siteSubmitLabel,
  onClose,
  onStarted,
}: StartResearchModalProps) {
  const [tier, setTier] = useState<Tier>('quick');
  const [customMode, setCustomMode] = useState<Mode>('deep');
  const [customStart, setCustomStart] = useState<string>(() => subtractYearsISO(easternToday(), 3));
  const [customEnd, setCustomEnd] = useState<string>(() => easternToday());

  const [radius, setRadius] = useState<number>(10);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [munis, setMunis] = useState<PreviewMuni[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [coverage, setCoverage] = useState<CoverageSegment[]>([]);
  const [coverageLoading, setCoverageLoading] = useState(false);

  // ---- preview on mount + when radius changes ----
  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const { data, error } = await supabase.functions.invoke(
          'ovis-research-trigger',
          { body: { mode: 'preview', site_submit_id: siteSubmitId, radius_miles: radius } },
        );
        if (cancelled) return;
        if (error) throw new Error(await extractInvokeError(error));
        if (data && typeof data === 'object' && 'error' in data) {
          throw new Error((data as { detail?: string; error?: string }).detail ?? (data as { error: string }).error);
        }
        const list = (data as { municipalities?: PreviewMuni[] })?.municipalities ?? [];
        setMunis(list);
        setSelected(new Set(list.map((m) => m.boundary_municipality_id))); // default: all
      } catch (e) {
        if (cancelled) return;
        setMunis([]);
        setSelected(new Set());
        setPreviewError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }
    loadPreview();
    return () => { cancelled = true; };
  }, [siteSubmitId, radius]);

  // ---- coverage map (Deep passes only) on mount ----
  useEffect(() => {
    let cancelled = false;
    async function loadCoverage() {
      setCoverageLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_research_coverage', { p_site_submit_id: siteSubmitId });
        if (cancelled) return;
        // Non-blocking context — a coverage failure must never block starting a run.
        setCoverage(error ? [] : ((data ?? []) as CoverageSegment[]));
      } finally {
        if (!cancelled) setCoverageLoading(false);
      }
    }
    loadCoverage();
    return () => { cancelled = true; };
  }, [siteSubmitId]);

  // Resolved (mode, window) for the current tier. quick/deep let the edge function
  // fill the recent default window (it recomputes identically in Eastern time), so
  // we only send `research_mode`; the dates here are display-only. Custom sends
  // explicit bounds applied to both record types.
  const plan = useMemo(() => {
    const today = easternToday();
    if (tier === 'custom') {
      const start = customStart || subtractYearsISO(today, 3);
      const end = customEnd || today;
      return {
        mode: customMode as Mode,
        explicit: true,
        pz_window_start: start, pz_window_end: end,
        permit_window_start: start, permit_window_end: end,
      };
    }
    return {
      mode: tier as Mode,
      explicit: false,
      pz_window_start: subtractYearsISO(today, 3), pz_window_end: today,
      permit_window_start: subtractYearsISO(today, 2), permit_window_end: today,
    };
  }, [tier, customMode, customStart, customEnd]);

  // Coverage grouped: municipality -> record_type -> segments (newest first).
  const coverageByMuni = useMemo(() => {
    const m = new Map<string, { name: string; pz: CoverageSegment[]; permit: CoverageSegment[] }>();
    for (const seg of coverage) {
      const key = seg.boundary_municipality_id;
      const name = seg.municipality_name ?? '(unknown municipality)';
      if (!m.has(key)) m.set(key, { name, pz: [], permit: [] });
      m.get(key)![seg.record_type].push(seg);
    }
    for (const g of m.values()) {
      const byRecent = (a: CoverageSegment, b: CoverageSegment) => b.segment_start.localeCompare(a.segment_start);
      g.pz.sort(byRecent); g.permit.sort(byRecent);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [coverage]);

  const counts = useMemo(() => {
    const cityCount = munis.filter((m) => m.kind === 'city' && selected.has(m.boundary_municipality_id)).length;
    const countyCount = munis.filter((m) => m.kind === 'county' && selected.has(m.boundary_municipality_id)).length;
    return { cityCount, countyCount, total: munis.length, selectedTotal: selected.size };
  }, [munis, selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(munis.map((m) => m.boundary_municipality_id)));
  const selectNone = () => setSelected(new Set());
  const selectCitiesOnly = () =>
    setSelected(new Set(munis.filter((m) => m.kind === 'city').map((m) => m.boundary_municipality_id)));
  const selectCountiesOnly = () =>
    setSelected(new Set(munis.filter((m) => m.kind === 'county').map((m) => m.boundary_municipality_id)));

  const handleStart = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        mode: 'commit',
        site_submit_id: siteSubmitId,
        radius_miles: radius,
        municipality_ids: [...selected],
        research_mode: plan.mode,
      };
      // quick/deep: omit windows so the edge function fills the recent default;
      // custom: send explicit bounds.
      if (plan.explicit) {
        body.pz_window_start = plan.pz_window_start;
        body.pz_window_end = plan.pz_window_end;
        body.permit_window_start = plan.permit_window_start;
        body.permit_window_end = plan.permit_window_end;
      }

      const { data, error } = await supabase.functions.invoke('ovis-research-trigger', { body });
      if (error) throw new Error(await extractInvokeError(error));
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error((data as { detail?: string; error?: string }).detail ?? (data as { error: string }).error);
      }
      const runId = (data as { research_run_id?: string })?.research_run_id;
      const selCount = (data as { selected_count?: number })?.selected_count ?? selected.size;
      if (!runId) throw new Error('Trigger succeeded but no research_run_id returned.');
      onStarted({ research_run_id: runId, selected_count: selCount });
      onClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const hasCoverage = coverage.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="px-5 py-4 border-b" style={{ borderColor: '#8FA9C8' }}>
          <h3 className="text-lg font-semibold" style={{ color: '#002147' }}>Start Market Research</h3>
          <p className="text-sm mt-1" style={{ color: '#4A6B94' }}>{siteSubmitLabel}</p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Tier picker */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#002147' }}>Run type</label>
            <div className="grid grid-cols-3 gap-2">
              {TIERS.map((t) => {
                const active = tier === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTier(t.key)}
                    disabled={submitting}
                    className="px-2 py-2 rounded-lg border text-center transition-colors"
                    style={{
                      backgroundColor: active ? '#002147' : '#FFFFFF',
                      borderColor: active ? '#002147' : '#8FA9C8',
                    }}
                  >
                    <div className="text-sm font-semibold" style={{ color: active ? '#FFFFFF' : '#002147' }}>{t.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: active ? '#8FA9C8' : '#8FA9C8' }}>{t.cost}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-2" style={{ color: '#8FA9C8' }}>
              {TIERS.find((t) => t.key === tier)!.blurb}
            </p>
          </div>

          {/* Window summary / custom inputs */}
          <div className="rounded-md border px-3 py-2" style={{ borderColor: '#8FA9C8', backgroundColor: '#F8FAFC' }}>
            {tier === 'custom' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium" style={{ color: '#002147' }}>Protocol</span>
                  {(['quick', 'deep'] as Mode[]).map((mm) => (
                    <button
                      key={mm}
                      type="button"
                      onClick={() => setCustomMode(mm)}
                      className="px-2 py-0.5 rounded-full text-xs border"
                      style={{
                        backgroundColor: customMode === mm ? '#002147' : '#FFFFFF',
                        color: customMode === mm ? '#FFFFFF' : '#4A6B94',
                        borderColor: customMode === mm ? '#002147' : '#8FA9C8',
                      }}
                    >
                      {mm === 'quick' ? 'Quick (sniff)' : 'Deep (enumerate)'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs" style={{ color: '#4A6B94' }}>From</label>
                  <input
                    type="date" value={customStart} max={customEnd}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-2 py-1 text-sm border rounded" style={{ borderColor: '#8FA9C8', color: '#002147' }}
                  />
                  <label className="text-xs" style={{ color: '#4A6B94' }}>to</label>
                  <input
                    type="date" value={customEnd} min={customStart} max={easternToday()}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-2 py-1 text-sm border rounded" style={{ borderColor: '#8FA9C8', color: '#002147' }}
                  />
                </div>
                <p className="text-xs" style={{ color: '#8FA9C8' }}>Applied to both P&amp;Z and permit searches.</p>
              </div>
            ) : (
              <div className="text-xs" style={{ color: '#4A6B94' }}>
                <span className="font-medium" style={{ color: '#002147' }}>Search window</span>{' — '}
                P&amp;Z {fmtMonthYear(plan.pz_window_start)} → {fmtMonthYear(plan.pz_window_end)}
                {' · '}
                Permits {fmtMonthYear(plan.permit_window_start)} → {fmtMonthYear(plan.permit_window_end)}
                {tier === 'deep' && (
                  <span className="block mt-1" style={{ color: '#8FA9C8' }}>
                    Deep uses the recent window by default — use Custom to reach further back.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Coverage map (Deep passes to date) */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#002147' }}>
              Deep coverage to date
            </label>
            {coverageLoading ? (
              <div className="text-xs py-1" style={{ color: '#8FA9C8' }}>Checking coverage…</div>
            ) : !hasCoverage ? (
              <div className="text-xs italic" style={{ color: '#8FA9C8' }}>
                No Deep coverage yet — a Deep run here would be the first pass on this site. (Quick sniff tests don't count toward coverage.)
              </div>
            ) : (
              <div className="border rounded-md divide-y" style={{ borderColor: '#8FA9C8' }}>
                {coverageByMuni.map((g) => (
                  <div key={g.name} className="px-3 py-2">
                    <div className="text-sm font-medium" style={{ color: '#002147' }}>{g.name}</div>
                    {(['pz', 'permit'] as const).map((rt) => {
                      const segs = rt === 'pz' ? g.pz : g.permit;
                      if (segs.length === 0) return null;
                      return (
                        <div key={rt} className="text-xs mt-0.5" style={{ color: '#4A6B94' }}>
                          <span className="font-medium">{rt === 'pz' ? 'P&Z' : 'Permits'}:</span>{' '}
                          {segs.map((s, i) => (
                            <span key={i}>
                              {i > 0 && ' · '}
                              {fmtMonthYear(s.segment_start)}–{fmtMonthYear(s.segment_end)}{' '}
                              <span style={{ color: '#002147' }}>×{s.pass_count}</span>
                              {s.last_searched_at && (
                                <span style={{ color: '#8FA9C8' }}> (last {fmtDate(s.last_searched_at)})</span>
                              )}
                            </span>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Radius picker */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#002147' }}>
              Search radius
            </label>
            <div className="grid grid-cols-4 gap-2">
              {RADIUS_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRadius(r)}
                  disabled={submitting || previewLoading}
                  className="py-2 rounded-lg border transition-colors text-sm font-medium"
                  style={{
                    backgroundColor: radius === r ? '#002147' : '#FFFFFF',
                    color: radius === r ? '#FFFFFF' : '#4A6B94',
                    borderColor: radius === r ? '#002147' : '#8FA9C8',
                  }}
                >
                  {r} mi
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: '#8FA9C8' }}>
              Use 3–5 mi for dense metro areas; 10–15 mi for rural sites. Skipped municipalities can be researched in a later run.
            </p>
          </div>

          {/* Muni list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={{ color: '#002147' }}>
                Municipalities to research
                {!previewLoading && munis.length > 0 && (
                  <span className="ml-2 text-xs font-normal" style={{ color: '#4A6B94' }}>
                    {counts.selectedTotal} of {counts.total} selected
                    {' · '}
                    {counts.cityCount} {counts.cityCount === 1 ? 'city' : 'cities'} · {counts.countyCount} {counts.countyCount === 1 ? 'county' : 'counties'}
                  </span>
                )}
              </label>
              {munis.length > 0 && !previewLoading && (
                <div className="flex gap-2 text-xs">
                  <button type="button" onClick={selectAll}          className="underline" style={{ color: '#002147' }}>All</button>
                  <button type="button" onClick={selectNone}         className="underline" style={{ color: '#4A6B94' }}>None</button>
                  <button type="button" onClick={selectCitiesOnly}   className="underline" style={{ color: '#4A6B94' }}>Cities only</button>
                  <button type="button" onClick={selectCountiesOnly} className="underline" style={{ color: '#4A6B94' }}>Counties only</button>
                </div>
              )}
            </div>

            {previewLoading && (
              <div className="text-sm py-4" style={{ color: '#8FA9C8' }}>Loading municipalities…</div>
            )}
            {previewError && (
              <div className="rounded-md p-3 text-sm border"
                   style={{ borderColor: '#A27B5C', color: '#A27B5C', backgroundColor: '#FFF7F0' }}>
                {previewError}
              </div>
            )}
            {!previewLoading && !previewError && munis.length === 0 && (
              <div className="text-sm italic py-4" style={{ color: '#8FA9C8' }}>
                No municipalities found within {radius} mi of this site.
              </div>
            )}
            {!previewLoading && munis.length > 0 && (
              <div className="border rounded-md divide-y" style={{ borderColor: '#8FA9C8' }}>
                {munis.map((m) => {
                  const checked = selected.has(m.boundary_municipality_id);
                  return (
                    <label
                      key={m.boundary_municipality_id}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm"
                      style={{ backgroundColor: checked ? '#FFFFFF' : '#F8FAFC' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(m.boundary_municipality_id)}
                        disabled={submitting}
                      />
                      <span className="flex-1" style={{ color: checked ? '#002147' : '#8FA9C8' }}>
                        {m.name}
                        <span className="ml-2 text-xs" style={{ color: checked ? '#4A6B94' : '#8FA9C8' }}>
                          ({m.kind})
                        </span>
                      </span>
                      <span className="text-xs" style={{ color: checked ? '#4A6B94' : '#8FA9C8' }}>
                        {Number(m.distance_mi).toFixed(2)} mi
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {submitError && (
            <div className="rounded-md p-3 text-sm border"
                 style={{ borderColor: '#A27B5C', color: '#A27B5C', backgroundColor: '#FFF7F0' }}>
              {submitError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex justify-end gap-2"
             style={{ borderColor: '#8FA9C8', backgroundColor: '#F8FAFC' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm border"
            style={{ borderColor: '#8FA9C8', color: '#4A6B94', backgroundColor: '#FFFFFF' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={submitting || previewLoading || selected.size === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: submitting || selected.size === 0 ? '#8FA9C8' : '#002147',
              color: '#FFFFFF',
              opacity: submitting || selected.size === 0 ? 0.7 : 1,
            }}
          >
            {submitting
              ? 'Starting…'
              : selected.size === 0
                ? 'Select at least one municipality'
                : `Start ${plan.mode === 'deep' ? 'Deep' : 'Quick'} research on ${selected.size} ${selected.size === 1 ? 'municipality' : 'municipalities'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
