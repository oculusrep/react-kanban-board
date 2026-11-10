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

## 3. Phased plan (no code yet)

### Phase 1 — Data foundations
- Persist QBO Bank-type account balances with an `as_of` timestamp on each
  `quickbooks-list-accounts` sync. Store them in `qb_account` or a new table; any new table gets
  the REVOKE + GRANT block (CLAUDE.md), with authenticated SELECT only and service_role write.
  Apply via psql + `schema_migrations` record.
- List the 4 open active payments that have no `payment_date_estimated`, and have Mike fill
  them in, so the timeline has no silent holes.

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

Grouped panel, count badge per group. Each row shows deal name, client, owning broker
(Mike/Arty/Greg), amount, and days overdue/stale. Each row opens the deal in
`DealDetailsSlideout` (overlay-first per CLAUDE.md, not `navigate('/deal/:id')`).
Thresholds are config constants.

| # | Group | Rule | Amount shown | Days shown |
|---|---|---|---|---|
| 1 | Missing fee | Open deal with no `fee` / `gci` set | — | — |
| 2 | Missing payout date | Active (`is_active`), unreceived payment with no `payment_date_estimated` | `payment_amount` | — |
| 3 | Past due | `payment_date_estimated` < today (ET) and `payment_received = false` | `payment_amount` | days past `payment_date_estimated` |
| 4 | Stale | Open deal, `probability >= 50`, not updated in 30+ days | `fee` | days since last update |

Config constants: `STALE_PROBABILITY_MIN = 50`, `STALE_DAYS = 30`.

Definitions to settle at build time (current live data, 2026-11-10):
- **Open deal** = stage not `Lost` and not `Closed Paid`. There is no separate "closed-dead"
  stage; live stages are Pre-Submittal, Submitted-Reviewing, Negotiating LOI, At Lease/PSA,
  Under Contract / Contingent, Booked, Executed Payable, Closed Paid, Lost.
- **Owning broker** = `deal.owner_id`, mapped to Mike/Arty/Greg. Confirm that matches "who owns
  this deal" before the build; the alternative is the largest `commission_split` share.
- **"Not updated"** = `deal.updated_at`. That column may get bumped by triggers (e.g. payment
  recalculation) without anyone touching the deal, which would hide staleness. Check what
  updates it before relying on it; `last_stage_change_at` is the fallback.

### Phase 3 — Claude / MCP access
- `update_payment_date` tool on `ovis-mcp`: resolves `payment_id` or deal + installment,
  writes `payment_date_estimated`, audits old → new (same `audited()` wrapper as `update_deal`).
  It writes no money fields.
- Read-only cash-flow tools for Claude (e.g. available cash, upcoming payments by month,
  safe-to-draw), using the same helper as the page.
- Merge to main before deploying the edge function.
