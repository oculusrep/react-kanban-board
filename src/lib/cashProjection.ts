/**
 * 12-month cash projection + owner take-home (v1.5). Pure logic. See docs/CASH_FLOW_DASHBOARD_AUDIT.md ("v1.5").
 *
 * Per month, walking day by day from the Operating book balance:
 *  1. Apply the day's events. If cash drops below the cushion, draw on the LOC to get back to it
 *     (capped at what's available; anything beyond is a shortfall).
 *  2. Month end: cash above the cushion pays down the LOC drawn balance first (FIFO by draw).
 *  3. Whatever is still above the cushion = available owner distribution. It is assumed taken at month
 *     end, so it reduces the next month's starting cash.
 * Scenarios: 'committed' = deals ≥ threshold only; 'pipeline' = committed + below-threshold commissions
 * weighted by probability.
 */
import { CashEvent, addDays, CASH_CONFIG } from './cashCalendar';

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
  /** Cash at month end after paydown, before the owner distribution. */
  endingCash: number;
  ownerDistribution: number;
  /** Balance below the cushion that the LOC couldn't cover. */
  shortfall: number;
  locDrawnAfter: number;
  /** Largest inflow in the month (for "which inflow repays it"). */
  topInflow: { label: string; date: string; amount: number } | null;
}

export interface Projection {
  scenario: Scenario;
  months: ProjectionMonth[];
  draws: LocDraw[];
  totalDistribution: number;
}

function monthKey(d: string) {
  return d.slice(0, 7);
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function lastDayOfMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Events for a scenario: skipped (already in QBO) dropped; pipeline adds probability-weighted upside. */
export function scenarioEvents(events: CashEvent[], upside: CashEvent[], scenario: Scenario): CashEvent[] {
  const counted = events.filter((e) => !e.skipped);
  if (scenario === 'committed') return counted;
  return [
    ...counted,
    ...upside.map((e) => ({ ...e, amount: (e.amount * (e.probability ?? 0)) / 100 })),
  ];
}

/** Horizon in days covering this month + the next PROJECTION_MONTHS − 1 months. */
export function projectionHorizonDays(today: string, months: number = CASH_CONFIG.PROJECTION_MONTHS): number {
  const [y, m] = today.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, 0)).toISOString().slice(0, 10);
  let n = 1;
  for (let d = today; d < end; d = addDays(d, 1)) n++;
  return n;
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
  const monthsN = opts.months ?? CASH_CONFIG.PROJECTION_MONTHS;
  const byDate = new Map<string, CashEvent[]>();
  for (const e of opts.events) {
    const d = e.date < today ? today : e.date;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(e);
  }

  let cash = startBalance;
  let available = opts.locAvailable;
  const draws: LocDraw[] = [];
  const months: ProjectionMonth[] = [];
  let day = today;

  for (let i = 0; i < monthsN; i++) {
    const key = monthKey(day);
    const last = lastDayOfMonth(key);
    const startCash = cash;
    let inflow = 0;
    let outflow = 0;
    let lowBeforeDraw = Infinity;
    let locDraw = 0;
    let shortfall = 0;
    let topInflow: ProjectionMonth['topInflow'] = null;

    for (; day <= last; day = addDays(day, 1)) {
      for (const e of byDate.get(day) || []) {
        cash += e.amount;
        if (e.amount > 0) {
          inflow += e.amount;
          if (!topInflow || e.amount > topInflow.amount) topInflow = { label: e.label, date: day, amount: e.amount };
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
          draws.push({ month: key, date: day, amount: draw, repaidBy: [], outstanding: draw });
        }
        shortfall = Math.max(shortfall, need - draw);
      }
    }

    // Month end: pay down LOC (FIFO), then the rest above the cushion is the owner distribution.
    let locPaydown = 0;
    let excess = cash - cushion;
    for (const d of draws) {
      if (excess <= 0) break;
      if (d.outstanding <= 0) continue;
      const pay = Math.min(excess, d.outstanding);
      d.outstanding -= pay;
      excess -= pay;
      locPaydown += pay;
      if (topInflow) d.repaidBy.push({ ...topInflow, month: key, amount: pay });
      else d.repaidBy.push({ label: 'Cash on hand', date: last, amount: pay, month: key });
    }
    cash -= locPaydown;
    available += locPaydown;
    const endingCash = cash;
    const ownerDistribution = Math.max(0, cash - cushion);
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

  return {
    scenario,
    months,
    draws,
    totalDistribution: months.reduce((t, m) => t + m.ownerDistribution, 0),
  };
}
