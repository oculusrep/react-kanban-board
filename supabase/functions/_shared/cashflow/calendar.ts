/**
 * 45-day cash calendar — pure logic, no Supabase. See docs/CASH_FLOW_DASHBOARD_AUDIT.md
 * ("v1 build" + "v1 revision"). All dates are Eastern-Time calendar dates ('YYYY-MM-DD').
 */

export const BROKER_IDS = {
  mike: '38d4b67c-841d-4590-a909-523d3a4c6e4b',
  arty: '1d049634-32fe-4834-8ca1-33f1cff0055a',
  greg: 'dbfdd8d4-5241-4cc2-be83-f7763f5519bf',
} as const;

export type PayMethod = 'payroll' | 'ach_today';

export const CASH_CONFIG = {
  /**
   * The calendar runs on the Oculus Operating Account (QBO 256 — BofA checking, also the referral
   * check account). Savings / personal accounts are shown for information only (Mike, 2026-11-10).
   */
  OPERATING_QB_ACCOUNT_ID: '256',
  /** "Money owed out" urgency by days held since the client payment arrived. */
  OWED_AMBER_DAYS: 15,
  OWED_RED_DAYS: 30,
  /** 12-month projection horizon (v1.5). */
  PROJECTION_MONTHS: 12,
  /** Tax reserve payment dates (month 1-12, day): estimated-tax style schedule (v1.6). */
  TAX_PAYMENT_DATES: [[1, 15], [4, 15], [6, 15], [9, 15]] as [number, number][],
  /** Fallback when app_settings.tax_reserve_pct is missing. */
  TAX_RESERVE_PCT_DEFAULT: 0.25,
  /** Days shown on the calendar, starting today (ET). */
  CALENDAR_DAYS: 45,
  /** Commission payments count as expected cash only on deals at or above this probability. */
  COMMITTED_PROBABILITY_MIN: 90,
  /**
   * Referral fees / broker splits "owed" only count on payments received within this many days.
   * Older received payments carry legacy unpaid flags (2021–2024 data) that aren't real debts.
   */
  OWED_LOOKBACK_DAYS: 90,
  /** How each broker's split leaves the bank. Mike's own split is never an outflow. */
  BROKER_PAY_METHOD: {
    [BROKER_IDS.arty]: 'payroll',
    [BROKER_IDS.greg]: 'ach_today',
  } as Record<string, PayMethod>,
  /**
   * A scheduled-payment occurrence is skipped when QBO already has a bank-register line for the
   * same payee within this many days and this many dollars — the book balance already includes it.
   */
  DEDUPE_DAYS: 5,
  DEDUPE_DOLLARS: 1,
  /** Payroll runs semi-monthly: the 15th and the last day of the month (Arty's draw Bills). */
  PAYROLL_DAYS_OF_MONTH: [15, 'last'] as (number | 'last')[],
} as const;

// ---------------------------------------------------------------------------
// Date helpers (date-only strings; arithmetic in UTC so DST never shifts a day)
// ---------------------------------------------------------------------------

export function todayET(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function toUTC(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Dates in [start, end] on which a day-of-month schedule falls (31 → last day of short months). */
export function monthlyOccurrences(dayOfMonth: number, start: string, end: string): string[] {
  const out: string[] = [];
  const s = toUTC(start);
  let y = s.getUTCFullYear();
  let m = s.getUTCMonth();
  for (;;) {
    const day = Math.min(dayOfMonth, daysInMonth(y, m));
    const d = fromUTC(new Date(Date.UTC(y, m, day)));
    if (d > end) break;
    if (d >= start) out.push(d);
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return out;
}

/** Every-N-weeks dates in [start, end] from `anchor` (inclusive), stopping after `until` if given. */
export function weeklyOccurrences(anchor: string, everyNWeeks: number, start: string, end: string, until?: string | null): string[] {
  const out: string[] = [];
  const step = Math.max(1, everyNWeeks) * 7;
  let d = anchor;
  if (d < start) {
    const behind = daysBetween(d, start);
    d = addDays(d, Math.ceil(behind / step) * step);
  }
  for (; d <= end; d = addDays(d, step)) {
    if (until && d > until) break;
    out.push(d);
  }
  return out;
}

export function nextPayrollDate(from: string): string {
  for (let i = 0; i < 40; i++) {
    const d = addDays(from, i);
    const x = toUTC(d);
    const last = daysInMonth(x.getUTCFullYear(), x.getUTCMonth());
    const dom = x.getUTCDate();
    if (CASH_CONFIG.PAYROLL_DAYS_OF_MONTH.some((p) => (p === 'last' ? dom === last : dom === p))) return d;
  }
  return from;
}

/** When a broker's split is expected to leave the bank. */
export function brokerPayoutDate(brokerId: string, today: string): string {
  return CASH_CONFIG.BROKER_PAY_METHOD[brokerId] === 'payroll' ? nextPayrollDate(today) : today;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export type CashEventKind =
  | 'scheduled'      // scheduled_payment kind 'bill'
  | 'draw'           // scheduled_payment kind 'draw'
  | 'referral_owed'  // received payment, referral fee not yet paid
  | 'split_owed'     // received payment, broker split not yet marked paid
  | 'split_bill'     // OVIS broker-split Bill still open in QBO
  | 'commission'     // expected commission (probability ≥ threshold), net of referral + other brokers
  | 'tax';           // tax reserve payment (placeholder %)

export interface CashEvent {
  date: string;
  kind: CashEventKind;
  label: string;
  /** Signed: + money in, − money out. */
  amount: number;
  detail?: string;
  dealId?: string | null;
  warning?: string;
  /** Already entered in QBO (book balance includes it): shown greyed, not counted. */
  skipped?: boolean;
  /** Deal probability for commission events (0–100). */
  probability?: number;
  /** Arty's split inside this event (commission or split owed) — recoups his advance balance. */
  artySplit?: number;
  /** This outflow is an advance to Arty (a draw) — adds to his advance balance. */
  advance?: number;
  /** Counts as a business expense in the tax-reserve base (scheduled bills; not LOC principal or advances). */
  expense?: boolean;
}

export interface CalendarDay {
  date: string;
  events: CashEvent[];
  inflow: number;
  outflow: number;
  balance: number;
}

export function buildCalendar(startBalance: number, today: string, events: CashEvent[], days: number = CASH_CONFIG.CALENDAR_DAYS) {
  const byDate = new Map<string, CashEvent[]>();
  for (const e of events) {
    // Anything dated before today (overdue) lands on today: it is still owed / still expected.
    const d = e.date < today ? today : e.date;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push({ ...e, date: d });
  }

  const out: CalendarDay[] = [];
  let balance = startBalance;
  let lowest: CalendarDay | null = null;
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const evs = (byDate.get(date) || []).sort((a, b) => a.amount - b.amount);
    const counted = evs.filter((e) => !e.skipped);
    const inflow = counted.filter((e) => e.amount > 0).reduce((t, e) => t + e.amount, 0);
    const outflow = counted.filter((e) => e.amount < 0).reduce((t, e) => t + e.amount, 0);
    balance += inflow + outflow;
    const day = { date, events: evs, inflow, outflow, balance };
    out.push(day);
    if (!lowest || day.balance < lowest.balance) lowest = day;
  }
  return { days: out, lowest, end: addDays(today, days - 1) };
}

// ---------------------------------------------------------------------------
// Arty advances (v1.6)
// ---------------------------------------------------------------------------

/**
 * Walk events in date order. Draws marked `advance` add to the advance balance; any event carrying
 * `artySplit` pays Arty split − outstanding advance (floor 0), so the event's cash effect improves by the
 * amount recouped. Returns new event objects (inputs untouched). Skipped events are ignored (already in
 * QBO, so already in the starting balance).
 */
export function applyAdvances(events: CashEvent[], startAdvance: number) {
  const sorted = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (b.advance ? 1 : 0) - (a.advance ? 1 : 0)));
  let balance = Math.max(0, startAdvance);
  let recouped = 0;
  const out = sorted.map((e) => {
    if (e.skipped) return e;
    if (e.advance) {
      balance += e.advance;
      return e;
    }
    if (e.artySplit && e.artySplit > 0 && balance > 0) {
      const r = Math.min(e.artySplit, balance);
      balance -= r;
      recouped += r;
      return {
        ...e,
        amount: e.amount + r,
        detail: `${e.detail ? e.detail + ' · ' : ''}Arty advance recouped ${r.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`,
      };
    }
    return e;
  });
  return { events: out, endBalance: balance, recouped };
}

// ---------------------------------------------------------------------------
// Tax reserve (v1.6) — placeholder %
// ---------------------------------------------------------------------------

export function taxReserveLabel(pct: number) {
  return `Tax reserve (placeholder ${Math.round(pct * 100)}% — confirm with CPA)`;
}

/**
 * Accrue `pct` × max(0, month base) per month from today, where base = commission cash in − business
 * expenses (= owner pay + business net income; owner pay itself is not an expense, so the base doesn't
 * depend on it). Pay the accrued amount on each TAX_PAYMENT_DATES date in (today, end].
 */
export function buildTaxEvents(events: CashEvent[], today: string, end: string, pct: number): CashEvent[] {
  if (!(pct > 0)) return [];
  const baseByMonth = new Map<string, number>();
  for (const e of events) {
    if (e.skipped) continue;
    const m = e.date.slice(0, 7);
    if (e.kind === 'commission') baseByMonth.set(m, (baseByMonth.get(m) || 0) + e.amount);
    else if (e.expense) baseByMonth.set(m, (baseByMonth.get(m) || 0) + e.amount);
  }
  const payDates: string[] = [];
  const startY = Number(today.slice(0, 4));
  const endY = Number(end.slice(0, 4));
  for (let y = startY; y <= endY; y++) {
    for (const [m, d] of CASH_CONFIG.TAX_PAYMENT_DATES) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (date > today && date <= end) payDates.push(date);
    }
  }
  payDates.sort();
  const out: CashEvent[] = [];
  let paidThrough = ''; // last month already covered by a payment (accrual starts this month)
  const months = [...baseByMonth.keys()].sort();
  for (const pd of payDates) {
    const cutoff = pd.slice(0, 7); // accrue months strictly before the payment month
    let accrued = 0;
    const covered: string[] = [];
    for (const m of months) {
      if (m < cutoff && m > paidThrough) {
        accrued += Math.max(0, baseByMonth.get(m) || 0) * pct;
        covered.push(m);
      }
    }
    if (covered.length) paidThrough = covered[covered.length - 1];
    if (accrued > 0.5) {
      out.push({
        date: pd,
        kind: 'tax',
        label: taxReserveLabel(pct),
        amount: -accrued,
        detail: `Accrued ${covered[0]} → ${covered[covered.length - 1]}`,
      });
    }
  }
  return out;
}
