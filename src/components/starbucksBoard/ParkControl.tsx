// Starbucks Deal Board — Park control (decisions §2.24).
// Parks a deal until a required review date (no indefinite parking); the deal
// drops off the board and into the Parking lot, its real stage unchanged. On
// the review date it returns with the clock running from then (we set
// ball_in_court_since = the review date). Also un-parks. Shared by the
// slide-over and the triage queue.

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { insertDealNote } from '../../lib/boardWrites';
import { BoardDeal, formatReviewDate, isParked, PALETTE } from '../../lib/starbucksBoard';

function localDate(offsetDays = 0): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ParkControl({
  deal,
  px,
  onDone,
}: {
  deal: BoardDeal;
  px: (n: number) => number;
  onDone: () => void;
}) {
  const parked = isParked(deal);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const today = localDate(0);
  const canPark = date > today; // strictly future — no indefinite/instant parking

  async function park() {
    setSaving(true);
    setErr(null);
    try {
      const note = `Parked until ${formatReviewDate(date)}${reason.trim() ? `: ${reason.trim()}` : ''}`;
      // Note first (its reset trigger stamps ball_in_court_since = now); then the
      // upsert below overwrites it with the review date so the clock runs from then.
      await insertDealNote(deal.id, note);
      const { error } = await supabase
        .from('deal_activity_state')
        .upsert(
          { deal_id: deal.id, parked_until: date, ball_in_court_since: new Date(`${date}T00:00:00`).toISOString() },
          { onConflict: 'deal_id' }
        );
      if (error) throw error;
      onDone();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to park');
      setSaving(false);
    }
  }

  async function unpark() {
    setSaving(true);
    setErr(null);
    try {
      await insertDealNote(deal.id, 'Un-parked — back on the board.');
      const { error } = await supabase
        .from('deal_activity_state')
        .upsert(
          { deal_id: deal.id, parked_until: null, ball_in_court_since: new Date().toISOString() },
          { onConflict: 'deal_id' }
        );
      if (error) throw error;
      onDone();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to un-park');
      setSaving(false);
    }
  }

  if (parked) {
    return (
      <div>
        {err && <div style={{ color: PALETTE.hot, fontSize: px(13), marginBottom: 6 }}>{err}</div>}
        <div style={{ fontSize: px(14), color: PALETTE.textDim, marginBottom: 6 }}>
          Parked until <span style={{ color: PALETTE.text }}>{formatReviewDate(deal.parkedUntil)}</span>
        </div>
        <button onClick={unpark} disabled={saving} className="rounded px-3 py-1.5" style={{ border: `1px solid ${PALETTE.textDim}`, color: PALETTE.text, fontSize: px(14), opacity: saving ? 0.6 : 1 }}>
          Un-park now
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded px-3 py-1.5" style={{ border: `1px solid ${PALETTE.textDim}`, color: PALETTE.textDim, fontSize: px(14) }}>
        Park…
      </button>
    );
  }

  return (
    <div>
      {err && <div style={{ color: PALETTE.hot, fontSize: px(13), marginBottom: 6 }}>{err}</div>}
      <div style={{ fontSize: px(12), color: PALETTE.textDim, marginBottom: 6 }}>
        Off the board until the review date — no chasing, no burning. Returns to its column then.
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ fontSize: px(13), color: PALETTE.textDim }}>Review date</span>
        <input
          type="date"
          value={date}
          min={localDate(1)}
          onChange={(e) => setDate(e.target.value)}
          className="rounded px-2 py-1.5"
          style={{ backgroundColor: PALETTE.ground, color: PALETTE.text, border: `1px solid ${PALETTE.ground}`, fontSize: px(14) }}
        />
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Waiting on… (optional)"
        rows={2}
        className="w-full rounded px-2 py-1.5"
        style={{ backgroundColor: PALETTE.ground, color: PALETTE.text, border: `1px solid ${PALETTE.ground}`, fontSize: px(14), resize: 'vertical' }}
      />
      <div className="mt-2 flex items-center gap-2">
        <button onClick={park} disabled={saving || !canPark} className="rounded px-3 py-1.5" style={{ backgroundColor: canPark ? PALETTE.text : 'transparent', color: canPark ? PALETTE.ground : PALETTE.textDim, border: `1px solid ${canPark ? PALETTE.text : PALETTE.textDim}`, fontSize: px(14), fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
          Park
        </button>
        <button onClick={() => setOpen(false)} disabled={saving} className="rounded px-3 py-1.5" style={{ color: PALETTE.textDim, fontSize: px(14) }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
