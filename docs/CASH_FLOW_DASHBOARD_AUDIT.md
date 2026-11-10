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
