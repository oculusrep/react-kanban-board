// Starbucks Deal Board — Parking lot (decisions §2.24).
// Opened from the header "Parking lot (n)". Full-height list of parked deals,
// same interaction pattern as triage: Escape exits, click a row to open the
// slide-over (to un-park or act). Shows site name, the stage it's parked at,
// and the review date it returns.

import { useEffect } from 'react';
import { BoardDeal, CONDENSED_STACK, formatReviewDate, PALETTE } from '../../lib/starbucksBoard';

export default function ParkingLot({
  deals,
  scale,
  onOpenDeal,
  onClose,
}: {
  deals: BoardDeal[];
  scale: number;
  onOpenDeal: (d: BoardDeal) => void;
  onClose: () => void;
}) {
  const px = (n: number) => Math.round(n * scale);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[10001] flex flex-col" style={{ backgroundColor: PALETTE.ground, color: PALETTE.text, fontFamily: CONDENSED_STACK }}>
      <div className="flex items-center justify-between px-8 pt-5 pb-3">
        <div className="uppercase tracking-wider" style={{ fontSize: px(15), color: PALETTE.textDim }}>
          Parking lot · <span className="tabular-nums">{deals.length}</span>
        </div>
        <button onClick={onClose} style={{ fontSize: px(15), color: PALETTE.textDim }}>Close (Esc)</button>
      </div>

      <div className="flex-1 overflow-y-auto flex justify-center px-6">
        <div style={{ width: Math.round(920 * scale), maxWidth: '94vw' }}>
          {deals.length === 0 ? (
            <div style={{ fontSize: px(20), color: PALETTE.textDim, marginTop: px(24) }}>Nothing parked.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {deals.map((d) => (
                <div
                  key={d.id}
                  onClick={() => onOpenDeal(d)}
                  className="rounded-md px-4 py-3 flex items-center justify-between gap-4 cursor-pointer"
                  style={{ backgroundColor: PALETTE.column }}
                  title={d.name}
                >
                  <div className="min-w-0">
                    <div className="truncate" style={{ fontWeight: 600, fontSize: px(22), color: PALETTE.text }}>{d.name}</div>
                    <div className="truncate" style={{ fontSize: px(14), color: PALETTE.textDim }}>
                      {d.city ?? '—'} · parked at {d.stageLabel}
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div style={{ fontSize: px(12), color: PALETTE.textDim }}>review</div>
                    <div className="tabular-nums" style={{ fontSize: px(18), color: PALETTE.text }}>{formatReviewDate(d.parkedUntil)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ height: px(40) }} />
        </div>
      </div>
    </div>
  );
}
