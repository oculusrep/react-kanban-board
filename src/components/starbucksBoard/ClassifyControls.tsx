// Shared court + blocker classification controls (decisions §2.10, §2.12).
// Used by both the slide-over and the triage queue so classification behaves
// identically everywhere. Owns its own form state + the write to
// deal_activity_state, and re-seeds when a different deal is passed in.

import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  BallInCourt,
  BlockedOn,
  BLOCKED_ON_LABEL,
  BLOCKED_ON_OPTIONS,
  BoardDeal,
  COURT_OPTIONS,
  IMPLIED_COURT,
  PALETTE,
  PRE_SUBMITTAL,
} from '../../lib/starbucksBoard';

export default function ClassifyControls({
  deal,
  px,
  saveLabel,
  requireCourt = false,
  onSaved,
}: {
  deal: BoardDeal;
  px: (n: number) => number;
  saveLabel?: string;
  requireCourt?: boolean; // triage: can't save until classified (court set)
  onSaved?: () => void;
}) {
  const isPre = deal.stageLabel === PRE_SUBMITTAL;

  const [court, setCourt] = useState<BallInCourt | null>(deal.ballInCourt);
  const [party, setParty] = useState(deal.ballInCourtParty ?? '');
  const [blockedOn, setBlockedOn] = useState<BlockedOn | null>(deal.blockedOn);
  const [needsPricing, setNeedsPricing] = useState(deal.needsPricing);
  const [needsSitePlan, setNeedsSitePlan] = useState(deal.needsSitePlan);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setCourt(deal.ballInCourt);
    setParty(deal.ballInCourtParty ?? '');
    setBlockedOn(deal.blockedOn);
    setNeedsPricing(deal.needsPricing);
    setNeedsSitePlan(deal.needsSitePlan);
    setErr(null);
  }, [deal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick a blocker → pre-fill implied court (overridable); reset landlord
  // details unless it's awaiting_ll (§2.12).
  function pickBlocker(b: BlockedOn) {
    setBlockedOn(b);
    setCourt(IMPLIED_COURT[b]);
    if (b !== 'awaiting_ll') { setNeedsPricing(false); setNeedsSitePlan(false); }
  }
  // Clearing the blocker + court=us is "ready to submit" (no blocker, classified).
  function clearBlocker() {
    setBlockedOn(null);
    setNeedsPricing(false);
    setNeedsSitePlan(false);
  }

  const dirty =
    court !== deal.ballInCourt ||
    (party.trim() || null) !== (deal.ballInCourtParty ?? null) ||
    (isPre && (blockedOn !== deal.blockedOn ||
      needsPricing !== deal.needsPricing ||
      needsSitePlan !== deal.needsSitePlan));

  const awaitingInvalid = isPre && blockedOn === 'awaiting_ll' && !needsPricing && !needsSitePlan;
  const courtMissing = requireCourt && court === null;
  const canSave = dirty && !awaitingInvalid && !courtMissing;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const patch: Record<string, unknown> = {
        deal_id: deal.id,
        ball_in_court: court, // null = unclassified
        ball_in_court_party: party.trim() || null,
        ball_in_court_since: new Date().toISOString(),
        seeded_fallback: false,
      };
      if (isPre) {
        patch.blocked_on = blockedOn;
        patch.needs_pricing = blockedOn === 'awaiting_ll' ? needsPricing : false;
        patch.needs_site_plan = blockedOn === 'awaiting_ll' ? needsSitePlan : false;
      }
      const { error } = await supabase.from('deal_activity_state').upsert(patch, { onConflict: 'deal_id' });
      if (error) throw error;
      onSaved?.();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    backgroundColor: PALETTE.ground,
    color: PALETTE.text,
    border: `1px solid ${PALETTE.ground}`,
    fontSize: px(15),
  } as const;

  return (
    <div>
      {err && <div style={{ color: PALETTE.hot, fontSize: px(13), marginBottom: 6 }}>{err}</div>}

      <div style={{ fontSize: px(12), color: PALETTE.textDim, marginBottom: 4 }}>Ball in court</div>
      <div className="flex flex-wrap gap-2">
        {COURT_OPTIONS.map((o) => (
          <Pill key={o.value} px={px} active={court === o.value} onClick={() => setCourt(o.value)}>{o.label}</Pill>
        ))}
        {court !== null && <Pill px={px} active={false} muted onClick={() => setCourt(null)}>clear</Pill>}
      </div>
      <input
        value={party}
        onChange={(e) => setParty(e.target.value)}
        placeholder="Who specifically? (Landlord, GDOT, Seller…)"
        className="mt-2 w-full rounded px-2 py-1.5"
        style={inputStyle}
      />

      {isPre && (
        <div className="mt-3">
          <div style={{ fontSize: px(12), color: PALETTE.textDim, marginBottom: 4 }}>
            Blocker — leave clear for ready-to-submit
          </div>
          <div className="flex flex-wrap gap-2">
            {BLOCKED_ON_OPTIONS.map((b) => (
              <Pill key={b} px={px} active={blockedOn === b} onClick={() => pickBlocker(b)}>{BLOCKED_ON_LABEL[b]}</Pill>
            ))}
            {blockedOn !== null && <Pill px={px} active={false} muted onClick={clearBlocker}>none (ready)</Pill>}
          </div>

          {blockedOn === 'awaiting_ll' && (
            <div className="mt-2 flex flex-col gap-1" style={{ fontSize: px(14), color: PALETTE.text }}>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={needsPricing} onChange={(e) => setNeedsPricing(e.target.checked)} />
                Pricing
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={needsSitePlan} onChange={(e) => setNeedsSitePlan(e.target.checked)} />
                Site plan
              </label>
              {awaitingInvalid && <span style={{ color: PALETTE.warm, fontSize: px(12) }}>Pick at least one.</span>}
            </div>
          )}
        </div>
      )}

      <button
        onClick={save}
        disabled={saving || !canSave}
        className="mt-3 w-full rounded py-2"
        style={{
          backgroundColor: canSave ? PALETTE.text : 'transparent',
          color: canSave ? PALETTE.ground : PALETTE.textDim,
          border: `1px solid ${canSave ? PALETTE.text : PALETTE.textDim}`,
          fontWeight: 600, fontSize: px(16), opacity: saving ? 0.6 : 1,
        }}
      >
        {saveLabel ?? 'Save'}{canSave ? ' (resets clock)' : ''}
      </button>
      {courtMissing && <div style={{ color: PALETTE.textDim, fontSize: px(12), marginTop: 4 }}>Set the ball-in-court to classify.</div>}
    </div>
  );
}

function Pill({ active, muted, onClick, children, px }: { active: boolean; muted?: boolean; onClick: () => void; children: ReactNode; px: (n: number) => number }) {
  return (
    <button
      onClick={onClick}
      className="rounded"
      style={{
        fontSize: px(15),
        padding: `${px(4)}px ${px(10)}px`,
        border: `1px solid ${active ? PALETTE.text : PALETTE.textDim}`,
        backgroundColor: active ? PALETTE.text : 'transparent',
        color: active ? PALETTE.ground : muted ? PALETTE.textDim : PALETTE.text,
      }}
    >
      {children}
    </button>
  );
}
