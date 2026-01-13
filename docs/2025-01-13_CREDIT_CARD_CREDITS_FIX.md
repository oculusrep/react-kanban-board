# Credit Card Credits Fix - January 13, 2025

## Problem Statement

Credit Card Credits (refunds) from QuickBooks were not being synced to OVIS, causing the P&L totals to be incorrect. For example, Car Wash credits should reduce the Auto expense category total, but they weren't showing up at all.

## Root Cause Discovery

### Initial Assumptions (Incorrect)
1. First attempt: Query `SELECT * FROM CreditCardCredit` - assumed QBO had a separate entity type
2. Second attempt: Query `SELECT * FROM VendorCredit` - in case credits were stored as vendor credits
3. Both approaches returned no results despite credits being visible in QBO Transaction Reports

### Key Insight
After researching the QuickBooks Online API documentation, discovered that **Credit Card Credits are NOT a separate entity type**. Instead, they are stored as `Purchase` transactions with a `Credit=true` field.

From Intuit Developer documentation:
> "Credit Card Credits in QBO are accessed via the Purchase object with the Credit field set to true"

### Evidence
- User's QBO Transaction Report screenshot showed transactions with type "Credit Card Credit"
- SQL query of `qb_expense` table showed only `Purchase` type transactions
- Car Wash credits dated in 2024 were not syncing because default start date was 2025-01-01

## Solution Implemented

### 1. Updated `quickbooks-sync-expenses` Edge Function

**File:** `supabase/functions/quickbooks-sync-expenses/index.ts`

#### Changes:
- Added `Credit?: boolean` field to `QBPurchase` interface
- Modified `processPurchase()` function to detect credits via `purchase.Credit === true`
- When credit detected:
  - Store amount as negative: `-Math.abs(line.Amount)`
  - Set `transaction_type` to `'CreditCardCredit'` instead of `'Purchase'`
- Changed default `startDate` from `'2025-01-01'` to `'2024-01-01'` to capture historical data

```typescript
interface QBPurchase {
  Id: string
  SyncToken: string
  TxnDate: string
  TotalAmt: number
  EntityRef?: { name: string; value: string }
  Line: QBPurchaseLine[]
  PrivateNote?: string
  PaymentType?: string  // 'Cash', 'Check', 'CreditCard'
  Credit?: boolean  // true = Credit Card Credit (reduces expense), false = expense
}

const processPurchase = async (purchase: QBPurchase) => {
  // Determine if this is a credit (refund)
  const isCredit = purchase.Credit === true

  // For credits, store as negative to reduce expense total
  const amount = isCredit ? -Math.abs(line.Amount) : line.Amount

  // Store with appropriate transaction type
  transaction_type: isCredit ? 'CreditCardCredit' : 'Purchase',
}
```

### 2. Updated P&L Display for Credit Visibility

**File:** `src/pages/BudgetDashboardPage.tsx`

#### Changes:
- Updated `formatCurrency()` to display negative amounts in accounting format (parentheses)
- Added visual indicators for credit transactions:
  - Light green background on credit rows (`bg-green-50/50`)
  - "(Credit)" label next to vendor name in green text
  - Green text color for credit amounts (`text-green-700`)

```typescript
const formatCurrency = (amount: number, showNegative: boolean = false) => {
  const formatted = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2 });
  if (showNegative && amount < 0) {
    return `($${formatted})`;  // Accounting format for negatives
  }
  return `$${formatted}`;
};

// Credit detection for display
const isCredit = txn.amount < 0 ||
                 txn.transaction_type === 'CreditCardCredit' ||
                 txn.transaction_type === 'VendorCredit';
```

### 3. VendorCredit Support (Added as precaution)

Also added support for `VendorCredit` entity type in case any vendor credits exist:
- Queries `SELECT * FROM VendorCredit WHERE TxnDate >= '${startDate}'`
- Stores with `transaction_type: 'VendorCredit'`
- Amounts stored as negative to reduce expense totals

## Commits

1. **"Fix Credit Card Credits sync - detect via Purchase.Credit field"**
   - Core fix for detecting and syncing credit card credits correctly

2. **"Display credit transactions with negative amounts and visual indicators"**
   - UI improvements for credit visibility in transaction list

## Testing Verification

After deploying and syncing:
1. Credits now appear in the transaction list with negative amounts
2. Category totals correctly reflect credits (e.g., Auto category reduced by Car Wash credits)
3. P&L totals match QuickBooks P&L report
4. Credits are visually distinguishable with green highlighting and "(Credit)" label

## Related Files

- `supabase/functions/quickbooks-sync-expenses/index.ts` - Main sync function
- `supabase/functions/quickbooks-update-expense/index.ts` - Expense recategorization
- `src/pages/BudgetDashboardPage.tsx` - P&L display page
- `docs/QUICKBOOKS_INTEGRATION_SPEC.md` - Main integration documentation

## Key Learnings

1. **QBO API Quirk:** Credit Card Credits are not a separate entity - they're Purchase transactions with `Credit=true`
2. **Date Range Matters:** Historical credits won't sync if the default date range excludes them
3. **Visual Feedback:** Credits need clear visual distinction since they affect totals but represent refunds
