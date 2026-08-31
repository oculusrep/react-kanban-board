// Starbucks Deal Board — triage queue (decisions §2.12, spec §9).
// Opened from the header "N to classify" counter (never auto-opens — a new
// unclassified deal must not interrupt). Walks the unclassified Pre-Submittal
// deals one at a time, full-height: site name, city, stage, history, then
// classify (court + blocker) → auto-advance. Escape exits. Each save persists
// immediately, so partial progress is kept.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BoardDeal, CONDENSED_STACK, PALETTE } from '../../lib/starbucksBoard';
import ClassifyControls from './ClassifyControls';

interface HistoryRow { id: string; kind: 'activity' | 'note'; text: string; date: string | null; }

export default function TriageQueue({
  deals,
  scale,
  onClose,
  onChanged,
}: {
  deals: BoardDeal[];
  scale: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const px = (n: number) => Math.round(n * scale);
  // Snapshot the queue on open so it doesn't reshuffle as we save/advance.
  const [queue] = useState<BoardDeal[]>(deals);
  const [i, setI] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const current = queue[i] ?? null;

  // Escape exits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const loadHistory = useCallback(async (dealId: string) => {
    setHistory([]);
    try {
      const [{ data: acts }, { data: notes }] = await Promise.all([
        supabase.from('activity').select('id, subject, activity_date').eq('deal_id', dealId).order('activity_date', { ascending: false }).limit(6),
        supabase.from('note').select('id, title, created_at, note_object_link!inner(deal_id)').eq('note_object_link.deal_id', dealId).order('created_at', { ascending: false }).limit(4),
      ]);
      const rows: HistoryRow[] = [
        ...((acts as any[]) ?? []).map((a) => ({ id: `a_${a.id}`, kind: 'activity' as const, text: a.subject || '(activity)', date: a.activity_date })),
        ...((notes as any[]) ?? []).map((n) => ({ id: `n_${n.id}`, kind: 'note' as const, text: n.title || '(note)', date: n.created_at })),
      ].sort((x, y) => (y.date ?? '').localeCompare(x.date ?? '')).slice(0, 8);
      setHistory(rows);
    } catch (e) {
      console.error('TriageQueue.loadHistory', e);
    }
  }, []);

  useEffect(() => { if (current) loadHistory(current.id); }, [current, loadHistory]);

  function advance() {
    onChanged(); // refresh the board + the header counter live
    if (i + 1 >= queue.length) onClose();
    else setI(i + 1);
  }

  if (!current) {
    return (
      <div className="fixed inset-0 z-[10001] flex items-center justify-center" style={{ backgroundColor: PALETTE.ground, color: PALETTE.textDim, fontFamily: CONDENSED_STACK }}>
        <div className="text-center">
          <div style={{ fontSize: px(22), color: PALETTE.text }}>All classified 🎉</div>
          <button onClick={onClose} className="mt-3 rounded px-4 py-1.5" style={{ border: `1px solid ${PALETTE.textDim}`, color: PALETTE.text, fontSize: px(14) }}>Close (Esc)</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[10001] flex flex-col" style={{ backgroundColor: PALETTE.ground, color: PALETTE.text, fontFamily: CONDENSED_STACK }}>
      {/* top bar */}
      <div className="flex items-center justify-between px-8 pt-5 pb-3">
        <div className="uppercase tracking-wider" style={{ fontSize: px(13), color: PALETTE.textDim }}>
          Triage · <span className="tabular-nums">{i + 1} of {queue.length}</span>
        </div>
        <button onClick={onClose} style={{ fontSize: px(14), color: PALETTE.textDim }}>Close (Esc)</button>
      </div>

      {/* one deal, full height, centered column */}
      <div className="flex-1 overflow-y-auto flex justify-center px-6">
        <div style={{ width: Math.round(680 * Math.min(scale, 1.4)), maxWidth: '94vw' }}>
          <div style={{ fontWeight: 700, fontSize: px(34), letterSpacing: '-0.01em', color: PALETTE.text }}>{current.name}</div>
          <div style={{ fontSize: px(16), color: PALETTE.textDim, marginBottom: px(16) }}>
            {current.city ?? '—'} · {current.stageLabel}
          </div>

          {/* history */}
          <div className="uppercase tracking-wider" style={{ fontSize: px(12), color: PALETTE.textDim, marginBottom: 6 }}>History</div>
          {history.length === 0 ? (
            <div style={{ fontSize: px(14), color: PALETTE.textDim, marginBottom: px(20) }}>No history recorded.</div>
          ) : (
            <div className="flex flex-col gap-1" style={{ marginBottom: px(20) }}>
              {history.map((h) => (
                <div key={h.id} className="flex items-baseline gap-2" style={{ fontSize: px(14) }}>
                  <span style={{ color: PALETTE.textDim, fontSize: px(11), minWidth: px(84) }}>
                    {h.date ? new Date(h.date).toLocaleDateString() : ''} · {h.kind}
                  </span>
                  <span className="truncate" style={{ color: PALETTE.text }}>{h.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* classify → advance */}
          <div className="rounded-lg p-4" style={{ backgroundColor: PALETTE.column }}>
            <ClassifyControls deal={current} px={px} requireCourt saveLabel="Save & next" onSaved={advance} />
          </div>

          <div style={{ height: px(40) }} />
        </div>
      </div>
    </div>
  );
}
