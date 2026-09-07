// Starbucks Deal Board — the one "kill/pass" action (decisions §2.23).
// Labeled by stage: early (Pre-Submittal / Submitted-Reviewing) → "Pass on this
// site"; later → "Mark lost". One required reason input, written twice:
//   Pass  → site_submit.pass_reason + pass_reason_category (structured, for the
//           client report) AND a narrative note on the deal; site_submit → Pass
//           (tile drops via §2.22, deal record stays put).
//   Lost  → deal.loss_reason + deal.stage_id = Lost (canonical) AND a note; the
//           stage-sync trigger flips the site to Lost / Killed.
// A deal with no site_submit can't be "passed" — it falls back to Mark lost.

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { insertDealNote } from '../../lib/boardWrites';
import {
  BoardDeal,
  isEarlyStage,
  PASS_CATEGORIES,
  PassCategory,
  passCategoryLabel,
  PALETTE,
} from '../../lib/starbucksBoard';

export default function KillPassAction({
  deal,
  px,
  onDone,
}: {
  deal: BoardDeal;
  px: (n: number) => number;
  onDone: () => void; // refetch board + close slide-over
}) {
  const mode: 'pass' | 'lost' = isEarlyStage(deal.stageLabel) && deal.siteSubmitId ? 'pass' : 'lost';
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<PassCategory | ''>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const label = mode === 'pass' ? 'Pass on this site' : 'Mark lost';
  const canConfirm = reason.trim().length > 0 && (mode === 'lost' || category !== '');

  async function confirm() {
    setSaving(true);
    setErr(null);
    try {
      const text = reason.trim();
      if (mode === 'pass') {
        const { data: ps, error: psErr } = await supabase.from('submit_stage').select('id').eq('name', 'Pass').single();
        if (psErr) throw psErr;
        const { error: ssErr } = await supabase
          .from('site_submit')
          .update({ pass_reason: text, pass_reason_category: category, submit_stage_id: ps!.id })
          .eq('id', deal.siteSubmitId);
        if (ssErr) throw ssErr;
        await insertDealNote(deal.id, `Passed on this site — ${passCategoryLabel(category as PassCategory)}: ${text}`);
      } else {
        const { data: ls, error: lsErr } = await supabase.from('deal_stage').select('id').eq('label', 'Lost').single();
        if (lsErr) throw lsErr;
        const { error: dErr } = await supabase.from('deal').update({ loss_reason: text, stage_id: ls!.id }).eq('id', deal.id);
        if (dErr) throw dErr;
        await insertDealNote(deal.id, `Marked lost: ${text}`);
      }
      onDone();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed');
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded py-2"
        style={{ border: `1px solid ${PALETTE.hot}`, color: PALETTE.hot, fontSize: px(14), fontWeight: 600 }}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="rounded p-3" style={{ border: `1px solid ${PALETTE.hot}` }}>
      {err && <div style={{ color: PALETTE.hot, fontSize: px(13), marginBottom: 6 }}>{err}</div>}

      <div style={{ fontSize: px(12), color: PALETTE.textDim, marginBottom: 6 }}>
        {mode === 'pass'
          ? 'Records the pass reason on the site (for the client report) + a note on the deal, and removes the tile. The deal record stays at its stage.'
          : 'Marks the deal Lost (records the reason) + a note, and removes it from the board.'}
      </div>

      {mode === 'pass' && (
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as PassCategory)}
          className="w-full rounded px-2 py-1.5 mb-2"
          style={{ backgroundColor: PALETTE.ground, color: category ? PALETTE.text : PALETTE.textDim, border: `1px solid ${PALETTE.ground}`, fontSize: px(14) }}
        >
          <option value="">Category…</option>
          {PASS_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      )}

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={mode === 'pass' ? 'Why are we passing on this site? (required)' : 'Why is this lost? (required)'}
        rows={3}
        className="w-full rounded px-2 py-1.5"
        style={{ backgroundColor: PALETTE.ground, color: PALETTE.text, border: `1px solid ${PALETTE.ground}`, fontSize: px(14), resize: 'vertical' }}
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={confirm}
          disabled={saving || !canConfirm}
          className="rounded px-3 py-1.5"
          style={{ backgroundColor: canConfirm ? PALETTE.hot : 'transparent', color: canConfirm ? PALETTE.text : PALETTE.textDim, border: `1px solid ${canConfirm ? PALETTE.hot : PALETTE.textDim}`, fontSize: px(14), fontWeight: 600, opacity: saving ? 0.6 : 1 }}
        >
          {mode === 'pass' ? 'Confirm pass' : 'Confirm lost'}
        </button>
        <button onClick={() => setOpen(false)} disabled={saving} className="rounded px-3 py-1.5" style={{ color: PALETTE.textDim, fontSize: px(14) }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
