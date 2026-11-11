import { computeHouseNet } from './houseNet.ts';
import {
  BROKER_IDS,
  CASH_CONFIG,
  CashEvent,
  addDays,
  applyAdvances,
  brokerPayoutDate,
  buildTaxEvents,
  daysBetween,
  monthlyOccurrences,
  weeklyOccurrences,
} from './calendar.ts';
import { BankTxnRow, CashData, PaymentRow, STAGE } from './data.ts';

/** One row of "Money owed out": money in the bank that belongs to someone else. */
export interface OwedItem {
  key: string;
  type: 'referral' | 'split' | 'split_bill';
  payee: string;
  deal: string;
  dealId: string | null;
  paymentId: string;
  splitId: string | null;
  /** Cash still to pay (Arty splits: net of any advance recouped). */
  amount: number;
  /** Arty advance recouped against this split (0 otherwise). */
  recouped: number;
  receivedDate: string | null;
  daysHeld: number | null;
  /** Stored planned date (null = default). */
  plannedDate: string | null;
  /** Date the calendar uses. */
  effectiveDate: string;
  qbBillId?: string;
}

/** A scheduled payment that stops at payoff of a QBO liability (e.g. the AMEX LOC loan). */
export interface PayoffSchedule {
  name: string;
  qbAccountId: string;
  /** QBO liability balance (positive = owed); null if the snapshot doesn't have it. */
  balance: number | null;
  /** Date of the final (remainder) payment within the horizon, or null if not paid off in the horizon. */
  payoffDate: string | null;
  lastPayment: number | null;
  /** Remaining balance after the horizon (0 once paid off). */
  remainingAfter: number | null;
  warning?: string;
}

export interface CashSummary {
  /** Operating account QBO book balance (CurrentBalance, incl. future-dated entries). Calendar starts here. */
  startBalance: number;
  /** Operating book balance minus its register lines dated after today. */
  balanceToday: number;
  /** Operating register lines dated after today (already in startBalance). */
  futureTxns: BankTxnRow[];
  /** Operating account (one row) — kept as a list for display. */
  bankAccounts: { name: string; balance: number }[];
  /** Other Bank accounts (savings, personal): information only, not in the calendar. */
  otherAccounts: { name: string; balance: number }[];
  /** Counted committed events: Arty advances applied, tax reserve added. The calendar uses these. */
  events: CashEvent[];
  /** Committed events before advances and tax — the projection re-applies both per scenario. */
  rawEvents: CashEvent[];
  /** Commissions in the horizon on deals below the committed threshold (full cash amount + probability). */
  upside: CashEvent[];
  owed: OwedItem[];
  payoffs: PayoffSchedule[];
  arty: {
    /** QBO advance (draw) account balance now; null if not in the snapshot. */
    advanceNow: number | null;
    /** Advance balance at the end of the horizon (committed). */
    advanceEnd: number;
    recouped: number;
    qbAccountId: string | null;
  };
  taxReservePct: number;
  notCounted: {
    pastDueCommitted: { count: number; total: number };
    belowThreshold: { count: number; total: number };
    legacyReferral: number;
    legacySplit: number;
    excludedBills: { count: number; total: number };
  };
}

/** Still expected: not received, not on a Lost deal, not written off. */
export const isOpenPayment = (p: PaymentRow) =>
  !p.payment_received && p.deal?.stage_id !== STAGE.lost && !p.written_off_at;

function dealLabel(p: PaymentRow) {
  return `${p.deal?.deal_name || 'Unknown deal'} — ${p.payment_name || 'Payment'}`;
}

/**
 * Turn loaded data into dated cash events. `horizonDays` defaults to the 45-day calendar; the
 * 12-month projection passes a longer horizon.
 */
export function buildCashEvents(
  data: CashData,
  today: string,
  horizonDays: number = CASH_CONFIG.CALENDAR_DAYS
): CashSummary {
  const end = addDays(today, horizonDays - 1);
  const lookbackStart = addDays(today, -CASH_CONFIG.OWED_LOOKBACK_DAYS);
  const raw: CashEvent[] = [];
  const upside: CashEvent[] = [];
  const owed: OwedItem[] = [];
  const owedEvent = new Map<string, CashEvent>();
  const OP = CASH_CONFIG.OPERATING_QB_ACCOUNT_ID;

  // Starting balance: the Operating account only. Credit Card balances are liabilities (paid via
  // scheduled payments); savings / personal are shown as information.
  const banks = data.balances.filter((b) => b.account_type === 'Bank');
  const asRow = (b: (typeof banks)[number]) => ({ name: b.fully_qualified_name || b.name, balance: Number(b.current_balance) || 0 });
  const bankAccounts = banks.filter((b) => b.qb_account_id === OP).map(asRow);
  const otherAccounts = banks.filter((b) => b.qb_account_id !== OP).map(asRow);
  const startBalance = bankAccounts.reduce((t, b) => t + b.balance, 0);
  const balanceById = new Map(data.balances.map((b) => [b.qb_account_id, Number(b.current_balance) || 0]));
  const opTxns = data.bankTxns.filter((t) => t.qb_account_id === OP);
  const futureTxns = opTxns.filter((t) => t.txn_date > today);
  const balanceToday = startBalance - futureTxns.reduce((t, x) => t + Number(x.amount), 0);

  // Dedupe: each QBO Operating register line can satisfy at most one scheduled occurrence.
  const usedTxn = new Set<BankTxnRow>();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const findEntered = (payees: string[] | null, date: string, amount: number) => {
    if (!payees || payees.length === 0) return null;
    const names = new Set(payees.map(norm));
    let best: BankTxnRow | null = null;
    for (const t of opTxns) {
      if (usedTxn.has(t) || !t.payee || !names.has(norm(t.payee))) continue;
      if (Number(t.amount) >= 0) continue; // only money out
      if (Math.abs(Math.abs(Number(t.amount)) - amount) > CASH_CONFIG.DEDUPE_DOLLARS) continue;
      const gap = Math.abs(daysBetween(t.txn_date, date));
      if (gap > CASH_CONFIG.DEDUPE_DAYS) continue;
      if (!best || gap < Math.abs(daysBetween(best.txn_date, date))) best = t;
    }
    if (best) usedTxn.add(best);
    return best;
  };

  // 1. Scheduled payments + planned draws
  const payoffs: PayoffSchedule[] = [];
  for (const s of data.scheduled) {
    if (!s.active) continue;
    const until = s.end_date && s.end_date < end ? s.end_date : end;
    const dates = s.every_n_weeks && s.scheduled_date
      ? weeklyOccurrences(s.scheduled_date, s.every_n_weeks, today, until)
      : s.day_of_month
        ? monthlyOccurrences(s.day_of_month, today, until)
        : s.scheduled_date && s.scheduled_date >= today && s.scheduled_date <= until
          ? [s.scheduled_date]
          : [];
    let amount: number | null = null;
    let detail: string | undefined;
    let warning: string | undefined;
    if (s.qb_account_id) {
      const bal = balanceById.get(s.qb_account_id);
      if (bal !== undefined) {
        amount = Math.abs(bal);
        detail = 'Current QBO balance';
      } else {
        warning = 'Linked QBO account has no balance yet — refresh after QBO reconnects';
      }
    } else if (s.amount !== null && s.amount !== undefined) {
      amount = Number(s.amount);
    } else {
      warning = 'No amount — enter one or link a QBO account';
    }

    // Payoff: stop once the linked liability is paid; the last payment is the remainder.
    let remaining: number | null = null;
    let payoff: PayoffSchedule | null = null;
    if (s.payoff_qb_account_id) {
      const bal = balanceById.get(s.payoff_qb_account_id);
      remaining = bal === undefined ? null : Math.abs(bal);
      payoff = {
        name: s.name,
        qbAccountId: s.payoff_qb_account_id,
        balance: remaining,
        payoffDate: null,
        lastPayment: null,
        remainingAfter: remaining,
        warning: remaining === null ? 'No QBO balance for the linked liability — payment runs every month in the window' : undefined,
      };
      payoffs.push(payoff);
      if (remaining === null) warning = payoff.warning;
    }

    for (const date of dates) {
      if (remaining !== null && remaining <= 0.005) break;
      const entered = amount ? findEntered(s.qb_payee_names, date, amount) : null;
      let amt = amount || 0;
      let note: string | undefined;
      if (remaining !== null && !entered) {
        // An occurrence already entered in QBO is already in the liability balance — don't count it twice.
        amt = Math.min(amt, remaining);
        remaining -= amt;
        if (remaining <= 0.005 && payoff) {
          payoff.payoffDate = date;
          payoff.lastPayment = amt;
          note = `final payment — pays off ${s.name}`;
        }
      }
      raw.push({
        date,
        kind: s.kind === 'draw' ? 'draw' : 'scheduled',
        label: s.name,
        amount: -amt,
        detail: entered
          ? `already in QBO — ${entered.payee} ${fmt2(-Number(entered.amount))} on ${entered.txn_date}`
          : note ?? detail,
        warning: entered ? undefined : warning,
        skipped: !!entered,
        advance: s.advance_broker_id === BROKER_IDS.arty && !entered ? amt : undefined,
        // Advance draws are compensation (expense); LOC payments are mostly principal (not expense).
        expense: s.kind === 'bill' && !s.payoff_qb_account_id,
      });
    }
    if (payoff && remaining !== null) payoff.remainingAfter = Math.max(0, remaining);
  }

  const receivedRecently = (p: PaymentRow) =>
    !!p.payment_received && !!p.payment_received_date && p.payment_received_date >= lookbackStart;
  const held = (p: PaymentRow) => (p.payment_received_date ? daysBetween(p.payment_received_date, today) : null);

  // 2. Referral fees owed on received payments (money in the bank that isn't Oculus's)
  let legacyReferral = 0;
  for (const p of data.payments) {
    if (!p.payment_received || p.referral_fee_paid || !(Number(p.referral_fee_usd) > 0)) continue;
    if (!receivedRecently(p)) {
      legacyReferral++;
      continue;
    }
    const planned = p.referral_fee_planned_pay_date;
    const date = planned && planned > today ? planned : today;
    const deferred = !!planned && planned > today;
    const ev: CashEvent = {
      date,
      kind: 'referral_owed',
      label: deferred
        ? `Deferred referral – ${p.deal?.deal_name || 'Unknown deal'}`
        : `Referral fee owed — ${dealLabel(p)}`,
      amount: -Number(p.referral_fee_usd),
      dealId: p.deal_id,
    };
    raw.push(ev);
    owed.push({
      key: `ref-${p.id}`,
      type: 'referral',
      payee: p.deal?.referral_payee?.client_name || 'Referral payee not set',
      deal: dealLabel(p),
      dealId: p.deal_id,
      paymentId: p.id,
      splitId: null,
      amount: Number(p.referral_fee_usd),
      recouped: 0,
      receivedDate: p.payment_received_date,
      daysHeld: held(p),
      plannedDate: planned,
      effectiveDate: date,
    });
  }

  // 3. Broker splits owed on received payments (excl. Mike — his share exits via owner pay)
  const paymentById = new Map(data.payments.map((p) => [p.id, p]));
  let legacySplit = 0;
  for (const s of data.splits) {
    if (s.broker_id === BROKER_IDS.mike || s.paid || !(Number(s.split_broker_total) > 0)) continue;
    const p = paymentById.get(s.payment_id);
    if (!p || !p.payment_received) continue;
    if (!receivedRecently(p)) {
      legacySplit++;
      continue;
    }
    const date = s.planned_pay_date && s.planned_pay_date > today ? s.planned_pay_date : brokerPayoutDate(s.broker_id, today);
    const broker = data.brokerNames.get(s.broker_id) || 'Broker';
    const split = Number(s.split_broker_total);
    const ev: CashEvent = {
      date,
      kind: 'split_owed',
      label: `${broker} split owed — ${dealLabel(p)}`,
      amount: -split,
      dealId: p.deal_id,
      artySplit: s.broker_id === BROKER_IDS.arty ? split : undefined,
    };
    raw.push(ev);
    const key = `split-${s.id}`;
    owedEvent.set(key, ev);
    owed.push({
      key,
      type: 'split',
      payee: broker,
      deal: dealLabel(p),
      dealId: p.deal_id,
      paymentId: p.id,
      splitId: s.id,
      amount: split,
      recouped: 0,
      receivedDate: p.payment_received_date,
      daysHeld: held(p),
      plannedDate: s.planned_pay_date,
      effectiveDate: date,
    });
  }

  // 4. OVIS-created broker-split Bills still open in QBO (unless excluded: paid outside the Bill).
  //    These Bills already reflect any advance offset, so no artySplit here.
  const excludedBills = { count: 0, total: 0 };
  for (const b of data.splitBills) {
    if (b.qb_open_balance !== null && !(Number(b.qb_open_balance) > 0)) continue;
    const split = data.billSplits.get(b.payment_split_id);
    if (!split || split.broker_id === BROKER_IDS.mike) continue;
    const amount = b.qb_open_balance !== null ? Number(b.qb_open_balance) : Number(b.amount) || 0;
    if (b.exclude_from_calendar) {
      excludedBills.count++;
      excludedBills.total += amount;
      continue;
    }
    const p = paymentById.get(split.payment_id);
    const date = split.planned_pay_date && split.planned_pay_date > today ? split.planned_pay_date : brokerPayoutDate(split.broker_id, today);
    const broker = data.brokerNames.get(split.broker_id) || 'Broker';
    raw.push({
      date,
      kind: 'split_bill',
      label: `${broker} — open QBO Bill ${b.qb_entity_id}`,
      amount: -amount,
      detail: b.transaction_date ? `Bill dated ${b.transaction_date}` : undefined,
      warning: b.qb_balance_checked_at ? undefined : 'Not yet checked in QBO — counted as open until Refresh now',
      dealId: p?.deal_id,
    });
    owed.push({
      key: `bill-${b.id}`,
      type: 'split_bill',
      payee: broker,
      deal: p ? dealLabel(p) : `QBO Bill ${b.qb_entity_id}`,
      dealId: p?.deal_id ?? null,
      paymentId: split.payment_id,
      splitId: split.id,
      amount,
      recouped: 0,
      receivedDate: p?.payment_received_date ?? null,
      daysHeld: p ? held(p) : null,
      plannedDate: split.planned_pay_date,
      effectiveDate: date,
      qbBillId: b.qb_entity_id,
    });
  }

  // 5. Expected commissions, dated by payment_date_estimated.
  //    Cash in = payment − unpaid referral − Arty/Greg splits. Mike's split stays in the bank.
  //    Arty's split is tagged so his outstanding advance can be recouped from it.
  const mikeSplitByPayment = new Map<string, number>();
  const artySplitByPayment = new Map<string, number>();
  for (const s of data.splits) {
    if (s.broker_id === BROKER_IDS.mike) mikeSplitByPayment.set(s.payment_id, Number(s.split_broker_total) || 0);
    if (s.broker_id === BROKER_IDS.arty) artySplitByPayment.set(s.payment_id, Number(s.split_broker_total) || 0);
  }
  const pastDueCommitted = { count: 0, total: 0 };
  const belowThreshold = { count: 0, total: 0 };
  for (const p of data.payments) {
    if (!isOpenPayment(p) || !p.payment_date_estimated) continue;
    const net = computeHouseNet(p, 'cash');
    const mike = mikeSplitByPayment.get(p.id) || 0;
    const cashIn = net.houseNet + mike;
    const probability = Number(p.deal?.probability) || 0;
    const committed = probability >= CASH_CONFIG.COMMITTED_PROBABILITY_MIN;
    if (p.payment_date_estimated < today) {
      if (committed) {
        pastDueCommitted.count++;
        pastDueCommitted.total += cashIn;
      }
      continue;
    }
    if (p.payment_date_estimated > end) continue;
    const arty = artySplitByPayment.get(p.id);
    const ev: CashEvent = {
      date: p.payment_date_estimated,
      kind: 'commission',
      label: dealLabel(p),
      amount: cashIn,
      detail: `Payment ${fmt(net.paymentAmount)} − referral ${fmt(net.referralFee)} − other brokers ${fmt(net.agci - mike)}`,
      dealId: p.deal_id,
      probability,
      artySplit: arty && arty > 0 ? arty : undefined,
    };
    if (!committed) {
      belowThreshold.count++;
      belowThreshold.total += cashIn;
      upside.push(ev);
      continue;
    }
    raw.push(ev);
  }

  // 6. Arty advances, then the tax reserve (committed view — the projection redoes both per scenario).
  const artyAccount = data.advanceAccounts.get(BROKER_IDS.arty) ?? null;
  const advanceNow = artyAccount !== null && balanceById.has(artyAccount) ? Math.max(0, balanceById.get(artyAccount)!) : null;
  const adv = applyAdvances(raw, advanceNow ?? 0);
  const taxReservePct = data.taxReservePct ?? CASH_CONFIG.TAX_RESERVE_PCT_DEFAULT;
  const events = [...adv.events, ...buildTaxEvents(adv.events, today, end, taxReservePct)];

  // Owed splits show what's still payable after the advance offset.
  for (const o of owed) {
    const before = owedEvent.get(o.key);
    if (!before) continue;
    const after = adv.events.find((e) => e.kind === before.kind && e.label === before.label && e.date === before.date);
    if (after && after.amount !== before.amount) {
      o.recouped = after.amount - before.amount;
      o.amount = -after.amount;
    }
  }

  owed.sort((a, b) => (b.daysHeld ?? -1) - (a.daysHeld ?? -1));

  return {
    startBalance,
    balanceToday,
    futureTxns,
    bankAccounts,
    otherAccounts,
    events,
    rawEvents: raw,
    upside,
    owed,
    payoffs,
    arty: { advanceNow, advanceEnd: adv.endBalance, recouped: adv.recouped, qbAccountId: artyAccount },
    taxReservePct,
    notCounted: { pastDueCommitted, belowThreshold, legacyReferral, legacySplit, excludedBills },
  };
}

function fmt2(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
