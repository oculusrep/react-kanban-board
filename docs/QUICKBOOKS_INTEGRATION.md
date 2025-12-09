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
Creates a new invoice in QuickBooks for a payment.

**Endpoint:** `POST /functions/v1/quickbooks-sync-invoice`

**Request:**
```json
{
  "paymentId": "uuid",
  "sendEmail": false
}
```

**Response:**
```json
{
  "success": true,
  "qbInvoiceId": "123",
  "qbInvoiceNumber": "1001",
  "emailSent": false
}
```

**Actions:**
1. Fetches payment, deal, client, and property data
2. Finds or creates customer in QuickBooks
3. Finds or creates service item in QuickBooks
4. Creates invoice with line items
5. Optionally sends invoice via email
6. Updates payment record with QB invoice info
7. Logs sync operation

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
- `findOrCreateCustomer()` - Find or create QB customer
- `findOrCreateServiceItem()` - Find or create QB service item
- `createInvoice()` - Create QB invoice
- `sendInvoice()` - Send invoice via email
- `getInvoice()` - Get invoice (for SyncToken)
- `deleteInvoice()` - Delete/void invoice
- `logSync()` - Log sync operation
- `updateConnectionLastSync()` - Update connection timestamp

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

## UI Components

### QuickBooksAdminPage (`src/pages/QuickBooksAdminPage.tsx`)
Admin settings page for managing QuickBooks connection:
- Shows connection status
- Connect/Disconnect buttons
- Last sync timestamp
- Sync logs table

### PaymentSummaryRow (`src/components/payments/PaymentSummaryRow.tsx`)
Shows QuickBooks sync status in payment list:
- "QB Synced" badge with invoice number
- "Not Synced" badge when no invoice exists

### PaymentDetailPanel (`src/components/payments/PaymentDetailPanel.tsx`)
Full QuickBooks management when payment is expanded:
- **Not Synced:** "Create Invoice" and "Create & Send" buttons
- **Synced:** Shows invoice number, "Sent" badge if emailed
- **Actions:** "Send Invoice" button (if not sent), "Delete Invoice" button
- Success/error messages after operations

## Invoice Data Mapping

When creating an invoice, data is mapped as follows:

| QuickBooks Field | OVIS Source |
|------------------|-------------|
| Customer | Client name (creates if not exists) |
| Invoice Amount | Payment amount |
| Due Date | Payment estimated date |
| Transaction Date | Current date |
| Memo | Deal name + Property address |
| Bill Email | Deal's bill_to_email |
| Bill Address | Deal's bill_to_* fields |
| Line Item | "Consulting Services" service item |

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

## Future Enhancements

Potential future features:
- [ ] Sync payments received back from QuickBooks
- [ ] Batch invoice creation for multiple payments
- [ ] Invoice PDF download
- [ ] Customer sync (bidirectional)
- [ ] Expense/bill sync for broker payments
- [ ] Webhook integration for real-time updates
