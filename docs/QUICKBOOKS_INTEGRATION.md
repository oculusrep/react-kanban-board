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
| `qb_commission_mapping` | Configuration for broker/referral commission payments |
| `qb_commission_entry` | Tracks QBO entries created for commission payments |

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
| `quickbooks-sync-invoice` | Create/link invoices in QBO from OVIS payments |
| `quickbooks-update-invoice` | Update invoice fields (e.g., DueDate) in QBO |
| `quickbooks-list-accounts` | Fetch QBO accounts and vendors for commission mapping UI |
| `quickbooks-create-commission-entry` | Create Bills/Journal Entries for broker payments |
| `quickbooks-create-referral-entry` | Create Bills for referral fee payments |

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

### January 5, 2026

11. **Fixed Invoice Sync "Payment not found" error**
    - **Root cause**: The `client` table in the database doesn't have an `email` column, but the Edge Function query was trying to select `client.email`
    - **Error message**: `column client_2.email does not exist`
    - Removed `email` from the client join in `quickbooks-sync-invoice`
    - Changed all `client.email` fallbacks to use only `deal.bill_to_email`
    - Files modified: `supabase/functions/quickbooks-sync-invoice/index.ts`

12. **Added Due Date sync from OVIS to QuickBooks**
    - Created `getInvoice()` and `updateInvoice()` functions in shared `quickbooks.ts`
    - Created new Edge Function `quickbooks-update-invoice` for updating invoice due dates
    - When `payment_date_estimated` is changed on a payment linked to QBO, the due date automatically syncs
    - Uses QBO's sparse update with SyncToken for optimistic locking
    - Files created: `supabase/functions/quickbooks-update-invoice/index.ts`
    - Files modified: `supabase/functions/_shared/quickbooks.ts`, `src/components/payments/PaymentDashboardTable.tsx`

**Field Mapping (OVIS → QuickBooks):**
| OVIS Field | QBO Invoice Field | Notes |
|------------|------------------|-------|
| `payment_date_estimated` | `DueDate` | Auto-syncs when changed on linked payments |
| `payment_invoice_date` | `TxnDate` | Set when creating new invoice |
| `orep_invoice` | `DocNumber` | Used to match/link existing QBO invoices |

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

---

### January 6, 2026

13. **Added broker names to QBO invoices**
    - Invoice line items now include a second line showing broker name(s)
    - Broker line is description-only with $0 amount
    - Format: `Broker(s): Mike Minihan and Arty Santos`
    - Maps short deal_team labels to full broker names:
      - `'Mike'` → `'Mike Minihan'`
      - `'Arty'` → `'Arty Santos'`
      - `'Greg'` → `'Greg Bennett'`
      - `'Mike & Arty'` → `'Mike Minihan and Arty Santos'`
      - etc.
    - Required separate query for deal_team (no FK constraint between deal and deal_team tables)

14. **Fixed forceResync overwriting invoice details**
    - **Root cause**: The `forceResync` code path (used when re-syncing existing invoices) was using OLD logic that didn't include all the new features added to the create invoice path
    - **Symptoms**: Clicking "Resync" would remove: broker names, payment terms, bill-to formatting, CC/BCC emails, proper dates
    - **Fix**: Synchronized the forceResync code block (lines ~175-331) with all create invoice features:
      - Broker line with full names mapping
      - `SalesTermRef: { value: '1', name: 'Due on receipt' }`
      - Bill-to address format: Line1=Contact Name, Line2=Company Name, Line3=Street Address
      - CC/BCC email support (`BillEmailCc`, `BillEmailBcc`)
      - `TxnDate` = `payment_date_estimated` (not `payment_invoice_date`)
      - `ServiceDate` from `contract_signed_date`
      - Full description with payment name
    - Files modified: `supabase/functions/quickbooks-sync-invoice/index.ts`

15. **Standardized invoice field mappings**

| OVIS Field | QBO Invoice Field | Notes |
|------------|------------------|-------|
| `payment_date_estimated` | `TxnDate` | Invoice date |
| `payment_date_estimated` | `DueDate` | Due date |
| `deal.contract_signed_date` | `Line[].SalesItemLineDetail.ServiceDate` | Service date on line items |
| `deal.bill_to_contact_name` | `BillAddr.Line1` | Contact name |
| `deal.bill_to_company_name` | `BillAddr.Line2` | Company name |
| `deal.bill_to_address_street` | `BillAddr.Line3` | Street address |
| `deal.bill_to_email` | `BillEmail.Address` | Primary invoice email |
| `deal.bill_to_cc_emails` | `BillEmailCc.Address` | CC email (first in comma-separated list) |
| `deal_team.label` | Line description | `Broker(s): Full Name(s)` |
| (hardcoded) | `SalesTermRef` | `{ value: '1', name: 'Due on receipt' }` |

16. **Two code paths now synchronized**
    - **Create Invoice** (new payments): Creates invoice with all features
    - **Force Resync** (existing invoices): Full entity update with `sparse: false`, includes all same features
    - Both paths now produce identical invoices in QuickBooks

17. **Invoice date now syncs with due date**
    - When `payment_date_estimated` is changed on a synced invoice, both `TxnDate` (invoice date) and `DueDate` are updated to the same value
    - Files modified: `supabase/functions/quickbooks-update-invoice/index.ts`, `supabase/functions/_shared/quickbooks.ts`

18. **Broker line changed to DescriptionOnly type**
    - Broker line (line 2) now uses QBO's `DescriptionOnly` detail type instead of `SalesItemLineDetail`
    - Result: No product/service, service date, qty, rate, or amount columns on line 2
    - Only shows the description text: `Broker(s): Full Name(s)`
    - Updated `QBInvoiceLine` interface to support both `SalesItemLineDetail` and `DescriptionOnly` types
    - Files modified: `supabase/functions/quickbooks-sync-invoice/index.ts`, `supabase/functions/_shared/quickbooks.ts`

19. **Automatic invoice attachments from Dropbox**
    - Three standard documents are automatically downloaded from Dropbox and attached to every new invoice in QuickBooks:
      1. `W9-Oculus REP - CURRENT.pdf`
      2. `OCULUS WIRING INSTRUCTIONS.PDF`
      3. `ACH_eCHECK INSTRUCTIONS.PDF`
    - Attachments are marked with `IncludeOnSend: true` so they are included when sending the invoice via QBO email
    - Files are stored in Dropbox at `/Salesforce Documents/Invoice Attachments/`
    - Dropbox access token auto-refreshes using OAuth refresh token flow
    - If attachment download/upload fails, invoice creation still succeeds (graceful degradation)
    - Files created: `supabase/functions/_shared/dropbox.ts`
    - Files modified: `supabase/functions/quickbooks-sync-invoice/index.ts`, `supabase/functions/_shared/quickbooks.ts` (added `uploadAttachment()`)

**Required Supabase secrets for Dropbox:**
```
DROPBOX_ACCESS_TOKEN=your_access_token
DROPBOX_REFRESH_TOKEN=your_refresh_token
DROPBOX_APP_KEY=your_app_key
DROPBOX_APP_SECRET=your_app_secret
```

---

### January 9, 2026

20. **CFO Agent schema migration applied**
    - Added AI-native financial data schema to support future CFO Agent
    - New tables: `financial_snapshot`, `ai_financial_context`, `ai_financial_queries`
    - Enhanced `qb_expense` with: `is_recurring`, `recurring_pattern`, `anomaly_score`, `ai_parsed_memo`
    - Enhanced `qb_account` with: `budget_monthly`, `budget_annual`, `alert_threshold_pct`, `budget_notes`
    - Created views: `invoice_aging`, `budget_vs_actual`
    - See [CFO_AGENT_SPEC.md](./CFO_AGENT_SPEC.md) for full details

**Next Steps:**
- Verify P&L expense sync from QBO is working correctly
- Test expense recategorization sync back to QBO (OVIS as source of truth)
- Review and recategorize all 2025 expenses
- Set up budgets by expense account

---

### January 14, 2026

21. **Added Cash/Accrual Basis Toggle to P&L Statement**
    - New toggle in the date filter bar to switch between Accrual (default) and Cash basis
    - Both OVIS local filtering and QBO P&L Report API calls respect the selected basis
    - Files modified:
      - `src/pages/BudgetDashboardPage.tsx` - Added `accountingBasis` state, toggle UI, updated `fetchPayrollData()` to pass `accountingMethod`
      - `supabase/functions/quickbooks-sync-pl-report/index.ts` - Added `accountingMethod` parameter, passes to QBO Reports API

22. **Added Bill/Invoice Payment Status Tracking**
    - **Purpose**: Accurate Cash basis reporting requires knowing which Bills are paid (expenses incurred) and which Invoices are collected (income received)
    - **New database columns** on `qb_expense`:
      - `is_paid` (BOOLEAN) - `true` = paid, `false` = unpaid, `null` = immediate payment type (Purchase/SalesReceipt)
      - `payment_date` (DATE) - Date payment was received/made (for future Cash basis by payment date)
      - `balance` (NUMERIC) - Remaining balance from QBO (0 = fully paid)
    - **Sync logic**: QBO Bills and Invoices have a `Balance` field - if `Balance === 0`, the transaction is paid
    - **Cash basis filter**: Excludes Bills/Invoices where `is_paid === false`
    - **UI indicator**: Unpaid transactions show with yellow highlight and "(Unpaid)" label
    - Files modified:
      - `supabase/functions/quickbooks-sync-expenses/index.ts` - Added `Balance` to QBBill/QBInvoice interfaces, set `is_paid` and `balance` on upsert
      - `src/pages/BudgetDashboardPage.tsx` - Added payment tracking interface fields, Cash basis filtering logic, unpaid visual indicator
    - Migration created: `supabase/migrations/20260114_add_bill_payment_tracking.sql`

**Migration SQL (run in Supabase Dashboard):**
```sql
-- Add payment tracking columns to qb_expense for accurate Cash basis reporting
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT NULL;
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS payment_date DATE DEFAULT NULL;
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS balance NUMERIC(12, 2) DEFAULT NULL;

-- Index for filtering by payment status
CREATE INDEX IF NOT EXISTS qb_expense_is_paid_idx ON qb_expense (is_paid) WHERE is_paid = false;
CREATE INDEX IF NOT EXISTS qb_expense_payment_date_idx ON qb_expense (payment_date) WHERE payment_date IS NOT NULL;

COMMENT ON COLUMN qb_expense.is_paid IS 'Payment status: true=paid, false=unpaid, null=immediate payment (Purchase/SalesReceipt)';
COMMENT ON COLUMN qb_expense.payment_date IS 'Date payment was received/made (for Cash basis reporting)';
COMMENT ON COLUMN qb_expense.balance IS 'Remaining balance (0 = fully paid)';
```

23. **Fixed Cash Basis Income Not Showing**
    - **Problem**: Income was not displaying on Cash P&L because the filter was excluding Invoices with `is_paid = null` (not yet synced with payment status)
    - **Solution**: Changed filter to only exclude when `is_paid === false` (explicitly unpaid), include when `is_paid` is null/undefined (not synced yet)
    - This is a graceful fallback until the migration is run and data is re-synced
    - File modified: `src/pages/BudgetDashboardPage.tsx`

**Cash vs Accrual Basis - How It Works:**

| Basis | Income Recognized | Expenses Recognized |
|-------|-------------------|---------------------|
| **Accrual** | When invoiced (Invoice date) | When billed (Bill date) |
| **Cash** | When collected (Invoice paid) | When paid (Bill paid) |

**Transaction Type Behavior:**
| Transaction Type | `is_paid` Value | Cash Basis Behavior |
|------------------|-----------------|---------------------|
| Purchase | `null` | Always included (immediate payment) |
| SalesReceipt | `null` | Always included (immediate payment) |
| Bill | `true`/`false` | Included only if `is_paid = true` |
| Invoice | `true`/`false` | Included only if `is_paid = true` |

**To Enable Full Cash Basis Accuracy:**
1. Run the migration SQL above in Supabase Dashboard
2. Re-sync from QuickBooks on the P&L page
3. The sync will populate `is_paid` and `balance` for all Bills/Invoices
4. Cash basis will then accurately exclude unpaid transactions

---

---

## Commission Payment Mapping (January 29, 2026)

### Overview

When broker or referral commission payments are marked as paid in OVIS, the system can automatically create corresponding entries in QuickBooks:

| Entity | Payment Method | QBO Object Created |
|--------|---------------|-------------------|
| **Arty** | Journal Entry | Debit: Commission Paid Out expense / Credit: Commission Draw asset |
| **Greg** | Bill | Creates Accounts Payable to vendor Bennett Retail Group |
| **Referral Partners** | Bill | Creates Accounts Payable to the referral partner vendor |

### Database Tables

#### `qb_commission_mapping`

Stores configuration for how each broker/referral partner's payments are recorded in QBO.

| Column | Type | Description |
|--------|------|-------------|
| `entity_type` | TEXT | `'broker'` or `'referral_partner'` |
| `broker_id` | UUID | FK to `broker` table (for brokers) |
| `client_id` | UUID | FK to `client` table (for referral partners) |
| `payment_method` | TEXT | `'bill'` or `'journal_entry'` |
| `qb_vendor_id` | TEXT | QBO Vendor ID (required for bills) |
| `qb_vendor_name` | TEXT | QBO Vendor display name |
| `qb_debit_account_id` | TEXT | QBO Account ID for expense/COGS |
| `qb_debit_account_name` | TEXT | Account name (e.g., "Commissions Paid Out:Bennett Retail Group") |
| `qb_credit_account_id` | TEXT | QBO Account ID for credit (journal entries only) |
| `qb_credit_account_name` | TEXT | Credit account name (e.g., "Santos Real Estate Commission Draw") |
| `description_template` | TEXT | Template with placeholders: `{deal_name}`, `{payment_name}`, `{broker_name}`, `{payment_date}` |
| `is_active` | BOOLEAN | Whether this mapping is active |

#### `qb_commission_entry`

Tracks QBO entries created for commission payments.

| Column | Type | Description |
|--------|------|-------------|
| `payment_split_id` | UUID | FK to `payment_split` (the trigger) |
| `commission_mapping_id` | UUID | FK to the mapping used |
| `qb_entity_type` | TEXT | `'Bill'` or `'JournalEntry'` |
| `qb_entity_id` | TEXT | QBO entity ID |
| `qb_doc_number` | TEXT | QBO document number |
| `amount` | NUMERIC | Payment amount |
| `transaction_date` | DATE | Date of the QBO entry |
| `status` | TEXT | `'created'`, `'paid'`, `'voided'`, `'error'` |

#### Additional Columns

- **`broker.qb_vendor_id`** / **`broker.qb_vendor_name`** - Links broker to QBO Vendor
- **`client.qb_vendor_id`** / **`client.qb_vendor_name`** - Links referral partner to QBO Vendor

### Edge Functions

| Function | Purpose |
|----------|---------|
| `quickbooks-list-accounts` | Fetches all QBO accounts and vendors for dropdown selection |
| `quickbooks-create-commission-entry` | Creates Bill or Journal Entry for broker payment splits |
| `quickbooks-create-referral-entry` | Creates Bill for referral fee payments |

### Shared Utilities Added to `_shared/quickbooks.ts`

```typescript
// Vendor operations
findOrCreateVendor(connection, vendorName, options?)
getVendor(connection, vendorId)

// Bill operations
createBill(connection, bill)
getBill(connection, billId)
deleteBill(connection, billId, syncToken)

// Journal Entry operations
createJournalEntry(connection, journalEntry)
getJournalEntry(connection, journalEntryId)
deleteJournalEntry(connection, journalEntryId, syncToken)

// Account lookup
findAccountByName(connection, accountName)
findAccountByFullName(connection, fullName)
listAccountsByType(connection, accountType)
```

### Admin UI

The **Commission Payment Mappings** section is on the QuickBooks Integration page (`/admin/quickbooks`).

**Features:**
- View all configured mappings in a table
- Add new mappings for brokers or referral partners
- Edit existing mappings
- Delete mappings
- **"Refresh QBO Data"** button loads accounts and vendors from QuickBooks for dropdown selection

**Form Fields:**
1. **Entity Type**: Broker or Referral Partner
2. **Broker/Partner**: Dropdown of available entities
3. **Payment Method**: Bill (Accounts Payable) or Journal Entry (Commission Draw)
4. **QBO Vendor**: Required for Bills - dropdown of QBO vendors
5. **Debit Account**: Expense account (dropdown of Expense/COGS accounts)
6. **Credit Account**: Required for Journal Entries (dropdown of Asset accounts)
7. **Description Template**: Text with placeholders

### Setup Instructions

1. **Run the migration** (creates tables and columns):
   ```sql
   -- Already applied: 20260129_qb_commission_mapping.sql
   ```

2. **Deploy Edge Functions**:
   ```bash
   supabase functions deploy quickbooks-list-accounts --project-ref YOUR_PROJECT_REF
   supabase functions deploy quickbooks-create-commission-entry --project-ref YOUR_PROJECT_REF
   supabase functions deploy quickbooks-create-referral-entry --project-ref YOUR_PROJECT_REF
   ```

3. **Configure Mappings** (in OVIS):
   - Go to **QuickBooks Integration** page
   - Click **"Refresh QBO Data"** to load accounts and vendors
   - Click **"Add Mapping"** for each broker/referral partner

**Example Configurations:**

| Entity | Type | Method | Vendor | Debit Account | Credit Account |
|--------|------|--------|--------|---------------|----------------|
| Arty Santos | Broker | Journal Entry | - | Commission Paid Out: Santos Real Estate Partners, LLC | Santos Real Estate Commission Draw |
| Greg Bennett | Broker | Bill | Bennett Retail Group | Commissions Paid Out: Bennett Retail Group | - |
| (Default Referral) | Referral Partner | Bill | (per partner) | Commissions Paid Out: Referral Fee to Other Broker | - |

### Referral Partner Setup

1. **Mark client as Referral Partner**:
   - Go to the Client record
   - Set **Client Type** = "Referral Partner"
   - This makes them appear in the Referral Payee dropdown on deals

2. **Create QBO mapping**:
   - On QuickBooks Integration page, add a mapping
   - Entity Type = "Referral Partner"
   - Select the client from dropdown
   - Configure the Bill settings

3. **Link to deal**:
   - On the deal's Commission tab, select the Referral Payee
   - Only clients with type "Referral Partner" appear in the dropdown

### Files Created/Modified

```
src/components/
  admin/CommissionMappingAdmin.tsx    # Admin UI component
  ReferralPayeeAutocomplete.tsx       # Updated to filter by Referral Partner type
  ClientOverviewTab.tsx               # Added "Referral Partner" to client types

src/pages/
  QuickBooksAdminPage.tsx             # Added CommissionMappingAdmin section

supabase/functions/
  _shared/quickbooks.ts               # Added vendor, bill, journal entry utilities
  quickbooks-list-accounts/           # New: Lists QBO accounts and vendors
  quickbooks-create-commission-entry/ # New: Creates Bill/JE for broker payments
  quickbooks-create-referral-entry/   # New: Creates Bill for referral fees

supabase/migrations/
  20260129_qb_commission_mapping.sql  # Tables and columns
```

---

## Edge Function Deployment Commands

After making changes to Edge Functions, deploy with:

```bash
# P&L Report (for Cash/Accrual toggle)
npx supabase functions deploy quickbooks-sync-pl-report --no-verify-jwt

# Expense Sync (for payment status tracking)
npx supabase functions deploy quickbooks-sync-expenses --no-verify-jwt

# Commission Mapping (for broker/referral payments)
supabase functions deploy quickbooks-list-accounts --project-ref YOUR_PROJECT_REF
supabase functions deploy quickbooks-create-commission-entry --project-ref YOUR_PROJECT_REF
supabase functions deploy quickbooks-create-referral-entry --project-ref YOUR_PROJECT_REF
```
