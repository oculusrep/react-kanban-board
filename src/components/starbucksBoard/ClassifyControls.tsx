// Shared court + blocker classification controls (decisions §2.10, §2.12).
// Used by both the slide-over and the triage queue so classification behaves
// identically everywhere. Owns its own form state + the write to
// deal_activity_state, and re-seeds when a different deal is passed in.

import { useEffect, useState, type ReactNode } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import {
  BallInCourt,
  BlockedOn,
  BLOCKED_ON_LABEL,
  BLOCKED_ON_OPTIONS,
  BOARD_STAGES,
  BoardDeal,
  BoardStage,
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
  const [stage, setStage] = useState<BoardStage>((deal.stageLabel as BoardStage));
  const isPre = stage === PRE_SUBMITTAL; // based on the SELECTED stage, not the deal's current one

  const [court, setCourt] = useState<BallInCourt | null>(deal.ballInCourt);
  const [party, setParty] = useState(deal.ballInCourtParty ?? '');
  const [blockedOn, setBlockedOn] = useState<BlockedOn | null>(deal.blockedOn);
  const [needsPricing, setNeedsPricing] = useState(deal.needsPricing);
  const [needsSitePlan, setNeedsSitePlan] = useState(deal.needsSitePlan);
  // Clock start. Defaults to today — saving stamps NOW, as it always has. Edit
  // it to backdate a deal whose real last touch predates the classification
  // (the clock is the whole point of the board; a wrong start lies about heat).
  const [clockDate, setClockDate] = useState<string>(todayLocal);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setStage(deal.stageLabel as BoardStage);
    setCourt(deal.ballInCourt);
    setParty(deal.ballInCourtParty ?? '');
    setBlockedOn(deal.blockedOn);
    setNeedsPricing(deal.needsPricing);
    setNeedsSitePlan(deal.needsSitePlan);
    setClockDate(todayLocal());
    setErr(null);
  }, [deal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Changing stage away from Pre-Submittal drops the blocker (Pre-only, §2.12).
  function pickStage(s: BoardStage) {
    setStage(s);
    if (s !== PRE_SUBMITTAL) { setBlockedOn(null); setNeedsPricing(false); setNeedsSitePlan(false); }
  }

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

  // A backdated clock is itself a change worth saving, even if nothing else moved.
  const backdated = clockDate !== todayLocal();

  const dirty =
    backdated ||
    stage !== deal.stageLabel ||
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
      // Stage change is a SHARED-pipeline write (decisions §2.17): deal.stage_id
      // propagates to site_submit via the sync trigger, and leaving Pre-Submittal
      // clears blocked_on via trg_clear_blocked_on_stage_change. Do it first.
      if (stage !== deal.stageLabel) {
        const { data: sd, error: sErr } = await supabase.from('deal_stage').select('id').eq('label', stage).single();
        if (sErr) throw sErr;
        const { error: dErr } = await supabase.from('deal').update({ stage_id: sd!.id }).eq('id', deal.id);
        if (dErr) throw dErr;
      }

      const patch: Record<string, unknown> = {
        deal_id: deal.id,
        ball_in_court: court, // null = unclassified
        ball_in_court_party: party.trim() || null,
        // today → stamp now (unchanged); an edited date → that local midnight,
        // which is what daysSince() measures against (local calendar days).
        ball_in_court_since: backdated
          ? new Date(`${clockDate}T00:00:00`).toISOString()
          : new Date().toISOString(),
        seeded_fallback: false,
        // blocked_on is Pre-only; on non-Pre it's cleared (consistent with the trigger)
        blocked_on: isPre ? blockedOn : null,
        needs_pricing: isPre && blockedOn === 'awaiting_ll' ? needsPricing : false,
        needs_site_plan: isPre && blockedOn === 'awaiting_ll' ? needsSitePlan : false,
      };
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

      <div style={{ fontSize: px(12), color: PALETTE.textDim, marginBottom: 4 }}>Stage</div>
      <select
        value={stage}
        onChange={(e) => pickStage(e.target.value as BoardStage)}
        className="w-full rounded px-2 py-1.5 mb-3"
        style={inputStyle}
      >
        {BOARD_STAGES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

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

      {/* Clock started — every save resets the shot clock; this says to WHEN.
          Today by default; back-date it when the last real touch was earlier. */}
      <div className="mt-3">
        <div style={{ fontSize: px(12), color: PALETTE.textDim, marginBottom: 4 }}>
          Clock started
          {deal.ballInCourtSince && (
            <span> · now {format(new Date(deal.ballInCourtSince), 'M/d')} ({deal.days}d)</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* OVIS-standard react-datepicker; input styled for the dark panel */}
          <DatePicker
            selected={clockDate ? parseISO(clockDate) : null}
            onChange={(d) => setClockDate(d ? format(d, 'yyyy-MM-dd') : todayLocal())}
            dateFormat="MM/dd/yyyy"
            maxDate={new Date()}
            popperProps={{ strategy: 'fixed' }}
            className="rounded px-2 py-1.5 bg-[#12161C] text-[#E8EDF3] border border-[#12161C] w-[130px]"
          />
          {backdated ? (
            <Pill px={px} active={false} muted onClick={() => setClockDate(todayLocal())}>today</Pill>
          ) : (
            <span style={{ fontSize: px(12), color: PALETTE.textDim }}>today — resets to 0d</span>
          )}
        </div>
      </div>

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
        {saveLabel ?? 'Save'}
        {canSave && (backdated ? ` (clock → ${format(parseISO(clockDate), 'M/d')})` : ' (resets clock)')}
      </button>
      {courtMissing && <div style={{ color: PALETTE.textDim, fontSize: px(12), marginTop: 4 }}>Set the ball-in-court to classify.</div>}
    </div>
  );
}

// today as a local YYYY-MM-DD (CLAUDE.md: local date, never toISOString())
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
