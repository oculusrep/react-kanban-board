# QuickBooks Online Integration

## Overview

OVIS CRM integrates with QuickBooks Online (QBO) to sync invoices for deal payments. This allows users to:
- Create invoices in QuickBooks from payment records
- Send invoices via email through QuickBooks
- Delete/void invoices in QuickBooks
- Track sync status and invoice numbers

## Architecture

### Database Schema

#### `qb_connection` Table
Stores the OAuth connection to QuickBooks Online.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `realm_id` | text | QuickBooks company ID |
| `access_token` | text | OAuth access token (encrypted) |
| `refresh_token` | text | OAuth refresh token (encrypted) |
| `access_token_expires_at` | timestamptz | Access token expiration |
| `refresh_token_expires_at` | timestamptz | Refresh token expiration (100 days) |
| `status` | text | Connection status: 'connected', 'expired', 'disconnected' |
| `last_sync_at` | timestamptz | Last successful sync timestamp |
| `created_at` | timestamptz | Connection creation date |
| `updated_at` | timestamptz | Last update timestamp |

#### `qb_sync_log` Table
Audit log of all sync operations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `sync_type` | text | Type: 'invoice', 'payment', 'expense', 'customer', 'vendor', 'bill' |
| `direction` | text | 'inbound' or 'outbound' |
| `status` | text | 'success', 'failed', 'pending' |
| `entity_id` | uuid | OVIS entity ID (e.g., payment_id) |
| `entity_type` | text | Entity type (e.g., 'payment') |
| `qb_entity_id` | text | QuickBooks entity ID |
| `error_message` | text | Error details if failed |
| `created_at` | timestamptz | Log entry timestamp |

#### Broker Table Extensions
The `broker` table includes a link to user accounts for email lookup:

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | uuid | Foreign key to `user` table for email lookup |

This enables the BillToSection to auto-populate CC emails from deal team brokers via their linked user accounts.

**Migration:** `supabase/migrations/20251210_add_broker_user_fk.sql`

#### Deal Table Extensions
The `deal` table includes bill-to fields for QuickBooks invoicing:

| Column | Type | Description |
|--------|------|-------------|
| `bill_to_company_name` | text | Company name on invoice |
| `bill_to_contact_name` | text | Contact person name |
| `bill_to_email` | text | Primary invoice recipient(s) |
| `bill_to_cc_emails` | text | CC recipients (comma-separated) |
| `bill_to_bcc_emails` | text | BCC recipients (defaults to mike@oculusrep.com) |

These fields are managed via the BillToSection component in the Payment tab.

#### Payment Table Extensions
The `payment` table includes QuickBooks-related fields:

| Column | Type | Description |
|--------|------|-------------|
| `qb_invoice_id` | text | QuickBooks Invoice ID |
| `qb_invoice_number` | text | QuickBooks Invoice Number (e.g., "1001") |
| `qb_sync_status` | text | Sync status |
| `qb_last_sync` | timestamptz | Last sync timestamp |
| `invoice_sent` | boolean | Whether invoice was emailed via QB |

### Edge Functions

All Edge Functions are located in `supabase/functions/`:

#### 1. `quickbooks-connect`
Initiates OAuth flow to connect to QuickBooks.

**Endpoint:** `POST /functions/v1/quickbooks-connect`

**Response:**
```json
{
  "authUrl": "https://appcenter.intuit.com/connect/oauth2?..."
}
```

#### 2. `quickbooks-callback`
Handles OAuth callback from QuickBooks after user authorization.

**Endpoint:** `GET /functions/v1/quickbooks-callback?code=...&realmId=...&state=...`

**Actions:**
- Exchanges authorization code for tokens
- Stores tokens in `qb_connection` table
- Redirects to settings page with success/error message

#### 3. `quickbooks-sync-invoice`
Creates or updates an invoice in QuickBooks for a payment.

**Endpoint:** `POST /functions/v1/quickbooks-sync-invoice`

**Request:**
```json
{
  "paymentId": "uuid",
  "sendEmail": false,
  "forceResync": false
}
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `paymentId` | string | Required. The payment UUID |
| `sendEmail` | boolean | Optional. Send invoice via email after sync |
| `forceResync` | boolean | Optional. Update existing invoice instead of skipping |

**Response:**
```json
{
  "success": true,
  "qbInvoiceId": "123",
  "qbInvoiceNumber": "1001",
  "emailSent": false,
  "wasUpdate": false
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the operation succeeded |
| `qbInvoiceId` | string | QuickBooks Invoice ID |
| `qbInvoiceNumber` | string | Invoice number (e.g., "1001") |
| `emailSent` | boolean | Whether invoice was emailed |
| `wasUpdate` | boolean | True if existing invoice was updated |

**Actions:**
1. Fetches payment, deal, client, and property data
2. Checks if invoice already exists (`qb_invoice_id`)
3. If exists and `forceResync=false`, returns existing invoice info
4. If exists and `forceResync=true`, fetches SyncToken and updates invoice
5. If new, finds or creates customer in QuickBooks
6. Finds or creates service item in QuickBooks
7. Creates or updates invoice with line items
8. Optionally sends invoice via email
9. Updates payment record with QB invoice info
10. Logs sync operation

#### 4. `quickbooks-send-invoice`
Sends an existing QuickBooks invoice via email.

**Endpoint:** `POST /functions/v1/quickbooks-send-invoice`

**Request:**
```json
{
  "paymentId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Invoice 1001 sent to email@example.com",
  "qbInvoiceId": "123",
  "qbInvoiceNumber": "1001",
  "sentTo": "email@example.com"
}
```

**Requirements:**
- Invoice must already exist in QuickBooks (`qb_invoice_id` set)
- Deal must have `bill_to_email` configured

#### 5. `quickbooks-delete-invoice`
Deletes (voids) an invoice in QuickBooks.

**Endpoint:** `POST /functions/v1/quickbooks-delete-invoice`

**Request:**
```json
{
  "paymentId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Invoice 1001 deleted from QuickBooks",
  "deletedInvoiceNumber": "1001"
}
```

**Actions:**
1. Fetches invoice from QuickBooks to get SyncToken
2. Voids invoice in QuickBooks (QB doesn't truly delete)
3. Clears QB fields from payment record
4. Logs sync operation

### Shared Utilities

`supabase/functions/_shared/quickbooks.ts` contains shared functions:

- `postgrestQuery()` - Query database via PostgREST
- `postgrestInsert()` - Insert records via PostgREST
- `postgrestUpdate()` - Update records via PostgREST
- `getQBConnection()` - Get active QuickBooks connection
- `refreshTokenIfNeeded()` - Refresh OAuth token if expired
- `getQBApiUrl()` - Get API URL (sandbox vs production)
- `qbApiRequest()` - Make authenticated QB API requests
- `findOrCreateParentCustomer()` - Find or create parent QB customer (Client)
- `findOrCreateSubCustomer()` - Find or create sub-customer (Deal) under parent
- `findOrCreateCustomer()` - Full hierarchy creation (parent + sub-customer)
- `findOrCreateServiceItem()` - Find or create QB service item
- `createInvoice()` - Create QB invoice
- `updateInvoice()` - Update existing invoice (sparse update with SyncToken)
- `sendInvoice()` - Send invoice via email
- `getInvoice()` - Get invoice (for SyncToken)
- `deleteInvoice()` - Delete/void invoice
- `logSync()` - Log sync operation
- `updateConnectionLastSync()` - Update connection timestamp

### Frontend QuickBooks Service

`src/services/quickbooksService.ts` provides frontend utilities:

- `resyncInvoice(paymentId, sendEmail?)` - Resync a single payment's invoice
- `resyncDealInvoices(dealId)` - Resync all invoices for a deal
- `hasQBInvoice(paymentId)` - Check if payment has a synced invoice

## Environment Variables

Required Supabase secrets (set via `npx supabase secrets set`):

| Variable | Description |
|----------|-------------|
| `QUICKBOOKS_CLIENT_ID` | Intuit Developer App Client ID |
| `QUICKBOOKS_CLIENT_SECRET` | Intuit Developer App Client Secret |
| `QUICKBOOKS_REDIRECT_URI` | OAuth callback URL |
| `QUICKBOOKS_ENVIRONMENT` | 'sandbox' or 'production' |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for DB access |

## Customer Hierarchy (Client → Deal)

### Overview

QuickBooks customers are organized in a **two-level hierarchy**:
1. **Parent Customer** = OVIS Client (e.g., "Fuqua Development")
2. **Sub-Customer (Job)** = OVIS Deal (e.g., "Fuqua Development - 1234 Main St")

This structure allows:
- Multiple deals per client to be tracked separately
- Bill-to information to be stored at the deal level
- Reports to be grouped by client in QuickBooks

### Automatic Customer Creation

When syncing an invoice, the system automatically:
1. Finds or creates the **parent customer** (Client)
2. Finds or creates the **sub-customer** (Deal) under that parent
3. Associates bill-to information with the sub-customer

### Sub-Customer Display Name Format
```
{Client Name} - {Deal Name}
```
Example: `Fuqua Development - 1234 Main Street`

### Bill-To Information on Sub-Customers

The sub-customer stores deal-specific billing information:
- **CompanyName**: Bill-to company (from deal's `bill_to_company_name`)
- **GivenName/FamilyName**: Contact name parsed from `bill_to_contact_name`
- **PrimaryEmailAddr**: Bill-to email for invoices
- **BillAddr**: Billing address (street, city, state, zip)
- **PrimaryPhone**: Contact phone number
- **PrintOnCheckName**: Set to client name for check printing

### Shared Utilities for Customer Hierarchy

```typescript
// Find or create parent customer (Client level)
findOrCreateParentCustomer(connection, clientName, email?)

// Find or create sub-customer (Deal level) under a parent
findOrCreateSubCustomer(connection, parentCustomerId, clientName, dealName, billTo?)

// Complete hierarchy creation (calls both above)
findOrCreateCustomer(connection, clientName, dealName, email?, billTo?)
```

---

## Customer Mapping

### Overview

OVIS clients can be linked to QuickBooks customers to ensure invoices are created under the correct customer account. The Customer Mapping page (`/admin/quickbooks/customers`) provides a comprehensive interface for managing these relationships.

### Database Schema

#### Client Table Extensions
The `client` table includes QuickBooks-related fields:

| Column | Type | Description |
|--------|------|-------------|
| `qb_customer_id` | text | QuickBooks Customer ID |
| `parent_id` | uuid | Parent client reference (for sub-customers) |
| `is_active_client` | boolean | Whether client is active |

### Edge Functions

#### 1. `quickbooks-list-customers`
Fetches all customers from QuickBooks for the mapping modal.

**Endpoint:** `POST /functions/v1/quickbooks-list-customers`

**Request:**
```json
{
  "search": "optional search term",
  "maxResults": 1000
}
```

**Response:**
```json
{
  "success": true,
  "customers": [
    {
      "id": "123",
      "displayName": "Acme Corp",
      "companyName": "Acme Corporation",
      "email": "billing@acme.com",
      "isSubCustomer": false,
      "parentId": null,
      "parentName": null,
      "fullyQualifiedName": "Acme Corp",
      "active": true
    }
  ],
  "count": 1
}
```

#### 2. `quickbooks-sync-customer`
Creates or updates a customer in QuickBooks from an OVIS client.

**Endpoint:** `POST /functions/v1/quickbooks-sync-customer`

**Request:**
```json
{
  "clientId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "action": "created | updated | linked",
  "qbCustomerId": "123",
  "qbDisplayName": "Client Name",
  "message": "Customer created in QuickBooks: Client Name"
}
```

**Actions:**
1. Checks if client is already linked to a QB customer
2. If linked, updates the existing QB customer with OVIS data
3. If not linked, searches QB for exact name match
4. If match found, links to existing QB customer
5. If no match, creates new QB customer
6. Handles parent/sub-customer relationships via `ParentRef`
7. Logs sync operation

#### 3. `quickbooks-link-customer`
Manually links an OVIS client to an existing QuickBooks customer.

**Endpoint:** `POST /functions/v1/quickbooks-link-customer`

**Request:**
```json
{
  "clientId": "uuid",
  "qbCustomerId": "123",
  "qbDisplayName": "Customer Name"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Linked \"OVIS Client\" to QuickBooks customer \"QB Customer\"",
  "clientId": "uuid",
  "clientName": "OVIS Client",
  "qbCustomerId": "123"
}
```

### Parent/Sub-Customer Relationships

QuickBooks supports hierarchical customer relationships. OVIS mirrors this through the `parent_id` field:

1. **Setting a Parent in OVIS:**
   - If the child client is linked to QB, the child's QB customer is updated with `ParentRef`
   - If the parent is not yet in QB, it's automatically created first
   - The child is then synced with the parent reference

2. **Removing a Parent:**
   - Note: QuickBooks API doesn't support removing parent relationships
   - The OVIS relationship is updated, but QB may retain the hierarchy

3. **Sync Discrepancy Detection:**
   - The UI compares OVIS client data with QB customer data
   - Checks: name mismatch, parent relationship mismatch
   - Shows "Sync Changes" button only when discrepancies exist

### Customer Mapping Page Features

#### Active Client Management
- Checkbox to toggle `is_active_client` status
- "Show inactive" filter with count of inactive clients
- Inactive clients shown with visual indicator

#### Parent Assignment
- Dropdown to set/change parent client
- Only top-level active clients available as parents
- Changes auto-sync to QuickBooks when applicable
- Auto-creates parent in QB if not already linked

#### Smart Link Suggestions
The UI intelligently suggests actions based on potential matches:

| Scenario | Primary Action | Secondary Action |
|----------|---------------|------------------|
| Exact match found in QB | "Link to QB" | "Create New" |
| Close match found in QB | "Link to QB" | "Create New" |
| Partial match (may be parent) | "Create in QB" | "Search QB" |
| No match found in QB | "Create in QB" | "Search QB" |

**Match Types:**
- **Exact match**: QB customer name exactly equals OVIS client name
- **Close match**: QB customer name contains the full OVIS client name (e.g., QB: "Acme Corp - Main" contains OVIS: "Acme Corp")
- **Partial match**: OVIS client name contains the QB customer name (e.g., OVIS: "Cheeky Monkeys - Nicki Patel" contains QB: "Cheeky Monkeys") - this typically indicates a parent/child relationship where the parent exists but the child doesn't

#### Discrepancy Detection
For linked clients, the system compares:
- Client name vs QB DisplayName
- Parent relationship (OVIS parent_id vs QB ParentRef)

Visual indicators:
- **Green checkmark + "Synced"**: Data matches between OVIS and QB
- **Orange refresh + "Linked (needs sync)"**: Discrepancy detected
- **Orange "Sync Changes" button**: Appears only when sync is needed

### Deployment

Deploy customer-related Edge Functions:
```bash
npx supabase functions deploy quickbooks-list-customers --no-verify-jwt
npx supabase functions deploy quickbooks-sync-customer --no-verify-jwt
npx supabase functions deploy quickbooks-link-customer --no-verify-jwt
```

## UI Components

### QuickBooksAdminPage (`src/pages/QuickBooksAdminPage.tsx`)
Admin settings page for managing QuickBooks connection:
- Shows connection status
- Connect/Disconnect buttons
- Last sync timestamp
- Link to Customer Mapping page
- Sync logs table

### QuickBooksCustomerMappingPage (`src/pages/QuickBooksCustomerMappingPage.tsx`)
Customer mapping management page:
- List of all OVIS clients with QB link status
- Active/inactive toggle checkboxes
- Parent client dropdown (with auto-sync to QB)
- Smart action buttons based on QB match detection
- Discrepancy detection with conditional sync button
- Modal for searching and linking to QB customers
- Stats showing total/linked/unlinked counts

### PaymentSummaryRow (`src/components/payments/PaymentSummaryRow.tsx`)
Shows QuickBooks sync status in payment list:
- "QB Synced" badge with invoice number
- "Not Synced" badge when no invoice exists

### PaymentDetailPanel (`src/components/payments/PaymentDetailPanel.tsx`)
Full QuickBooks management when payment is expanded:
- **Not Synced:** "Create Invoice" and "Create & Send" buttons
- **Synced:** Shows invoice number, "Resync Invoice", "Send Invoice" (if not sent), "Delete Invoice" buttons

### BillToSection (`src/components/BillToSection.tsx`)
Collapsible section in PaymentTab for managing invoice billing info:
- **Bill-To Company**: Company name that appears on the invoice
- **Bill-To Contact**: Contact person name
- **Invoice Email (TO)**: Primary recipient(s), comma-separated
- **CC Emails**: Carbon copy recipients with "Add deal team emails" button
- **BCC Emails**: Blind copy with default `mike@oculusrep.com`

**Features:**
- Auto-saves with 800ms debounce (no save button needed)
- Fetches its own data to avoid re-render loops
- "Add deal team emails" auto-populates CC from broker emails
- Displays QuickBooks info box explaining field usage

**Props:**
```typescript
interface BillToSectionProps {
  dealId: string;
  clientId?: string;
  commissionSplits: CommissionSplit[];
  brokers: Broker[];
}
```

### ClientOverviewTab (`src/components/ClientOverviewTab.tsx`)
Client detail page shows QuickBooks integration status:
- **QB Customer ID**: Read-only display of linked QuickBooks customer ID
- Shows "Linked" badge when connected, "Not linked to QuickBooks" when not
- Helper text directs users to Customer Mapping page for changes
- Field is intentionally read-only to prevent accidental sync issues
- **Synced:** Shows invoice number, "Sent" badge if emailed
- **Actions:** "Send Invoice" button (if not sent), "Delete Invoice" button
- Success/error messages after operations

## Invoice Data Mapping

When creating an invoice, data is mapped as follows:

| QuickBooks Field | OVIS Source |
|------------------|-------------|
| Customer | Sub-customer (Deal) under parent (Client) - auto-created |
| Invoice Amount | Payment amount |
| Due Date | Payment estimated date |
| Transaction Date | Current date |
| Memo | Deal name + Property address |
| Bill Email (TO) | Deal's `bill_to_email` |
| Bill Email (CC) | Deal's `bill_to_cc_emails` |
| Bill Email (BCC) | Deal's `bill_to_bcc_emails` |
| Bill Address | Deal's `bill_to_*` fields |
| Line Item | "Consulting Services" service item |

### Invoice Email Recipients

Invoices can be sent to multiple recipients:
- **TO**: Primary recipient(s) from `bill_to_email`
- **CC**: Deal team members from `bill_to_cc_emails` (can auto-populate from brokers)
- **BCC**: Internal tracking via `bill_to_bcc_emails` (defaults to `mike@oculusrep.com`)

## Token Refresh Flow

OAuth tokens are automatically refreshed:
1. Access tokens expire after ~1 hour
2. Before each API call, `refreshTokenIfNeeded()` checks expiration
3. If expiring within 5 minutes, refresh token is used to get new access token
4. New tokens are stored in database
5. Refresh tokens expire after 100 days - user must reconnect

## Error Handling

Common errors and resolutions:

| Error | Cause | Resolution |
|-------|-------|------------|
| "QuickBooks is not connected" | No active connection | Go to Settings > QuickBooks and connect |
| "Failed to refresh token" | Refresh token expired | Reconnect to QuickBooks |
| "No bill-to email configured" | Missing email on deal | Add bill_to_email to deal |
| "Payment not found" | Invalid payment ID | Check payment exists |
| "Invoice already exists" | Re-syncing same payment | Delete existing invoice first |

## Troubleshooting

### Issue: "Invalid authorization token - Legacy API keys are disabled" (December 2025)

**Symptoms:**
- Invoice creation fails with error: `"Invalid authorization token"`
- Console shows: `"Legacy API keys are disabled"`
- Error occurred after Supabase disabled legacy JWT keys on October 23, 2025

**Root Cause:**
Supabase migrated to a new API key format in late 2025:
- **Legacy format (deprecated):** JWT tokens starting with `eyJ...`
- **New format:** Keys starting with `sb_secret_*` or `sb_publishable_*`

The Edge Functions were using direct PostgREST calls with legacy JWT keys, which stopped working after the deprecation.

**Solution:**
Migrated the shared utilities (`supabase/functions/_shared/quickbooks.ts`) to use the Supabase JS client instead of direct PostgREST calls:

```typescript
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Create a Supabase client for Edge Functions
// Uses the new secret key format (sb_secret_*)
export function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return createClient(supabaseUrl, supabaseKey)
}
```

The legacy helper functions (`postgrestQuery`, `postgrestInsert`, `postgrestUpdate`) were updated to internally use the Supabase client while maintaining their existing signatures for backward compatibility.

**Key Changes:**
1. Added `createSupabaseClient()` function
2. Added new `dbQuery`, `dbInsert`, `dbUpdate` helpers using Supabase client
3. Modified legacy PostgREST helpers to internally use the Supabase client
4. All Edge Functions now use `SUPABASE_SERVICE_ROLE_KEY` (new `sb_secret_*` format)

**Environment Variable:**
Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in Supabase secrets with the new format key:
```bash
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxx
```

---

### Issue: "column client.email does not exist" (December 2025)

**Symptoms:**
- Invoice creation fails with PostgREST error
- Error message: `column client.email does not exist`

**Root Cause:**
The `client` table does not have an `email` column. The code was incorrectly referencing `client.email` in several places.

**Solution:**
All invoice email needs should use the deal's bill-to fields instead:
- Use `deal.bill_to_email` for the primary invoice recipient
- Use `deal.bill_to_cc_emails` for CC recipients
- Use `deal.bill_to_bcc_emails` for BCC recipients

**Code Fix in `quickbooks-sync-invoice/index.ts`:**
```typescript
// INCORRECT - client table has no email column
// const clients = await postgrestQuery(..., `select=id,client_name,email,qb_customer_id...`)

// CORRECT - client table only has id, client_name, qb_customer_id
const clients = await postgrestQuery(
  supabaseUrl,
  secretKey,
  'client',
  `select=id,client_name,qb_customer_id&id=eq.${deal.client_id}`
)

// Use deal.bill_to_email for invoice recipients
const customerId = await findOrCreateCustomer(
  connection,
  client.client_name,
  deal.deal_name || 'Deal',
  deal.bill_to_email,  // Use deal's bill-to email, NOT client.email
  { ... }
)
```

**Schema Reference:**
- The `client` table contains: `id`, `client_name`, `qb_customer_id`, `parent_id`, `is_active_client`
- Email fields are on the `deal` table: `bill_to_email`, `bill_to_cc_emails`, `bill_to_bcc_emails`

---

## Security Considerations

1. **OAuth Tokens:** Stored in database, accessed only via service role key
2. **CORS:** Edge functions allow all origins (adjust for production)
3. **Authorization:** Functions check for valid auth header
4. **Service Role:** Used for database operations to bypass RLS

## Testing

### Sandbox Testing
1. Set `QUICKBOOKS_ENVIRONMENT=sandbox`
2. Use Intuit sandbox company
3. Create test invoices without affecting production data

### Production Deployment
1. Set `QUICKBOOKS_ENVIRONMENT=production`
2. Update `QUICKBOOKS_REDIRECT_URI` to production URL
3. Ensure Intuit app is approved for production

## Deployment

Deploy Edge Functions:
```bash
npx supabase functions deploy quickbooks-connect --no-verify-jwt
npx supabase functions deploy quickbooks-callback --no-verify-jwt
npx supabase functions deploy quickbooks-sync-invoice --no-verify-jwt
npx supabase functions deploy quickbooks-send-invoice --no-verify-jwt
npx supabase functions deploy quickbooks-delete-invoice --no-verify-jwt
```

## Automatic Invoice Resync

Invoices are automatically resynced to QuickBooks when relevant data changes in OVIS. This ensures QuickBooks always has the latest information without manual intervention.

### Triggers

| Trigger Location | Fields Monitored | Behavior |
|-----------------|------------------|----------|
| BillToSection | All bill-to fields | Resyncs all invoices for the deal |
| PaymentAmountOverrideModal | payment_amount | Resyncs the specific payment's invoice |
| PaymentTab | payment_amount, payment_invoice_date, payment_date_estimated | Resyncs the specific payment's invoice |

### How It Works

1. **Bill-To Field Changes** (`BillToSection.tsx`)
   - When any bill-to field is saved (company, contact, email, CC, BCC)
   - Calls `resyncDealInvoices(dealId)` to update all invoices for the deal
   - Runs in the background without blocking the UI

2. **Payment Amount Override** (`PaymentAmountOverrideModal.tsx`)
   - When payment amount is manually overridden
   - Checks if payment has a QB invoice via `hasQBInvoice()`
   - If yes, calls `resyncInvoice(paymentId)`

3. **Payment Field Updates** (`PaymentTab.tsx`)
   - Monitors changes to: `payment_amount`, `payment_invoice_date`, `payment_date_estimated`
   - If payment has `qb_invoice_id`, automatically resyncs

### Manual Resync

Users can manually trigger a resync via the **"Resync Invoice"** button in PaymentDetailPanel. This is useful when:
- Automatic resync failed
- Testing invoice updates
- Forcing a refresh after external changes

### Implementation Details

```typescript
// Frontend service (src/services/quickbooksService.ts)
await resyncInvoice(paymentId);           // Single invoice
await resyncDealInvoices(dealId);         // All invoices for a deal
const hasInvoice = await hasQBInvoice(paymentId);  // Check if synced

// Edge function call
POST /functions/v1/quickbooks-sync-invoice
{
  "paymentId": "uuid",
  "forceResync": true  // Required to update existing invoice
}
```

### Error Handling

- Auto-resync errors are logged to console but don't block the UI
- Failed resyncs can be manually retried via the "Resync Invoice" button
- Sync status and errors are logged to `qb_sync_log` table

---

## Future Enhancements

Potential future features:
- [ ] Sync payments received back from QuickBooks
- [ ] Batch invoice creation for multiple payments
- [ ] Invoice PDF download
- [x] Customer sync (OVIS → QuickBooks) - Completed
- [ ] Customer sync (QuickBooks → OVIS) - Inbound sync
- [ ] Expense/bill sync for broker payments
- [ ] Webhook integration for real-time updates
- [ ] Automatic sync on client name change in OVIS
- [ ] Bulk customer sync operation
- [ ] Automatic document attachments on invoices
