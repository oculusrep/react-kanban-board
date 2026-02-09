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

- `postgrestQuery()` - Query database via PostgREST (supports `eq.` and `in.()` filters)
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
| `DROPBOX_ACCESS_TOKEN` | Dropbox API access token (for invoice attachments) |
| `DROPBOX_REFRESH_TOKEN` | Dropbox refresh token for auto-renewal |
| `DROPBOX_APP_KEY` | Dropbox app key |
| `DROPBOX_APP_SECRET` | Dropbox app secret |

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

## Automatic Invoice Attachments

When a new invoice is created in QuickBooks, standard documents are automatically attached. These documents are downloaded from Dropbox and uploaded to QuickBooks via the Attachable API.

### Attached Documents

The following documents are attached to every new invoice:

| Document | Description |
|----------|-------------|
| `W9-Oculus REP - CURRENT.pdf` | Current W9 tax form |
| `OCULUS WIRING INSTRUCTIONS.PDF` | Wire transfer instructions |
| `ACH_eCHECK INSTRUCTIONS.PDF` | ACH/eCheck payment instructions |

### Dropbox Storage

Documents are stored in Dropbox at:
```
/Salesforce Documents/Invoice Attachments/
├── W9-Oculus REP - CURRENT.pdf
├── OCULUS WIRING INSTRUCTIONS.PDF
└── ACH_eCHECK INSTRUCTIONS.PDF
```

### How It Works

1. **New Invoice Creation Only**: Attachments are added only when a NEW invoice is created, not when resyncing/updating an existing invoice
2. **Download from Dropbox**: Files are downloaded from the configured Dropbox folder
3. **Upload to QuickBooks**: Each file is uploaded via the QuickBooks Attachable API
4. **Linked to Invoice**: Attachments are automatically linked to the newly created invoice

### Updating Documents

To update a document (e.g., new W9 for the year):
1. Upload the new file to Dropbox with the exact same filename
2. Delete/replace the old file
3. New invoices will automatically use the updated document

**Note**: Existing invoices retain their original attachments. To update attachments on an existing invoice, delete the invoice in QuickBooks and recreate it.

### Shared Utilities

`supabase/functions/_shared/dropbox.ts` provides Dropbox integration:

- `getDropboxCredentials()` - Get Dropbox API credentials from environment
- `downloadFile(path)` - Download a single file from Dropbox
- `downloadFiles(paths)` - Download multiple files
- `downloadInvoiceAttachments()` - Download all standard invoice attachments
- `getInvoiceAttachmentPaths()` - Get paths to standard attachment files

`supabase/functions/_shared/quickbooks.ts` attachment functions:

- `uploadAttachment(connection, fileData, fileName, contentType, entityType?, entityId?)` - Upload file to QuickBooks
- `linkAttachmentToEntity(connection, attachableId, syncToken, entityType, entityId)` - Link existing attachment to entity

### Error Handling

- Attachment failures don't block invoice creation
- Each attachment is uploaded independently - if one fails, others continue
- Errors are logged but invoice is still created successfully
- Response includes `attachmentsUploaded` count

### Response Format

```json
{
  "success": true,
  "message": "Invoice created in QuickBooks with 3 attachments",
  "qbInvoiceId": "123",
  "qbInvoiceNumber": "1001",
  "attachmentsUploaded": 3
}
```

---

## Broker Attribution Line

Each invoice includes a second line item that lists the brokers involved in the deal. This line has no dollar amount - it's purely informational.

### Format

The broker line appears as:
- Single broker: `Brokers: Mike Minihan`
- Two brokers: `Brokers: Mike Minihan and Arty Santos`
- Three+ brokers: `Brokers: Mike Minihan, Arty Santos, and Greg Bennett`

### How It Works

1. **Fetch Commission Splits**: Query the `commission_split` table for all splits associated with the deal
2. **Get Broker Names**: Fetch broker names from the `broker` table using the broker IDs from the splits
3. **Filter Invalid Names**: Remove any null, empty, or "Unknown Broker" entries
4. **Add Description Line**: Add a `DescriptionOnly` line type to the invoice with the formatted broker list

### Technical Details

The broker line uses QuickBooks' `DescriptionOnly` line type:
```typescript
{
  Amount: 0,
  DetailType: 'DescriptionOnly',
  DescriptionLineDetail: {},
  Description: 'Brokers: Mike Minihan and Arty Santos'
}
```

### Important Notes

- Broker names come from the `broker.name` column (not `broker_name`)
- Only brokers with commission splits on the specific deal are included
- The `postgrestQuery` function must support `in.()` filters for this to work correctly
- Resyncing an invoice will update the broker line if the deal team changes

---

## Invoice Send Behavior

When an invoice is sent via the "Send Invoice" button, the following occurs:

### Automatic Field Updates

| Field | Value Set | Description |
|-------|-----------|-------------|
| `invoice_sent` | `true` | Marks the invoice as sent |
| `payment_invoice_date` | Today's date | Sets the invoice date to when it was sent |

### How It Works

1. User clicks "Send Invoice" button in PaymentDetailPanel
2. Edge function `quickbooks-send-invoice` is called
3. QuickBooks API sends the invoice email to `bill_to_email`
4. Payment record is updated with `invoice_sent=true` and `payment_invoice_date=today`
5. Sync operation is logged to `qb_sync_log`

### Code Reference

```typescript
// In quickbooks-send-invoice/index.ts
const today = new Date().toISOString().split('T')[0]
await postgrestUpdate(supabaseUrl, secretKey, 'payment', `id=eq.${paymentId}`, {
  invoice_sent: true,
  payment_invoice_date: today
})
```

---

## Invoice Creation Validation

Before creating a new invoice, the system validates that required fields are present.

### Required Fields

| Field | Table | Validation |
|-------|-------|------------|
| `payment_date_estimated` | payment | Must be set before creating invoice |
| `bill_to_company_name` | deal | Must be set before creating invoice |
| `bill_to_contact_name` | deal | Must be set before creating invoice |
| `bill_to_email` | deal | Must be set before creating invoice |

### Validation Behavior

- Validation occurs in the frontend (`PaymentDetailPanel.tsx`)
- Only applies to NEW invoice creation, not resyncing existing invoices
- User sees error messages:
  - *"Estimated payment date is required before creating an invoice. Please set it in Payment Details."*
  - *"Missing required fields: Bill-To Company, Bill-To Contact, Bill-To Email. Please fill these in the Bill-To section."*

### Why This Validation Exists

**Estimated Payment Date**: Used as the invoice **Due Date** in QuickBooks. Without it:
- The invoice would have no due date
- Payment tracking would be inaccurate
- Collections workflows would be affected

**Bill-To Fields**: Used for the QuickBooks customer and invoice delivery:
- `bill_to_company_name` - Displayed on the invoice as the billing company
- `bill_to_contact_name` - Contact name on the invoice
- `bill_to_email` - Required for sending the invoice via email

### Code Reference

```typescript
// In PaymentDetailPanel.tsx handleSyncToQuickBooks()

// Estimated payment date validation
if (!forceResync && !payment.qb_invoice_id && !payment.payment_date_estimated) {
  setQbSyncMessage({
    type: 'error',
    text: 'Estimated payment date is required before creating an invoice. Please set it in Payment Details.'
  });
  return;
}

// Bill-to fields validation
if (!forceResync && !payment.qb_invoice_id) {
  const missingFields: string[] = [];
  if (!deal.bill_to_company_name) missingFields.push('Bill-To Company');
  if (!deal.bill_to_contact_name) missingFields.push('Bill-To Contact');
  if (!deal.bill_to_email) missingFields.push('Bill-To Email');

  if (missingFields.length > 0) {
    setQbSyncMessage({
      type: 'error',
      text: `Missing required fields: ${missingFields.join(', ')}. Please fill these in the Bill-To section.`
    });
    return;
  }
}
```

---

## Moving to Production

This section covers the steps to migrate from QuickBooks Sandbox to Production.

### Prerequisites

1. **Intuit Developer Account**: Must have a production-ready app in the Intuit Developer Portal
2. **App Review**: Intuit may require app review before production access
3. **Production Credentials**: Obtain production Client ID and Client Secret

### Step 1: Create Production App (or Update Existing)

1. Go to [Intuit Developer Portal](https://developer.intuit.com/)
2. Navigate to your app or create a new one
3. Under "Keys & credentials", switch to **Production** tab
4. Note the **Client ID** and **Client Secret**
5. Add production redirect URI (same as sandbox, typically):
   ```
   https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/quickbooks-callback
   ```

### Step 2: Update Supabase Secrets

```bash
# Update environment to production
npx supabase secrets set QUICKBOOKS_ENVIRONMENT=production

# Update with production credentials
npx supabase secrets set QUICKBOOKS_CLIENT_ID=your_production_client_id
npx supabase secrets set QUICKBOOKS_CLIENT_SECRET=your_production_client_secret

# Redirect URI typically stays the same
npx supabase secrets set QUICKBOOKS_REDIRECT_URI=https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/quickbooks-callback
```

### Step 3: Redeploy Edge Functions

After updating secrets, redeploy all QuickBooks Edge Functions:

```bash
npx supabase functions deploy quickbooks-connect --no-verify-jwt
npx supabase functions deploy quickbooks-callback --no-verify-jwt
npx supabase functions deploy quickbooks-sync-invoice --no-verify-jwt
npx supabase functions deploy quickbooks-send-invoice --no-verify-jwt
npx supabase functions deploy quickbooks-delete-invoice --no-verify-jwt
npx supabase functions deploy quickbooks-list-customers --no-verify-jwt
npx supabase functions deploy quickbooks-sync-customer --no-verify-jwt
npx supabase functions deploy quickbooks-link-customer --no-verify-jwt
```

### Step 4: Reconnect to QuickBooks

1. Go to Settings > QuickBooks in OVIS
2. Click "Disconnect" if currently connected to sandbox
3. Click "Connect to QuickBooks"
4. Log in with your **production** QuickBooks Online account
5. Authorize the application
6. Verify connection shows "Connected" status

### Step 5: Verify Production Connection

1. **Check API URL**: The `getQBApiUrl()` function in `quickbooks.ts` returns:
   - Sandbox: `https://sandbox-quickbooks.api.intuit.com`
   - Production: `https://quickbooks.api.intuit.com`

2. **Test Invoice Creation**: Create a test invoice on a real deal
3. **Verify in QuickBooks**: Log into QuickBooks Online and confirm the invoice appears
4. **Test Email Send**: Send a test invoice (use your own email first)

### Step 6: Remap Customers (Important!)

QuickBooks sandbox and production are completely separate. Customer IDs from sandbox **will not exist** in production.

1. Go to Admin > QuickBooks > Customer Mapping
2. All clients will show as "Not Linked"
3. For each client:
   - Click "Create in QB" to create new, OR
   - Click "Search QB" to find and link to existing production customer

### Production Checklist

- [ ] Production app created in Intuit Developer Portal
- [ ] Production Client ID and Secret obtained
- [ ] `QUICKBOOKS_ENVIRONMENT` set to `production`
- [ ] `QUICKBOOKS_CLIENT_ID` updated with production value
- [ ] `QUICKBOOKS_CLIENT_SECRET` updated with production value
- [ ] All Edge Functions redeployed
- [ ] Disconnected from sandbox
- [ ] Connected to production QuickBooks account
- [ ] Test invoice created successfully
- [ ] Test email sent successfully
- [ ] Customer mappings recreated for production

### Rollback to Sandbox

If you need to return to sandbox for testing:

```bash
npx supabase secrets set QUICKBOOKS_ENVIRONMENT=sandbox
npx supabase secrets set QUICKBOOKS_CLIENT_ID=your_sandbox_client_id
npx supabase secrets set QUICKBOOKS_CLIENT_SECRET=your_sandbox_client_secret
```

Then redeploy Edge Functions and reconnect to sandbox QuickBooks account.

### Environment Differences

| Aspect | Sandbox | Production |
|--------|---------|------------|
| API URL | `sandbox-quickbooks.api.intuit.com` | `quickbooks.api.intuit.com` |
| Data | Test data only | Real business data |
| Emails | Not delivered | Delivered to real recipients |
| Rate Limits | More lenient | Standard limits apply |
| Customer IDs | Sandbox-specific | Production-specific |

### Security Considerations for Production

1. **Never commit credentials**: Keep Client ID/Secret in Supabase secrets only
2. **Monitor sync logs**: Review `qb_sync_log` for failed operations
3. **Token expiration**: Refresh tokens expire after 100 days - set calendar reminder
4. **Email recipients**: Double-check `bill_to_email` before sending invoices
5. **Test thoroughly**: Use a test deal before sending real invoices

---

## Commission Entry Management

When broker payments are marked as "paid" in OVIS, the system can automatically create accounting entries in QuickBooks. This supports both Bills (for vendor payments) and Journal Entries (for draw accounts).

### Overview

The commission entry system:
- Creates Bills or Journal Entries when a payment split is marked "paid"
- Deletes the corresponding entry when a payment split is unmarked (unchecked)
- Tracks all entries in the `qb_commission_entry` table
- Prevents duplicate entries for the same payment split

### Commission Mapping Configuration

Each broker can have a commission mapping that determines how their payments are recorded:

| Field | Description |
|-------|-------------|
| `broker_id` | The broker this mapping applies to |
| `entity_type` | Always `broker` |
| `payment_method` | `bill` (creates a Bill) or `journal_entry` (creates a Journal Entry) |
| `qb_vendor_id` | QuickBooks Vendor ID for the broker |
| `qb_debit_account_id` | Account to debit (expense account) |
| `qb_credit_account_id` | Account to credit (for journal entries - typically a draw account) |
| `description_template` | Template for line descriptions (supports `{deal_name}`, `{payment_name}`, `{broker_name}`, `{payment_date}`) |

### Journal Entry Numbering

Journal entries created by OVIS use a sequential numbering system:

- **Format**: `OVIS-XXX` (e.g., `OVIS-100`, `OVIS-101`, `OVIS-102`)
- **Starting Number**: 100
- **Sequence Logic**: The system queries `qb_commission_entry` for the highest existing `OVIS-` prefixed doc number and increments by 1

This numbering makes OVIS-generated journal entries easily identifiable in QuickBooks.

### Edge Functions

| Function | Purpose |
|----------|---------|
| `quickbooks-create-commission-entry` | Creates Bill or Journal Entry when payment is marked paid |
| `quickbooks-delete-commission-entry` | Deletes Bill or Journal Entry when payment is unmarked |
| `quickbooks-delete-transaction` | Generic deletion for any QBO entity type |
| `quickbooks-account-transactions` | Fetches General Ledger transactions for account reports |

### Database Tables

#### `qb_commission_mapping`

Configures how commission payments should be recorded in QBO.

#### `qb_commission_entry`

Tracks commission entries created in QBO.

| Column | Type | Description |
|--------|------|-------------|
| `payment_split_id` | uuid | Reference to the payment split |
| `commission_mapping_id` | uuid | Reference to the mapping used |
| `qb_entity_type` | text | `Bill` or `JournalEntry` |
| `qb_entity_id` | text | QuickBooks entity ID |
| `qb_doc_number` | text | Document number (e.g., `OVIS-100`) |
| `amount` | numeric | Commission amount |
| `transaction_date` | date | Date of the transaction |
| `status` | text | `created` or `voided` |
| `created_by_id` | uuid | User who created the entry |

### Arty's Draw Account Report

Located at **Reports > Arty's Draw Account**, this report displays:
- All transactions from a broker's draw account in QBO
- Draws (debits) and Credits (commissions earned)
- Running balance
- Delete button for Journal Entries and Bills created by OVIS

### Deployment

Deploy commission-related Edge Functions:
```bash
npx supabase functions deploy quickbooks-create-commission-entry --no-verify-jwt
npx supabase functions deploy quickbooks-delete-commission-entry --no-verify-jwt
npx supabase functions deploy quickbooks-delete-transaction --no-verify-jwt
npx supabase functions deploy quickbooks-account-transactions --no-verify-jwt
```

---

## Expense Sync (QBO → OVIS)

The expense sync imports all expense transactions from QuickBooks into OVIS for P&L reporting and analysis. This is an **inbound sync** that pulls data from QBO.

### Overview

The expense sync:
- Fetches Purchases, Bills, Bill Payments, Journal Entries, Deposits, Credit Card Credits, and Vendor Credits
- Stores transactions in the `qb_expense` table
- Handles transaction updates (upsert based on QBO transaction ID)
- Cleans up orphaned records when transactions are deleted/voided in QBO
- Supports pagination for large datasets (1000+ transactions)

### Synced Transaction Types

| Transaction Type | QBO Entity | Description |
|-----------------|------------|-------------|
| Purchase | Purchase | Credit card expenses, cash purchases |
| Bill | Bill | Vendor bills (accounts payable) |
| BillPayment | BillPayment | Payments made against bills |
| JournalEntry | JournalEntry | Manual journal entries |
| Deposit | Deposit | Bank deposits (often income-related) |
| CreditCardCredit | CreditCardCredit | Credit card refunds/credits |
| VendorCredit | VendorCredit | Vendor credits/refunds |

### Edge Function

#### `quickbooks-sync-expenses`

**Endpoint:** `POST /functions/v1/quickbooks-sync-expenses`

**Request:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Synced 1610 expense transactions (0 errors, 0 deleted)",
  "syncedCount": 1610,
  "errorCount": 0,
  "deletedCount": 0,
  "period": {
    "startDate": "2024-01-01",
    "endDate": "2024-12-31"
  }
}
```

### Database Schema

#### `qb_expense` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `qb_transaction_id` | text | QuickBooks transaction ID (unique) |
| `transaction_type` | text | Type: 'Purchase', 'Bill', 'JournalEntry', etc. |
| `transaction_date` | date | Date of the transaction |
| `account_id` | text | QBO account ID |
| `account_name` | text | Account name |
| `vendor_id` | text | Vendor ID (if applicable) |
| `vendor_name` | text | Vendor name |
| `amount` | numeric | Transaction amount |
| `memo` | text | Transaction memo/description |
| `line_description` | text | Line item description |
| `doc_number` | text | Document/reference number |
| `created_at` | timestamptz | Record creation date |
| `updated_at` | timestamptz | Last update timestamp |

### Orphan Cleanup

When syncing, the function identifies and deletes "orphaned" records:
- Records in OVIS that no longer exist in QBO (deleted or voided transactions)
- Only records within the sync date range are considered
- Cleanup uses pagination to handle large datasets (1000+ records)

### Deployment

```bash
npx supabase functions deploy quickbooks-sync-expenses --no-verify-jwt
```

---

## P&L Report Integration

The P&L (Profit & Loss) report integration fetches the official P&L report from QuickBooks for display in the Budget Dashboard. This is separate from expense sync - it gets the actual QBO report with proper accounting totals.

### Overview

The P&L integration:
- Fetches the P&L report directly from QBO Reports API
- Supports both **Accrual** and **Cash** accounting methods
- Parses hierarchical account data (parent/child accounts)
- Extracts payroll data (not available via standard Accounting API)
- Only includes **leaf accounts** to avoid double-counting

### Edge Function

#### `quickbooks-sync-pl-report`

**Endpoint:** `POST /functions/v1/quickbooks-sync-pl-report`

**Request:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "accountingMethod": "Accrual"
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `startDate` | string | Jan 1 of current year | Start of report period |
| `endDate` | string | Today | End of report period (inclusive) |
| `accountingMethod` | string | "Accrual" | "Accrual" or "Cash" |

**Response:**
```json
{
  "success": true,
  "message": "P&L report fetched for 2024-01-01 to 2024-12-31 (Accrual basis)",
  "period": { "startDate": "2024-01-01", "endDate": "2024-12-31" },
  "accountingMethod": "Accrual",
  "lineItems": [...],
  "payrollCOGSItems": [...],
  "totalPayrollCOGS": 45000,
  "payrollExpenseItems": [...],
  "totalPayrollExpenses": 5000,
  "totals": {
    "income": 500000,
    "cogs": 100000,
    "grossProfit": 400000,
    "expenses": 150000,
    "operatingIncome": 250000,
    "otherIncome": 1000,
    "otherExpenses": 500,
    "netIncome": 250500
  },
  "reportHeader": { ... }
}
```

### Leaf-Only Account Parsing

The P&L parser only includes **leaf accounts** (accounts with no children) to avoid double-counting:

```
Payroll (parent - SKIPPED, $50,000)
├── Management (parent - SKIPPED, $30,000)
│   ├── Salary - Mike (leaf - INCLUDED, $20,000)
│   └── Salary - Arty (leaf - INCLUDED, $10,000)
└── Staff (parent - SKIPPED, $20,000)
    └── Wages (leaf - INCLUDED, $20,000)
```

This ensures totals are accurate without counting both parent roll-ups and individual items.

### Payroll Extraction

Payroll data is extracted separately because it's only available via the P&L Report (not via the Accounting API):

- **COGS Payroll**: Wages/salaries under Cost of Goods Sold
- **Expense Payroll**: Employer taxes (FUTA, Medicare, SS, SUTA) under Operating Expenses

### Accrual vs Cash Method

| Method | When Revenue is Recorded | When Expenses are Recorded |
|--------|-------------------------|---------------------------|
| Accrual | When earned (invoice sent) | When incurred (bill received) |
| Cash | When cash received | When cash paid |

The Budget Dashboard includes a toggle to switch between methods. Accrual shows business profitability; Cash shows actual cash flow.

### Deployment

```bash
npx supabase functions deploy quickbooks-sync-pl-report --no-verify-jwt
```

---

## Budget Dashboard

The Budget Dashboard (`/reports/budget`) provides a comprehensive P&L view combining OVIS budget data with QuickBooks actuals.

### Features

- **Year Selection**: View any year's P&L data
- **Accounting Method Toggle**: Switch between Accrual and Cash basis
- **Real-Time QBO Sync**: Fetch latest P&L data from QuickBooks
- **Expandable Sections**: Drill down into Income, COGS, and Operating Expenses
- **Budget vs Actual**: Compare OVIS budgets against QBO actuals
- **Payroll Integration**: Displays payroll costs from QBO P&L Report
- **Edit Budgets**: Inline editing for budget amounts

### P&L Structure

The dashboard displays the standard P&L structure:

```
Income
  - Consulting Income
  - Other Income
─────────────────────────
Total Income

Cost of Goods Sold (COGS)
  - Broker Commissions
  - Payroll (COGS)
  - Referral Fees
─────────────────────────
Total COGS

GROSS PROFIT = Income - COGS

Operating Expenses
  - Payroll Taxes
  - Other Expenses
─────────────────────────
Total Operating Expenses

NET PROFIT = Gross Profit - Operating Expenses
```

### Data Sources

| Section | OVIS Source | QBO Source |
|---------|-------------|------------|
| Income | Budget categories | P&L Report line items |
| COGS | Budget categories | P&L Report COGS section |
| Payroll COGS | — | P&L Report (payroll under COGS) |
| Expenses | Budget categories | P&L Report Expense section |
| Payroll Taxes | — | P&L Report (payroll under Expenses) |

### Budget Management

Budgets are stored in the `budget` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `budget_category_id` | uuid | FK to budget_category |
| `year` | integer | Budget year |
| `amount` | numeric | Budgeted amount |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update |

Budget categories are mapped to P&L sections via the `budget_category` table.

### QBO Sync Flow

1. User clicks "Sync QBO" button
2. Dashboard calls `quickbooks-sync-expenses` (for transaction data)
3. Dashboard calls `quickbooks-sync-pl-report` (for P&L totals)
4. UI updates with latest QBO data
5. Payroll items are merged into appropriate sections

### File Location

`src/pages/BudgetDashboardPage.tsx`

---

## Future Enhancements

Potential future features:
- [ ] Sync payments received back from QuickBooks
- [ ] Batch invoice creation for multiple payments
- [ ] Invoice PDF download
- [x] Customer sync (OVIS → QuickBooks) - Completed
- [ ] Customer sync (QuickBooks → OVIS) - Inbound sync
- [x] Expense sync (QuickBooks → OVIS) - Completed
- [x] P&L Report integration - Completed
- [x] Budget Dashboard with QBO actuals - Completed
- [ ] Cash-basis P&L view - Toggle exists, needs validation
- [ ] Webhook integration for real-time updates
- [ ] Automatic sync on client name change in OVIS
- [ ] Bulk customer sync operation
- [x] Automatic document attachments on invoices - Completed
