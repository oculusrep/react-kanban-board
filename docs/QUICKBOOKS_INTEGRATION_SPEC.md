# QuickBooks Online Integration Specification

**Document Created:** December 5, 2025
**Last Updated:** December 30, 2025
**Status:** Blocked - Awaiting Intuit Production Approval
**Last Step Completed:** Invoice sync working in sandbox; Production questionnaire submitted but rejected

---

## Overview

This document outlines the specifications for integrating OVIS (the React Kanban Board CRM) with QuickBooks Online (QBO). The integration enables two-way syncing between OVIS's payments module and QBO's accounting system.

---

## Tech Stack Context

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Supabase (PostgreSQL + Edge Functions)
- **Existing Integrations:** Dropbox, Google Maps, Salesforce, Resend Email
- **Existing QBO Fields:** `qb_invoice_id` and `qb_payment_id` already exist in the payment schema

---

## Integration Scope

### OVIS → QuickBooks (Outbound)

| Feature | Trigger | Timing |
|---------|---------|--------|
| Create Invoice | Invoice created in OVIS | Scheduled or real-time |
| Update Invoice | Invoice modified in OVIS | Real-time (automatic) |
| Send Invoice | User clicks "Send Invoice" button | Real-time (updates `date_sent` in OVIS) |
| Update Due Date | Estimated Payment Date changes in OVIS | Real-time (automatic) |
| Record Payment | Payment marked as received in OVIS | Real-time (automatic) |
| Create Customer | New client added | On first invoice creation |
| Create Vendor | New broker or referral source added | On first bill creation |
| Create Bill | Referral fee or broker payout due | When disbursement is created |

### QuickBooks → OVIS (Inbound)

| Feature | Trigger | Timing |
|---------|---------|--------|
| Import Expenses | Initial setup | One-time import of all 2025 expenses |
| Sync Expenses | Ongoing | Weekly background sync + manual refresh button |
| Expense Detail Level | Full transaction details | Individual transactions with date, vendor, memo, category |

---

## Data Mapping

### Invoices (Receivables)

| OVIS Field | QBO Field | Notes |
|------------|-----------|-------|
| Client | Customer | The company/entity |
| Deal | Customer Reference | One customer can have multiple deals |
| Bill To (Deal level) | Bill To Address | Different from Client address |
| Payment Amount | Invoice Line Amount | — |
| Estimated Payment Date | Due Date | Auto-syncs when changed |
| Date Sent | Email Sent Date | Updated when "Send Invoice" clicked |
| Property Address | Custom field or memo | Optional reference |

### Bill To Fields (NEW - at Deal Level)

These fields need to be added to the Deal entity:

- `bill_to_contact_name` - Contact person for invoice
- `bill_to_company_name` - Company name (if different from Client)
- `bill_to_email` - Email address for invoice delivery
- `bill_to_address_street` - Street address
- `bill_to_address_city` - City
- `bill_to_address_state` - State
- `bill_to_address_zip` - ZIP code
- `bill_to_phone` - Phone number

### Products/Services

| OVIS Service | QBO Product/Service | Usage |
|--------------|---------------------|-------|
| Brokerage Fee | "Brokerage Fee" | Primary - used on most invoices |
| Consulting Fee | "Consulting Fee" | Occasional |

### Vendors (Payables)

| OVIS Entity | QBO Vendor Type | Purpose |
|-------------|-----------------|---------|
| Broker | Vendor | Commission payouts |
| Referral Source | Vendor | Referral fee payments |

### Expenses (Inbound)

| QBO Field | OVIS Field | Notes |
|-----------|------------|-------|
| Account (Chart of Accounts) | Category | Use QBO categories as-is |
| Date | Transaction Date | — |
| Vendor | Vendor Name | — |
| Memo/Description | Description | — |
| Amount | Amount | — |
| Full transaction details | Stored for drill-down | Enables detailed budget tracking |

---

## Permissions & Access Control

### QuickBooks Connection Management
- **Admin only** — Initial setup, reconnect, manage connection settings

### Send Invoice Button
- Admin
- Broker (Full Access)
- Broker (Lite)
- *(VA role may be added later)*

### Expenses Sync (Trigger Pull)
- **Admin only**

### Budget & P&L Module (View/Edit)
- **Admin only**

---

## Authentication

- **Method:** OAuth 2.0
- **Access Token:** Expires every hour (auto-refreshed by OVIS)
- **Refresh Token:** Valid for 100 days if unused
- **User Experience:** One-time authorization, stays connected indefinitely with regular use
- **Connection Type:** Single company-wide connection to QBO

---

## Error Handling & Notifications

### Sync Failure Notifications
- **In-app notification:** Banner or badge showing sync errors
- **Email alert:** Sent to admin when sync fails

### Admin Sync Status Page
- View history of all syncs
- See what succeeded and what failed
- Retry failed items
- View detailed error messages

---

## New Modules to Build

### 1. Budget & P&L Module
- Admin-only access
- Display expenses by QBO Chart of Accounts categories
- Support drill-down into individual transactions
- P&L report generation from QBO data

### 2. QuickBooks Settings/Admin Page
- Connect/Disconnect QuickBooks button
- Connection status indicator
- Sync status history
- Manual sync triggers (Expenses refresh)
- Error log viewer
- Retry failed sync items

---

## Invoice Lifecycle Flow

```
1. Invoice Created in OVIS
   └── Syncs to QBO (scheduled or real-time)

2. User clicks "Send Invoice" button
   └── Triggers QBO to email invoice immediately
   └── Updates date_sent field in OVIS

3. Estimated Payment Date changes in OVIS
   └── Auto-updates Due Date in QBO

4. Payment marked as received in OVIS
   └── Records payment in QBO against the invoice
```

---

## Expense Sync Flow

```
1. Initial Setup
   └── Import all 2025 expenses from QBO

2. Ongoing Sync
   └── Weekly background sync (automatic)
   └── Manual "Refresh Expenses" button (on-demand)

3. Data Storage
   └── Full transaction details stored in OVIS
   └── Categorized by QBO Chart of Accounts
```

---

## Developer Setup Status

### Completed
- [x] Intuit Developer account created
- [x] App created in Intuit Developer Portal (name: "OVIS" or similar)
- [x] Scope selected: Accounting
- [x] Sandbox company created
- [x] Client ID and Client Secret retrieved
- [x] Credentials stored in Supabase secrets
- [x] Database tables created (qb_connection, qb_sync_log, qb_expense)
- [x] OAuth Edge Functions created (quickbooks-connect, quickbooks-callback)
- [x] bill_to fields added to deal table
- [x] qb_invoice_number field added to payment table

### Credentials Obtained
- [x] Client ID — Stored in Supabase secrets
- [x] Client Secret — Stored in Supabase secrets

### Next Steps
1. **Configure OAuth redirect URI in Intuit Developer Portal:**
   ```
   https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/quickbooks-callback
   ```
2. Deploy Edge Functions to Supabase
3. Build frontend QuickBooks settings/admin page
4. Implement invoice sync logic (Edge Function)
5. Build "Send Invoice" button functionality
6. Implement expense import and sync
7. Create Budget & P&L Module UI
8. Build admin sync status page
9. Add error handling and notifications

---

## Environment Variables Needed

```
QUICKBOOKS_CLIENT_ID=<from Intuit Developer Portal>
QUICKBOOKS_CLIENT_SECRET=<from Intuit Developer Portal>
QUICKBOOKS_ENVIRONMENT=sandbox  # Change to 'production' when ready
FRONTEND_URL=https://ovis.oculusrep.com  # For OAuth callback redirects
```

### OAuth Redirect URI

Configure this in Intuit Developer Portal under your app's settings:

```
https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/quickbooks-callback
```

---

## Database Tables to Create

### `qb_connection`
Stores the OAuth tokens and connection status.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| realm_id | text | QBO Company ID |
| access_token | text | Encrypted |
| refresh_token | text | Encrypted |
| access_token_expires_at | timestamp | — |
| refresh_token_expires_at | timestamp | — |
| connected_by | uuid | FK to user |
| connected_at | timestamp | — |
| last_sync_at | timestamp | — |
| status | text | 'connected', 'expired', 'error' |

### `qb_sync_log`
Tracks sync history for admin visibility.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| sync_type | text | 'invoice', 'payment', 'expense', 'customer', 'vendor', 'bill' |
| direction | text | 'inbound', 'outbound' |
| status | text | 'success', 'failed', 'pending' |
| entity_id | uuid | FK to the OVIS entity |
| qb_entity_id | text | QBO entity ID |
| error_message | text | Null if successful |
| created_at | timestamp | — |
| retry_count | int | Number of retry attempts |

### `qb_expense`
Stores imported expenses from QBO.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| qb_transaction_id | text | QBO transaction ID |
| transaction_date | date | — |
| vendor_name | text | — |
| category | text | QBO Chart of Accounts category |
| description | text | Memo/description |
| amount | numeric | — |
| account_id | text | QBO account ID |
| imported_at | timestamp | — |

---

## Questions Resolved

1. **Developer account:** Created (had production account, now has developer account)
2. **Tech stack:** React 18 + TypeScript + Supabase
3. **Sync scope:** Full two-way integration
4. **Expense granularity:** Individual transactions (Option B)
5. **Invoice sync timing:** Scheduled or real-time for creation; real-time for send/updates
6. **Expense sync timing:** Weekly background + manual trigger; initial import of 2025
7. **Customer mapping:** Client = Customer; Deal for reference
8. **Bill To location:** Deal level (not Client level)
9. **Bill To fields:** Full set (name, company, email, address, phone)
10. **Products/Services:** "Brokerage Fee" (primary) + "Consulting Fee" (occasional)
11. **Expense categories:** Use QBO Chart of Accounts as-is (Option A)
12. **Connection management:** Admin only
13. **Send Invoice permissions:** Admin, Broker (Full Access), Broker (Lite)
14. **Expense/P&L permissions:** Admin only
15. **Error notifications:** In-app + email alerts; admin sync status page

---

## Current Status (December 30, 2025)

### What's Working (Sandbox)
- ✅ OAuth flow complete (connect/callback Edge Functions deployed)
- ✅ QuickBooks settings page in Admin section
- ✅ Invoice creation via `quickbooks-sync-invoice` Edge Function
- ✅ Invoice linking (matches `orep_invoice` to existing QBO invoices by DocNumber)
- ✅ QB sync button in Payment Dashboard table
- ✅ QB sync status display (green checkmark when synced)
- ✅ Customer auto-creation in QBO
- ✅ Service item auto-creation ("Brokerage Fee")

### Production Migration - BLOCKED

**Issue:** Intuit Developer Portal compliance questionnaire rejected the app.

**Root Cause:** The questionnaire forces apps that "create invoices" into the "Payments/Money Movement" regulated industry pathway, which requires payment processing compliance. OVIS only creates invoice **documents** using the Accounting API - it does not process payments.

**Action Taken:** Submitted clarification email to Intuit Developer Support (Reference: Q-063543) explaining:
- OVIS only uses the Accounting API (not Payments API)
- Invoice documents are created for bookkeeping only
- Actual payments are received via wire/check outside the application
- Requested guidance on correct compliance pathway

**Timeline:** Intuit gave 1 week to respond (email sent December 30, 2025)

### Next Steps (After Intuit Responds)
1. If approved: Update Supabase secrets with production Client ID/Secret
2. Clear sandbox connection from `qb_connection` table
3. Re-authorize OVIS to connect to production QBO
4. Test invoice linking with production data

---

## Resume Point

**Where we left off:** Production migration blocked pending Intuit response.

**When Intuit approves:**
1. Get production credentials from Intuit Developer Portal
2. Update secrets: `supabase secrets set QUICKBOOKS_CLIENT_ID=<prod_id>` and `QUICKBOOKS_CLIENT_SECRET=<prod_secret>`
3. Set environment: `supabase secrets set QUICKBOOKS_ENVIRONMENT=production`
4. Clear sandbox connection and re-authorize

---

## Sandbox to Production Migration Plan

### Key Differences: Sandbox vs Production

| Aspect | Sandbox | Production |
|--------|---------|------------|
| API Base URL | `sandbox-quickbooks.api.intuit.com` | `quickbooks.api.intuit.com` |
| Data | Test/fake data | Real company data |
| Rate Limits | More lenient | Stricter (10 requests/sec per realm) |
| OAuth Token | Same process | Same process |
| Realm ID | Sandbox company ID | Real company ID |
| Customers/Invoices | Test entities | Real invoices sent to real customers |

### Pre-Production Checklist

#### 1. Intuit Developer Portal Configuration

- [ ] **Get Production Keys**: In your Intuit Developer app, ensure you have production credentials (not just sandbox)
- [ ] **Add Production Redirect URI**: Same callback URL works, but verify it's approved for production
- [ ] **App Review (if required)**: Check if Intuit requires app review for production use. For internal-use apps (only your company uses it), this is typically not required
- [ ] **Verify Scopes**: `com.intuit.quickbooks.accounting` scope is approved for production

#### 2. QuickBooks Online Setup (Your Real QBO Account)

Before syncing invoices, ensure these are configured in your production QBO:

- [ ] **Create Income Account**:
  - Navigate to Settings > Chart of Accounts
  - Create or identify the income account for "Brokerage Fee" revenue (e.g., "Service Income" or "Consulting Income")
  - Note the account ID for use in the `findOrCreateServiceItem` function

- [ ] **Create "Brokerage Fee" Service Item**:
  - Navigate to Sales > Products and Services
  - Create a service item named "Brokerage Fee"
  - Link it to your income account
  - (Or let the system auto-create it on first invoice sync)

- [ ] **Create "Consulting Fee" Service Item** (optional):
  - Same process for any secondary service types

- [ ] **Verify Email Settings**:
  - Settings > Account and Settings > Sales > Online delivery
  - Ensure invoice emails are configured with your branding
  - Set "Email me a copy" if you want notifications

- [ ] **Invoice Template**:
  - Customize your invoice template with logo, colors, terms
  - Settings > Custom Form Styles

#### 3. Environment Variable Updates

Update Supabase secrets for production:

```bash
# Set production environment
supabase secrets set QUICKBOOKS_ENVIRONMENT=production

# If you have separate production credentials (check Intuit portal)
supabase secrets set QUICKBOOKS_CLIENT_ID=<production_client_id>
supabase secrets set QUICKBOOKS_CLIENT_SECRET=<production_client_secret>
```

**Important**: The OAuth process will connect to your REAL QuickBooks company. The `realm_id` stored will be your production company ID.

#### 4. Database Preparation

- [ ] **Clear Sandbox Connection**: Before switching, remove any sandbox connection data:
  ```sql
  -- View current connections (to see what environment you're connected to)
  SELECT realm_id, status, connected_at FROM qb_connection;

  -- If switching from sandbox to production, you'll need to re-authorize
  -- The old sandbox realm_id won't work with production
  ```

- [ ] **Existing Payment Records**: If payments have `qb_invoice_id` from sandbox testing, decide whether to:
  - Clear them: `UPDATE payment SET qb_invoice_id = NULL, qb_invoice_number = NULL WHERE qb_invoice_id IS NOT NULL;`
  - Or leave them (they won't conflict, just won't link to real invoices)

#### 5. Code Changes Required

**None required** - The code is already production-ready:

- `quickbooks.ts` line 165-166: `getQBApiUrl()` uses `QUICKBOOKS_ENVIRONMENT` to determine URL
- `quickbooks-connect/index.ts` line 108: Auth URL is the same for sandbox and production
- Token refresh, invoice creation, and all API calls work identically

#### 6. Post-Switch Testing

After switching to production:

1. **Test OAuth Flow**:
   - Go to Admin > QuickBooks settings
   - Click "Connect to QuickBooks"
   - Authorize with your real QBO account
   - Verify `qb_connection` table shows your production `realm_id`

2. **Test Invoice Sync (Carefully!)**:
   - Create a test payment in OVIS for a real or test client
   - Sync to QuickBooks WITHOUT sending email first
   - Verify invoice appears correctly in QBO
   - Check amounts, customer name, service item, due date

3. **Test Invoice Send**:
   - Once invoice looks correct, test sending to your own email first
   - Update `bill_to_email` to your email address temporarily
   - Verify email delivery and formatting

### Recommended Production Launch Sequence

1. **Week -1: Preparation**
   - Create service items in QBO (Brokerage Fee, Consulting Fee)
   - Customize invoice template
   - Verify Chart of Accounts income account

2. **Day 1: Switch Environment**
   - Update `QUICKBOOKS_ENVIRONMENT=production` in Supabase secrets
   - Re-deploy edge functions (if any changes): `supabase functions deploy`
   - Admin reconnects QuickBooks (authorizes production company)

3. **Day 1-2: Validation**
   - Create 2-3 test invoices to real customers (or your own email)
   - Verify all fields sync correctly
   - Test "Send Invoice" functionality

4. **Day 3+: Full Production Use**
   - Begin syncing real invoices
   - Monitor `qb_sync_log` for any errors
   - Set up weekly review of sync status

### Rollback Plan

If issues occur in production:

1. Set `QUICKBOOKS_ENVIRONMENT=sandbox` to revert API calls
2. Invoices created in production QBO remain (they're real records)
3. Clear `qb_invoice_id` on affected payments to allow re-sync after fix

### Handling Existing Invoices

If you already have invoices in QuickBooks with invoice numbers stored in the `payment` table, **you do NOT need to delete and recreate them**. The connector is designed to create new invoices only - it skips any payment that already has `qb_invoice_id` populated.

#### Option A: Leave Existing, Only Sync New (Recommended)

Simply proceed with production. The connector will:
- Skip any payment that already has `qb_invoice_id` populated
- Only create new invoices for payments without a QBO link
- Your historical invoices remain in QuickBooks unchanged

This is the simplest approach if you don't need the "Send Invoice" button to work for historical invoices.

#### Option B: Link Existing Invoices via API

If you want the connector to manage existing invoices (for "Send Invoice" functionality), I can build a reconciliation edge function that:
1. Queries QuickBooks for all invoices by their `DocNumber` (invoice number)
2. Matches them to your payments by `qb_invoice_number`
3. Updates `qb_invoice_id` automatically

This would enable full functionality for historical invoices.

#### Option C: Manual Linking

For each existing invoice, update the payment record manually:

```sql
-- Example: Link a specific payment to its QBO invoice
UPDATE payment
SET qb_invoice_id = '<qbo_invoice_id>',  -- QBO's internal ID (numeric string like "123")
    qb_sync_status = 'synced',
    qb_last_sync = NOW()
WHERE qb_invoice_number = '<your_invoice_number>';
```

Note: `qb_invoice_id` is QuickBooks' internal ID (not the invoice number). You'd need to look these up in QuickBooks via Settings > Audit Log or API.

---

### Rate Limiting Considerations

QuickBooks production API limits:
- **10 requests per second** per realm (company)
- **500 requests per minute** per realm
- Batch operations help stay within limits

Current implementation makes 2-4 API calls per invoice:
1. Query for existing customer
2. Create customer (if new)
3. Query for service item
4. Create invoice
5. (Optional) Send invoice

This is well within limits for normal use. For bulk operations (migrating many invoices), add delays between syncs.

---

## Phase 2: Budget & P&L Module (Future)

This feature will import expenses from QuickBooks and allow budget tracking by Chart of Accounts categories.

### Overview

The Budget & P&L module will:
1. Import all expenses from QuickBooks (initially 2025, then ongoing sync)
2. Display expenses organized by QBO Chart of Accounts categories
3. Allow setting budget targets per category
4. Show budget vs actual comparisons
5. Provide drill-down into individual transactions

### Data Flow

```
QuickBooks Online
    └── Expenses (Purchase transactions)
    └── Chart of Accounts (Categories)
            │
            ▼
    Supabase Edge Function (quickbooks-sync-expenses)
            │
            ▼
    qb_expense table (stores transaction details)
    qb_account table (stores Chart of Accounts)
            │
            ▼
    OVIS Budget Module UI
        ├── Category summaries with budget targets
        ├── Monthly/quarterly/annual views
        └── Transaction drill-down
```

### QBO API Endpoints Needed

1. **Chart of Accounts**: `GET /v3/company/{realmId}/query?query=SELECT * FROM Account WHERE AccountType IN ('Expense', 'Cost of Goods Sold')`
2. **Purchases/Expenses**: `GET /v3/company/{realmId}/query?query=SELECT * FROM Purchase WHERE TxnDate >= '2025-01-01'`
3. **Bills**: `GET /v3/company/{realmId}/query?query=SELECT * FROM Bill WHERE TxnDate >= '2025-01-01'`

### Database Tables (To Be Created)

#### `qb_account` (Chart of Accounts cache)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| qb_account_id | text | QBO Account ID |
| name | text | Account name |
| account_type | text | 'Expense', 'COGS', etc. |
| account_sub_type | text | Sub-classification |
| fully_qualified_name | text | Full hierarchy path |
| active | boolean | Is account active |
| budget_amount | numeric | Monthly budget target (OVIS-only field) |
| last_synced_at | timestamp | — |

#### `qb_expense` (Already defined above, stores individual transactions)

### UI Components (To Be Built)

1. **Budget Dashboard Page** (`/admin/budget`)
   - Summary cards: Total budget, Total spent, Remaining
   - Category breakdown table with progress bars
   - Monthly trend chart

2. **Category Detail View**
   - All transactions for selected category
   - Filterable by date range, vendor
   - Edit budget target

3. **Expense Sync Controls**
   - "Sync Expenses" button (manual trigger)
   - Last sync timestamp
   - Sync status/errors

### Implementation Order

1. Create `qb_account` table and sync Chart of Accounts
2. Build `quickbooks-sync-expenses` Edge Function
3. Initial import of 2025 expenses
4. Create Budget Dashboard page UI
5. Add budget target editing
6. Build category drill-down view
7. Set up weekly background sync (Supabase cron)

### Permissions

- **View Budget/P&L**: Admin only
- **Edit Budget Targets**: Admin only
- **Trigger Expense Sync**: Admin only

---

## Phase 2b: Expense Recategorization (Pending Production)

**Status:** Documented - Build when production access granted

This feature allows users to recategorize expenses in OVIS and sync the changes back to QuickBooks.

### Use Case

When reviewing expenses in the Budget Dashboard, users may notice transactions categorized to the wrong Chart of Accounts category. Instead of switching to QuickBooks to fix it, users can change the category directly in OVIS and have it sync back.

### Technical Requirements

#### SyncToken Tracking

QuickBooks uses optimistic locking via a `SyncToken` field. To update any entity in QBO:
1. You must include the current `SyncToken` value in the update request
2. If someone else modified the record, QBO rejects your update with a "stale object" error
3. You must then re-fetch the entity to get the new `SyncToken` and retry

**Database Changes Required:**
```sql
ALTER TABLE qb_expense ADD COLUMN sync_token TEXT;
ALTER TABLE qb_expense ADD COLUMN qb_entity_type TEXT; -- 'Purchase' or 'Bill'
ALTER TABLE qb_expense ADD COLUMN qb_entity_id TEXT;   -- The actual Purchase/Bill ID (not line item)
```

Currently `qb_transaction_id` stores a composite like `purchase_123_456` (type + entity ID + account ID). We need to split this to track the actual entity for updates.

#### API Endpoint for Updates

**Purchase Update:**
```
POST /v3/company/{realmId}/purchase
Content-Type: application/json

{
  "Id": "123",
  "SyncToken": "0",
  "Line": [...],  // Full line array with updated AccountRef
  ...other required fields
}
```

**Bill Update:**
```
POST /v3/company/{realmId}/bill
Content-Type: application/json

{
  "Id": "456",
  "SyncToken": "1",
  "Line": [...],
  ...other required fields
}
```

Note: QBO requires sending the FULL entity for updates, not just the changed fields.

### Implementation Plan

#### 1. Schema Updates
- Add `sync_token`, `qb_entity_type`, `qb_entity_id` columns to `qb_expense`
- Update `quickbooks-sync-expenses` to populate these fields during import

#### 2. Edge Function: `quickbooks-update-expense`
- Accept: expense ID, new account ID
- Fetch current expense from OVIS to get `qb_entity_id` and `sync_token`
- Fetch full entity from QBO (to get current state)
- Update the line item's `AccountRef`
- POST updated entity to QBO
- Handle stale token errors with retry logic
- Update `qb_expense` record with new `sync_token` and `account_id`

#### 3. UI Changes to Budget Dashboard
- Add "Edit Category" button/dropdown to expense rows
- Show dropdown of available QBO accounts (from `qb_account` table)
- Call update function on selection
- Show success/error feedback
- Refresh expense data after update

### Why Wait for Production

1. **Sandbox data is fake** - Can't meaningfully test recategorization workflow with test transactions
2. **Real data reveals real needs** - Users will identify actual miscategorization patterns
3. **SyncToken debugging** - Easier to debug with real data and real concurrent editing scenarios
4. **API behavior verification** - Production API may have subtle differences in validation

### Resume Point for Phase 2b

**When to build:** After production access is granted and basic expense sync is verified working.

**Build order:**
1. Run expense sync with production data
2. Let users review for ~1 week to identify recategorization needs
3. If recategorization is needed:
   - Apply schema migration (add sync_token columns)
   - Re-run expense sync to populate new columns
   - Build `quickbooks-update-expense` Edge Function
   - Add UI controls to Budget Dashboard
   - Test with real expenses

---

## Phase 2 Status Summary

| Component | Status | Location |
|-----------|--------|----------|
| `qb_account` table migration | ⚠️ Created, needs manual apply | `supabase/migrations/20251230_create_qb_account_table.sql` |
| `quickbooks-sync-accounts` function | ✅ Deployed | `supabase/functions/quickbooks-sync-accounts/` |
| `quickbooks-sync-expenses` function | ✅ Deployed | `supabase/functions/quickbooks-sync-expenses/` |
| Budget Dashboard UI | ✅ Built | `src/pages/BudgetDashboardPage.tsx` |
| Route and navigation | ✅ Added | `/admin/budget` in `App.tsx`, links in `Navbar.tsx` |
| Expense recategorization | 📝 Documented | This section - build after production access |

### Manual Steps Required

Before testing Budget Dashboard:

1. **Apply the qb_account migration** via Supabase Dashboard:
   - Go to SQL Editor
   - Run contents of `supabase/migrations/20251230_create_qb_account_table.sql`

2. **Connect to QuickBooks** (sandbox or production)

3. **Sync Accounts** using the "Sync Accounts" button in Budget Dashboard

4. **Sync Expenses** using the "Sync Expenses" button

---

## Reference Links

- Intuit Developer Portal: https://developer.intuit.com
- QBO API Documentation: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities
- OAuth 2.0 Guide: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization
- Rate Limits: https://developer.intuit.com/app/developer/qbo/docs/develop/rate-limits
