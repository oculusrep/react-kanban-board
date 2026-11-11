# Cash Flow Dashboard — Data Audit, Decisions & Plan (2026-11-06)

Audit of what OVIS already stores for a cash flow dashboard, the decisions taken from it, and
a phased build plan. No code has been written yet. Counts below are from the live production
database on 2026-11-06 (read-only queries).

An existing forecast page already lives at `/admin/budget/forecast`
(see [CASHFLOW_DASHBOARD_REFACTOR_2026_05_14.md](CASHFLOW_DASHBOARD_REFACTOR_2026_05_14.md)).
The dashboard extends that page; it is not a new one.

## 1. Audit

### Where commission invoices live

`payment` — one row per installment on a deal.

| Group | Columns |
|---|---|
| Amounts | `payment_amount`, `agci`, `referral_fee_usd`, `referral_fee_percent_override`, `bor_fee_usd` |
| Dates | `payment_invoice_date`, `payment_date_estimated`, `payment_date_auto_calculated`, `payment_date_source`, `payment_received_date`, `referral_fee_paid_date` |
| Status | `invoice_sent`, `payment_received`, `referral_fee_paid`, `is_active`, `locked`, `deleted_at` |
| QBO link | `qb_invoice_id`, `qb_invoice_number`, `qb_payment_id`, `qb_sync_status`, `qb_sync_pending`, `qb_last_sync` |
| Other | `orep_invoice`, `payment_sequence`, `amount_override`, `updated_at` |

Per-broker shares of a payment: `payment_split` (`split_broker_total`, `paid`, `paid_date`,
`commission_split_id`). The deal-level template for those shares: `commission_split`.
There is also an `invoice_aging` view.

### Field-by-field

| Field | Exists? | Location | Gap |
|---|---|---|---|
| Expected payout date | ✅ | `payment.payment_date_estimated` (per installment); `deal.target_close_date` | 4 of 82 open active payments have no estimated date |
| Close probability | ✅ | `deal.probability` (also `deal.weighted_fee`) | Set on 807 deals; not checked for staleness |
| Gross commission | ✅ | `deal.fee` / `calculated_fee` / `gci`; `payment.payment_amount` | Several overlapping columns; one must be picked as the source |
| Co-broker split | ⚠️ partial | `commission_split` / `payment_split` | These cover internal brokers only (Mike/Arty/Greg). No column holds an outside co-broker split |
| Referral fee | ✅ | `deal.referral_fee_usd` / `referral_fee_percent` / `referral_payee_client_id`; `payment.referral_fee_usd`, `referral_fee_paid` | None |
| Net to Oculus | ✅ | `deal.oculus_net`, `deal.house_usd`; house net per payment is computed in code (below) | No stored per-payment net |
| Last-updated timestamp | ✅ | `deal.updated_at`, `payment.updated_at`, `deal.last_stage_change_at` | None |
| QuickBooks integration | ✅ | ~25 `quickbooks-*` edge functions; `qb_connection`, `qb_account`, `qb_expense`, `qb_commission_entry`, `qb_sync_log` | Invoices, expenses and the P&L report sync |
| Bank balance | ❌ | `qb_account.current_balance` holds income/expense accounts only (246 rows, no Bank type) | `quickbooks-list-accounts` fetches Bank accounts from QBO for dropdowns but never saves them. No cash-on-hand data is stored |
| MCP `update_deal`: payout date | ⚠️ | Write allowlist `DEAL_FIELDS` in [voice_triage.ts](../supabase/functions/ovis-mcp/voice_triage.ts) | Can write `target_close_date`, not `payment.payment_date_estimated`. Money fields are excluded on purpose |
| MCP `update_deal`: probability | ✅ | `probability` (int) is in the same allowlist | None |

### Existing house-net math

The same formula appears in two places today:

- [src/components/reports/CashflowDashboard.tsx](../src/components/reports/CashflowDashboard.tsx) (~line 188)
- [src/pages/CashFlowForecastPage.tsx](../src/pages/CashFlowForecastPage.tsx) (~line 204)

```
gci      = payment_amount − referral_fee_usd
houseNet = gci − agci            // agci = total internal broker splits (DB trigger)
```

## 2. Decisions (2026-11-06)

- **Payout timing source** = `payment.payment_date_estimated` (not `deal.target_close_date`).
- **Gross source for cash** = `payment.payment_amount`.
- **Outside co-broker splits: hold.** No new field. They are entered as referral fees
  (`referral_fee_usd`) and flow through the same path as any referral.
- **Reuse the existing referral handling — do not re-implement it.** Cash-flow math uses
  `referral_fee_usd`, `referral_fee_paid` and the house-net logic above. If the new code needs
  that logic outside its current components, *extract* it into one shared helper that both
  existing pages and the new code call. Don't write a third copy.
- **Bank balance:** persist QBO Bank-type accounts from `quickbooks-list-accounts` (balance +
  `as_of` timestamp) on each sync.
- **New MCP tool needed:** `update_payment_date` — takes `payment_id`, or deal + installment
  number, and a new date; logs old and new values.

### Added 2026-11-06 (follow-up)

- **House-net formula moves to one shared helper.** `CashflowDashboard.tsx` and
  `CashFlowForecastPage.tsx` both call it. No third copy.
- **Referral fees: subtract only where `referral_fee_paid = false`** — in cash mode only (see
  the mode switch below). Paid fees are already reflected in the bank balance; never double-count.
- **Safe-to-draw counts only payments on deals with `probability >= 90`.** Everything below 90
  shows as a separate "possible upside" line, weighted by `deal.probability`. The threshold is a
  single config constant.

### Added 2026-11-06 (second follow-up)

- **The shared house-net helper takes a mode switch.**
  - `mode='profit'` subtracts all referral fees. The existing pages use this, and their numbers
    must not move.
  - `mode='cash'` subtracts only referral fees where `referral_fee_paid = false`.
- **Available cash now** = bank balance
  − referral fees owed on payments already received
  (`payment_received = true AND referral_fee_paid = false`)
  − other committed outflows.
  "Referral fees owed" shows as its own line: money sitting in the bank that isn't Oculus's.
- **Available cash now — full definition** (supersedes the "other committed outflows"
  placeholder above). Each line is shown separately:

  ```
    QBO bank balance (book balance)
  − Referral fees owed        received payments (payment_received = true),
                              referral_fee_paid = false
  − Broker splits owed        received payments, payment_split.paid = false,
                              EXCLUDING Mike's own split (his share exits via salary/draws)
  − Next 30 days operating    budgeted operating expenses incl. payroll, from the existing
                              budget used by /admin/budget/forecast.
                              Do NOT also pull QBO Bills — single source.
  − Planned owner draw        manual entry field
  = Available cash now
  ```

  Uncashed checks are excluded: they are already reflected in the QBO book balance.
- **30-day opex is prorated by days** from the monthly budget, e.g. 20 days remaining this
  month + 10 days of next month. Each month's share = days in window ÷ days in that month
  (e.g. 20/30 of November, 10/31 of December). "Today" and day boundaries are Eastern Time.
- **Planned owner draws are dated entries** (`date`, `amount`, `note`); multiple allowed.
  - Available cash now subtracts draws dated within the next 30 days.
  - The monthly safe-to-draw timeline places each draw in its dated month.
  - Draws are never prorated.
- **Parity check:** after the helper refactor, existing house-net and Mike's Net totals must
  match pre-refactor values exactly.

### Added 2026-11-10 — outstanding checks and budget-driven outflows

See §4 Verification for the findings behind these.

- **Premise correction.** "Paid referral fees are already reflected in the bank balance" is
  true only once the BofA check is recorded in QBO as a Bill Payment. Marking a referral (or a
  Bill-type broker split) paid in OVIS creates an **unpaid Bill** — it does not touch the Bank
  account. Until the Bill Payment exists, the fee is in neither "Referral fees owed" nor the
  book balance, and **available cash is overstated** by that amount.
- **Outstanding checks.** Any referral fee or broker split marked paid in OVIS stays on an
  "Outstanding checks" list (payee, date, amount) until cleared. Show both:
  - **QBO book balance**
  - **Bank actual balance = QBO book balance + outstanding checks**
  Clearing: use QBO cleared status if the API exposes it (unconfirmed — see §4); otherwise a
  one-click "Cleared" in OVIS.

### Added 2026-11-10 — deal team, backlog

Supersedes the "owning broker" and "Stale" (probability ≥ 50, 30 days) definitions in the
2026-11-06 Needs-attention plan.

1. **Deal team** = all brokers on the deal's `commission_split`, every name shown per row.
   (Not `deal.owner_id`. Note `deal_team` in the database is a role lookup table, not a
   membership table.)
2. **Backlog first.** A one-time cleanup view lists all past-due payments (37 today) in one
   sortable list with inline date edit (v1). Nudges are v2 and stay disabled until Mike turns
   them on.

Items 2–5 of this block (last_reviewed_at, critical dates → payment dates, stage gate, nudges)
moved to **Phase v2 (deferred)**.

## 3. Phased plan

### Phase 1 — Data foundations
- Persist QBO Bank-type account balances with an `as_of` timestamp on each
  `quickbooks-list-accounts` sync. Store them in `qb_account` or a new table; any new table gets
  the REVOKE + GRANT block (CLAUDE.md), with authenticated SELECT only and service_role write.
  Apply via psql + `schema_migrations` record.
- List the 4 open active payments that have no `payment_date_estimated`, and have Mike fill
  them in, so the timeline has no silent holes.
- Persist the QBO AMEX (Credit Card type) liability balance the same way as Bank.
- Outstanding checks: decide how QBO records the BofA checks (§4 open question 1), then run a
  minimal TransactionList call with the `cleared` filter to see if cleared status is usable.

### Phase 2 — Forecast page: available cash + safe-to-draw
- Extend `/admin/budget/forecast` with:
  - **Available cash now:** the five-line calculation in Decisions, every line shown
    separately, with the bank balances' `as_of` time. Planned owner draws need a new table of
    dated entries (`date`, `amount`, `note`), with the CLAUDE.md grants block.
  - **Monthly safe-to-draw timeline:** starting cash + expected house net by month
    (bucketed on `payment_date_estimated`) − budgeted operating expenses.
- First step: extract the shared helper (`mode='profit'` / `'cash'`). Before switching the two
  existing pages to it, record their house-net and Mike's Net totals; after the switch they must
  match exactly.
- Inflows use the shared helper in `mode='cash'`; outside co-brokers are already inside
  `referral_fee_usd`.
- Referral handling and probability weighting: resolved in Decisions (unpaid referrals only;
  ≥ 90 committed, < 90 as weighted "possible upside").
- Dates in Eastern Time per CLAUDE.md.

#### "Needs attention" panel (same page)

Supersedes the 2026-11-06 version (owning broker + 30-day stale rule). Grouped panel, count
badge per group. Each row shows deal name, client, **deal team** (every broker on the deal's
`commission_split`, all names), amount, and days overdue / until due. Thresholds are config
constants.

| # | Group | Rule | Amount | Days |
|---|---|---|---|---|
| 1 | Missing fee | Open deal with no `fee` / `gci` set | — | — |
| 2 | Missing payout date | Active, unreceived payment with no `payment_date_estimated` | `payment_amount` | — |
| 3 | Past due | `payment_date_estimated` < today (ET), `payment_received = false` | `payment_amount` | days past due |

v1 is read-only. Row action:
- **Update** — opens `DealDetailsSlideout` (overlay-first per CLAUDE.md).

**Open deal** = stage not `Lost` and not `Closed Paid` (there is no "closed-dead" stage).


### v1 build (2026-11-10) — on `/admin/budget/forecast`, extending it

Replaces Phase 2's monthly safe-to-draw timeline and budget-driven opex for now.

1. **QBO balance snapshots** — Bank + AMEX (Credit Card) balances saved to a snapshot table
   with `fetched_at` (CLAUDE.md grants block), plus a "Refresh now" button.
2. **`scheduled_payment`** — add/edit list: name, date *or* day_of_month, amount *or* "use QBO
   AMEX balance". Seeded with AMEX on the 12th.
3. **Outstanding checks** — referral fees / broker splits marked paid in OVIS, one-click
   "Cleared". Shows QBO book balance and bank balance (book + outstanding).
4. **45-day cash calendar** — start balance − scheduled payments − referral/split owed −
   planned draws + commission payments on deals with probability ≥ 90 by
   `payment_date_estimated`. Running balance per day, lowest point highlighted.
5. **Needs attention** (read-only) — Missing fee, Missing payout date, Past due; deal-team names;
   click opens the deal slideout.
6. **Past-due cleanup view** — sortable list with inline `payment_date_estimated` edit.

Plus the shared house-net helper (`profit` / `cash`); existing page totals must match
pre-refactor exactly.

### v1 revision (2026-11-10, second pass) — supersedes the v1 list above where they differ

1. **Referral fees → QBO Check, not Bill.** `quickbooks-create-referral-entry` creates a
   `Purchase` with `PaymentType = Check`, drawn on the BofA bank account, Referral Fee expense
   line, payee = the referral partner (vendor). Book balance drops when the fee is marked paid
   in OVIS; Mike matches the bank-feed debit to this check. The bank account comes from
   `app_settings.qbo_referral_bank_account` (`{"id","name"}`); if it is unset the function
   refuses rather than falling back to a Bill. `quickbooks-delete-referral-entry` deletes the
   Purchase when "Paid" is unchecked.
   **BOR pass-throughs are unchanged** (Bill + income JE) — they post to the BOR clearing
   account, not the Referral Fee expense account. Change them separately if wanted.
2. **Broker splits: no change.** They keep creating Bills (Greg) / JEs (Arty). Arty is paid via
   payroll, Greg via ACH; Mike matches both.
3. **Cash calendar subtracts OVIS-created broker-split Bills still open in QBO**, dated by the
   payee's pay method (config per broker): Arty = next payroll date (semi-monthly, 15th and last
   day of month — matches his draw Bills in QBO), Greg = today. Open/closed is read from QBO
   (`Bill.Balance`) on refresh and stored on `qb_commission_entry`. Unpaid splits on received
   payments (`payment_split.paid = false`, excl. Mike) are dated the same way.
4. **No other open QBO Bills are included.** Recurring outflows go in `scheduled_payment`
   (name; `day_of_month` or `date`; `amount` or "use QBO account balance"). Seeded: AMEX on the
   12th using the QBO AMEX balance, linked automatically on the first refresh that finds a
   Credit Card account named like AMEX / American Express; if none exists, a manual amount.
   Planned owner draws are `scheduled_payment` rows of kind `draw`.
5. **Outstanding-checks list dropped** for v1.
6. **Account sync also saves Bank and Credit Card accounts** with balance and `fetched_at`
   (`qb_balance_snapshot`). Both `quickbooks-sync-accounts` and the page's "Refresh now" write
   it.
7. **OVIS-created referral/BOR Bills for Mike to close manually.** Existing Bills are not
   modified. Last known QBO status is from the 2026-08-07 expense sync, which predates all four,
   so their status is unknown until QBO is reconnected; the page's refresh reads it.

   | QBO Bill Id | Date | Amount | Deal |
   |---|---|---|---|
   | 8480 | 2026-09-15 | $5,601.85 | Farthsworth Flooring Marietta - BOR - Resolut (BOR) |
   | 8500 | 2026-09-23 | $6,244.45 | Foxtail - CS Ventures - Lulah Hills - Edens |
   | 8502 | 2026-09-23 | $6,324.48 | Hammer Nails - Aspen Station Alpharetta |
   | 8527 | 2026-10-09 | $68,500.00 | NAI Red - Referral Fee - Watkinsville (BOR) |

   Correction to the 2026-11-10 verification note: the **3 Bills open in QBO** as of Aug 7 are
   Greg's broker-split Bills (QBO 8158, 8324, 8417), not referral Bills. They stay Bills and
   show on the cash calendar as split payouts.

### v1 as built (2026-11-10)

Where it lives: `/admin/budget/forecast?tab=cash` — "Cash (45 days)" tab on the existing page.

| Piece | Code / table |
|---|---|
| House-net helper (`profit` / `cash`) | [src/lib/houseNet.ts](../src/lib/houseNet.ts); both existing pages call it in `profit` mode |
| Calendar logic + config constants | [src/lib/cashCalendar.ts](../src/lib/cashCalendar.ts) (`CASH_CONFIG`) |
| Data load / events / UI | [src/components/cashflow/](../src/components/cashflow/) |
| Balance snapshots | `qb_balance_snapshot`; written by `quickbooks-cash-refresh` (Refresh now) and `quickbooks-sync-accounts` |
| OVIS Bill open balances | `qb_commission_entry.qb_open_balance` / `qb_balance_checked_at`; written by `quickbooks-cash-refresh` |
| Scheduled payments + draws | `scheduled_payment` (`kind` = `bill` / `draw`); AMEX seeded on the 12th |
| Referral → Check | `quickbooks-create-referral-entry` (Purchase); `quickbooks-delete-referral-entry` deletes Purchases |
| Migrations | `20261110114012_cash_flow_v1`, `20261110114125_qb_commission_entry_allow_purchase` (both applied to prod + recorded) |

Behaviour notes:
- **Parity:** after the helper refactor, house net (338,592.90) and GCI (841,613.91) over the 59
  open dated payments matched the pre-refactor formula exactly, 0 per-row mismatches. Mike's Net
  reads `payment_split` directly and is untouched.
- **Commission inflow** on the calendar = payment − unpaid referral − Arty/Greg splits
  (`computeHouseNet(p,'cash').houseNet + Mike's split`). Mike's split stays in the bank until he
  draws it, and his draws are scheduled payments.
- **"Owed" lookback:** referral fees / broker splits owed only count on payments received in the
  last `OWED_LOOKBACK_DAYS = 90`. Live data has 23 referral fees and 13 splits flagged unpaid on
  payments received 2021–2025; the referral ones carry `referral_fee_usd` ≈ 50× the payment
  (e.g. $1,280,639.50 on a $25,612.79 payment) — legacy data, flagged here, not fixed. The page
  shows the excluded counts.
- **Past-due commissions** (estimated date < today) are not placed on the calendar; the page
  shows their count and total and points to Past-due cleanup.
- **Unchecked Bills** (no QBO refresh yet) count as open, labelled "Not yet checked".
- **Arty payroll** dates: semi-monthly, 15th and last day of month (`PAYROLL_DAYS_OF_MONTH`).
  His $2,083.33 semi-monthly draw Bills are not OVIS-created, so add them as scheduled payments
  if they should hit the calendar.
- **Before the first referral is marked paid:** set `app_settings.qbo_referral_bank_account` to
  the BofA account's QBO `{id, name}` (visible after the first Refresh now). Until then the
  function refuses with "Referral check bank account not configured"; the OVIS paid flag still
  saves and the UI shows the error.

### Finance hub placement (2026-11-10)

- `/admin/finance` opens with a **Cash Position (45 days)** card
  ([CashPositionCard.tsx](../src/components/cashflow/CashPositionCard.tsx)): QBO bank balance with
  as-of time, 45-day low point (amount + date), red when the low is below the cash cushion. Click →
  `/admin/budget/forecast?tab=cash`.
- Cash cushion = `app_settings.cash_cushion_usd`, edited on Finance Settings (default 0).
- The old "Cash Flow Forecast" card/tab is renamed **Profit Forecast** (`?tab=profit`; the old
  `?tab=forecast` still works). It projects house net − budgeted opex by month; it was never a
  cash view. Page title is now "Cash & Profit Forecast"; **Cash is the default tab**.

### Phase 3 — Claude / MCP access
- `update_payment_date` tool on `ovis-mcp`: resolves `payment_id` or deal + installment,
  writes `payment_date_estimated`, audits old → new (same `audited()` wrapper as `update_deal`).
  It writes no money fields.
- Read-only cash-flow tools for Claude (e.g. available cash, upcoming payments by month,
  safe-to-draw), using the same helper as the page.
- Merge to main before deploying the edge function.

## Phase v2 (deferred)

Moved out of v1 on 2026-11-10. Text kept as decided; nothing here is built.

### Review tracking, critical dates, nudges

- **`deal.last_reviewed_at`** — new column.
   - Set **only** by human edits to `probability`, `fee`, `payment_date_estimated`, critical
     dates, or an explicit "Still on track" confirm.
   - Automated writes (triggers, recalcs, syncs, behind-schedule pushes) never touch it. So it
     is set by the app/edit path, not by a generic `BEFORE UPDATE` trigger on `deal`.
   - Backfill = `last_stage_change_at`.
- **Critical dates drive payment dates** (proposal; findings in §4C):
   - `payment_date_estimated` derives per installment from the deal's critical dates when they
     are entered — Lease: installment 1 = Contingency Date Expiration (fallback Lease / PSA
     Effective Date), installment 2 = Estimated Open Date (fallback Rent Commencement Date);
     Purchase: installment 1 = closing date. When a mapped critical date is missing, the
     existing velocity estimate stays.
   - Source is recorded in `payment_date_source`: `critical_date` (value already documented,
     never used), `auto` (velocity), `broker_override` (manual — wins over both, as today).
   - **Stage gate:** moving At Lease/PSA → Under Contract / Contingent requires Contingency
     Date Expiration and Estimated Open Date before save.
- **Nudge triggers** (replace the 30-day stale rule):
   - Payment due within 30, 14, 7 days: one nudge per threshold, skipped if `last_reviewed_at`
     is after the payment entered that window.
   - Past due (estimated < today, not received): weekly nudge until the date is updated or the
     payment is received.
   - Contingency date passed without a stage change: flag + nudge.
   - Recipients: deal-team members other than the current user. Each nudge is a **drafted
     email for Mike to approve; never auto-sent.** Nudges sent are logged so a threshold fires
     once.
- **Needs-attention v2 groups:** "Due in 30 days, unconfirmed" (due within 30 days and
  `last_reviewed_at` before the payment entered that window) and "Contingency passed"
  (Contingency Date Expiration < today, still Under Contract / Contingent).
- **Row actions:** "Still on track" (sets `last_reviewed_at = now()`) and "Nudge <name>" (one per
  deal-team member other than the current user; drafts an email for Mike to approve).

### Build steps (formerly Phase 2b, minus the backlog view now in v1)

1. Migration: `deal.last_reviewed_at` (backfill from `last_stage_change_at`); a nudge log table
   (payment/deal, threshold, drafted_at, approved_at, recipient) with the CLAUDE.md grants block.
2. Write `last_reviewed_at` from the human edit paths only (deal form, payment date edit,
   critical-date edit, "Still on track").
3. Critical-date → payment-date derivation (§4C), as a change to the existing
   `calculate_deal_payment_dates` pulled from the live definition — not a rebuild from the
   old migration. Plus the At Lease/PSA → Under Contract stage gate in the UI.
4. Nudge engine behind `NUDGES_ENABLED = false`: computes due nudges, drafts emails into an
   approval queue for Mike. Nothing sends without his approval. Mike flips the flag after the
   backlog is clear.

### Budget pay_method / AMEX cycle tagging

- **Budget-driven outflows** (would supersede the prorated "Next 30 days operating" line in Decisions):
  - Each budget line gets `pay_method` (`bank` | `amex`) and `due_day` (bank lines only).
  - Bank-paid lines hit the calendar on `due_day`.
  - AMEX-paid lines roll into the AMEX payment for their statement cycle. Config:
    `AMEX_STATEMENT_CLOSE_DAY` (value needed from Mike), `AMEX_PAYMENT_DAY = 12`.
  - Next AMEX payment = actual QBO AMEX liability balance. Future AMEX payments = sum of
    budgeted amex lines for that cycle.
  - An amex budget line is never counted separately on the calendar.
- Storage: `pay_method` / `due_day` describe the account, not the year — store per
  `qb_account_id`, not on each `account_budget` year row. Mike tags the 63 lines in §4B.

## 4. Verification (2026-11-10)

Code read on this branch; counts from the live database (read-only).

### A. Referral payments / BofA bill-pay checks

**1. What OVIS creates in QBO when a fee is marked paid**

| OVIS action | Edge function | QBO entity | Debit | Credit | Bank book balance |
|---|---|---|---|---|---|
| Referral fee paid | `quickbooks-create-referral-entry` | **Bill** to the referral partner's vendor | `Commissions Paid Out:Referral Fee to Other Broker` (expense) | Accounts Payable | **Unchanged** |
| BOR pass-through paid | same | **Bill** + Journal Entry (BOR fee → income) | `BOR - Pass-Through Clearing` | A/P; JE credits `BOR Referral Income` | **Unchanged** |
| Broker split paid — Greg (Bennett Retail Group) | `quickbooks-create-commission-entry` | **Bill** | `Commissions Paid Out:Bennett Retail Group` | Accounts Payable | **Unchanged** |
| Broker split paid — Arty (Santos) | `quickbooks-create-commission-entry` / `process-arty-commission` | **Journal Entry** | `Commissions Paid Out:Santos…` | `Santos Real Estate Commission Draw` | **Unchanged** (offsets prior draws; no check) |

OVIS has no code that creates a Check, Purchase, Expense or Bill Payment — `_shared/quickbooks.ts`
has `createBill` and `createJournalEntry` only. Live `qb_commission_entry`: 19 Bills + 17 JEs
created, 3 Bills + 8 JEs voided.

**2. Flag: cash is overstated.** Marking paid creates an unpaid Bill. The Bank account only
drops when a Bill Payment is recorded in QBO (by hand via Pay Bills, or by matching the BofA
bank-feed line to the Bill). Between "marked paid in OVIS" and that Bill Payment, the fee is
gone from "Referral/Broker splits owed" (flag flipped) but still in the book balance.

**3. Outstanding checks — proposal**
- List = every referral fee / Bill-type broker split marked paid in OVIS whose check hasn't
  cleared. Payee, paid date, amount, QBO Bill number.
- **Bank actual = QBO book balance + outstanding checks**; show both.
- Clearing: QBO entities appear to have no cleared/reconciled field; the TransactionList
  *report* reportedly accepts a `cleared` filter (Reconciled / Cleared / Uncleared) but doesn't
  return it as a column, so you'd query once per status. **Unconfirmed** — secondhand sources,
  not Intuit docs; verify with a minimal call before building
  ([Satva](https://satvasolutions.com/blog/reconciled-transactions-quickbooks-online-api),
  [CData ClearTransaction](https://cdn.cdata.com/help/RQM/py/pg_sp-cleartransaction.htm)).
  Fallback: one-click "Cleared" in OVIS.
- `getBill` exists; a Bill's `Balance` = 0 means a Bill Payment has been recorded. That gives
  "is it on the books yet", not "has it cleared the bank".

**Open questions for Mike**
1. How do the BofA bill-pay checks get into QBO — Pay Bills when the check is sent, or
   bank-feed match when it clears? If it's at clearing, the book balance already *is* the bank
   actual, and the gap is "marked paid in OVIS, Bill Payment not yet recorded" — the list
   should be keyed on unpaid Bills (Balance > 0), not on clearing.
2. Arty's split is a JE against his draw — no check is ever written. His cash leaves as draws.
   Should Arty's unpaid splits be excluded from "Broker splits owed" (like Mike's), with his
   draws budgeted as their own outflow instead?

### B. Budget-driven outflows

- Budget source: `account_budget` (one row per QBO account per year, `jan`…`dec`), joined to
  `qb_account`. This is what `/admin/budget/forecast` reads.
- **63 lines, all 2026, all `Expense` type.**
- **No payroll line exists.** The "incl. payroll" in the available-cash definition has nothing
  to read; payroll/owner salary needs a budget line or its own input.
- **No 2027 budget rows yet.** From December, any 30-day window and the safe-to-draw timeline
  run past the budget; they must show "no budget" rather than $0.
- No account stores the AMEX liability today (`qb_account` holds Income/Expense types only).

**Budget lines to tag** (Nov 2026 budget and 2026 annual, from `account_budget`):

| Account | Nov 2026 | 2026 annual | pay_method | due_day |
|---|---|---|---|---|
| Accounting/Tax Prep | 0 | 3400 | | |
| Accounting/Tax Prep:Quickbooks | 101 | 1212 | | |
| ACH Transfer Fees - Greg Bennett | 10 | 120 | | |
| Auto:Car Wash | 20 | 240 | | |
| Auto:Gas | 200 | 2400 | | |
| Auto:Parking | 42 | 504 | | |
| Auto:Tolls | 12 | 144 | | |
| Bank Charges | 0 | 0 | | |
| Bank Charges:Bank Charges / Fees | 0 | 695 | | |
| Bank Charges:Interest Expense | 640 | 7680 | | |
| Commercial Conferences & Networking:ICSC - Vegas | 0 | 2230 | | |
| Contract Labor:Belay - Bookkeeper | 0 | 1245 | | |
| Contract Labor:Upwork | 0 | 0 | | |
| Contract Labor:Upwork:Salesforce Development | 0 | 0 | | |
| Contract Labor:Virtual Assistant | 990 | 11880 | | |
| Dues & Subscriptions:Atlanta Biz Chronical | 0 | 212 | | |
| Dues & Subscriptions:GSCCCA.org | 13.04 | 156.48 | | |
| Dues & Subscriptions:Restaurant Trends | 0 | 7475 | | |
| Insurance:E&O Insurance | 0 | 648 | | |
| Massimo Coaching | 1650 | 16500 | | |
| Meals and Entertainment | 210 | 2520 | | |
| Office | 85 | 1020 | | |
| Office:Cell Phones | 300 | 3600 | | |
| Office:Internet Access | 90 | 1065 | | |
| Office:Postage | 42 | 504 | | |
| Professional Memberships:CCIM Membership Fees | 0 | 973 | | |
| Professional Memberships:ICSC Membership Dues | 0 | 1650 | | |
| Professional Memberships:Retail Brokers Network | 0 | 9500 | | |
| Professional Memberships:Southeast Franchise Forum | 0 | 400 | | |
| Rent:Rent - Office | 700 | 7700 | | |
| Taxes & Licenses:Secretary of State Filings | 0 | 297 | | |
| Technology | 0 | 22 | | |
| Technology:Adobe Acrobat | 0 | 240 | | |
| Technology:Anthropic - ClaudAi | 100 | 1200 | | |
| Technology:Apple | 10 | 120 | | |
| Technology:Calendly | 24 | 288 | | |
| Technology:Canva | 0 | 120 | | |
| Technology:CoStar | 1374 | 16488 | | |
| Technology:Docusign | 0 | 0 | | |
| Technology:Domains | 169 | 235 | | |
| Technology:Dropbox | 0 | 1087 | | |
| Technology:Express VPN | 13 | 156 | | |
| Technology:GitHub | 5 | 60 | | |
| Technology:Google Biz Apps | 101 | 1212 | | |
| Technology:Google Voice | 13 | 156 | | |
| Technology:Lastpass | 0 | 36 | | |
| Technology:LinkedIn Sales Navigator | 0 | 780 | | |
| Technology:Loom | 18 | 216 | | |
| Technology:Mail Chimp | 58 | 696 | | |
| Technology:Microsoft 365 | 0 | 130 | | |
| Technology:Open AI | 0 | 1108 | | |
| Technology:Placer AI | 0 | 5250 | | |
| Technology:Reonomy | 0 | 4525 | | |
| Technology:Sites USA | 0 | 5595 | | |
| Technology:Spokeo | 10 | 120 | | |
| Technology:Supabase | 25 | 300 | | |
| Technology:Zoom | 34 | 408 | | |
| Technology:Zoom Info | 0 | 6000 | | |
| Travel | 0 | 0 | | |
| Travel:Airfare | 0 | 2000 | | |
| Travel:Lodging | 0 | 2000 | | |
| Travel:Taxi & Ride Share | 0 | 400 | | |
| Travel:Travel Meals | 0 | 1000 | | |

### C. Critical dates and payment-date calculation

**Critical-date fields today** — two different stores:

- `deal` date columns, mirrored as 5 default "timeline-linked" rows in `critical_date`
  (`deal_field_name` set): Closed Date, LOI X Date, Target Close Date, Booked Date, Effective
  Date (Contract X).
- `critical_date` rows (`subject`, `critical_date`) for everything else — created per deal as
  blank templates, mostly unfilled (filled / rows):

  | Subject | Filled | Rows |
  |---|---|---|
  | Lease / PSA Effective Date | 121 | 654 |
  | Booked Date (non-linked copy) | 96 | 648 |
  | Contingency Date Expiration | 44 | 644 |
  | Rent Commencement Date | 29 | 660 |
  | Delivery Date | 27 | 656 |
  | Estimated Open Date | 23 | 658 |
  | ~20 deal-specific subjects (inspection, permit, closing deadlines…) | 1–5 each | |

  There is no "lease execution" subject; execution is `deal.contract_signed_date`
  ("Effective Date (Contract X)") or the "Lease / PSA Effective Date" row.
- `deal` also holds **durations**, not dates: `contingency_period_days`,
  `rent_commencement_days`, `due_diligence_days`, `closing_deadline_days`, plus
  `estimated_execution_date` and legacy `sf_contingency_date_est`.

**How payment dates work today** (live function definitions; see
[DEAL_FORECASTING_SYSTEM.md](DEAL_FORECASTING_SYSTEM.md)):

- `calculate_payment_estimates` / `calculate_deal_payment_dates` compute from the stage anchor
  (LOI date / LOI signed / `contract_signed_date`) + stage velocity + the duration columns:
  Lease P1 = execution + contingency days; P2 = + rent commencement days (default 180).
  Purchase P1 = execution + due diligence + closing deadline (default 30). Deals behind
  schedule get pushed by `weeks_behind × 7`.
- `payment_date_auto_calculated` always holds that computed value.
- `payment_date_estimated` is overwritten only when `payment_date_source` is `auto` or null.
- `track_payment_date_source` trigger sets `broker_override` whenever someone writes an
  estimated date that differs from the auto value. After that, recalcs leave it alone.
- Recalc fires on deal changes to stage, LOI/contract dates, the duration columns,
  `estimated_execution_date`, or behind-schedule fields. **Critical-date rows do not trigger
  a recalc and are not read by the calculation.** `critical_date` as a source is documented
  but used by 0 payments (live: 239 `auto`, 60 `broker_override`).

**Implications for the proposal**
- The derivation must read `critical_date` rows by `subject` (free text) — subjects need to be
  treated as a fixed key set for the mapped ones, or given a type column.
- Contingency Date Expiration is filled on 44 deals and Estimated Open Date on 23, so most
  payments stay on the velocity estimate until the stage gate starts collecting them.
- Behind-schedule pushes move `auto` dates silently; that's an automated write, so it must not
  touch `last_reviewed_at`, and a pushed date can enter a nudge window without anyone acting.

### D. Deal team and backlog (live, 2026-11-10)

- 75 open deals have **no `commission_split` rows**, so their deal team is empty: no names,
  nobody to nudge. They need a fallback (e.g. `deal.owner_id`) or a "no team" flag.
- 37 active, unreceived payments are past due, across 34 deals; the oldest estimated date is
  2026-04-22.

## Scheduled-payment dedupe + "today vs. book" balance (2026-11-10)

QBO `Account.CurrentBalance` (the calendar's start) already includes future-dated register entries.
So a scheduled payment Mike has already entered in QBO must not be subtracted again.

- **Capture.** Every balance snapshot (`snapshotCashBalances`, called by `quickbooks-cash-refresh` and
  `quickbooks-sync-accounts`) also saves each Bank account's GeneralLedger lines from today−10 to
  today+60 into `qb_bank_transaction`, stamped with the same `fetched_at`. Only the latest batch is kept.
- **Rule.** A `scheduled_payment` occurrence is skipped when an unused bank line exists with the same
  payee (any of `scheduled_payment.qb_payee_names`, case/punctuation-insensitive), money out, within
  ±`DEDUPE_DAYS` (5) and ±`DEDUPE_DOLLARS` ($1). Each QBO line satisfies at most one occurrence.
  Skipped occurrences show greyed and struck through as "Already in QBO" and are not counted.
  No payee names → never deduped.
- **Balances on the Cash tab.** "Bank balance today" = book balance − bank lines dated after today;
  "After entered future transactions" = book balance (calendar start). Future lines are listed.
- Migration: `20261110152457_cash_flow_qbo_dedupe.sql`.

Seeded 2026-11-10 (Mike-approved list): AMEX Business card moved day 12 → 3 (still = QBO card balance);
AMEX LOC loan day 14 $11,523.77; Arty draws day 15 + last day $2,083.33; VA $495 on 11/20, 12/4, 12/18;
Verizon day 12 $291.61; Apple day 1 $66.58. Owner draws and payroll not scheduled (no fixed amount/date).

## v1 fixes + "Money owed out" (2026-11-10)

Migration `20261110153752_cash_flow_v1_fixes_and_credit_facility.sql`.

- **Operating account only.** Calendar start, "today" balance and dedupe use QBO 256 (Oculus Operating,
  `CASH_CONFIG.OPERATING_QB_ACCOUNT_ID`). Savings and personal accounts are listed as information only.
- **AMEX Business card** scheduled payment: fixed $7,000 on the 3rd.
- **Cushion:** `app_settings.cash_cushion_usd` = 20000.
- **Excluded Bills:** `qb_commission_entry.exclude_from_calendar` + `exclude_reason`. Set on Greg's 8440,
  8443, 8444 (paid by the 8/19 bank expense, $6,871.65) and 8158 (paid by 5/4 expense 8183, line "SportClips
  Roswell Payment 1 of 2", $3,889.35). They're counted under "Not counted" on the calendar.
- **Planned pay dates:** `payment.referral_fee_planned_pay_date`, `payment_split.planned_pay_date`. Null means
  the default (today for referrals; pay-method date for splits). A future referral date shows on the calendar
  as "Deferred referral – <deal>". LVIV Croissants ($5,012.67) set to 2026-12-01: the first committed inflow
  date (Central Bark, $4,415) after which the running balance stays above $0 ($1,981).
- **Money owed out** (top of the Cash tab; count + total on the Finance hub card): unpaid referral fees and
  Arty/Greg splits on payments received within the 90-day lookback, plus non-excluded open OVIS split Bills.
  Payee, deal, amount, date the client paid, days held (green < 15, amber 15–30, red > 30, sorted by days
  held), planned pay date. Mark paid calls the existing `usePaymentDisbursement` flow, which creates the QBO
  entry. Open Bills are paid in QBO.

## v1.5 — 12-month projection, owner take-home, planner summary (2026-11-10)

- **`credit_facility`** (admin RLS + grants block). Seeded with AMEX Line of Credit, available $24,500; limit
  and APR blank. Edited in "Credit lines" on the Cash tab.
- **Projection** (`src/lib/cashProjection.ts`). Steps each day from the Operating book balance over this
  month plus the next 11:
  - If cash falls below the cushion, it draws on the LOC up to the amount available; anything beyond that
    is a shortfall.
  - At month end, cash above the cushion pays down the LOC first (draws repaid oldest first). The month's
    largest inflow is recorded as what repaid the draw.
  - The rest above the cushion is the **owner take-home**. It's assumed taken, so next month starts lower.
  - Scenarios: *committed* (deals ≥ 90%) and *with pipeline* (plus lower-probability payments weighted by
    probability).
- **Cash tab panel:** chart, take-home table, LOC draws with what repays them.
- **Planner summary** `/admin/budget/planner`: one page, print to PDF. Shows Operating today and after
  entered items, LOC available, money owed out, the 12-month chart, the take-home table, LOC by month and
  the top 5 inflows (deal name, date, amount, probability).
- **Known limits:**
  - Outflows are scheduled payments only: no payroll, taxes or VA beyond the dated rows.
  - The LOC loan payment ($11,523.77/mo) is assumed to run all 12 months.
  - Arty's draws may double-count against his commission splits, which are also netted out of inflows.
    His draws are advances against commission; not modelled.
- **Not built yet:** the MCP cash tool (Phase 3: `update_payment_date` + read tools).

## Visual redesign — "mission control" (2026-11-10)

The Cash tab and the Finance hub Cash Position card use a dark, dense theme scoped under the `.cf` class
(`src/components/cashflow/cf.css`, helpers in `cfTheme.tsx`). The rest of OVIS is unchanged. On
`/admin/budget/forecast` only the Cash tab renders the dark page shell; Profit Forecast and Broker Splits
keep the light layout. The planner summary stays light for printing.

- **Palette:** bg #0B0F14, panels #11161D, 1px borders #1E2630, radius ≤ 4px, no shadows.
- **Color carries meaning only:** green = inflow / above cushion, amber = warning, red = below cushion,
  overdue or negative, cyan = interactive. Everything else is grayscale.
- **Type:** IBM Plex Mono with tabular-nums for figures; IBM Plex Sans for labels. Labels are small
  uppercase and letter-spaced. Fonts load from Google Fonts only when a `.cf` view mounts.
- **Layout:**
  - Top: KPI strip (Operating, Book, Owed out, 45-day low, Credit available, Cushion status).
  - Middle: the 45-day calendar (step chart, cushion dashed, today marker) beside Money owed out and the
    12-month projection.
  - Bottom: Scheduled payments, Needs attention and Credit lines in a row, then Past-due cleanup.
- **Tables:** compact, sticky headers, hover highlight only, money right-aligned; negatives use a true
  minus sign ("−") and are red.

## v1.6 — remaining work for Thursday 2026-11-12 (Mike, 2026-11-10)

Build order is as given. Design notes are mine, written before building.

1. **Take-home rule.** Take-home in month M is the largest amount Mike can take at the end of M such
   that, with nothing else taken, no later day in the 12-month window drops below the cushion. The
   check runs on the path with no LOC draws.
   - Formally: `min(cash_M − cushion, min_future_balance − cushion)`, floored at 0, after the
     month-end LOC paydown.
   - Applies to both scenarios. Take-home is never followed by borrowing: if any later day is below
     the cushion even with nothing taken, take-home is 0.
2. **LOC payment until payoff.**
   - Each snapshot also reads the LOC liability account (QBO 1150040002 "Line of Credit- American
     Express"; $72,681.37 on 2026-11-10, including the entered 11/13 payment). It's linked through
     `credit_facility.qb_account_id`.
   - The scheduled $11,523.77 runs only until the balance is paid; the last payment is the remainder.
     The payoff month is shown. Without a QBO balance it's flagged and runs 12 months.
   - Simplification: the whole payment counts against the balance. The 11/13 payment was actually
     $10,329.19 principal + $1,194.58 interest, but the payoff month comes out the same either way
     (7th payment).
3. **Every N weeks.** `scheduled_payment.every_n_weeks` uses `scheduled_date` as the anchor, with an
   optional `end_date`. Noree's three one-off rows become one row: every 2 weeks, $495, anchored
   11/20, no end.
4. **Arty advances.**
   - The advance balance is Arty's draws not yet recouped. It starts at the live QBO balance of
     "Santos Real Estate Commission Draw" (1150040000, the account `process-arty-commission` reads)
     and grows with each future scheduled draw (`scheduled_payment.advance_broker_id`).
   - Any Arty split (expected commission or split owed) is paid as split − outstanding advance,
     floored at 0, and the advance drops by the amount recouped. Applied in date order, per scenario.
   - Shown in Money owed out as "advanced to Arty" (information only).
5. **Steady monthly owner pay.** The largest flat X taken at the end of every month in the window with
   no day below the cushion and no LOC draws. Found by binary search on the no-draw path, for both
   scenarios.
   - If X is $0 starting now, it reports the earliest month a positive X could start, judged from
     that month onward.
   - Shown at the top of the take-home section and on the planner. No payroll schedule for Mike;
     owner pay replaces it.
6. **Tax reserve.** `app_settings.tax_reserve_pct` (placeholder 0.25).
   - Base per month = owner pay + business net income, i.e. commission cash in − business outflows.
     Owner pay is excluded from outflows, so the base doesn't depend on it. LOC principal is not an
     expense; referral fees and splits are already netted out of inflows.
   - Accrues monthly from the current month and is paid Jan 15, Apr 15, Jun 15 and Sep 15 (the amount
     accrued through the previous month end).
   - Labelled "Tax reserve (placeholder 25% — confirm with CPA)". Projection only: no tax payment
     date falls inside the current 45 days.
7. **MCP `get_cash_position`** (read-only, ovis-mcp). Returns the same numbers as the UI: balances,
   the 45-day summary, the 12-month committed vs pipeline projection, take-home, steady owner pay,
   LOC draws and what repays them, money owed out, the Arty advance, past-due payments, cushion and
   tax reserve.
   - The pure cash logic moves to `supabase/functions/_shared/cashflow/` (explicit `.ts` imports, no
     React). The `src/` modules re-export it, so the UI and the MCP tool run the same code.

### v1.6 as built (2026-11-10)

Migration `20261110211904_cash_flow_v1_6.sql` (applied to prod and recorded). Code is in
`supabase/functions/_shared/cashflow/` (`calendar`, `data`, `events`, `projection`, `bundle`,
`position`); the `src/` modules re-export it.

Live-data results on 2026-11-10 (Operating book balance $5,516; today $19,123):
- **45-day low:** −$19,907 on Dec 18.
- **Steady owner pay:** $0 committed and $0 with pipeline. No flat amount fits in either scenario, and
  there's no start month within 12 months. The window starts $14.5K under the $20K cushion, and the
  no-draw path ends at −$161K (committed) / −$34K (pipeline).
- **Take-home:** $0 in every month in both scenarios. Under the new rule, every month is followed by a
  dip below the cushion.
- **LOC payoff:** Jun 14, 2027. QBO 1150040002 balance $72,681.37; six payments of $11,523.77, then a
  last payment of $3,538.75.
- **Arty advance:** $0 in QBO now. Projected draws of $4,167 in the 45-day window aren't recouped yet,
  because no commission with an Arty split lands in that window.
- **Tax reserve (25% placeholder, committed):** $2,688 on Jan 15, 2027 and $2,032 on Sep 15, 2027.
  There's no Apr/Jun payment because the base is ≤ 0 in the months before them.
- **MCP:** `get_cash_position` in ovis-mcp v0.7.0 (`cash_position.ts`), admin-only. Checked locally
  under Deno against live data; the output is about 21 KB.

## Payment write-off (2026-11-10)

**Not reusing `is_active = false`.** OVIS has an "archived" state (`is_active = false` + `deleted_at`),
but it's the wrong fit:
- it hides the payment from the deal's Payments tab (`usePaymentData` filters `is_active = true`);
- `usePaymentLifecycle.restoreArchivedPayments` re-activates *all* archived payments when a deal leaves
  Lost, which would silently undo a write-off;
- `sync_payment_names` renumbers "Payment n of m" when `is_active` changes.

So a written-off payment stays active and visible, with its own columns.

**Schema** (`20261110223127_payment_write_off.sql`):
- `payment.write_off_reason`, `written_off_at`, `written_off_by`, `qb_invoice_voided_at`,
  `qb_invoice_voided_by`.
- CHECK: the reason and `written_off_at` are set together.
- Trigger `payment_write_off_guard`:
  - stamps who and when from the reason, and clears them on undo;
  - rejects a blank reason;
  - rejects marking a written-off payment received.

**Excluded wherever a payment counts as "still expected":**
- Shared `isOpenPayment` covers the cash calendar, the 12-month projection, past-due cleanup,
  needs-attention and MCP `get_cash_position`.
- Explicit `.is('written_off_at', null)` filters on the Profit Forecast, Broker Splits (CashflowDashboard),
  the Broker Forecast dashboard, Aged/Upcoming payments and the CFO agent tools (`cfo-tools.ts`).
- It still shows in the deal's payment list as "Written off <date>" with the reason.

**Actions:**
- "Write off…" in the slideout payment-row menu and on each Past-due cleanup row. The reason is
  required (`WriteOffPaymentDialog`).
- If the payment has `qb_invoice_id`, the next step offers **Void QBO invoice**.
  - Each one needs an explicit confirm; it's never automatic.
  - New edge function `quickbooks-void-invoice` (admin only; requires the payment to be written off;
    `POST invoice?operation=void`).
  - QBO keeps the invoice at $0. Nothing is deleted.
- "Undo write-off" is allowed until the invoice is voided.
- `quickbooks-sync-invoice` now refuses (409) to create, resync or delete for a written-off payment, so
  a voided invoice can't be revived or a new one created by accident.

**Closed Paid prompt:**
- After a write-off, or after ticking "received" in the slideout: if every active payment on the deal is
  received or written off, OVIS offers to move the deal to Closed Paid.
- The closed date defaults to the latest received date, else today (ET), and can be edited.
- It's a prompt, not automatic.
- Received ticks made elsewhere (payment dashboard) don't prompt yet.

**Lost deals (checked 2026-11-10):**
- Every forecast path excludes Lost deals by stage in code: cash model, Profit Forecast,
  CashflowDashboard, Broker Forecast, Aged/Upcoming, CFO tools.
- **But the database trigger `auto_archive_lost_deal_payments` has a bug.** It matches
  `payment_received = false`, which never matches NULL.
  - 23 active unpaid payments ($465,376) sit on Lost deals, all with `payment_received` NULL.
  - They don't reach the forecasts only because of the code-level stage filter.
  - Fix + backfill: `20261110223636_lost_archive_null_received.sql`, rebuilt from the live definition.
    **Held — not applied** until Mike approves.

**Deploy (not done — waiting for Mike):**
- Apply `20261110223127_payment_write_off.sql`, plus the held Lost fix if approved.
- Push to main.
- Deploy `quickbooks-void-invoice`, `quickbooks-sync-invoice`, `ovis-mcp` and `cfo-query`
  (imports `cfo-tools.ts`).
- **The migration must go before the frontend:** the cash loader selects the new columns.
