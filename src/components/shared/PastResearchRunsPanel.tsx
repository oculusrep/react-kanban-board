import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface PastResearchRunsPanelProps {
  siteSubmitId: string;
  /** Bump this number to force a re-fetch (e.g. after a fresh "Start Research" click). */
  refreshTrigger?: number;
  /** Callback when a row is clicked (opens the approval modal). */
  onRunClick?: (runId: string) => void;
  /** Callback when the Cancel button is clicked on a pending/running row. */
  onCancelClick?: (runId: string) => void | Promise<void>;
  /** Callback when a Deep Sweep row is clicked (opens the unified sweep approval). */
  onSweepClick?: (sweepId: string) => void;
}

interface SweepRow {
  id: string;
  created_at: string;
  radius_miles: number;
  total_chunks: number;
  state: 'running' | 'complete' | 'complete_with_failures' | 'failed' | 'cancelled';
  done: number;
  failed: number;
  running: number;
  staged: number;
}

const SWEEP_STATE_LABEL: Record<SweepRow['state'], string> = {
  running: 'Running', complete: 'Complete', complete_with_failures: 'Complete (with gaps)',
  failed: 'Failed', cancelled: 'Cancelled',
};

interface ResearchRunRow {
  id: string;
  triggered_at: string;
  radius_miles: number;
  state: 'pending' | 'running' | 'awaiting_review' | 'approved' | 'archived' | 'failed' | 'cancelled';
  needs_review: string | null;
  openclaw_run_id: string | null;
  checklist_count: number;
  staging_count: number;
}

const STATE_STYLES: Record<ResearchRunRow['state'], { label: string; bg: string; fg: string; border: string }> = {
  pending:         { label: 'Pending',         bg: '#F8FAFC', fg: '#4A6B94', border: '#8FA9C8' },
  running:         { label: 'Running',         bg: '#E8F1FF', fg: '#002147', border: '#4A6B94' },
  awaiting_review: { label: 'Awaiting review', bg: '#FFF7F0', fg: '#A27B5C', border: '#A27B5C' },
  approved:        { label: 'Approved',        bg: '#002147', fg: '#FFFFFF', border: '#002147' },
  archived:        { label: 'Reviewed',        bg: '#F8FAFC', fg: '#4A6B94', border: '#8FA9C8' },
  failed:          { label: 'Failed',          bg: '#FBEAEA', fg: '#8B0000', border: '#8B0000' },
  cancelled:       { label: 'Cancelled',       bg: '#F8FAFC', fg: '#8FA9C8', border: '#8FA9C8' },
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function PastResearchRunsPanel({ siteSubmitId, refreshTrigger = 0, onRunClick, onCancelClick, onSweepClick }: PastResearchRunsPanelProps) {
  const [runs, setRuns] = useState<ResearchRunRow[] | null>(null);
  const [sweeps, setSweeps] = useState<SweepRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);

      // ---- Deep Sweeps for this site (with per-chunk progress) ----
      const { data: sweepRows } = await supabase
        .from('research_sweep')
        .select('id, created_at, radius_miles, total_chunks, state')
        .eq('site_submit_id', siteSubmitId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const sweepIds = (sweepRows ?? []).map((s) => s.id);
      let chunkRows: { sweep_id: string; state: string; research_run_id: string | null }[] = [];
      if (sweepIds.length > 0) {
        const { data } = await supabase
          .from('research_sweep_chunk')
          .select('sweep_id, state, research_run_id')
          .in('sweep_id', sweepIds);
        chunkRows = (data ?? []) as typeof chunkRows;
      }
      if (cancelled) return;
      const sweepChunkRunIds = chunkRows.map((c) => c.research_run_id).filter(Boolean) as string[];
      let sweepStagingCounts = new Map<string, number>();
      if (sweepChunkRunIds.length > 0) {
        const { data: st } = await supabase
          .from('municipal_project_staging').select('research_run_id').in('research_run_id', sweepChunkRunIds);
        const runToSweep = new Map(chunkRows.filter((c) => c.research_run_id).map((c) => [c.research_run_id!, c.sweep_id]));
        for (const row of (st ?? []) as { research_run_id: string }[]) {
          const sid = runToSweep.get(row.research_run_id);
          if (sid) sweepStagingCounts.set(sid, (sweepStagingCounts.get(sid) ?? 0) + 1);
        }
      }
      setSweeps((sweepRows ?? []).map((s) => {
        const cs = chunkRows.filter((c) => c.sweep_id === s.id);
        return {
          id: s.id, created_at: s.created_at, radius_miles: s.radius_miles, total_chunks: s.total_chunks, state: s.state,
          done: cs.filter((c) => c.state === 'done').length,
          failed: cs.filter((c) => c.state === 'failed').length,
          running: cs.filter((c) => c.state === 'running' || c.state === 'firing').length,
          staged: sweepStagingCounts.get(s.id) ?? 0,
        } as SweepRow;
      }));

      // ---- Standalone runs (exclude sweep-child runs) ----
      const { data: runRows, error: runsErr } = await supabase
        .from('research_run')
        .select('id, triggered_at, radius_miles, state, needs_review, openclaw_run_id')
        .eq('site_submit_id', siteSubmitId)
        .is('sweep_id', null)
        .order('triggered_at', { ascending: false });
      if (cancelled) return;
      if (runsErr) { setError(runsErr.message); return; }
      if (!runRows || runRows.length === 0) { setRuns([]); return; }

      const ids = runRows.map((r) => r.id);
      const [{ data: checklist }, { data: staging }] = await Promise.all([
        supabase.from('research_checklist_item').select('research_run_id').in('research_run_id', ids),
        supabase.from('municipal_project_staging').select('research_run_id').in('research_run_id', ids),
      ]);
      if (cancelled) return;

      const tally = (rows: { research_run_id: string }[] | null) => {
        const out = new Map<string, number>();
        for (const r of rows ?? []) out.set(r.research_run_id, (out.get(r.research_run_id) ?? 0) + 1);
        return out;
      };
      const checklistCounts = tally(checklist);
      const stagingCounts = tally(staging);

      setRuns(runRows.map((r) => ({
        ...r,
        checklist_count: checklistCounts.get(r.id) ?? 0,
        staging_count:   stagingCounts.get(r.id) ?? 0,
      })) as ResearchRunRow[]);
    }
    load();
    return () => { cancelled = true; };
  }, [siteSubmitId, refreshTrigger]);

  if (runs === null && !error) {
    return <div className="text-xs" style={{ color: '#8FA9C8' }}>Loading past runs…</div>;
  }
  if (error) {
    return <div className="text-xs" style={{ color: '#A27B5C' }}>Failed to load past runs: {error}</div>;
  }
  if (runs && runs.length === 0 && sweeps.length === 0) {
    return <div className="text-xs italic" style={{ color: '#8FA9C8' }}>No research runs yet for this site.</div>;
  }

  return (
    <div className="space-y-2">
      {sweeps.map((s) => {
        const clickable = !!onSweepClick;
        return (
          <div
            key={s.id}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => onSweepClick!(s.id) : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSweepClick!(s.id); } : undefined}
            className={`rounded-md border px-3 py-2 text-sm ${clickable ? 'cursor-pointer hover:shadow' : ''}`}
            style={{ borderColor: '#4A6B94', backgroundColor: '#F8FAFC' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="px-2 py-0.5 rounded-full text-xs font-medium border"
                    style={{ backgroundColor: '#002147', color: '#FFFFFF', borderColor: '#002147' }}>
                Deep Sweep · {SWEEP_STATE_LABEL[s.state]}
              </span>
              <span className="text-xs" style={{ color: '#8FA9C8' }}>{formatTimestamp(s.created_at)}</span>
            </div>
            <div className="mt-1 text-xs" style={{ color: '#4A6B94' }}>
              {s.radius_miles}-mile radius · {s.done}/{s.total_chunks} chunks done
              {s.running > 0 && <> · {s.running} running</>}
              {s.failed > 0 && <span style={{ color: '#A27B5C' }}> · {s.failed} failed (gap)</span>}
              {s.staged > 0 && <> · {s.staged} staged records</>}
            </div>
          </div>
        );
      })}
      {(runs ?? []).map((r) => {
        const style = STATE_STYLES[r.state] ?? STATE_STYLES.pending;
        const clickable = !!onRunClick;
        return (
          <div
            key={r.id}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => onRunClick!(r.id) : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onRunClick!(r.id); } : undefined}
            className={`rounded-md border px-3 py-2 text-sm ${clickable ? 'cursor-pointer hover:shadow' : ''}`}
            style={{ borderColor: '#8FA9C8', backgroundColor: '#FFFFFF' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium border"
                style={{ backgroundColor: style.bg, color: style.fg, borderColor: style.border }}
              >
                {style.label}
              </span>
              <div className="flex items-center gap-2">
                {onCancelClick && (r.state === 'pending' || r.state === 'running') && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void onCancelClick(r.id); }}
                    className="text-xs px-2 py-0.5 rounded border"
                    style={{ borderColor: '#A27B5C', color: '#A27B5C', backgroundColor: '#FFFFFF' }}
                    title="Mark this run as cancelled (use when a run is hung)"
                  >
                    Cancel
                  </button>
                )}
                <span className="text-xs" style={{ color: '#8FA9C8' }}>{formatTimestamp(r.triggered_at)}</span>
              </div>
            </div>
            <div className="mt-1 text-xs" style={{ color: '#4A6B94' }}>
              {r.radius_miles}-mile radius
              {r.checklist_count > 0 && <> · {r.checklist_count} municipalities</>}
              {r.staging_count > 0 && <> · {r.staging_count} staged records</>}
            </div>
            {r.needs_review && (
              <div className="mt-1 text-xs italic truncate" style={{ color: '#A27B5C' }} title={r.needs_review}>
                Needs review: {r.needs_review}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
