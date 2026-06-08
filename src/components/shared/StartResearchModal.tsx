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

const RADIUS_PRESETS = [3, 5, 10, 15];

export default function StartResearchModal({
  siteSubmitId,
  siteSubmitLabel,
  onClose,
  onStarted,
}: StartResearchModalProps) {
  const [radius, setRadius] = useState<number>(10);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [munis, setMunis] = useState<PreviewMuni[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
        if (error) {
          const detail = (error as { context?: { error?: string; detail?: string } }).context;
          throw new Error(detail?.detail ?? detail?.error ?? error.message);
        }
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
      const { data, error } = await supabase.functions.invoke(
        'ovis-research-trigger',
        {
          body: {
            mode: 'commit',
            site_submit_id: siteSubmitId,
            radius_miles: radius,
            municipality_ids: [...selected],
          },
        },
      );
      if (error) {
        const detail = (error as { context?: { error?: string; detail?: string } }).context;
        throw new Error(detail?.detail ?? detail?.error ?? error.message);
      }
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
                : `Start research on ${selected.size} ${selected.size === 1 ? 'municipality' : 'municipalities'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
