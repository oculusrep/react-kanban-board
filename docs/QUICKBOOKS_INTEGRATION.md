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
| `qb_item` | Items/products with income account mappings |
| `qb_expense` | All transactions (synced from QBO) |
| `qb_sync_log` | Audit trail of sync operations |

### Edge Functions

| Function | Purpose |
|----------|---------|
| `quickbooks-auth` | OAuth flow initiation |
| `quickbooks-callback` | OAuth callback handler |
| `quickbooks-sync-accounts` | Pull chart of accounts from QBO |
| `quickbooks-sync-items` | Pull items/products with income account mappings |
| `quickbooks-sync-expenses` | Pull all transaction types from QBO |
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

## Transaction Sync

### Transaction Types Pulled

**Expenses:**
1. **Purchase** - Credit card charges, checks, cash expenses
2. **Bill** - Vendor bills/invoices

**Income:**
3. **Invoice** - Customer invoices (income)
4. **SalesReceipt** - Point-of-sale transactions (income)

**Both:**
5. **JournalEntry** - Manual journal entries (can be income or expense)

### Line Item Handling

Each transaction can have multiple line items. We store each line as a separate record:

```
Transaction ID format: {type}_{entity_id}_line{line_num}
Examples:
  purchase_123_line1, bill_456_line2
  invoice_789_line1, salesreceipt_101_line1
  journalentry_202_line1
```

### Data Stored

```sql
qb_expense:
  - qb_transaction_id (unique composite ID)
  - transaction_type (Purchase, Bill, Invoice, SalesReceipt, JournalEntry-Credit, JournalEntry-Debit)
  - transaction_date
  - vendor_name (vendor for expenses, customer for income)
  - account_id (QBO account ID, or Item ID for invoices - see Items section)
  - account_name (display fallback)
  - category (display fallback)
  - description
  - amount
  - sync_token (for optimistic locking on updates)
  - qb_entity_type (Purchase, Bill, Invoice, SalesReceipt, JournalEntry)
  - qb_entity_id (parent transaction ID in QBO)
  - qb_line_id (line number within transaction)
```

### Invoice Income Mapping

**Important:** QuickBooks Invoices don't reference Income accounts directly. They reference **Items** (products/services), and each Item has an `IncomeAccountRef` that specifies which Income account to use.

When syncing invoices:
1. The `account_id` stored is actually the **Item ID**, not an Account ID
2. We sync Items separately via `quickbooks-sync-items`
3. The P&L display code looks up the Item to find the real Income account

This is why the Items sync is required for income to display correctly.

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

### 20251231_add_qb_item_table.sql

Creates table for Item-to-Income-Account mappings:
```sql
CREATE TABLE qb_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qb_item_id TEXT NOT NULL UNIQUE,  -- QBO Item ID
    name TEXT NOT NULL,
    fully_qualified_name TEXT,
    item_type TEXT,  -- 'Service', 'Inventory', 'NonInventory', etc.
    active BOOLEAN DEFAULT true,
    income_account_id TEXT,  -- QBO Account ID for income
    income_account_name TEXT,
    expense_account_id TEXT,  -- QBO Account ID for COGS/expense
    expense_account_name TEXT,
    description TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Common Operations

### Initial Setup

1. Configure environment variables in Supabase
2. Run migrations (including `20251231_add_qb_item_table.sql`)
3. Deploy Edge Functions:
   ```bash
   npx supabase functions deploy quickbooks-auth --no-verify-jwt
   npx supabase functions deploy quickbooks-callback --no-verify-jwt
   npx supabase functions deploy quickbooks-sync-accounts --no-verify-jwt
   npx supabase functions deploy quickbooks-sync-items --no-verify-jwt
   npx supabase functions deploy quickbooks-sync-expenses --no-verify-jwt
   npx supabase functions deploy quickbooks-update-expense --no-verify-jwt
   ```

### Connect to QuickBooks

1. Go to `/admin/quickbooks`
2. Click "Connect to QuickBooks"
3. Authorize in QBO popup
4. Connection status shows "Connected"

### Sync All Data

1. Go to P&L Statement page (`/admin/budget`)
2. Click **"Sync from QuickBooks"** button
3. This single button syncs everything in order:
   - Accounts (chart of accounts)
   - Items (products/services with income account mappings)
   - Transactions (purchases, bills, invoices, sales receipts, journal entries)
4. Progress is shown during sync ("Syncing accounts...", "Syncing items...", etc.)
5. Summary shows counts when complete

### After Changing Chart of Accounts in QBO

Just click "Sync from QuickBooks" - the P&L will reflect new names and hierarchy because matching is by stable `account_id`, not names.

### Full Refresh (if needed)

If data is corrupted or you want a clean slate:
```sql
TRUNCATE TABLE qb_expense;
TRUNCATE TABLE qb_item;
```
Then click "Sync from QuickBooks".

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
  quickbooks-sync-items/       # Items sync (for income mapping)
  quickbooks-sync-expenses/    # Transaction sync (all types)
  quickbooks-update-expense/   # Recategorization
  quickbooks-reconcile/        # Payment reconciliation
  quickbooks-create-invoice/   # Invoice push

supabase/migrations/
  20251208_create_quickbooks_tables.sql
  20251231_add_expense_recategorization.sql
  20251231_add_qb_item_table.sql
```

---

## Session History

### December 31, 2025

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

### January 1, 2026

7. **Added income transaction syncing**
   - Added Invoice, SalesReceipt, and JournalEntry sync to `quickbooks-sync-expenses`
   - Invoices store Item ID (not Account ID) - requires Items sync for proper mapping

8. **Added Items sync for income account mapping**
   - Created `qb_item` table to store Items with their income account references
   - Created `quickbooks-sync-items` Edge Function
   - Updated P&L display to look up Items and map to correct Income accounts

9. **Consolidated sync buttons**
   - Replaced 3 separate buttons with single "Sync from QuickBooks"
   - Syncs accounts, items, and transactions in sequence
   - Shows progress during sync

10. **Improved transaction display**
    - Removed 15-transaction limit
    - Added scrollable container (max-height 384px) for long lists
    - Sticky header stays visible while scrolling
    - Shows total transaction count

---

## TODO / Known Issues

**Pending: Run `qb_item` table migration**

The `qb_item` table needs to be created in the database. Run this SQL in Supabase Dashboard > SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS qb_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qb_item_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    fully_qualified_name TEXT,
    item_type TEXT,
    active BOOLEAN DEFAULT true,
    income_account_id TEXT,
    income_account_name TEXT,
    expense_account_id TEXT,
    expense_account_name TEXT,
    description TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qb_item_income_account_idx ON qb_item (income_account_id);
CREATE INDEX IF NOT EXISTS qb_item_active_idx ON qb_item (active) WHERE active = true;

GRANT ALL ON qb_item TO service_role;
GRANT SELECT ON qb_item TO authenticated;
```

**Testing needed:**
- Verify invoice income appears under correct Income accounts after Items sync
- Verify Commission Income and other income accounts show correct totals
