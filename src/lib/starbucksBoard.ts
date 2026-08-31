// Starbucks Deal Board — pure logic, types, and palette.
// See docs/STARBUCKS_DEAL_BOARD_SPEC.md. This file holds everything testable
// and framework-free: heat thresholds, heat/ordering rules, chip text, and the
// dark instrument-panel palette. The board is deliberately NOT the OVIS brand
// light theme (spec §6.1) — do not "correct" these colors.

// ---- Palette (spec §6.2) --------------------------------------------------
export const PALETTE = {
  ground: '#12161C',   // board background
  column: '#1A2029',   // column wells
  tileCool: '#232B36', // cool tile fill
  text: '#E8EDF3',     // site names
  textDim: '#7C8899',  // city, stage, counts
  warm: '#D9891F',
  hot: '#D6453C',
} as const;

// Condensed grotesque per spec §6.3, with graceful system fallbacks so the
// board is legible even before a webfont is wired up.
export const CONDENSED_STACK =
  "'Oswald', 'Roboto Condensed', 'Archivo Narrow', 'Arial Narrow', system-ui, sans-serif";

// ---- Domain types (mirror deal_activity_state) ----------------------------
export type BallInCourt = 'us' | 'them' | 'none';
export type BlockedOn =
  | 'pricing'
  | 'site_plan'
  | 'under_contract'
  | 'info'
  | 'ready';
// 'unclassified' = ball_in_court is NULL (Mike hasn't set who owes). Distinct
// from 'no_history' (no touch data at all). Both are exempt from heat, but
// unclassified is actionable ("Set the court") whereas no_history is "needs a
// first touch". Neither is silently defaulted to a tolerance (spec §5.1).
export type Heat = 'no_history' | 'unclassified' | 'cool' | 'warm' | 'hot';

export interface BoardDeal {
  id: string;
  name: string;          // site name: property → site_submit → deal_name
  city: string | null;
  stageLabel: string;
  stageSortOrder: number;
  ballInCourt: BallInCourt | null;   // null = unclassified
  ballInCourtParty: string | null;
  ballInCourtSince: string | null; // ISO
  blockedOn: BlockedOn | null;
  onAgenda: boolean;
  seededFallback: boolean;
  // derived
  days: number;          // whole days since ball_in_court_since (local/Eastern)
  heat: Heat;
}

// ---- Board stage columns (spec §4). Fixed order, left→right. --------------
export const BOARD_STAGES = [
  'Pre-Submittal',
  'Submitted-Reviewing',
  'Negotiating LOI',
  'At Lease/PSA',
] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];

export const PRE_SUBMITTAL: BoardStage = 'Pre-Submittal';

// ---- Pre-Submittal blocker subheads (spec §4.1). Fixed order; null last. ---
export const BLOCKED_ON_ORDER: Array<BlockedOn | null> = [
  'ready',
  'pricing',
  'site_plan',
  'under_contract',
  'info',
  null,
];

export const BLOCKED_ON_LABEL: Record<BlockedOn | 'null', string> = {
  ready: 'Ready',
  pricing: 'Pricing',
  site_plan: 'Site plan',
  under_contract: 'Under contract',
  info: 'Info',
  null: 'No blocker set',
};

// Blocker → implied ball-in-court, used to pre-select the court when Mike sets
// a Pre-Submittal blocker (saves a click across the ~23 Pre-Submittal deals).
// He can override before saving. (User addition, step 5.)
//   pricing / site_plan / under_contract → them (we're waiting on the other side)
//   ready / info                         → us   (the next move is ours)
export const IMPLIED_COURT: Record<BlockedOn, BallInCourt> = {
  pricing: 'them',
  site_plan: 'them',
  under_contract: 'them',
  ready: 'us',
  info: 'us',
};

// Option lists for the slide-over forms. `none` is deliberately NOT offered —
// escape hatches get used on exactly the deals being avoided (decisions §2.10).
// The picker sets us/them; "clear" returns a deal to unclassified (null).
export const COURT_OPTIONS: Array<{ value: BallInCourt; label: string }> = [
  { value: 'us', label: 'Us' },
  { value: 'them', label: 'Them' },
];

export const BLOCKED_ON_OPTIONS: BlockedOn[] = [
  'ready',
  'pricing',
  'site_plan',
  'under_contract',
  'info',
];

// ---- Heat thresholds (spec §5.1). Tunable — kept here, not inline. ---------
// Days at/above `hot` → hot; at/above `warm` → warm; below → cool.
// `none` has no cool band: it's warm from day 0, hot at 3+ (treated suspicious).
export const HEAT_THRESHOLDS: Record<BallInCourt, { warm: number; hot: number }> = {
  us: { warm: 3, hot: 7 },
  them: { warm: 10, hot: 21 },
  none: { warm: 0, hot: 3 },
};

// Whole calendar days between the clock and today, in the viewer's local
// timezone (the Mac driving the TV is Eastern — CLAUDE.md). Rolls at midnight.
export function daysSince(iso: string | null, now: Date = new Date()): number {
  if (!iso) return 0;
  const since = new Date(iso);
  if (isNaN(since.getTime())) return 0;
  const a = Date.UTC(since.getFullYear(), since.getMonth(), since.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// Heat for a deal (spec §5.1, §5.3). Precedence:
//   seeded_fallback / no row  → no_history (exempt; no clock at all)
//   blocked_on = 'ready'      → hot ("Submit it", regardless of clock — §3.2.1)
//   ball_in_court IS NULL     → unclassified (exempt; NEVER default to a tolerance)
//   otherwise                 → the ball_in_court tolerance
export function computeHeat(d: {
  seededFallback: boolean;
  blockedOn: BlockedOn | null;
  ballInCourt: BallInCourt | null;
  days: number;
}): Heat {
  if (d.seededFallback) return 'no_history';
  if (d.blockedOn === 'ready') return 'hot';
  if (d.ballInCourt === null) return 'unclassified';
  const t = HEAT_THRESHOLDS[d.ballInCourt];
  if (d.ballInCourt === 'none') return d.days >= t.hot ? 'hot' : 'warm';
  if (d.days >= t.hot) return 'hot';
  if (d.days >= t.warm) return 'warm';
  return 'cool';
}

// Sort rank. unclassified sits just above no_history (both below cool) — an
// unclassified deal at least has a clock, so it outranks a historyless one.
const HEAT_RANK: Record<Heat, number> = { hot: 4, warm: 3, cool: 2, unclassified: 1, no_history: 0 };

// Ordering within a column/subhead (spec §5.3): hottest first, then days desc.
// no_history sinks to the bottom.
export function compareDeals(a: BoardDeal, b: BoardDeal): number {
  const r = HEAT_RANK[b.heat] - HEAT_RANK[a.heat];
  if (r !== 0) return r;
  return b.days - a.days;
}

// The court chip label: who owes + how long. (spec §6.4)
export function courtLabel(d: BoardDeal): string {
  if (d.ballInCourtParty) return d.ballInCourtParty;
  if (d.ballInCourt === 'us') return 'You';
  if (d.ballInCourt === 'them') return 'Them';
  if (d.ballInCourt === 'none') return 'No one';
  return 'Unset';
}

// The instruction verb (spec §5.2 + the 'ready' §5.3 and unclassified §5.1
// cases). Null when the tile is calm enough to need no instruction.
export function instruction(d: BoardDeal): string | null {
  if (d.blockedOn === 'ready') return 'Submit it';
  if (d.heat === 'unclassified') return 'Set the court';
  if (d.heat === 'hot' && d.ballInCourt === 'us') return 'You owe a move';
  if (d.heat === 'hot' && d.ballInCourt === 'them') return 'Chase them';
  if ((d.heat === 'warm' || d.heat === 'hot') && d.ballInCourt === 'none')
    return 'No one owns this';
  return null;
}

export function needsAttention(d: BoardDeal): boolean {
  return d.heat === 'warm' || d.heat === 'hot';
}

// The left-edge heat bar + tile fill (spec §6.2). Cool/unclassified/no_history
// are quiet (base tile fill); the energy is spent on warm/hot tints. The bar
// distinguishes the quiet states: none (cool), solid dim (unclassified),
// dashed dim (no_history).
export function heatStyle(heat: Heat): { bar: string; dashed: boolean; fill: string } {
  switch (heat) {
    case 'hot':
      return { bar: PALETTE.hot, dashed: false, fill: 'rgba(214,69,60,0.18)' };
    case 'warm':
      return { bar: PALETTE.warm, dashed: false, fill: 'rgba(217,137,31,0.12)' };
    case 'unclassified':
      return { bar: PALETTE.textDim, dashed: false, fill: PALETTE.tileCool };
    case 'no_history':
      return { bar: PALETTE.textDim, dashed: true, fill: PALETTE.tileCool };
    case 'cool':
    default:
      return { bar: 'transparent', dashed: false, fill: PALETTE.tileCool };
  }
}
