/**
 * 12-month cash projection, owner take-home and steady owner pay. Pure logic.
 * See docs/CASH_FLOW_DASHBOARD_AUDIT.md ("v1.5", "v1.6").
 *
 * Day by day from the Operating book balance:
 *  1. Apply the day's events. Below the cushion → draw on the LOC back up to it (capped at what's
 *     available; anything beyond is a shortfall).
 *  2. Month end: cash above the cushion pays down the LOC drawn balance first (FIFO by draw).
 *  3. Take-home for the month (v1.6 rule) = the largest amount that can be taken now such that, taking
 *     nothing else, no later day in the window falls below the cushion — judged on the no-draw path.
 *     So take-home is never followed by borrowing. It is assumed taken (lowers next month's start).
 * Steady owner pay = the largest flat amount taken at every month end with no day below the cushion and
 * no LOC draws (no-draw path).
 */
import { CashEvent, addDays, CASH_CONFIG, daysBetween } from './calendar.ts';

export type Scenario = 'committed' | 'pipeline';

export interface LocDraw {
  /** 'YYYY-MM' of the month the draw happened. */
  month: string;
  date: string;
  amount: number;
  /** Inflows whose month-end paydown repaid this draw (FIFO). */
  repaidBy: { label: string; date: string; amount: number; month: string }[];
  outstanding: number;
}

export interface ProjectionMonth {
  month: string; // 'YYYY-MM'
  label: string; // 'Nov 2026'
  startCash: number;
  inflow: number;
  outflow: number;
  /** Lowest balance in the month before any LOC draw. */
  lowBeforeDraw: number;
  locDraw: number;
  locPaydown: number;
  /** Cash at month end after paydown, before the owner take-home. */
  endingCash: number;
  /** Take-home available this month (v1.6 rule). */
  ownerDistribution: number;
  /** Balance below the cushion that the LOC couldn't cover. */
  shortfall: number;
  locDrawnAfter: number;
  /** Largest inflow in the month (for "which inflow repays it"). */
  topInflow: { label: string; date: string; amount: number } | null;
}

export interface SteadyPay {
  /** Largest flat monthly amount starting this month (0 if not possible now). */
  amount: number;
  /** When `amount` is 0: earliest month a positive flat amount could start, and that amount. */
  startMonth: string | null;
  startLabel: string | null;
  amountFromStart: number;
  /** Month whose low point binds the amount (the tightest month). */
  bindingMonth: string | null;
}

export interface Projection {
  scenario: Scenario;
  months: ProjectionMonth[];
  draws: LocDraw[];
  totalDistribution: number;
  steady: SteadyPay;
  /** Lowest balance on the no-draw, no-take-home path. */
  noDrawLow: { date: string; balance: number };
}

function monthKey(d: string) {
  return d.slice(0, 7);
}

export function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}


/** Committed events, or committed + below-threshold commissions weighted by probability. */
export function scenarioEvents(events: CashEvent[], upside: CashEvent[], scenario: Scenario): CashEvent[] {
  if (scenario === 'committed') return events;
  return [
    ...events,
    ...upside.map((e) => {
      const w = (e.probability ?? 0) / 100;
      return { ...e, amount: e.amount * w, artySplit: e.artySplit ? e.artySplit * w : undefined };
    }),
  ];
}

/** Horizon in days covering this month + the next PROJECTION_MONTHS − 1 months. */
export function projectionHorizonDays(today: string, months: number = CASH_CONFIG.PROJECTION_MONTHS): number {
  const [y, m] = today.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, 0)).toISOString().slice(0, 10);
  return daysBetween(today, end) + 1;
}

export function buildProjection(opts: {
  startBalance: number;
  today: string;
  events: CashEvent[];
  cushion: number;
  locAvailable: number;
  scenario: Scenario;
  months?: number;
}): Projection {
  const { startBalance, today, cushion, scenario } = opts;
  const N = projectionHorizonDays(today, opts.months ?? CASH_CONFIG.PROJECTION_MONTHS);
  const dates: string[] = Array.from({ length: N }, (_, i) => addDays(today, i));
  const idx = new Map(dates.map((d, i) => [d, i]));
  const dayEvents: CashEvent[][] = dates.map(() => []);
  for (const e of opts.events) {
    if (e.skipped) continue;
    const i = idx.get(e.date < today ? today : e.date);
    if (i !== undefined) dayEvents[i].push(e);
  }
  const net = dayEvents.map((evs) => evs.reduce((t, e) => t + e.amount, 0));

  // Prefix sums of net flow and suffix minimum of the prefix → min future balance in O(1).
  const P: number[] = [];
  net.forEach((n, i) => P.push((i ? P[i - 1] : 0) + n));
  const sufMin: number[] = new Array(N + 1).fill(Infinity);
  for (let i = N - 1; i >= 0; i--) sufMin[i] = Math.min(P[i], sufMin[i + 1]);

  // Month boundaries
  const monthEnds: number[] = [];
  dates.forEach((d, i) => { if (i === N - 1 || monthKey(dates[i + 1]) !== monthKey(d)) monthEnds.push(i); });

  // --- Take-home path with LOC -------------------------------------------------
  let cash = startBalance;
  let available = opts.locAvailable;
  const draws: LocDraw[] = [];
  const months: ProjectionMonth[] = [];
  let i = 0;
  for (const mEnd of monthEnds) {
    const key = monthKey(dates[i]);
    const startCash = cash;
    let inflow = 0, outflow = 0, locDraw = 0, shortfall = 0;
    let lowBeforeDraw = Infinity;
    let topInflow: ProjectionMonth['topInflow'] = null;
    for (; i <= mEnd; i++) {
      for (const e of dayEvents[i]) {
        cash += e.amount;
        if (e.amount > 0) {
          inflow += e.amount;
          if (!topInflow || e.amount > topInflow.amount) topInflow = { label: e.label, date: dates[i], amount: e.amount };
        } else outflow += e.amount;
      }
      lowBeforeDraw = Math.min(lowBeforeDraw, cash);
      if (cash < cushion) {
        const need = cushion - cash;
        const draw = Math.min(need, available);
        if (draw > 0) {
          cash += draw;
          available -= draw;
          locDraw += draw;
          draws.push({ month: key, date: dates[i], amount: draw, repaidBy: [], outstanding: draw });
        }
        shortfall = Math.max(shortfall, need - draw);
      }
    }

    // Month end: LOC paydown first (FIFO).
    let locPaydown = 0;
    let excess = cash - cushion;
    for (const d of draws) {
      if (excess <= 0) break;
      if (d.outstanding <= 0) continue;
      const pay = Math.min(excess, d.outstanding);
      d.outstanding -= pay;
      excess -= pay;
      locPaydown += pay;
      d.repaidBy.push(topInflow ? { ...topInflow, month: key, amount: pay } : { label: 'Cash on hand', date: dates[mEnd], amount: pay, month: key });
    }
    cash -= locPaydown;
    available += locPaydown;
    const endingCash = cash;

    // Take-home: never so much that a later day (no further draws or take-home) dips under the cushion.
    const minFuture = mEnd + 1 < N ? cash + sufMin[mEnd + 1] - P[mEnd] : Infinity;
    const ownerDistribution = Math.max(0, Math.floor(Math.min(cash - cushion, minFuture - cushion)));
    cash -= ownerDistribution;

    months.push({
      month: key,
      label: monthLabel(key),
      startCash,
      inflow,
      outflow,
      lowBeforeDraw: lowBeforeDraw === Infinity ? startCash : lowBeforeDraw,
      locDraw,
      locPaydown,
      endingCash,
      ownerDistribution,
      shortfall,
      locDrawnAfter: draws.reduce((t, d) => t + d.outstanding, 0),
      topInflow,
    });
  }

  // --- Steady owner pay (no-draw path) -------------------------------------------
  const B = P.map((p) => startBalance + p);
  // Month ends at or before day d (pay is taken at month end, after that day's events).
  const endSet = new Set(monthEnds);
  const kAt: number[] = [];
  let k = 0;
  for (let d = 0; d < N; d++) { if (endSet.has(d)) k++; kAt.push(k); }
  const monthStart = [0, ...monthEnds.slice(0, -1).map((e) => e + 1)];
  const steadyFrom = (s: number) => {
    let x = Infinity;
    let binding: number | null = null;
    for (let d = monthStart[s]; d < N; d++) {
      const c = kAt[d] - s;
      if (c <= 0) {
        if (B[d] < cushion) return { x: 0, binding: d };
        continue;
      }
      const v = (B[d] - cushion) / c;
      if (v < x) { x = v; binding = d; }
    }
    return { x: x === Infinity ? 0 : Math.max(0, Math.floor(x)), binding };
  };
  const now = steadyFrom(0);
  const steady: SteadyPay = {
    amount: now.x,
    startMonth: null,
    startLabel: null,
    amountFromStart: 0,
    bindingMonth: now.binding !== null ? monthKey(dates[now.binding]) : null,
  };
  if (now.x <= 0) {
    for (let s = 1; s < monthStart.length; s++) {
      const r = steadyFrom(s);
      if (r.x > 0) {
        const key = monthKey(dates[monthStart[s]]);
        steady.startMonth = key;
        steady.startLabel = monthLabel(key);
        steady.amountFromStart = r.x;
        break;
      }
    }
  }

  let lowI = 0;
  B.forEach((b, d) => { if (b < B[lowI]) lowI = d; });

  return {
    scenario,
    months,
    draws,
    totalDistribution: months.reduce((t, m) => t + m.ownerDistribution, 0),
    steady,
    noDrawLow: { date: dates[lowI], balance: B[lowI] },
  };
}
