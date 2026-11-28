/**
 * get_cash_position — one read-only JSON snapshot of the cash model, built from the SAME code the
 * Cash tab and planner use (docs/CASH_FLOW_DASHBOARD_AUDIT.md, v1.6 item 7).
 */
import { buildCalendar, CASH_CONFIG, daysBetween } from './calendar.ts';
import { CashData } from './data.ts';
import { buildCashEvents, isOpenPayment } from './events.ts';
import { computeProjections } from './bundle.ts';
import { Projection } from './projection.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

function scenario(p: Projection) {
  return {
    total_take_home: r2(p.totalDistribution),
    steady_owner_pay: {
      monthly_amount: r2(p.steady.amount),
      could_start_month: p.steady.startMonth,
      amount_from_start: r2(p.steady.amountFromStart),
      binding_month: p.steady.bindingMonth,
    },
    no_draw_low: { date: p.noDrawLow.date, balance: r2(p.noDrawLow.balance) },
    months: p.months.map((m) => ({
      month: m.month,
      inflow: r2(m.inflow),
      outflow: r2(m.outflow),
      loc_draw: r2(m.locDraw),
      loc_paydown: r2(m.locPaydown),
      ending_cash: r2(m.endingCash),
      take_home: r2(m.ownerDistribution),
      shortfall_below_cushion: r2(m.shortfall),
      loc_drawn_after: r2(m.locDrawnAfter),
    })),
    loc_draws: p.draws.map((d) => ({
      date: d.date,
      amount: r2(d.amount),
      repaid_by: d.repaidBy.map((x) => ({ month: x.month, amount: r2(x.amount), inflow: x.label, inflow_date: x.date })),
      outstanding_after_12_months: r2(d.outstanding),
    })),
  };
}

export function getCashPosition(data: CashData, today: string) {
  const s = buildCashEvents(data, today);
  const cal = buildCalendar(s.startBalance, today, s.events);
  const p = computeProjections(data, today);
  const cushion = data.cushion;
  const firstBelow = cal.days.find((d) => d.balance < cushion);
  const owedTotal = s.owed.reduce((t, o) => t + o.amount, 0);

  const pastDue = data.payments
    .filter((x) => isOpenPayment(x) && x.payment_date_estimated && x.payment_date_estimated < today)
    .map((x) => ({
      deal: x.deal?.deal_name || 'Unknown deal',
      payment: x.payment_name,
      amount: r2(Number(x.payment_amount) || 0),
      estimated_date: x.payment_date_estimated,
      days_overdue: daysBetween(x.payment_date_estimated!, today),
      probability: Number(x.deal?.probability) || 0,
    }))
    .sort((a, b) => b.days_overdue - a.days_overdue);

  const loc = p.summary.payoffs[0] ?? null;

  return {
    today_et: today,
    qbo_balances_as_of: data.balancesFetchedAt,
    cushion: r2(cushion),
    balances: {
      operating_today: r2(s.balanceToday),
      operating_book_after_entered_future_items: r2(s.startBalance),
      entered_future_items: s.futureTxns.map((t) => ({ date: t.txn_date, payee: t.payee, memo: t.memo, amount: r2(Number(t.amount)) })),
      other_bank_accounts_info_only: s.otherAccounts.map((a) => ({ name: a.name, balance: r2(a.balance) })),
      credit_cards_owed: data.balances
        .filter((b) => b.account_type === 'Credit Card' && Number(b.current_balance))
        .map((b) => ({ name: b.fully_qualified_name || b.name, owed: r2(Math.abs(Number(b.current_balance))) })),
    },
    calendar_45_days: {
      low: cal.lowest ? { date: cal.lowest.date, balance: r2(cal.lowest.balance) } : null,
      below_cushion_from: firstBelow?.date ?? null,
      end_balance: r2(cal.days[cal.days.length - 1]?.balance ?? s.startBalance),
      total_in: r2(cal.days.reduce((t, d) => t + d.inflow, 0)),
      total_out: r2(cal.days.reduce((t, d) => t + d.outflow, 0)),
      events: s.events
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((e) => ({ date: e.date, kind: e.kind, label: e.label, amount: r2(e.amount), already_in_qbo: !!e.skipped })),
    },
    projection_12_months: {
      committed_threshold_pct: CASH_CONFIG.COMMITTED_PROBABILITY_MIN,
      committed: scenario(p.committed),
      with_pipeline_weighted: scenario(p.pipeline),
      top_inflows: p.topInflows.map((t) => ({ deal: t.label, date: t.date, amount: r2(t.amount), probability: t.probability })),
    },
    line_of_credit: {
      available: r2(p.locAvailable),
      facilities: data.credit.map((c) => ({ name: c.name, available: r2(Number(c.available)), limit: c.credit_limit, apr: c.apr })),
      loan_payoff: loc
        ? {
            schedule: loc.name,
            qbo_balance_owed: loc.balance === null ? null : r2(loc.balance),
            payoff_date: loc.payoffDate,
            last_payment: loc.lastPayment === null ? null : r2(loc.lastPayment),
            warning: loc.warning ?? null,
          }
        : null,
    },
    money_owed_out: {
      total: r2(owedTotal),
      pct_of_operating_today: s.balanceToday > 0 ? Math.round((owedTotal / s.balanceToday) * 100) : null,
      items: s.owed.map((o) => ({
        type: o.type,
        payee: o.payee,
        deal: o.deal,
        amount: r2(o.amount),
        advance_recouped: r2(o.recouped),
        client_paid_date: o.receivedDate,
        days_held: o.daysHeld,
        planned_pay_date: o.plannedDate ?? o.effectiveDate,
        qbo_bill: o.qbBillId ?? null,
      })),
    },
    arty_advance: {
      qbo_balance_now: s.arty.advanceNow === null ? null : r2(s.arty.advanceNow),
      qbo_account_id: s.arty.qbAccountId,
      note: 'Draws not yet recouped; offsets his next splits (split paid = split − advance, floor 0).',
    },
    past_due_payments: { count: pastDue.length, total: r2(pastDue.reduce((t, x) => t + x.amount, 0)), items: pastDue },
    tax_reserve: {
      pct: s.taxReservePct,
      placeholder: true,
      payment_dates: CASH_CONFIG.TAX_PAYMENT_DATES.map(([m, d]) => `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`),
      committed_payments_12_months: p.summary.events
        .filter((e) => e.kind === 'tax')
        .map((e) => ({ date: e.date, amount: r2(-e.amount), basis: e.detail })),
    },
    not_counted: {
      past_due_on_committed_deals: { count: s.notCounted.pastDueCommitted.count, net: r2(s.notCounted.pastDueCommitted.total) },
      below_threshold_in_45_days: { count: s.notCounted.belowThreshold.count, net: r2(s.notCounted.belowThreshold.total) },
      excluded_qbo_bills: { count: s.notCounted.excludedBills.count, total: r2(s.notCounted.excludedBills.total) },
    },
    notes: [
      'Operating account (QBO 256) only; book balance includes future-dated QBO entries, and scheduled payments already entered in QBO are skipped.',
      'Take-home = the most that can be taken in a month without any later day in the window dropping below the cushion (never followed by borrowing).',
      'Steady owner pay = largest flat monthly amount with no day below the cushion and no LOC draws; replaces payroll for Mike.',
      'Outflows are scheduled payments only (no payroll or taxes beyond the placeholder reserve).',
      'LOC loan payment runs until the QBO liability is paid; the whole payment is counted against the balance (interest not split out).',
    ],
  };
}
