# QuickBooks Online Integration Specification

**Document Created:** December 5, 2025
**Status:** In Progress - OAuth Flow Ready
**Last Step Completed:** OAuth Edge Functions created, database tables created

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

## Resume Point

**Where we left off:** OAuth flow backend is complete. Database tables created.

**Next session should start with:**
1. Configure OAuth redirect URI in Intuit Developer Portal (see above)
2. Deploy Edge Functions: `npx supabase functions deploy quickbooks-connect` and `npx supabase functions deploy quickbooks-callback`
3. Build the frontend QuickBooks settings page with Connect button
4. Test the OAuth flow end-to-end

---

## Reference Links

- Intuit Developer Portal: https://developer.intuit.com
- QBO API Documentation: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities
- OAuth 2.0 Guide: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization
