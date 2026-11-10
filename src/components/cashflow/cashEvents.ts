import { computeHouseNet } from '../../lib/houseNet';
import {
  BROKER_IDS,
  CASH_CONFIG,
  CashEvent,
  addDays,
  brokerPayoutDate,
  daysBetween,
  monthlyOccurrences,
} from '../../lib/cashCalendar';
import { BankTxnRow, CashData, PaymentRow, STAGE } from './useCashData';

export interface CashSummary {
  /** QBO book balance (CurrentBalance) — includes future-dated entries. Calendar starts here. */
  startBalance: number;
  /** Book balance minus bank-register lines dated after today. */
  balanceToday: number;
  /** Bank-register lines dated after today (already in startBalance). */
  futureTxns: BankTxnRow[];
  bankAccounts: { name: string; balance: number }[];
  events: CashEvent[];
  notCounted: {
    pastDueCommitted: { count: number; total: number };
    belowThreshold: { count: number; total: number };
    legacyReferral: number;
    legacySplit: number;
  };
}

const isOpenPayment = (p: PaymentRow) => !p.payment_received && p.deal?.stage_id !== STAGE.lost;

function dealLabel(p: PaymentRow) {
  return `${p.deal?.deal_name || 'Unknown deal'} — ${p.payment_name || 'Payment'}`;
}

/** Turn loaded data into dated cash events for the calendar. */
export function buildCashEvents(data: CashData, today: string): CashSummary {
  const end = addDays(today, CASH_CONFIG.CALENDAR_DAYS - 1);
  const lookbackStart = addDays(today, -CASH_CONFIG.OWED_LOOKBACK_DAYS);
  const events: CashEvent[] = [];

  // Starting balance: Bank accounts only (Credit Card balances are liabilities, paid via
  // scheduled payments such as AMEX on the 12th).
  const bankAccounts = data.balances
    .filter((b) => b.account_type === 'Bank')
    .map((b) => ({ name: b.fully_qualified_name || b.name, balance: Number(b.current_balance) || 0 }));
  const startBalance = bankAccounts.reduce((t, b) => t + b.balance, 0);
  const balanceById = new Map(data.balances.map((b) => [b.qb_account_id, Number(b.current_balance) || 0]));
  const bankIds = new Set(data.balances.filter((b) => b.account_type === 'Bank').map((b) => b.qb_account_id));
  const bankTxns = data.bankTxns.filter((t) => bankIds.has(t.qb_account_id));
  const futureTxns = bankTxns.filter((t) => t.txn_date > today);
  const balanceToday = startBalance - futureTxns.reduce((t, x) => t + Number(x.amount), 0);

  // Dedupe: each QBO bank line can satisfy at most one scheduled occurrence.
  const usedTxn = new Set<BankTxnRow>();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const findEntered = (payees: string[] | null, date: string, amount: number) => {
    if (!payees || payees.length === 0) return null;
    const names = new Set(payees.map(norm));
    let best: BankTxnRow | null = null;
    for (const t of bankTxns) {
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
  for (const s of data.scheduled) {
    if (!s.active) continue;
    const dates = s.day_of_month
      ? monthlyOccurrences(s.day_of_month, today, end)
      : s.scheduled_date && s.scheduled_date >= today && s.scheduled_date <= end
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
    for (const date of dates) {
      const entered = amount ? findEntered(s.qb_payee_names, date, amount) : null;
      events.push({
        date,
        kind: s.kind === 'draw' ? 'draw' : 'scheduled',
        label: s.name,
        amount: -(amount || 0),
        detail: entered
          ? `already in QBO — ${entered.payee} ${fmt2(-Number(entered.amount))} on ${entered.txn_date}`
          : detail,
        warning: entered ? undefined : warning,
        skipped: !!entered,
      });
    }
  }

  const receivedRecently = (p: PaymentRow) =>
    !!p.payment_received && !!p.payment_received_date && p.payment_received_date >= lookbackStart;

  // 2. Referral fees owed on received payments (money in the bank that isn't Oculus's)
  let legacyReferral = 0;
  for (const p of data.payments) {
    if (!p.payment_received || p.referral_fee_paid || !(Number(p.referral_fee_usd) > 0)) continue;
    if (!receivedRecently(p)) {
      legacyReferral++;
      continue;
    }
    events.push({
      date: today,
      kind: 'referral_owed',
      label: `Referral fee owed — ${dealLabel(p)}`,
      amount: -Number(p.referral_fee_usd),
      dealId: p.deal_id,
    });
  }

  // 3. Broker splits owed on received payments (excl. Mike — his share exits via draws)
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
    events.push({
      date: brokerPayoutDate(s.broker_id, today),
      kind: 'split_owed',
      label: `${data.brokerNames.get(s.broker_id) || 'Broker'} split owed — ${dealLabel(p)}`,
      amount: -Number(s.split_broker_total),
      dealId: p.deal_id,
    });
  }

  // 4. OVIS-created broker-split Bills still open in QBO
  for (const b of data.splitBills) {
    if (b.qb_open_balance !== null && !(Number(b.qb_open_balance) > 0)) continue;
    const split = data.billSplits.get(b.payment_split_id);
    if (!split || split.broker_id === BROKER_IDS.mike) continue;
    const amount = b.qb_open_balance !== null ? Number(b.qb_open_balance) : Number(b.amount) || 0;
    events.push({
      date: brokerPayoutDate(split.broker_id, today),
      kind: 'split_bill',
      label: `${data.brokerNames.get(split.broker_id) || 'Broker'} — open QBO Bill ${b.qb_entity_id}`,
      amount: -amount,
      detail: b.transaction_date ? `Bill dated ${b.transaction_date}` : undefined,
      warning: b.qb_balance_checked_at ? undefined : 'Not yet checked in QBO — counted as open until Refresh now',
    });
  }

  // 5. Expected commissions (probability ≥ threshold), dated by payment_date_estimated.
  //    Cash in = payment − unpaid referral − Arty/Greg splits. Mike's split stays in the bank.
  const mikeSplitByPayment = new Map<string, number>();
  for (const s of data.splits) {
    if (s.broker_id === BROKER_IDS.mike) mikeSplitByPayment.set(s.payment_id, Number(s.split_broker_total) || 0);
  }
  const pastDueCommitted = { count: 0, total: 0 };
  const belowThreshold = { count: 0, total: 0 };
  for (const p of data.payments) {
    if (!isOpenPayment(p) || !p.payment_date_estimated) continue;
    const net = computeHouseNet(p, 'cash');
    const mike = mikeSplitByPayment.get(p.id) || 0;
    const cashIn = net.houseNet + mike;
    const committed = (Number(p.deal?.probability) || 0) >= CASH_CONFIG.COMMITTED_PROBABILITY_MIN;
    if (p.payment_date_estimated < today) {
      if (committed) {
        pastDueCommitted.count++;
        pastDueCommitted.total += cashIn;
      }
      continue;
    }
    if (p.payment_date_estimated > end) continue;
    if (!committed) {
      belowThreshold.count++;
      belowThreshold.total += cashIn;
      continue;
    }
    events.push({
      date: p.payment_date_estimated,
      kind: 'commission',
      label: dealLabel(p),
      amount: cashIn,
      detail: `Payment ${fmt(net.paymentAmount)} − referral ${fmt(net.referralFee)} − other brokers ${fmt(net.agci - mike)}`,
      dealId: p.deal_id,
    });
  }

  return {
    startBalance,
    balanceToday,
    futureTxns,
    bankAccounts,
    events,
    notCounted: { pastDueCommitted, belowThreshold, legacyReferral, legacySplit },
  };
}

function fmt2(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
