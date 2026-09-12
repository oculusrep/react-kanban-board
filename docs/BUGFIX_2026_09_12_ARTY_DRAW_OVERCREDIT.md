# Bugfix: Arty draw over-credited by the commission JE (2026-09-12)

## Summary

The draw-offset journal entry created by `process-arty-commission` credited the
**full outstanding draw balance** instead of the **commission actually earned** on
the payment. When a payment's commission was smaller than the outstanding draw,
the JE zeroed the draw account anyway — forgiving draw the broker had not earned
and overstating the commission expense by the difference.

A second, unrelated bug in the Arty Draw Report made the balance column render
with the wrong sign, which is how this was spotted.

## How it surfaced

The "Net Pay" notification email and the ledger disagreed. The email read:

```
Your net commission on this payment is $2,810.00.

Draw balance before: $6,249.99
Less credit applied: ($2,810.00)
Draw balance after:  $3,439.99
```

...while QuickBooks showed the draw account at **$0.00** and the JE at **$6,249.99**.

The email was right. The email body renders `creditApplied` / `drawAfter`, which
were computed correctly; only the JE used the wrong figure. So the notification
told the broker the truth while the ledger quietly did something else — worth
remembering as a symptom: **when a notification and the ledger disagree, check
whether they read the same variable.**

## Root cause

### Bug 1 — JE posted `drawBalance` instead of `creditApplied`

`supabase/functions/process-arty-commission/index.ts`

The draw math was already correct:

```ts
const drawBalance   = accountResult.Account.CurrentBalance ?? ... ?? 0;
const creditApplied = Math.min(grossCommission, drawBalance);
const drawAfter     = Math.max(0, drawBalance - grossCommission);
const netPayment    = Math.max(0, grossCommission - drawBalance);
```

But both JE lines posted `Amount: drawBalance`, and the guard was
`if (drawBalance > 0)`. Fixed to `creditApplied` on both lines, guard
`if (creditApplied > 0)`.

Note this case was **already documented correctly** in
[ARTY_COMMISSION_DRAW_SYSTEM.md](ARTY_COMMISSION_DRAW_SYSTEM.md) under "Draw
Exceeds Commission" ("JE created for partial offset — only up to commission
amount"). The code had diverged from its own written spec, and nothing caught it
because the bug is invisible whenever commission >= draw, which is the common case.

### Bug 2 — inverted running balance in the draw report

`supabase/functions/quickbooks-account-transactions/index.ts`

The GL parser's `debit` / `credit` fields are **report-facing, not ledger-facing**:
`debit` feeds the green "Commissions Earned" column and `credit` feeds the purple
"Draws" column — the opposite of their general-ledger meaning, because QBO's
`subt_nat_amount` is signed from the account's perspective (positive = a debit to
the draw account = money advanced to the broker).

The running balance was computed `runningBalance + debit - credit`, which reads
correctly against the *field names* but made draws decrease the balance and
commissions increase it. Fixed to `+ credit - debit`.

The draw account is an **Other Asset** (verified from the QBO API:
`"Classification":"Asset","AccountType":"Other Asset"`), so a debit balance means
the broker owes the company — matching the report's own "Amount Arty owes the
company" card and its legend's "Positive = Arty owes the company". The table was
contradicting both, and disagreeing with its own TOTALS row, which reads QBO's
`Account.CurrentBalance` directly and therefore had the correct sign all along.

### Bug 3 — created entities were never recorded

`process-arty-commission` never inserted into `qb_commission_entry`, even though
the `OVIS-###` doc number sequence is derived from `MAX(qb_doc_number)` in that
table. The table topped out at OVIS-114 while OVIS-115 existed in QBO, so the
next run would have minted OVIS-115 a second time. The function now records both
the JE and the Bill.

### Bug 4 — `-$0.00` in the report

A balance that nets to zero can land on `-0` or float residue (`-1.8e-12`), both
of which `Intl.NumberFormat` renders as `-$0.00` — reading like the company owes
money it doesn't. `formatCurrency` now rounds to cents and collapses zero.

## Data remediation (completed)

The bad entry had to be corrected by hand; the code fix only changes what future
runs post.

| Time (UTC) | Action |
|---|---|
| — | Bad JE: QBO id **8472**, OVIS-115, 2026-09-11, **$6,249.99** credited to the draw |
| 15:23:54 | Deleted JE 8472 via the trash icon on the draw report |
| 15:24:50 | Re-ran Net Pay — preview confirmed draw $6,249.99 / credit $2,810.00 / after $3,439.99 / net $0 |
| 15:25:03 | New JE: QBO id **8475**, OVIS-115, **$2,810.00**. Draw account now **$3,439.99** |

No Bill was created either time, correctly — net payment was $0 because the
commission was fully absorbed by the draw.

**Order of operations matters when correcting one of these.** `process-arty-commission`
reads the draw balance **live from QBO** at run time. Re-running Net Pay *before*
deleting the bad JE would have seen a $0.00 balance, computed
`creditApplied = min(2810, 0) = 0`, skipped the JE entirely, and created a **Bill
for $2,810.00** — cutting a cash payment for commission that had already gone out
as draw. Always delete first, confirm the balance reverts, then re-run.

Also note a re-run **re-sends the notification email** (the send modal doesn't pass
`skip_email`, though the function supports it) and re-stamps `payment_split.paid_date`
to the day of the re-run.

## Verifying the delete path

The trash icon on the draw report performs a real QBO delete: it calls
`quickbooks-delete-transaction`, which fetches the entity for its `SyncToken` and
POSTs `journalentry?operation=delete`. It is a **hard delete** — QBO has no void
operation for journal entries via the API, though the deletion remains in QBO's
own audit log.

The part worth checking was whether the report even has a real QBO id to delete:
the GL parser falls back to a synthetic `${date}-${docNum}` string when it can't
find one, which would 404. It doesn't — the GL report rows carry genuine numeric
QBO transaction ids.

## Commits

- `2595028b` fix(draw-report): correct inverted running balance sign
- `1b7eed54` fix(arty-commission): credit the draw by commission earned, not the full balance
- `805a8e3b` fix(draw-report): render a cleared balance as $0.00, not -$0.00

Both edge functions (`process-arty-commission`, `quickbooks-account-transactions`)
were deployed directly with `supabase functions deploy`; the frontend shipped via
the normal push to `main`.

## Follow-ups not done

- The send modal has no "don't send email" option, so any re-run notifies the
  broker again. `process-arty-commission` already accepts `skip_email`.
- The GL parser requests `rbal_nat_amount` (QBO's own running balance, correct
  sign, and it handles pre-window opening balances) and maps it to
  `colMap['balance']`, but never uses it — the balance is recomputed locally
  instead. Switching to it would be more robust than the local sum, which assumes
  the date range covers all history.
- `process-arty-commission` has no guard against re-processing a payment split
  that is already `paid`.
