# Payment Migration Fix - Duplicate Key Constraint Resolution

## Issue Summary

**Date**: October 2025
**Error**: `ERROR: 23505: could not create unique index "idx_payment_deal_sequence_unique"`
**Details**: `Key (deal_id, payment_sequence)=(ca1136a3-1f5b-4b7c-8d35-27c6e6200053, 2) is duplicated`

## Root Cause

The payment migration script was failing due to conflicts between:
1. **Manually-created payments** in the CRM (sf_id IS NULL)
2. **Salesforce-sourced payments** being migrated (sf_id IS NOT NULL)

### Why This Happened

Previous cleanup logic only deleted Salesforce payments:
```sql
-- OLD APPROACH - Only deleted Salesforce payments
DELETE FROM payment WHERE sf_id IS NOT NULL;
```

This left manually-created payments in the database that conflicted with incoming Salesforce data on the unique constraint `(deal_id, payment_sequence)`.

## Solution: Salesforce as Complete Source of Truth

For any deal that has Salesforce payment data, **ALL payments** (both manual and Salesforce-sourced) are deleted and refreshed from Salesforce.

### Implementation

**Location**: `_master_migration_script.sql` lines 1179-1208

```sql
-- Drop any existing unique constraints (will recreate after migration)
DROP INDEX IF EXISTS idx_payment_sequence_unique;
DROP INDEX IF EXISTS payment_deal_sequence_unique;
DROP INDEX IF EXISTS idx_payment_deal_sequence_unique;

-- Clear ALL payment data for deals that have Salesforce data
-- This includes both Salesforce-sourced AND manually-created payments
WITH sf_deals AS (
    SELECT DISTINCT (SELECT id FROM deal WHERE sf_id = p."Opportunity__c" LIMIT 1) AS deal_id
    FROM "salesforce_Payment__c" p
    WHERE p."Id" IS NOT NULL
      AND p."Payment_Amount__c" IS NOT NULL
      AND p."Opportunity__c" IS NOT NULL
)
DELETE FROM payment_split
WHERE payment_id IN (
    SELECT p.id FROM payment p
    WHERE p.deal_id IN (SELECT deal_id FROM sf_deals WHERE deal_id IS NOT NULL)
);

-- Now delete ALL payments for deals with Salesforce payment data
WITH sf_deals AS (
    SELECT DISTINCT (SELECT id FROM deal WHERE sf_id = p."Opportunity__c" LIMIT 1) AS deal_id
    FROM "salesforce_Payment__c" p
    WHERE p."Id" IS NOT NULL
      AND p."Payment_Amount__c" IS NOT NULL
      AND p."Opportunity__c" IS NOT NULL
)
DELETE FROM payment
WHERE deal_id IN (SELECT deal_id FROM sf_deals WHERE deal_id IS NOT NULL);
```

## Two-Step CTE Deduplication Pattern

**Location**: `_master_migration_script.sql` lines 1251-1294

The migration uses a two-step CTE approach to ensure unique payment sequences:

```sql
-- Step 1: Assign sequences using ROW_NUMBER()
WITH payment_with_sequence AS (
    SELECT
        p."Id" AS sf_id,
        p."Name" AS payment_name,
        (SELECT id FROM deal WHERE sf_id = p."Opportunity__c" LIMIT 1) AS deal_id,
        ROW_NUMBER() OVER (
            PARTITION BY p."Opportunity__c"
            ORDER BY p."CreatedDate", p."Id"
        ) AS payment_sequence,
        -- ... all other fields
    FROM "salesforce_Payment__c" p
    WHERE p."Id" IS NOT NULL
),
-- Step 2: Deduplicate using DISTINCT ON
payment_data AS (
    SELECT DISTINCT ON (deal_id, payment_sequence)
        *
    FROM payment_with_sequence
    WHERE deal_id IS NOT NULL
    ORDER BY deal_id, payment_sequence, updated_at DESC NULLS LAST
)
INSERT INTO payment (...)
SELECT * FROM payment_data
ON CONFLICT (sf_id) DO UPDATE SET ...
```

## Key Benefits

1. **Eliminates Duplicate Key Errors**: Ensures one payment per (deal_id, payment_sequence)
2. **Salesforce as Source of Truth**: For deals with Salesforce data, all payment information comes from Salesforce
3. **Idempotent**: Script can be run multiple times safely
4. **Preserves Manual Data**: Payments for deals WITHOUT Salesforce data remain untouched

## Testing Checklist

- [x] Script runs without unique constraint violations
- [x] Salesforce payments correctly assigned sequential payment_sequence
- [x] Manual payments for non-Salesforce deals preserved
- [x] payment_splits correctly deleted before parent payments (FK cascade)
- [x] Unique index created successfully after data insertion

## Migration Pattern for Future Reference

When migrating data where Salesforce should be source of truth:

1. **Identify affected records** using CTE
2. **Delete foreign key dependencies first** (payment_split → payment)
3. **Delete ALL records** for affected entities (not just Salesforce-sourced)
4. **Insert fresh data** using UPSERT pattern
5. **Create unique constraints** AFTER data insertion

## Related Documentation

- [MIGRATION_BEST_PRACTICES.md](../MIGRATION_BEST_PRACTICES.md) - General UPSERT patterns
- [COMMISSION_PERCENTAGES_MIGRATION_FIX.md](./COMMISSION_PERCENTAGES_MIGRATION_FIX.md) - Similar source-of-truth issue
- `_master_migration_script.sql` - Complete migration implementation

---

**Status**: ✅ RESOLVED - Migration script now runs successfully without duplicate key errors
