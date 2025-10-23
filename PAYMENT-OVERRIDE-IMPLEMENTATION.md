# Payment Amount Override - Implementation Summary

## Overview
Implemented a comprehensive payment amount override system that allows manual overrides of payment amounts while preventing automatic recalculation. This addresses instances where LL (LandLord/Lease) calculations differ slightly from expected values.

## Key Design Decisions

### 1. Stored Amount as Source of Truth
- **Decision**: Use `payment.payment_amount` (stored value) everywhere, not calculated amounts
- **Rationale**:
  - Allows manual corrections when calculations are slightly off
  - Consistent across all reports and payment splits
  - Simplifies logic (one source of truth)
- **Impact**:
  - Reports now show stored amounts
  - Splits calculate from stored amounts
  - Override system works seamlessly

### 2. Override Flag Instead of Null Check
- **Decision**: Added `amount_override` boolean flag
- **Rationale**:
  - Clear indicator of manual override
  - Triggers can check flag instead of complex logic
  - Easier to query and report on overridden payments
- **Alternative considered**: Null `override_at` field, but less explicit

### 3. Trigger Protection
- **Decision**: Update all auto-calculation triggers to skip payments with `amount_override = true`
- **Rationale**:
  - Prevents accidental overwrite of manual corrections
  - Maintains data integrity
  - Clear separation between auto-calculated and manual amounts

## Files Created/Modified

### Database Migrations

#### 1. `20251023_add_payment_amount_override.sql`
Adds override columns to payment table:
- `amount_override` BOOLEAN - Flag indicating manual override
- `override_by` UUID - User who set the override (for audit trail)
- `override_at` TIMESTAMP - When override was set

#### 2. `20251023_update_triggers_respect_override.sql`
Updates `auto_update_payment_amounts_on_deal_change()` function to:
- Skip payments with `amount_override = true` when recalculating
- Ensure new payments default to `amount_override = false`
- Add debug logging for override handling

### Frontend Changes

#### 1. `src/types/payment-dashboard.ts`
Added to `PaymentComparison` interface:
```typescript
ovis_amount_override: boolean | null; // If true, amount was manually overridden
```

#### 2. `src/components/payments/ComparisonReportTab.tsx`
Major changes:
- **Removed calculated amount logic** - Now uses stored `payment.payment_amount` everywhere
- **Added 3-dot menu** in Actions column with:
  - "🔧 Override Amount" - Open override modal
  - "📝 Edit Override" - Edit existing override (shows when overridden)
  - "🔓 Clear Override" - Remove override and allow auto-calculation
- **Added override modal** with:
  - Current amount display
  - New amount input
  - Warning about locking the amount
  - Save/Cancel buttons
- **Added visual indicators**:
  - 🔒 lock icon next to overridden payments
  - Menu text changes based on override status
- **Fetches `amount_override` field** from database

### Test Documentation

#### `test-payment-override.md`
Comprehensive test plan with 8 test scenarios:
1. Basic override functionality
2. Override persists through fee changes
3. Override persists through number_of_payments changes
4. Edit existing override
5. Clear override
6. Override affects payment splits correctly
7. Comparison report shows correct amounts
8. Override works after number decrease

Includes:
- Step-by-step instructions
- Expected results
- SQL verification queries
- Success criteria
- Rollback plan

## How It Works

### Setting an Override

1. User clicks 3-dot menu in comparison report
2. Clicks "Override Amount"
3. Enters new amount in modal
4. System updates database:
   ```sql
   UPDATE payment
   SET payment_amount = <new_amount>,
       amount_override = true,
       override_at = NOW()
   WHERE id = <payment_id>
   ```
5. Report refreshes and shows 🔒 icon

### Trigger Protection

When deal fee or number_of_payments changes:

```sql
-- Old behavior (before override system):
UPDATE payment
SET payment_amount = NEW.fee / NEW.number_of_payments
WHERE deal_id = NEW.id
  AND locked = false;

-- New behavior (with override system):
UPDATE payment
SET payment_amount = NEW.fee / NEW.number_of_payments
WHERE deal_id = NEW.id
  AND locked = false
  AND (amount_override = false OR amount_override IS NULL);  -- Skip overridden
```

### Clearing an Override

1. User clicks 3-dot menu
2. Clicks "Clear Override"
3. Confirms action
4. System clears override:
   ```sql
   UPDATE payment
   SET amount_override = false,
       override_at = NULL,
       override_by = NULL
   WHERE id = <payment_id>
   ```
5. Payment amount will be recalculated on next deal change
6. Report refreshes, 🔒 icon removed

## UI Flow

```
Comparison Report
  └─ Payment Row
      └─ Actions Column
          ├─ 3-dot menu button
          └─ 🔒 icon (if overridden)
              └─ On click menu:
                  ├─ "🔧 Override Amount" (if not overridden)
                  ├─ "📝 Edit Override" (if overridden)
                  └─ "🔓 Clear Override" (if overridden)

Override Modal (on click "Override" or "Edit")
  ├─ Deal name
  ├─ Payment sequence
  ├─ Current amount (read-only)
  ├─ New amount (input)
  ├─ Warning message
  └─ Buttons:
      ├─ Save Override
      └─ Cancel
```

## Benefits

1. **Handles Edge Cases**: LL calculations that are slightly off can be manually corrected
2. **Data Integrity**: Overrides are protected from accidental recalculation
3. **Transparency**: Clear visual indicators (🔒) show which payments are overridden
4. **Audit Trail**: Tracks who and when override was set
5. **Reversible**: Can clear override and return to auto-calculation
6. **Consistent Reporting**: All reports use stored amount (single source of truth)
7. **Split Accuracy**: Payment splits calculate from corrected amounts

## Migration Instructions

### Step 1: Run Migrations
In Supabase SQL Editor, run in order:
1. `20251023_add_payment_amount_override.sql`
2. `20251023_update_triggers_respect_override.sql`

### Step 2: Deploy Frontend
The frontend changes are backward compatible:
- Will handle both `amount_override = null` (old payments) and `false/true` (new)
- UI enhancements are additive (new Actions column)
- Report functionality remains the same

### Step 3: Test
Follow [test-payment-override.md](./test-payment-override.md) test plan

## Rollback Plan

If issues arise:

```sql
-- Disable all overrides and recalculate
UPDATE payment
SET amount_override = false,
    override_at = NULL,
    override_by = NULL
WHERE amount_override = true;

-- Recalculate all payment amounts
UPDATE payment p
SET payment_amount = d.fee / d.number_of_payments
FROM deal d
WHERE p.deal_id = d.id
  AND p.is_active = true
  AND p.locked = false;
```

## Future Enhancements (Optional)

1. **Bulk Override**: Allow overriding multiple payments at once
2. **Override History**: Track history of override changes (audit log)
3. **Override Reason**: Add optional text field for why override was set
4. **Email Notifications**: Notify stakeholders when overrides are set/cleared
5. **Override Report**: Dedicated report showing all overridden payments
6. **Permission Control**: Restrict who can set/clear overrides (RLS policies)

## Questions for Review

1. Should `override_by` be populated automatically (requires user context)?
2. Do we want to prevent overrides on locked payments?
3. Should we log override history in a separate audit table?
4. Do we need permission controls (RLS) for override actions?

## Testing Checklist

Before deploying to production:

- [ ] Run both migration scripts in order
- [ ] Complete all 8 test scenarios in test plan
- [ ] Verify SQL verification queries work
- [ ] Test with actual production-like data
- [ ] Verify payment splits calculate correctly
- [ ] Check comparison report loads without errors
- [ ] Test with different user roles (if RLS applies)
- [ ] Verify override persists through deal changes
- [ ] Test clearing override restores auto-calculation

## Support & Documentation

- Test Plan: `test-payment-override.md`
- UI Documentation: See "Actions Column" in Payment Dashboard
- Database Schema: See migration files for column details
- Trigger Logic: See `auto_update_payment_amounts_on_deal_change()` function
