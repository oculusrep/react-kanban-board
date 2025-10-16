# Payment System: Hybrid Auto-Generate with Manual Override Architecture

## Business Requirements

1. **Automatic by default** - Reduce manual work for standard cases
2. **Manual override capability** - Handle edge cases (e.g., adjust 2nd payment split)
3. **Immutability after disbursement** - Once paid, splits are locked (accounting integrity)
4. **QuickBooks Online integration** - Payments must match external accounting system
5. **Audit trail** - Track who changed what and why

---

## Database Schema Additions

### Add Status Tracking to `payment` table

```sql
ALTER TABLE payment ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE payment ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS disbursed_by_id UUID REFERENCES "user"(id);
ALTER TABLE payment ADD COLUMN IF NOT EXISTS qbo_payment_id TEXT; -- QuickBooks Online ID
ALTER TABLE payment ADD COLUMN IF NOT EXISTS qbo_synced_at TIMESTAMPTZ;

-- Payment status: draft → approved → disbursed
-- draft: Can auto-sync from commission splits
-- approved: User reviewed, locked from auto-sync, but not yet paid
-- disbursed: Money sent, synced to QBO, completely immutable

CREATE TYPE payment_status AS ENUM ('draft', 'approved', 'disbursed');
ALTER TABLE payment ALTER COLUMN status TYPE payment_status USING status::payment_status;
```

### Add Override Tracking to `payment_split` table

```sql
ALTER TABLE payment_split ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT false;
ALTER TABLE payment_split ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE payment_split ADD COLUMN IF NOT EXISTS override_by_id UUID REFERENCES "user"(id);
ALTER TABLE payment_split ADD COLUMN IF NOT EXISTS override_at TIMESTAMPTZ;
ALTER TABLE payment_split ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false;

-- locked = true means this split is immutable (paid, or user explicitly locked)
```

### Add Audit Trail

```sql
CREATE TABLE IF NOT EXISTS payment_split_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    payment_split_id UUID REFERENCES payment_split(id) ON DELETE CASCADE,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    changed_by_id UUID REFERENCES "user"(id),
    change_type TEXT, -- 'auto_sync' | 'manual_override' | 'commission_change'
    old_split_broker_total NUMERIC(12,2),
    new_split_broker_total NUMERIC(12,2),
    reason TEXT
);
```

---

## Auto-Sync Logic with Safety Checks

### When to Auto-Sync Payment Splits:

```typescript
async function autoSyncPaymentSplitsForDeal(dealId: string, userId: string) {
  // Get all payments for this deal
  const { data: payments } = await supabase
    .from('payment')
    .select('*')
    .eq('deal_id', dealId);

  // Get commission splits
  const { data: commissionSplits } = await supabase
    .from('commission_split')
    .select('*')
    .eq('deal_id', dealId);

  for (const payment of payments) {
    // SAFETY CHECK 1: Skip if payment is not in draft status
    if (payment.status !== 'draft') {
      console.log(`⏭️ Skipping payment ${payment.id}: status=${payment.status}`);
      continue;
    }

    // SAFETY CHECK 2: Check if any splits are locked or manually overridden
    const { data: existingSplits } = await supabase
      .from('payment_split')
      .select('*')
      .eq('payment_id', payment.id);

    const hasLockedSplits = existingSplits?.some(s => s.locked || s.manual_override);

    if (hasLockedSplits) {
      console.log(`⏭️ Skipping payment ${payment.id}: has locked/overridden splits`);
      continue;
    }

    // SAFE TO AUTO-SYNC - Delete old splits and regenerate
    await regeneratePaymentSplitsForPayment(payment, commissionSplits, userId);
  }
}
```

---

## UI/UX Flow

### 1. Commission Tab (Auto-Sync Happens Here)

```typescript
// After user saves a commission split change
const handleSaveCommissionSplit = async (splitData) => {
  // Save the commission split
  await supabase.from('commission_split').upsert(splitData);

  // Auto-sync draft payments only
  const { updatedPayments, skippedPayments } = await autoSyncPaymentSplitsForDeal(deal.id, userId);

  // Show toast notification
  if (updatedPayments > 0) {
    showToast(`✅ Updated ${updatedPayments} draft payment(s)`, { type: 'success' });
  }

  if (skippedPayments > 0) {
    showToast(
      `⚠️ ${skippedPayments} payment(s) skipped (approved/disbursed or manually overridden)`,
      { type: 'info', duration: 5000 }
    );
  }
};
```

### 2. Payment Tab (Manual Override & Status Management)

```
┌─────────────────────────────────────────────────────────┐
│ Payment 1 of 2                         Status: [Draft ▼]│
│ Amount: $50,000.00                     Due: Jan 15, 2025 │
├─────────────────────────────────────────────────────────┤
│ Broker Splits:                                          │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ John Smith          $25,000.00  [✏️ Override]  [ ]🔒│ │
│ │ Jane Doe            $20,000.00  [✏️ Override]  [ ]🔒│ │
│ │ Bob Johnson          $5,000.00  [✏️ Override]  [ ]🔒│ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ℹ️ This payment auto-syncs with commission splits       │
│                                                          │
│ Actions:                                                 │
│ [Approve Payment] ← Locks splits, prevents auto-sync    │
│ [Mark as Disbursed] ← Records payment sent              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Payment 2 of 2                   Status: [Approved 🔒]  │
│ Amount: $50,000.00                     Due: Mar 15, 2025 │
├─────────────────────────────────────────────────────────┤
│ Broker Splits:                                          │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ John Smith          $20,000.00  [✏️ Edit]   [✓]🔒   │ │
│ │ Jane Doe            $25,000.00  [✏️ Edit]   [✓]🔒   │ │
│ │ Bob Johnson          $5,000.00  [✏️ Edit]   [ ]🔒   │ │
│ │ (manually adjusted - won't auto-sync)                │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ⚠️ This payment is approved and won't auto-sync          │
│                                                          │
│ Actions:                                                 │
│ [Revert to Draft] ← Re-enable auto-sync                 │
│ [Mark as Disbursed]                                      │
└─────────────────────────────────────────────────────────┘
```

### 3. Override Modal

```typescript
<OverridePaymentSplitModal
  split={selectedSplit}
  onSave={async (newAmount, reason) => {
    // Save the override
    await supabase
      .from('payment_split')
      .update({
        split_broker_total: newAmount,
        manual_override: true,
        override_reason: reason,
        override_by_id: userId,
        override_at: new Date().toISOString()
      })
      .eq('id', selectedSplit.id);

    // Log to audit trail
    await supabase
      .from('payment_split_history')
      .insert({
        payment_split_id: selectedSplit.id,
        changed_by_id: userId,
        change_type: 'manual_override',
        old_split_broker_total: selectedSplit.split_broker_total,
        new_split_broker_total: newAmount,
        reason: reason
      });

    showToast('✅ Split amount overridden', { type: 'success' });
  }}
/>
```

Modal content:
```
┌───────────────────────────────────────────────┐
│ Override Payment Split                        │
├───────────────────────────────────────────────┤
│ Broker: John Smith                            │
│ Payment: Payment 2 of 2                       │
│                                               │
│ Current Amount: $25,000.00                    │
│ (Based on commission splits)                  │
│                                               │
│ Override Amount: [____________]               │
│                                               │
│ Reason (required):                            │
│ ┌───────────────────────────────────────────┐ │
│ │ Special arrangement: extra 10% for        │ │
│ │ bringing in the client relationship       │ │
│ └───────────────────────────────────────────┘ │
│                                               │
│ ⚠️ This split will no longer auto-sync       │
│                                               │
│ [Cancel]  [Save Override]                     │
└───────────────────────────────────────────────┘
```

---

## QuickBooks Online Integration

### Workflow:

```typescript
async function disburseMentToQuickBooks(paymentId: string) {
  // 1. Get payment and splits
  const { data: payment } = await supabase
    .from('payment')
    .select('*, payment_split(*), deal(*)')
    .eq('id', paymentId)
    .single();

  // 2. Create QBO Bill Payment for each broker split
  const qboPayments = [];
  for (const split of payment.payment_split) {
    const qboPayment = await createQBOBillPayment({
      vendorId: split.broker.qbo_vendor_id, // Need to store this
      amount: split.split_broker_total,
      paymentDate: payment.payment_date,
      referenceNumber: `${payment.deal.deal_name}-P${payment.payment_sequence}`,
      memo: `Payment ${payment.payment_sequence} - ${split.broker.name}`
    });

    qboPayments.push(qboPayment);

    // 3. Update split with QBO ID
    await supabase
      .from('payment_split')
      .update({
        qbo_bill_payment_id: qboPayment.id,
        qbo_synced_at: new Date().toISOString(),
        locked: true // Lock after syncing to QBO
      })
      .eq('id', split.id);
  }

  // 4. Update payment status
  await supabase
    .from('payment')
    .update({
      status: 'disbursed',
      disbursed_at: new Date().toISOString(),
      disbursed_by_id: userId,
      qbo_payment_id: qboPayments[0].id, // Primary reference
      qbo_synced_at: new Date().toISOString()
    })
    .eq('id', paymentId);

  return { success: true, qboPayments };
}
```

### QBO Sync Safety:

```typescript
// Before allowing any changes to a payment split
async function canModifyPaymentSplit(splitId: string): Promise<boolean> {
  const { data: split } = await supabase
    .from('payment_split')
    .select('*, payment(*)')
    .eq('id', splitId)
    .single();

  // Cannot modify if already synced to QBO
  if (split.qbo_bill_payment_id) {
    return false;
  }

  // Cannot modify if payment is disbursed
  if (split.payment.status === 'disbursed') {
    return false;
  }

  // Cannot modify if explicitly locked
  if (split.locked) {
    return false;
  }

  return true;
}
```

---

## State Diagram

```
                         ┌──────────┐
                         │  DRAFT   │ ← Auto-syncs from commission splits
                         └────┬─────┘
                              │
                    User clicks "Approve Payment"
                              │
                         ┌────▼─────┐
                         │ APPROVED │ ← Locked from auto-sync, can still edit
                         └────┬─────┘
                              │
                  User clicks "Mark as Disbursed"
                              │
                    Creates QBO Bill Payment(s)
                              │
                         ┌────▼──────┐
                         │ DISBURSED │ ← Completely immutable
                         └───────────┘
                         ↓
                    Synced to QuickBooks
                    payment_split.locked = true
                    payment.qbo_payment_id = 'QBO-123'
```

---

## Edge Case Handling

### Scenario 1: Broker Added After Payment 1 Disbursed

```
Payment 1: DISBURSED (3 brokers)
Payment 2: DRAFT (3 brokers)

User adds 4th broker to commission splits
↓
Auto-sync updates Payment 2 only (adds 4th broker)
Payment 1 remains unchanged (locked)
↓
Result: Payment 1 has 3 splits, Payment 2 has 4 splits ✅
```

### Scenario 2: User Adjusts Payment 2 Manually

```
Payment 1: DRAFT
Payment 2: DRAFT

User overrides Payment 2 broker splits manually
↓
payment_split.manual_override = true for Payment 2
↓
Commission splits change
↓
Auto-sync updates Payment 1 only
Payment 2 skipped (has manual overrides)
↓
Result: Payment 1 auto-synced, Payment 2 preserved ✅
```

### Scenario 3: Commission Splits Change After Payment 1 Disbursed

```
Payment 1: DISBURSED ($50k split: John $25k, Jane $25k)
Payment 2: DRAFT ($50k split: John $25k, Jane $25k)

Commission percentages change (John 60%, Jane 40%)
↓
Auto-sync recalculates Payment 2 only
Payment 2 now: John $30k, Jane $20k
Payment 1 unchanged: John $25k, Jane $25k ✅
↓
Result: Historical payment preserved, future payment updated
```

---

## User Controls & Indicators

### Payment Status Badge
```typescript
const PaymentStatusBadge = ({ status }) => {
  const badges = {
    draft: {
      color: 'bg-blue-100 text-blue-800',
      icon: '📝',
      label: 'Draft',
      tooltip: 'Auto-syncs with commission splits'
    },
    approved: {
      color: 'bg-orange-100 text-orange-800',
      icon: '🔒',
      label: 'Approved',
      tooltip: 'Locked from auto-sync, ready to disburse'
    },
    disbursed: {
      color: 'bg-green-100 text-green-800',
      icon: '✅',
      label: 'Disbursed',
      tooltip: 'Paid and synced to QuickBooks'
    }
  };

  const badge = badges[status];
  return (
    <span className={`${badge.color} px-2 py-1 rounded`} title={badge.tooltip}>
      {badge.icon} {badge.label}
    </span>
  );
};
```

### Override Indicator
```typescript
const SplitAmountDisplay = ({ split }) => {
  if (split.manual_override) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-medium">${formatUSD(split.split_broker_total)}</span>
        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded"
              title={split.override_reason}>
          ✏️ Overridden
        </span>
      </div>
    );
  }

  return <span className="font-medium">${formatUSD(split.split_broker_total)}</span>;
};
```

---

## Migration Plan

### Phase 1: Add Database Fields (No behavior change)
```sql
-- Run these ALTERs
-- Update existing payments to 'draft' status
UPDATE payment SET status = 'draft' WHERE status IS NULL;
```

### Phase 2: Implement Auto-Sync with Safety Checks
- Add `autoSyncPaymentSplitsForDeal()` function
- Call it after commission split changes
- Respects `status` and `manual_override` flags

### Phase 3: Add Payment Status Workflow UI
- Status badges
- "Approve Payment" button
- "Mark as Disbursed" button
- Override modal with reason field

### Phase 4: QuickBooks Online Integration
- QBO API connection
- Bill Payment creation
- Sync status tracking

---

## Benefits of This Architecture

✅ **Automatic by default** - 90% of payments just work
✅ **Manual override when needed** - Edge cases handled
✅ **Accounting integrity** - Disbursed payments are immutable
✅ **QBO integration ready** - Clear sync points
✅ **Audit trail** - Know who changed what and why
✅ **User control** - Can lock payments at any point
✅ **Flexible workflow** - Draft → Approved → Disbursed stages

---

## Questions for You

1. **Payment approval workflow**: Do you want a formal "approval" step before disbursement, or can users go straight from draft → disbursed?

2. **QBO vendor mapping**: How do you want to map brokers to QBO vendors? (Need `broker.qbo_vendor_id`?)

3. **Partial disbursement**: Can you pay some broker splits but not others in the same payment? Or is it all-or-nothing?

4. **Revert capability**: If a payment is approved (locked), should users be able to revert to draft (unlock)?

5. **Notification preferences**: Should users get notified when auto-sync occurs? Or just show a subtle indicator?

---

Let me know your thoughts and I can start implementing this hybrid approach!
