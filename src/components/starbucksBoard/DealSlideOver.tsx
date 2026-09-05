// Starbucks Deal Board — slide-over panel (spec §7).
// Click a tile → this slides in from the right over a dimmed board. Classify
// (court + blocker) via the shared ClassifyControls, Log a note, Set next
// action. Dark; type sizes scale with the board's A-/A+ control (`scale`).

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import {
  BoardDeal,
  CONDENSED_STACK,
  courtLabel,
  instruction,
  PALETTE,
} from '../../lib/starbucksBoard';
import ClassifyControls from './ClassifyControls';
import KillPassAction from './KillPassAction';
import ParkControl from './ParkControl';
import TouchControls from './TouchControls';
import UrgentToggle from './UrgentToggle';

interface NoteRow { id: string; title: string | null; body: string | null; created_at: string | null; }

export default function DealSlideOver({
  deal,
  scale,
  onClose,
  onChanged,
}: {
  deal: BoardDeal;
  scale: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const px = (n: number) => Math.round(n * scale);

  const [notes, setNotes] = useState<NoteRow[]>([]);

  const loadDetails = useCallback(async () => {
    try {
      const { data: noteData } = await supabase
        .from('note')
        .select('id, title, body, created_at, note_object_link!inner(deal_id)')
        .eq('note_object_link.deal_id', deal.id)
        .order('created_at', { ascending: false })
        .limit(3);
      setNotes((noteData as NoteRow[]) ?? []);
    } catch (e) {
      console.error('DealSlideOver.loadDetails', e);
    }
  }, [deal.id]);

  useEffect(() => { loadDetails(); }, [loadDetails]);

  const verb = instruction(deal);

  return (
    <>
      <div className="fixed inset-0 z-[10000]" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={onClose} />

      <div
        className="fixed top-0 right-0 h-full z-[10001] flex flex-col shadow-2xl"
        style={{ width: Math.round(440 * scale), maxWidth: '92vw', backgroundColor: PALETTE.column, color: PALETTE.text, fontFamily: CONDENSED_STACK }}
      >
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${PALETTE.ground}` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate" style={{ fontWeight: 600, fontSize: px(22), color: PALETTE.text }}>{deal.name}</div>
              <div style={{ fontSize: px(14), color: PALETTE.textDim }}>{deal.city ?? '—'} · {deal.stageLabel}</div>
            </div>
            <button onClick={onClose} style={{ color: PALETTE.textDim, fontSize: px(22), lineHeight: 1 }} aria-label="Close">✕</button>
          </div>
          <div className="mt-2" style={{ fontSize: px(14) }}>
            {deal.heat === 'no_history' ? (
              <span style={{ color: PALETTE.textDim }}>no history yet</span>
            ) : deal.heat === 'unclassified' ? (
              <span style={{ color: PALETTE.text }}>Unclassified · {deal.days}d — classify below</span>
            ) : (
              <span style={{ color: deal.heat === 'hot' ? PALETTE.hot : deal.heat === 'warm' ? PALETTE.warm : PALETTE.textDim }}>
                {deal.readyToSubmit ? 'Ready to submit' : courtLabel(deal)} · {deal.days}d{verb ? ` — ${verb}` : ''}
              </span>
            )}
          </div>
          <div className="mt-3">
            <UrgentToggle deal={deal} px={px} onChanged={onChanged} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          <Section title="Rolling summary" px={px}>
            <div style={{ color: PALETTE.textDim, fontSize: px(14), fontStyle: 'italic' }}>(Coming in phase 2 — reserved.)</div>
          </Section>

          <Section title="Classify" px={px}>
            <ClassifyControls deal={deal} px={px} saveLabel="Save court" onSaved={onChanged} />
          </Section>

          {/* Log a note · Set next action — shared with the triage queue (TouchControls) */}
          <TouchControls deal={deal} px={px} onSaved={() => { loadDetails(); onChanged(); }} />

          <Section title="Recent notes" px={px}>
            {notes.length === 0 ? (
              <div style={{ color: PALETTE.textDim, fontSize: px(14) }}>None yet.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {notes.map((n) => (
                  <div key={n.id} style={{ fontSize: px(14) }}>
                    <div style={{ color: PALETTE.text }}>{n.title || stripHtml(n.body)}</div>
                    <div style={{ color: PALETTE.textDim, fontSize: px(12) }}>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Park — off the board until a review date (decisions §2.24) */}
          <Section title="Park" px={px}>
            <ParkControl deal={deal} px={px} onDone={() => { onChanged(); onClose(); }} />
          </Section>

          {/* Pass / Mark lost — removes the tile (decisions §2.23) */}
          <Section title="Remove from board" px={px}>
            <KillPassAction deal={deal} px={px} onDone={() => { onChanged(); onClose(); }} />
          </Section>
        </div>

        <div className="px-5 py-3" style={{ borderTop: `1px solid ${PALETTE.ground}` }}>
          <button onClick={() => navigate(`/deal/${deal.id}`)} style={{ color: PALETTE.textDim, fontSize: px(13) }}>Open full deal →</button>
        </div>
      </div>
    </>
  );
}

function Section({ title, children, px }: { title: string; children: ReactNode; px: (n: number) => number }) {
  return (
    <div>
      <div className="uppercase tracking-wider" style={{ fontSize: px(12), color: PALETTE.textDim, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function stripHtml(s: string | null): string {
  if (!s) return '(empty note)';
  return s.replace(/<[^>]*>/g, '').slice(0, 80);
}
