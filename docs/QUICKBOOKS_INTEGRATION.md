# QuickBooks Online Integration

## Overview

OVIS integrates with QuickBooks Online (QBO) for:
1. **Invoice sync** - Push OVIS invoices to QBO
2. **Payment reconciliation** - Match OVIS payments with QBO
3. **Expense tracking** - Pull expenses from QBO for P&L reporting
4. **Chart of Accounts sync** - Pull account structure for categorization

## Architecture

### Database Tables

| Table | Purpose |
|-------|---------|
| `qb_connection` | OAuth tokens and connection status |
| `qb_account` | Chart of accounts (synced from QBO) |
| `qb_expense` | Expense transactions (synced from QBO) |
| `qb_sync_log` | Audit trail of sync operations |

### Edge Functions

| Function | Purpose |
|----------|---------|
| `quickbooks-auth` | OAuth flow initiation |
| `quickbooks-callback` | OAuth callback handler |
| `quickbooks-sync-accounts` | Pull chart of accounts from QBO |
| `quickbooks-sync-expenses` | Pull Purchase/Bill transactions from QBO |
| `quickbooks-update-expense` | Push category changes back to QBO |
| `quickbooks-reconcile` | Payment reconciliation |
| `quickbooks-create-invoice` | Push invoices to QBO |

### Frontend Pages

| Page | Route | Purpose |
|------|-------|---------|
| QuickBooks Settings | `/admin/quickbooks` | Connection management |
| P&L Statement | `/admin/budget` | Profit & Loss reporting |

---

## Connection Flow

### OAuth 2.0 Setup

1. User clicks "Connect to QuickBooks" on `/admin/quickbooks`
2. `quickbooks-auth` generates OAuth URL and redirects to Intuit
3. User authorizes in QBO
4. `quickbooks-callback` receives auth code, exchanges for tokens
5. Tokens stored in `qb_connection` table

### Token Management

- **Access token**: 1 hour expiry, auto-refreshed
- **Refresh token**: 100 day expiry
- `refreshTokenIfNeeded()` in `_shared/quickbooks.ts` handles refresh
- If refresh fails, connection marked as `expired`

### Environment Variables

```
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_REDIRECT_URI=https://your-app.com/api/quickbooks/callback
QUICKBOOKS_ENVIRONMENT=production  # or 'sandbox'
```

---

## Chart of Accounts Sync

### What Gets Synced

Account types pulled from QBO:
- Income
- Other Income
- Cost of Goods Sold
- Expense
- Other Expense

### Data Stored

```sql
qb_account:
  - qb_account_id (stable QBO ID - never changes)
  - name (current account name)
  - account_type (Income, Expense, etc.)
  - account_sub_type
  - fully_qualified_name (hierarchy path, e.g., "Expenses:Auto:Fuel")
  - active
  - current_balance
  - budget_amount (OVIS-specific)
  - last_synced_at
```

### Key Design Decision

**Account matching uses `qb_account_id`** (QBO's internal ID), not the name. This means:
- Renaming accounts in QBO automatically reflects in OVIS after account sync
- Moving accounts to different parent categories reflects after account sync
- No need to re-sync transactions when account structure changes

---

## Expense Sync

### Transaction Types Pulled

1. **Purchase** - Credit card charges, checks, cash expenses
2. **Bill** - Vendor bills/invoices

### Line Item Handling

Each Purchase/Bill can have multiple line items. We store each line as a separate expense record:

```
Transaction ID format: {type}_{entity_id}_line{line_num}
Example: purchase_123_line1, bill_456_line2
```

### Data Stored

```sql
qb_expense:
  - qb_transaction_id (unique composite ID)
  - transaction_type (Purchase or Bill)
  - transaction_date
  - vendor_name
  - account_id (stable QBO account ID for matching)
  - account_name (display fallback)
  - category (display fallback)
  - description
  - amount
  - sync_token (for optimistic locking on updates)
  - qb_entity_type (Purchase or Bill)
  - qb_entity_id (parent transaction ID in QBO)
  - qb_line_id (line number within transaction)
```

### Pagination

QBO limits queries to 1000 results. The sync uses `STARTPOSITION` and `MAXRESULTS`:

```typescript
while (true) {
  const query = `SELECT * FROM Purchase WHERE TxnDate >= '${startDate}'
                 ORDERBY TxnDate DESC
                 STARTPOSITION ${startPosition}
                 MAXRESULTS 1000`
  // ... process results
  if (results.length < 1000) break
  startPosition += 1000
}
```

Similarly, Supabase queries use `.range()` for pagination beyond 1000 rows.

---

## P&L Statement Display

### Hierarchy Building

The `fully_qualified_name` field contains the account hierarchy:
```
"Cost of Goods Sold:Product Costs:Materials"
```

This is parsed to build a tree structure:
```
Cost of Goods Sold (parent)
  └── Product Costs (parent)
      └── Materials (leaf with transactions)
```

### Sections

| Section | Account Types | Color |
|---------|--------------|-------|
| Income | Income, Other Income | Green |
| Cost of Goods Sold | Cost of Goods Sold | Orange |
| **Gross Profit** | Income - COGS | Blue |
| Operating Expenses | Expense, Other Expense | Red |
| **Net Income** | Gross Profit - Expenses | Dark |

### Features

- **Collapsible categories**: Click parent to expand/collapse children
- **Transaction drill-down**: Click leaf category to see individual transactions
- **Budget tracking**: Set budget amounts per account, see % used
- **Recategorization**: Change transaction categories (pushes to QBO)
- **Period filtering**: View by month or full year

---

## Expense Recategorization

### Flow

1. User clicks "Change" on a transaction
2. Selects new category from dropdown
3. `quickbooks-update-expense` is called with:
   - `expenseId` (OVIS UUID)
   - `newAccountId` (QBO account ID)
   - `newAccountName`

### QBO Update Process

1. Look up expense record to get `qb_entity_type`, `qb_entity_id`, `qb_line_id`
2. Fetch current Purchase/Bill from QBO (need full entity for update)
3. Find matching line item by `LineNum`
4. Update `AccountBasedExpenseLineDetail.AccountRef`
5. POST full entity back to QBO
6. Update local `qb_expense` record

### SyncToken

QBO uses optimistic locking. Each entity has a `SyncToken` that increments on update. Updates must include the current `SyncToken` or they fail with a stale data error.

---

## Migrations

### 20251208_create_quickbooks_tables.sql

Creates core tables:
- `qb_connection`
- `qb_sync_log`
- `qb_expense`

### 20251231_add_expense_recategorization.sql

Adds columns for recategorization support:
```sql
ALTER TABLE qb_expense ADD COLUMN sync_token TEXT;
ALTER TABLE qb_expense ADD COLUMN qb_entity_type TEXT;
ALTER TABLE qb_expense ADD COLUMN qb_entity_id TEXT;
ALTER TABLE qb_expense ADD COLUMN qb_line_id TEXT;
```

---

## Common Operations

### Initial Setup

1. Configure environment variables in Supabase
2. Run migrations
3. Deploy Edge Functions:
   ```bash
   npx supabase functions deploy quickbooks-auth --no-verify-jwt
   npx supabase functions deploy quickbooks-callback --no-verify-jwt
   npx supabase functions deploy quickbooks-sync-accounts --no-verify-jwt
   npx supabase functions deploy quickbooks-sync-expenses --no-verify-jwt
   npx supabase functions deploy quickbooks-update-expense --no-verify-jwt
   ```

### Connect to QuickBooks

1. Go to `/admin/quickbooks`
2. Click "Connect to QuickBooks"
3. Authorize in QBO popup
4. Connection status shows "Connected"

### Sync Chart of Accounts

1. Go to P&L Statement page
2. Click "Sync Accounts"
3. Pulls all Income, COGS, and Expense accounts

### Sync Transactions

1. Go to P&L Statement page
2. Click "Sync Transactions"
3. Pulls Purchase and Bill transactions for selected year

### After Changing Chart of Accounts in QBO

Just click "Sync Accounts" - the P&L will reflect new names and hierarchy because matching is by stable `account_id`, not names.

### Full Refresh (if needed)

If data is corrupted or you want a clean slate:
```sql
TRUNCATE TABLE qb_expense;
```
Then sync accounts and transactions.

---

## Troubleshooting

### "QuickBooks not connected"

- Check `qb_connection` table for status
- May need to reconnect if refresh token expired (100 days)

### Duplicate transactions

- Old transaction ID format was `purchase_123_0`
- New format is `purchase_123_line1` (uses LineNum)
- Fix: Truncate `qb_expense` and re-sync

### Missing transactions

- Check date range (syncs from January of selected year)
- Check pagination - should fetch all pages automatically
- Check Edge Function logs for errors

### Stale SyncToken error on recategorization

- The transaction was modified in QBO after we synced
- Re-sync transactions to get fresh SyncToken

---

## File Locations

```
src/pages/
  BudgetDashboardPage.tsx      # P&L Statement UI
  QuickBooksSettingsPage.tsx   # Connection management

supabase/functions/
  _shared/quickbooks.ts        # Shared utilities (auth, API calls)
  quickbooks-auth/             # OAuth initiation
  quickbooks-callback/         # OAuth callback
  quickbooks-sync-accounts/    # Chart of accounts sync
  quickbooks-sync-expenses/    # Transaction sync
  quickbooks-update-expense/   # Recategorization
  quickbooks-reconcile/        # Payment reconciliation
  quickbooks-create-invoice/   # Invoice push

supabase/migrations/
  20251208_create_quickbooks_tables.sql
  20251231_add_expense_recategorization.sql
```

---

## Session History (December 31, 2025)

### Work Completed

1. **Fixed OAuth flow for production**
   - Added `--no-verify-jwt` flag for callback
   - Fixed redirect URI configuration

2. **Built expense recategorization feature**
   - Added schema columns for tracking QBO entity info
   - Created `quickbooks-update-expense` Edge Function
   - Added UI for changing categories

3. **Fixed pagination issues**
   - QBO API: Added `STARTPOSITION` loop for >1000 transactions
   - Supabase: Added `.range()` pagination for >1000 rows
   - Added secondary sort by `id` for consistent pagination

4. **Fixed duplicate transactions**
   - Changed transaction ID to use `LineNum` instead of index
   - Format: `purchase_123_line1` instead of `purchase_123_0`

5. **Redesigned Budget Dashboard as P&L Statement**
   - Added Income account types to sync
   - Built hierarchical category structure from `fully_qualified_name`
   - Added sections: Income, COGS, Gross Profit, Expenses, Net Income
   - Collapsible parent categories with subtotals
   - Color-coded sections
   - Summary cards at bottom

6. **Improved account matching**
   - Uses stable `qb_account_id` (never changes) for matching
   - Account renames/reorganization in QBO reflect after account sync only
   - No need to re-sync transactions when structure changes
