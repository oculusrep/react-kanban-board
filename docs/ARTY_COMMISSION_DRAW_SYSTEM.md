# Arty Commission Draw System

## Overview

This document describes the commission processing system for Arty Santos, who operates on a "draw" arrangement. Arty receives regular draw payments (advances against future commissions), and when a commission is earned, the draw balance is offset before any net payment is made.

## Key Concepts

### Draw Account
- **Account**: "Santos Real Estate Commission Draw" (QBO id `1150040000`)
- **Type**: **Other Asset** — `"Classification":"Asset","AccountType":"Other Asset"`
  per the QBO API. (It is *not* a liability; earlier versions of this doc said so.)
  The company has advanced money to Arty, so the receivable is an asset.
- **Purpose**: Tracks the running balance of draws taken vs commissions earned
- **Positive (debit) balance**: Arty owes the company (draws exceed commissions)
- **Negative balance**: Company owes Arty (commissions exceed draws)

Because it's an asset, **draws debit this account and commission offsets credit it.**
Anything that displays this account must follow that sign convention or it will
contradict `Account.CurrentBalance`, which QBO reports with the correct sign.

### Commissions Paid Out Account
- **Account**: "Commissions Paid Out: Santos Real Estate Partners LLC" (expense account)
- **Purpose**: Records actual commission expense when payments are processed

## How Commission Processing Works (Option A)

When Arty earns a commission, the system creates two QBO entries:

### 1. Journal Entry (applies commission against the draw)
Only created if commission is actually being applied — `creditApplied > 0`.

**The JE amount is `min(grossCommission, drawBalance)`, never the full draw balance.**
Crediting the whole balance forgives draw Arty hasn't earned yet and overstates the
Commissions Paid Out expense by the difference. This was a real bug — see
[BUGFIX_2026_09_12_ARTY_DRAW_OVERCREDIT.md](BUGFIX_2026_09_12_ARTY_DRAW_OVERCREDIT.md).

In the example below commission ($1,838.65) exceeds the draw ($669.03), so the
applied credit happens to equal the full draw and the account does land on zero.
That is the common case, which is exactly why the bug went unnoticed.

| Account | Debit | Credit | Description |
|---------|-------|--------|-------------|
| Commissions Paid Out: Santos Real Estate Partners LLC | $669.03 | | Commission expense for draw offset |
| Santos Real Estate Commission Draw | | $669.03 | Credits the draw by the commission applied |

**Result**: The draw account balance goes from $669.03 to $0.00 — because here the
commission covered the whole draw. Had the commission been $400, the JE would be
$400 and the draw would carry $269.03 forward.

### 2. Bill (net payment to Arty)
Only created if net payment > $0.

| Vendor | Amount | Account | Description |
|--------|--------|---------|-------------|
| Santos Real Estate Partners LLC | $1,169.62 | Commissions Paid Out: Santos Real Estate Partners LLC | Net commission payment |

**Result**: Creates an Accounts Payable entry for the net payment

## Example Calculation

Given:
- **Draw balance**: $669.03 (Arty owes the company)
- **Commission earned**: $1,838.65

Calculation:
- Net payment = $1,838.65 - $669.03 = **$1,169.62**
- JE amount = $669.03 (clears the draw)
- Bill amount = $1,169.62 (net payment to Arty)

Total expense = $669.03 (JE) + $1,169.62 (Bill) = **$1,838.65** (equals gross commission)

## Arty Draw Report

Located at `/reports/arty-draw`, this report shows:
- **Draws** (purple column): Money paid to Arty from the draw account
- **Commissions Earned** (green column): Credits to the draw account from commissions
- **Running Balance**: **Positive = Arty owes the company.** Draws increase it,
  commission offsets pay it down.

The report pulls data live from QuickBooks' General Ledger report for the draw
account (`quickbooks-account-transactions`). It stores nothing — correct the data
in QBO and the report follows on refresh.

### Gotcha: the parser's `debit`/`credit` fields are report-facing, not ledger-facing

QBO's `subt_nat_amount` is signed from the account's perspective: positive means a
**debit** to the draw account (a draw), negative means a **credit** (commission
applied). The parser stores these into fields named `debit` and `credit` that feed
the *display columns* — `debit` → "Commissions Earned", `credit` → "Draws" — which
is the opposite of their GL meaning. **Don't reason about the running balance from
those field names.** Doing exactly that produced an inverted balance column.

### Deleting an entry

The trash icon calls `quickbooks-delete-transaction`, which performs a **real, hard
delete in QBO** (fetches the `SyncToken`, then `POST journalentry?operation=delete`).
QBO has no API void for journal entries. The row ids come from the GL report and are
genuine QBO transaction ids.

## Edge Cases

### No Draw Balance
If Arty has no outstanding draw (balance = $0 or negative):
- **No JE created** - nothing to clear
- **Bill created for full commission amount**

### Draw Exceeds Commission
If the draw balance is greater than the commission earned:
- **JE created for partial offset** (only up to commission amount)
- **No Bill created** - no net payment owed
- **Remaining draw balance carries forward**

### No Net Payment
If commission exactly equals draw balance:
- **JE created to clear the draw**
- **No Bill created** - balance is zeroed out with no payment

## Technical Implementation

### Edge Function
`supabase/functions/process-arty-commission/index.ts`

Key steps:
1. Fetch payment split from OVIS database
2. Get draw balance from QBO (account CurrentBalance)
3. Look up "Commissions Paid Out: Santos Real Estate Partners LLC" account
4. Create JE for `min(grossCommission, drawBalance)` if that is > 0
5. Create Bill if net payment > 0
6. Record both entities in `qb_commission_entry`
7. Mark payment split as paid
8. Send email notification to Arty

**Step 6 is load-bearing.** The `OVIS-###` doc number is generated from
`MAX(qb_doc_number)` in `qb_commission_entry`, so failing to record an entry makes
the next run reuse the same number.

### UI Components
- **BrokerPaymentRow.tsx**: "Net Pay" button triggers the process
- **ArtyDrawReport.tsx**: Displays the draw account activity

### Account Lookups
Both the JE and Bill use the same expense account:
- Query: `SELECT * FROM Account WHERE FullyQualifiedName LIKE '%Commissions Paid Out%Santos Real Estate%'`
- Fallback: Search for any "Commissions Paid Out" account

## Configuration

### QBO Commission Mapping
In Settings > QuickBooks, Arty's commission mapping should have:
- **Payment Method**: Journal Entry
- **Credit Account**: Santos Real Estate Commission Draw
- **Vendor**: Santos Real Estate Partners LLC

## Workflow

1. Deal closes and payment is received
2. Admin goes to Payment Dashboard
3. Clicks "Net Pay" button on Arty's payment split
4. System shows preview with draw balance and net payment
5. Admin confirms to process
6. System creates JE (if needed) and Bill
7. Email sent to Arty with breakdown
8. Payment split marked as paid

## Why Option A

Implemented March 2026 to replace the previous "Option B" approach, which credited
the full commission to the draw account and then had the bill debit it back out.
Option A is cleaner because:
- The draw account shows only draws and the commission applied against them
- The Bill represents only the actual cash payment to Arty
- Both entries use the same expense account for consistency

## Correcting a bad entry

`process-arty-commission` reads the draw balance **live from QBO** at run time, so
**order of operations matters**:

1. **Delete the bad JE first** (trash icon on the draw report).
2. Confirm the draw balance reverts on refresh.
3. Re-run Net Pay.

Re-running *before* deleting sees the already-reduced balance, computes
`creditApplied = 0`, skips the JE, and creates a **Bill for the full commission** —
cutting a cash payment for commission that already went out as draw.

Two side effects of a re-run: it **re-sends the notification email** (the send modal
doesn't pass `skip_email`, though the edge function supports it), and it re-stamps
`payment_split.paid_date` to the re-run date.

## Revision history

- **March 2026** — Implemented, replacing "Option B" (which credited the full
  commission to the draw and had the bill debit it back out).
- **2026-09-12** — Corrected the JE amount to `min(commission, draw)`, fixed the
  report's inverted balance sign, started recording entries in
  `qb_commission_entry`, and corrected this doc's claim that the draw account is a
  liability. See
  [BUGFIX_2026_09_12_ARTY_DRAW_OVERCREDIT.md](BUGFIX_2026_09_12_ARTY_DRAW_OVERCREDIT.md).
