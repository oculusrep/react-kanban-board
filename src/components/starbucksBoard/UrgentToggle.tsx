// Starbucks Deal Board — manual priority toggle (decisions §2.25).
// Auto-expiring (URGENT_TTL_DAYS): mark → urgent_until = now + TTL; re-tap to
// renew; clear to drop. Separate channel from heat; sorts the tile to the top
// of its column but never changes the heat color. Shared by slide-over + triage.
// Optimistic so it reflects immediately even before the board refetches.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BoardDeal, isUrgent, PALETTE, URGENT_TTL_DAYS } from '../../lib/starbucksBoard';

export default function UrgentToggle({
  deal,
  px,
  onChanged,
}: {
  deal: BoardDeal;
  px: (n: number) => number;
  onChanged: () => void;
}) {
  const [urgentUntil, setUrgentUntil] = useState<string | null>(deal.urgentUntil);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setUrgentUntil(deal.urgentUntil); }, [deal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const urgent = isUrgent({ urgentUntil });
  const daysLeft = urgent ? Math.max(1, Math.ceil((new Date(urgentUntil!).getTime() - Date.now()) / 86_400_000)) : 0;

  async function set(next: string | null) {
    setUrgentUntil(next); // optimistic
    setSaving(true);
    try {
      await supabase.from('deal_activity_state').update({ urgent_until: next }).eq('deal_id', deal.id);
      onChanged();
    } catch (e) {
      console.error('UrgentToggle', e);
    } finally {
      setSaving(false);
    }
  }
  const mark = () => set(new Date(Date.now() + URGENT_TTL_DAYS * 86_400_000).toISOString());

  if (!urgent) {
    return (
      <button onClick={mark} disabled={saving} className="rounded px-3 py-1.5" style={{ border: `1px solid ${PALETTE.urgent}`, color: PALETTE.urgent, fontSize: px(14), fontWeight: 600 }}>
        ▲ Mark urgent
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={mark} disabled={saving} className="rounded px-3 py-1.5" style={{ backgroundColor: PALETTE.urgent, color: PALETTE.ground, fontSize: px(14), fontWeight: 600 }} title="Re-mark to renew">
        ▲ Urgent · {daysLeft}d left — renew
      </button>
      <button onClick={() => set(null)} disabled={saving} style={{ color: PALETTE.textDim, fontSize: px(13) }}>clear</button>
    </div>
  );
}
