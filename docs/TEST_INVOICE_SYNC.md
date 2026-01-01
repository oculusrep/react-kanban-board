# Manual Test Script: Invoice Sync to QuickBooks

This document provides step-by-step instructions for manually testing the outbound invoice sync feature, which pushes OVIS payments to QuickBooks Online as invoices.

---

## Prerequisites

Before testing, ensure:

1. **QuickBooks is connected**
   - Go to `/admin/quickbooks`
   - Status should show "Connected"
   - If not connected, click "Connect to QuickBooks" and complete OAuth flow

2. **You have admin access**
   - The sync function requires admin role

3. **You have a test payment ready**
   - The payment must be associated with a deal
   - The deal must have a client
   - The deal should have bill-to information (optional but recommended)

---

## Test Scenarios

### Test 1: Create New Invoice in QuickBooks

**Purpose:** Verify that a new invoice is created in QuickBooks from an OVIS payment.

**Steps:**

1. **Navigate to Payments**
   - Go to the Payments page in OVIS

2. **Find or Create a Test Payment**
   - Find a payment that:
     - Does NOT have a QBO Invoice ID (not yet synced)
     - Has a deal with a client attached
   - Or create a new payment for testing

3. **Verify Payment Details**
   - Note the payment amount
   - Note the deal name
   - Note the client name

4. **Trigger Sync**
   - **Option A - From Payment Table:**
     - Find the payment row
     - Click the "Sync QB" button (appears if no QBO invoice linked)

   - **Option B - From Payment Detail Sidebar:**
     - Click on the payment to open the detail sidebar
     - Scroll to the QuickBooks section
     - Click "Create Invoice" (creates invoice only)
     - Or click "Create & Send" (creates invoice AND emails to client)

5. **Verify Success in OVIS**
   - Success message should appear: "Invoice created in QuickBooks" or "Invoice created and sent via QuickBooks"
   - The button should change to show the QBO Invoice Number (e.g., "1234")
   - The payment record now has `qb_invoice_id` and `qb_invoice_number` populated

6. **Verify in QuickBooks**
   - Log into QuickBooks Online
   - Go to Sales → Invoices
   - Find the newly created invoice
   - Verify:
     - Customer name matches the client
     - Invoice amount matches payment amount
     - Line item shows "Brokerage Fee"
     - Description includes deal name
     - Due date matches payment estimated date (if set)
     - Memo includes deal/property info

**Expected Result:** Invoice appears in QBO with correct customer, amount, and details.

---

### Test 2: Link Existing QuickBooks Invoice

**Purpose:** Verify that OVIS links to an existing QBO invoice instead of creating a duplicate.

**Scenario:** An invoice was manually created in QuickBooks before the OVIS integration. The OVIS payment has an `orep_invoice` number that matches the QBO invoice's Doc Number.

**Steps:**

1. **In QuickBooks**
   - Create a test invoice manually
   - Note the invoice number (Doc Number), e.g., "TEST-001"

2. **In OVIS**
   - Create or edit a payment
   - Set the `orep_invoice` field to match the QBO invoice number: "TEST-001"

3. **Trigger Sync**
   - Click "Sync QB" or "Create Invoice" for this payment

4. **Verify Linking**
   - Success message should say: "Linked to existing QuickBooks invoice #TEST-001"
   - The response should include `linked: true`
   - No duplicate invoice should be created in QBO

**Expected Result:** Payment links to existing invoice instead of creating duplicate.

---

### Test 3: Already Synced Payment

**Purpose:** Verify that re-syncing an already-synced payment doesn't create duplicates.

**Steps:**

1. **Find a Synced Payment**
   - Find a payment that already shows a QBO Invoice Number

2. **Attempt Re-sync**
   - Try to sync again (if button is available)

3. **Verify**
   - Should see message: "Invoice already synced to QuickBooks"
   - No duplicate invoice should be created

**Expected Result:** Idempotent behavior - no duplicate invoices.

---

### Test 4: Send Invoice Email

**Purpose:** Verify that the "Create & Send" option emails the invoice to the client.

**Steps:**

1. **Prepare Payment**
   - Find a payment NOT yet synced to QB
   - Ensure the deal has a `bill_to_email` or the client has an email

2. **Click "Create & Send"**
   - From the payment detail sidebar, click "Create & Send"

3. **Verify**
   - Success message should mention email was sent
   - In QuickBooks, the invoice status should show as "Sent"
   - Check the email inbox for the bill-to address

**Expected Result:** Invoice created AND email sent to customer.

---

### Test 5: Error Handling - Missing Client

**Purpose:** Verify proper error when payment has no client.

**Steps:**

1. **Create Payment Without Client**
   - Create a payment associated with a deal that has no client

2. **Attempt Sync**
   - Click "Sync QB"

3. **Verify Error**
   - Should see error: "Payment must have a client associated via deal"

**Expected Result:** Clear error message explaining the issue.

---

### Test 6: Error Handling - QuickBooks Disconnected

**Purpose:** Verify proper error when QuickBooks is not connected.

**Steps:**

1. **Disconnect QuickBooks**
   - Go to `/admin/quickbooks`
   - Disconnect QuickBooks (or wait for token to expire)

2. **Attempt Sync**
   - Try to sync any payment

3. **Verify Error**
   - Should see error: "QuickBooks is not connected. Please connect in Settings."

**Expected Result:** Clear error message guiding user to reconnect.

---

## Verification Checklist

After running tests, verify the following in the database:

```sql
-- Check payment was updated with QB info
SELECT
  id,
  payment_name,
  payment_amount,
  qb_invoice_id,
  qb_invoice_number,
  qb_sync_status,
  qb_last_sync,
  invoice_sent
FROM payment
WHERE id = 'YOUR_PAYMENT_ID';

-- Check sync log entry was created
SELECT *
FROM qb_sync_log
WHERE record_id = 'YOUR_PAYMENT_ID'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                      OVIS Payment                           │
│  - payment_amount                                           │
│  - payment_date_estimated (→ DueDate)                       │
│  - payment_invoice_date (→ TxnDate)                         │
│  - orep_invoice (checked for existing QBO match)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      OVIS Deal                              │
│  - deal_name (→ Line Description)                           │
│  - bill_to_* fields (→ BillAddr, BillEmail)                 │
│  - client_id → Client (→ QBO Customer)                      │
│  - property_id → Property (→ CustomerMemo)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              QuickBooks Online Invoice                      │
│  - CustomerRef (found/created from client)                  │
│  - Line[0]: Brokerage Fee, amount, description              │
│  - TxnDate: Invoice date                                    │
│  - DueDate: Estimated payment date                          │
│  - BillAddr: Bill-to address from deal                      │
│  - BillEmail: For sending invoice                           │
│  - CustomerMemo: Deal name + property info                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Invoice not appearing in QuickBooks

1. Check Supabase Edge Function logs for errors
2. Verify QuickBooks connection is active
3. Check `qb_sync_log` table for error messages

### Customer not found/created correctly

- The sync uses `findOrCreateCustomer()` which searches by name
- If customer exists with same name, it's reused
- New customers are created with email and bill-to info

### Wrong amount on invoice

- Amount comes from `payment.payment_amount`
- Verify the payment amount is correct in OVIS

### Invoice not sent by email

- Requires valid `bill_to_email` on deal OR `email` on client
- Check Edge Function logs for email send errors
- Email sending can fail without failing the overall sync

---

## Related Files

| File | Purpose |
|------|---------|
| `supabase/functions/quickbooks-sync-invoice/index.ts` | Edge Function that creates/links invoices |
| `src/components/payments/PaymentDetailSidebar.tsx` | UI for "Create Invoice" and "Create & Send" buttons |
| `src/components/payments/PaymentDashboardTable.tsx` | UI for "Sync QB" button in payment table |
| `src/components/payments/PaymentSummaryRow.tsx` | UI for QB sync in summary rows |
| `supabase/functions/_shared/quickbooks.ts` | Shared QB utilities (customer, item, invoice creation) |
