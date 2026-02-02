# QuickBooks Commission Integration

## Overview

This document describes the automatic QuickBooks Online (QBO) integration for commission payments. When a broker payment split is marked as "paid" in OVIS, the system automatically creates a corresponding entry in QuickBooks Online.

## Features

### Automatic Entry Creation
- **Bills**: For brokers paid via Accounts Payable (traditional vendor payments)
- **Journal Entries**: For brokers paid via commission draws (internal accounting entries)

### Entry Types

| Payment Method | QBO Entry Type | Use Case |
|---------------|----------------|----------|
| Bill | Accounts Payable Bill | External contractors, 1099 vendors |
| Journal Entry | Journal Entry with Debit/Credit | Internal commission draws, partner allocations |

## Database Schema

### `qb_commission_mapping` Table
Stores configuration for how each broker/referral partner's commissions should be recorded.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `entity_type` | enum | 'broker' or 'referral_partner' |
| `broker_id` | UUID | FK to broker table (nullable) |
| `client_id` | UUID | FK to client table for referral partners (nullable) |
| `payment_method` | enum | 'bill' or 'journal_entry' |
| `qb_vendor_id` | string | QBO Vendor ID |
| `qb_vendor_name` | string | QBO Vendor display name |
| `qb_debit_account_id` | string | QBO Account ID for debit (expense) |
| `qb_debit_account_name` | string | QBO Account name for debit |
| `qb_credit_account_id` | string | QBO Account ID for credit (for JE only) |
| `qb_credit_account_name` | string | QBO Account name for credit |
| `description_template` | string | Template for entry description |
| `is_active` | boolean | Whether mapping is active |

### `qb_commission_entry` Table
Tracks each commission entry created in QBO.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `payment_split_id` | UUID | FK to payment_split table |
| `commission_mapping_id` | UUID | FK to qb_commission_mapping |
| `qb_entity_type` | string | 'Bill' or 'JournalEntry' |
| `qb_entity_id` | string | QBO entity ID |
| `qb_doc_number` | string | QBO document number (if available) |
| `amount` | decimal | Commission amount |
| `transaction_date` | date | Date of the QBO transaction |
| `status` | string | 'created', 'voided', etc. |
| `created_by_id` | UUID | User who triggered creation |

## Architecture

### Edge Function
**Location**: `supabase/functions/quickbooks-create-commission-entry/index.ts`

The Edge Function handles:
1. Authentication verification
2. Payment split lookup with broker/deal data
3. Commission mapping retrieval
4. QBO entry creation (Bill or Journal Entry)
5. Entry tracking in `qb_commission_entry` table
6. Sync logging

### Frontend Integration Points

The QBO commission entry is triggered from three locations:

1. **BrokerPaymentRow.tsx** (`src/components/payments/BrokerPaymentRow.tsx`)
   - Used in the Payment Dashboard Kanban view
   - Checkbox toggle triggers QBO sync

2. **DisbursementReportTab.tsx** (`src/components/payments/DisbursementReportTab.tsx`)
   - Used in the Deal sidebar payment tab
   - Checkbox toggle triggers QBO sync

3. **usePaymentDisbursement.ts** (`src/hooks/usePaymentDisbursement.ts`)
   - Shared hook used by other components
   - `updatePaymentSplitPaid()` function triggers QBO sync

### Flow Diagram

```
User marks payment as "Paid"
         │
         ▼
┌─────────────────────────────┐
│ Update payment_split table  │
│ (paid = true, paid_date)    │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Call Edge Function:         │
│ quickbooks-create-          │
│ commission-entry            │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Look up commission mapping  │
│ for this broker             │
└─────────────────────────────┘
         │
         ├── No mapping? → Silent skip (log only)
         │
         ▼
┌─────────────────────────────┐
│ Check for existing entry    │
│ (prevent duplicates)        │
└─────────────────────────────┘
         │
         ├── Entry exists? → Return success (alreadyExists: true)
         │
         ▼
┌─────────────────────────────────────────┐
│ Create QBO Entry based on payment_method│
│                                         │
│ Bill:                                   │
│   - VendorRef → qb_vendor_id            │
│   - Line → AccountBasedExpenseLineDetail│
│   - Account → qb_debit_account_id       │
│                                         │
│ Journal Entry:                          │
│   - Debit Line → expense account        │
│   - Credit Line → draw/asset account    │
│   - Entity → vendor (for tracking)      │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Record in qb_commission_    │
│ entry table                 │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Return success to frontend  │
└─────────────────────────────┘
```

## Admin UI

**Location**: `/admin/quickbooks` → Commission Payment Mappings section

### Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| Entity Type | Yes | Broker or Referral Partner |
| Broker/Partner | Yes | Select the specific broker or referral partner |
| Payment Method | Yes | Bill or Journal Entry |
| QBO Vendor | Bill: Required, JE: Optional | QBO vendor to associate |
| Debit Account | Yes | Expense account (e.g., "Commissions Paid Out") |
| Credit Account | JE only | Asset/draw account for journal entries |
| Description Template | No | Template for entry descriptions |

### Description Template Placeholders

- `{deal_name}` - Name of the deal
- `{payment_name}` - Name of the payment
- `{broker_name}` - Name of the broker
- `{payment_date}` - Date of the payment

Example: `Commission Payment for {payment_name} - {deal_name}`

## Example Configurations

### Greg Bennett (Bill Method)
```
Entity Type: Broker
Broker: Greg Bennett
Payment Method: Bill (Accounts Payable)
QBO Vendor: Greg Bennett (required)
Debit Account: Commissions Paid Out:Broker Commissions
Description: Commission for {deal_name} - {payment_name}
```

When Greg is paid, a Bill is created in QBO:
- Vendor: Greg Bennett
- Account: Commissions Paid Out:Broker Commissions
- Creates an Accounts Payable entry

### Arty Santos (Journal Entry Method)
```
Entity Type: Broker
Broker: Arty Santos
Payment Method: Journal Entry (Commission Draw)
QBO Vendor: Santos Real Estate Partners, LLC (optional, for tracking)
Debit Account: Commissions Paid Out:Broker Commissions
Credit Account: Partner Draw Account
Description: Commission Draw for {deal_name} - {payment_name}
```

When Arty is paid, a Journal Entry is created in QBO:
- Debit: Commissions Paid Out:Broker Commissions
- Credit: Partner Draw Account
- Entity (both lines): Santos Real Estate Partners, LLC (for vendor tracking)

## Error Handling

The system handles errors gracefully without blocking the paid status update:

| Scenario | Behavior |
|----------|----------|
| No QBO connection | Silent skip, log to console |
| No commission mapping | Silent skip, log to console |
| Entry already exists | Return success with `alreadyExists: true` |
| QBO API error | Log error, payment still marked as paid |

## Files Reference

| File | Purpose |
|------|---------|
| `supabase/functions/quickbooks-create-commission-entry/index.ts` | Edge Function for QBO entry creation |
| `supabase/functions/_shared/quickbooks.ts` | Shared QBO utilities (createBill, createJournalEntry, etc.) |
| `src/components/admin/CommissionMappingAdmin.tsx` | Admin UI for commission mappings |
| `src/components/payments/BrokerPaymentRow.tsx` | Payment row with paid checkbox |
| `src/hooks/usePaymentDisbursement.ts` | Shared hook for payment operations |

## Deployment Notes

### Edge Function Deployment
```bash
supabase functions deploy quickbooks-create-commission-entry
```

### Required Environment Variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- QBO credentials stored in `qb_connection` table

## Changelog

### 2026-02-02
- Added vendor field for Journal Entry payment method in Admin UI
- Journal entries now attach vendor to both debit and credit lines for tracking
- Vendor is required for Bills, optional for Journal Entries

### Initial Release
- Auto-trigger QBO commission entries when marking payments as paid
- Support for Bill and Journal Entry payment methods
- Admin UI for configuring commission mappings
- Duplicate prevention via `qb_commission_entry` table
