# Reonomy Credit Card Credit — Budget Dashboard Review (2026-05-14)

## User-Reported Issue

> "In my reonomy quickbooks account, there was a credit to that account that
> came through the credit card but it is showing up as an expense so it's
> showing that I paid for it twice."

## Data Verification

Queried `qb_expense` for `account_id = '247'` (Technology:Reonomy):

| qb_transaction_id      | transaction_type   | date       | amount       | imported_at         |
|------------------------|--------------------|------------|--------------|---------------------|
| purchase_5913_line1    | Purchase           | 2024-02-04 |  +$4,309.20  | 2026-02-10 11:28    |
| purchase_6736_line1    | Purchase           | 2025-02-04 |  +$4,524.66  | 2026-05-14 13:08    |
| purchase_7911_line1    | Purchase           | 2026-02-04 |  +$4,524.66  | 2026-05-14 13:08    |
| purchase_7949_line1    | Purchase           | 2026-02-12 |  +$4,524.66  | 2026-05-14 13:08    |
| purchase_7956_line1    | **CreditCardCredit** | 2026-02-18 |  **−$4,524.66**  | 2026-05-14 13:08    |

The credit IS stored correctly:
- `transaction_type = 'CreditCardCredit'`
- `amount = -$4,524.66` (negative, as required)
- Same `account_id = '247'` as the two purchases, so it groups under
  Technology:Reonomy

### Yearly net for Reonomy

| Year | Purchases sum | Credits sum | **Net** |
|------|---------------|-------------|---------|
| 2024 | $4,309.20     | —           | $4,309.20 |
| 2025 | $4,524.66     | —           | $4,524.66 |
| 2026 | $9,049.32 (2 rows) | −$4,524.66 (1 row) | **$4,524.66** |

The 2026 net matches 2025 — one annual subscription's worth, as expected after
Reonomy's duplicate charge was refunded.

## Root Cause — Bug in Budget Manager Page

The user was looking at the **Budget Manager** page (`/admin/budget/manage`),
not the Budget Dashboard. The Budget Manager fetches actuals with a
hard-coded filter that only includes `Purchase` and `Bill`:

```ts
// src/pages/BudgetManagePage.tsx (before fix)
.in('transaction_type', ['Purchase', 'Bill']);
```

This silently excludes `CreditCardCredit`, `VendorCredit`, and `Deposit`
rows — all three of which the sync function stores with NEGATIVE amounts
specifically so that they net against expense actuals. For Reonomy in Feb
2026, the two Purchase rows summed to $9,049 and the −$4,524.66 credit was
filtered out, producing the "paid twice" appearance.

## Fix

Include the credit transaction types in the actuals query:

```ts
// src/pages/BudgetManagePage.tsx:144 (after fix)
.in('transaction_type', ['Purchase', 'Bill', 'CreditCardCredit', 'VendorCredit', 'Deposit']);
```

No sign-handling logic is needed: the sync stores all three credit types
with negative amounts already (see
[2025-01-13_CREDIT_CARD_CREDITS_FIX.md](2025-01-13_CREDIT_CARD_CREDITS_FIX.md)
and `processDeposit` in `quickbooks-sync-expenses/index.ts`), so the
existing `actuals[monthKey] += expense.amount` accumulator correctly
subtracts them.

The Budget Dashboard (`/admin/budget`) was already handling credits
correctly via its `calculateAmount` helper — only the Budget Manager page
had the gap.

### Not fixed in this patch

`JournalEntry-Debit` and `JournalEntry-Credit` posting types are still
excluded from the Budget Manager actuals. Including them would require the
same Debit-vs-Credit sign-flip logic the Budget Dashboard does at
[BudgetDashboardPage.tsx:541-558](../src/pages/BudgetDashboardPage.tsx#L541-L558).
Out of scope for this fix; can be addressed if/when JE-driven expense
adjustments become a meaningful share of actuals.

## Bug #2 — Grand Total / Annual Budget Card Disagreement

While reviewing the screenshot, the user pointed out that the Grand Total
row and the Annual Budget summary card showed wildly different totals:

| Card / row             | 2026 budget total |
|------------------------|-------------------|
| Annual Budget card     | $140,937          |
| Grand Total row (Bud)  | $65,896           |
| Difference             | ~$75,041          |

Same problem hits actuals — YTD Actual card and Grand Total row's "Act"
columns are computed two different ways.

### Root Cause — Parent-account shadow drop in tree-walk helpers

[BudgetManagePage.tsx:360-391](../src/pages/BudgetManagePage.tsx#L360-L391)
defines four recursive helpers (`getNodeBudgetTotal`, `getNodeActualTotal`,
`getNodeMonthBudget`, `getNodeMonthActual`). Each had the same structure:

```ts
if (node.account) {
  return /* node.account's own value */;   // STOPS here
}
return node.children.reduce(...);          // only reached if NO account
```

In QBO, a parent account can have BOTH its own direct postings/budget AND
child accounts under it (e.g., `Technology` is a real account with its own
$22 budget, and it also has 26 children like `Technology:Reonomy`,
`Technology:CoStar`, etc.). `buildHierarchy` attaches the account to the
matching tree node, so the `Technology` node has `account` set AND has
`children`. The recursion's `if (node.account)` branch fires and returns
only the parent's own value — silently dropping every descendant's
contribution.

Confirmed against the data — six "shadowed parents" in the user's 2026
budget:

| Shadowed parent          | Own budget | Descendants budget DROPPED | Descendants |
|--------------------------|-----------:|---------------------------:|------------:|
| Technology               | $22        | $46,766                    | 26          |
| Bank Charges             | $0         | $8,375                     | 2           |
| Travel                   | $0         | $5,400                     | 4           |
| Office                   | $1,020     | $5,148                     | 3           |
| Accounting/Tax Prep      | $3,400     | $1,212                     | 1           |
| Contract Labor:Upwork    | $0         | $0                         | 1           |

The Annual Budget card iterates `budgets.values()` directly (Map iteration)
and thus shows the correct $140,937, but the Grand Total row goes through
the tree walk and gets the smaller, wrong number.

### Fix

Changed all four helpers from "return self OR children" to "sum self AND
children":

```ts
const getNodeBudgetTotal = (node: AccountNode): number => {
  let sum = 0;
  if (node.account) {
    const budget = getBudget(node.account.qb_account_id);
    sum += MONTHS.reduce((s, month) => s + (budget[month] || 0), 0);
  }
  sum += node.children.reduce((s, child) => s + getNodeBudgetTotal(child), 0);
  return sum;
};
```

(Same pattern for `getNodeActualTotal`, `getNodeMonthBudget`,
`getNodeMonthActual`.)

### Side effect — parent rows now display aggregate

Previously, the per-row "TOTAL" column for a parent account row showed only
that parent's own budget/actual (e.g., `Technology` row showed $22 even
though its children totalled $46,788). With the fix, parent rows now show
the aggregate (self + all descendants), which matches standard P&L
convention.

Leaf rows are unchanged.

The Grand Total iterates root nodes only (`section.accounts` is the root
list from `buildHierarchy`), so the aggregated totals don't double-count.

## How the Dashboard Renders the Credit

In [src/pages/BudgetDashboardPage.tsx](../src/pages/BudgetDashboardPage.tsx):

- [Line 536](../src/pages/BudgetDashboardPage.tsx#L536) — `calculateAmount`
  sums transaction amounts. For an expense section, `CreditCardCredit` is left
  as the stored negative value, so it correctly reduces the category total.
- [Line 1383](../src/pages/BudgetDashboardPage.tsx#L1383) — credit rows get
  `isCredit = true`, which applies green text, an `(Credit)` label, and
  accounting-format parentheses on the displayed amount.

Expected display for Technology:Reonomy in 2026:

| Date    | Type             | Description                  | Amount         |
|---------|------------------|------------------------------|----------------|
| Feb 4   | Purchase         | REONOMY NEW YORK NY XXXX2000 |     $4,524.66  |
| Feb 12  | Purchase         | REONOMY NEW YORK NY XXXX1008 |     $4,524.66  |
| Feb 18  | CreditCardCredit | REONOMY NEW YORK NY XXXX2000 |   *($4,524.66)* (green, "(Credit)" badge) |
|         |                  | **Category total**           |   **$4,524.66** |

## Action

1. Reload `/budget` for year 2026 — the credit should now appear and the
   category total should read $4,524.66.
2. No code change required. Sync ran today; data is now correct.

## Related Docs

- [2025-01-13_CREDIT_CARD_CREDITS_FIX.md](2025-01-13_CREDIT_CARD_CREDITS_FIX.md)
  — original fix that made `Purchase.Credit=true` transactions sync as
  `CreditCardCredit` with negative amounts. That logic is working correctly
  here.
