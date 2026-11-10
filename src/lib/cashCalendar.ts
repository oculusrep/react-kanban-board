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
  | 'commission';    // expected commission (probability ≥ threshold), net of referral + other brokers

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
