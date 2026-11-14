import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * "Agent reports" for a Deep Sweep: one collapsible, read-only entry per chunk
 * with that run's needs_review (the agent puts its end-of-run coverage report
 * at the top of it). Labels: "Chunk 0 — undated sources", "Chunk 3 — May–Oct 2025".
 * A failed or never-run chunk shows "no report".
 */

interface ChunkReport {
  chunk_index: number;
  kind: string | null;
  window_start: string | null;
  window_end: string | null;
  state: string;
  run_state: string | null;
  needs_review: string | null;
}

function monthYear(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return { y, mon: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' }) };
}

export function chunkWindowLabel(c: { kind: string | null; window_start: string | null; window_end: string | null }) {
  if (c.kind === 'evergreen' || !c.window_start || !c.window_end) return 'undated sources';
  const a = monthYear(c.window_start);
  const b = monthYear(c.window_end);
  return a.y === b.y ? `${a.mon}–${b.mon} ${b.y}` : `${a.mon} ${a.y}–${b.mon} ${b.y}`;
}

export function SweepAgentReports({ sweepId }: { sweepId: string }) {
  const [rows, setRows] = useState<ChunkReport[]>([]);
  const [open, setOpen] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('research_sweep_chunk')
      .select('chunk_index, kind, window_start, window_end, state, research_run:research_run_id(state, needs_review)')
      .eq('sweep_id', sweepId)
      .order('chunk_index')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.warn('agent reports load failed', error.message); return; }
        setRows((data ?? []).map((r: any) => ({
          chunk_index: r.chunk_index, kind: r.kind, window_start: r.window_start, window_end: r.window_end,
          state: r.state, run_state: r.research_run?.state ?? null, needs_review: r.research_run?.needs_review ?? null,
        })));
      });
    return () => { cancelled = true; };
  }, [sweepId]);

  if (rows.length === 0) return null;

  const toggle = (i: number) => setOpen((prev) => {
    const nx = new Set(prev);
    if (nx.has(i)) nx.delete(i); else nx.add(i);
    return nx;
  });

  return (
    <div className="rounded-md border" style={{ borderColor: '#8FA9C8' }}>
      <div className="px-3 py-2 text-sm font-semibold" style={{ color: '#002147', backgroundColor: '#F8FAFC' }}>
        Agent reports
      </div>
      <div className="divide-y" style={{ borderColor: '#8FA9C8' }}>
        {rows.map((c) => {
          const failed = c.state === 'failed' || !c.run_state || ['failed', 'cancelled'].includes(c.run_state);
          const text = (c.needs_review ?? '').trim();
          const label = `Chunk ${c.chunk_index} — ${chunkWindowLabel(c)}`;
          const isOpen = open.has(c.chunk_index);
          return (
            <div key={c.chunk_index} className="px-3 py-1.5">
              {failed || !text ? (
                <div className="text-sm" style={{ color: '#4A6B94' }}>
                  {label} <span className="text-xs" style={{ color: '#8FA9C8' }}>· {failed ? 'no report' : 'nothing flagged'}</span>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => toggle(c.chunk_index)} className="text-left text-sm w-full" style={{ color: '#002147' }}>
                    <span style={{ color: '#8FA9C8' }}>{isOpen ? '▾' : '▸'} </span>{label}
                    {!isOpen && (
                      <span className="block text-xs truncate pl-4" style={{ color: '#4A6B94' }}>{text.split('\n')[0]}</span>
                    )}
                  </button>
                  {isOpen && (
                    <div className="mt-1 pl-4 text-xs whitespace-pre-wrap select-text" style={{ color: '#002147' }}>{text}</div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
