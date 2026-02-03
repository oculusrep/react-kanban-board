# Bug Fix: BillToSection Real-Time Update Loop

**Date:** 2025-12-10
**Issue:** Editing bill-to fields caused infinite re-render loops and harsh page refreshes
**Resolution:** Decoupled BillToSection from parent state and removed redundant real-time subscription

## Problem Description

When editing any field in the BillToSection component (CC emails, BCC emails, company name, etc.), the page would "flip out" with continuous re-renders and harsh refreshes. The console showed repeated logs like:

```
💼 Deal change detected - refetching
✅ Payment splits are in sync with commission splits
📅 PaymentSummaryRow payment dates: ...
(repeated dozens of times)
```

## Root Cause Analysis

The issue was caused by **multiple overlapping real-time subscriptions** creating a feedback loop:

1. **DealDetailsPage** subscribes to deal changes via `supabase.channel('deal-updates-...')`
2. **PaymentTab** ALSO subscribed to deal changes via `supabase.channel('deal-changes-...')`
3. **BillToSection** was receiving `deal` as a prop and initializing state from it

### The Loop:
1. User edits a bill-to field
2. BillToSection saves to database
3. DealDetailsPage real-time subscription fires → updates `deal` state → re-renders children
4. PaymentTab real-time subscription ALSO fires → refetches all payment data
5. PaymentTab re-renders → passes new props to BillToSection
6. If BillToSection's useEffect dependencies included bill-to fields, it would re-trigger
7. Repeat endlessly

## Solution

### 1. Decoupled BillToSection from Parent Deal State

**Before:** BillToSection received `deal` object as prop
```typescript
interface BillToSectionProps {
  deal: Deal;  // Full deal object - changes on every parent re-render
  ...
}
```

**After:** BillToSection only receives primitive IDs
```typescript
interface BillToSectionProps {
  dealId: string;    // Primitive - stable reference
  clientId?: string; // Primitive - stable reference
  commissionSplits: CommissionSplit[];
  brokers: Broker[];
}
```

### 2. BillToSection Fetches Its Own Data

Instead of initializing from props, BillToSection now fetches bill-to fields directly from the database on mount:

```typescript
// Fetch bill-to data directly from DB on mount
useEffect(() => {
  if (!dealId || fetchedForDealId.current === dealId) return;

  fetchedForDealId.current = dealId;
  setLoading(true);

  supabase
    .from('deal')
    .select('bill_to_company_name, bill_to_contact_name, bill_to_email, bill_to_cc_emails, bill_to_bcc_emails')
    .eq('id', dealId)
    .single()
    .then(({ data, error }) => {
      // ... set local state
      setLoading(false);
    });
}, [dealId]);
```

### 3. Custom Debounced Save (Not useAutosave Hook)

The `useAutosave` hook caused issues because it compared object references. Instead, we use a simple custom debounce:

```typescript
const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
const pendingSaveRef = useRef<Record<string, string>>({});

const saveField = useCallback((field: string, value: string) => {
  if (!dealId) return;

  // Queue the field for saving
  pendingSaveRef.current[field] = value;

  // Clear existing timeout
  if (saveTimeoutRef.current) {
    clearTimeout(saveTimeoutRef.current);
  }

  // Debounce: save after 800ms of no changes
  saveTimeoutRef.current = setTimeout(async () => {
    const fieldsToSave = { ...pendingSaveRef.current };
    pendingSaveRef.current = {};

    if (Object.keys(fieldsToSave).length === 0) return;

    setSaving(true);
    // ... save to database
    setSaving(false);
  }, 800);
}, [dealId]);
```

### 4. Removed Deal Subscription from PaymentTab

**This was the critical fix.** PaymentTab had its own deal subscription that was redundant (DealDetailsPage already handles it) and was causing the cascade:

```typescript
// REMOVED this entire subscription:
const dealSubscription = supabase
  .channel(`deal-changes-${deal.id}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'deal',
    filter: `id=eq.${deal.id}`
  }, (payload) => {
    // This was firing on EVERY bill_to field change!
    paymentDataCache.delete(deal.id);
    fetchPaymentData();
  })
  .subscribe();
```

**PaymentTab now only subscribes to:**
- `payment` table changes
- `payment_split` table changes
- `commission_split` table changes

It does NOT need to watch the `deal` table because DealDetailsPage handles that at the parent level.

## Key Lessons Learned

### 1. Don't Duplicate Real-Time Subscriptions

If a parent component subscribes to a table, child components generally shouldn't subscribe to the same table. The parent's state update will flow down via props.

### 2. Decouple Components That Manage Their Own Data

If a component saves data independently (like BillToSection), it should:
- Receive only IDs as props (primitives that don't change)
- Fetch its own data on mount
- Manage state locally
- NOT react to parent prop changes for the fields it manages

### 3. The useAutosave Hook Has Limitations

The `useAutosave` hook works well when:
- The component receives initial data from props and then manages it locally
- There are no competing real-time subscriptions

It causes issues when:
- The component's data object is recreated on every render
- Multiple subscriptions are competing to update the same data

### 4. Supabase Real-Time payload.old is Unreliable

We tried to filter deal changes by comparing `payload.old` vs `payload.new` to detect which fields changed. This doesn't work reliably because Supabase doesn't always include the full old record (requires REPLICA IDENTITY FULL on the table).

## Files Changed

1. **`src/components/BillToSection.tsx`**
   - Changed props from `deal: Deal` to `dealId: string, clientId?: string`
   - Added independent data fetching on mount
   - Custom debounced save instead of useAutosave hook

2. **`src/components/PaymentTab.tsx`**
   - Updated BillToSection props usage
   - **REMOVED** the deal table real-time subscription
   - Added comment explaining why deal subscription was removed

## Testing Checklist

- [ ] Edit CC emails field - should save smoothly without page refresh
- [ ] Clear CC emails field completely - should save empty value
- [ ] Edit BCC emails field - should save smoothly
- [ ] Click "+ Add deal team emails" button - should populate and save
- [ ] Navigate away and back - bill-to data should persist
- [ ] Edit other deal fields (on Overview tab) - PaymentTab should not refetch
- [ ] Real-time updates to payments/splits should still work

## Related Documentation

- `docs/REFACTOR_2025_11_04_TWITCHING_FIX.md` - General patterns for fixing re-render issues
- `docs/DEBUGGING_RULES.md` - How to debug twitching issues
- `src/hooks/useAutosave.ts` - The autosave hook (use with caution)
