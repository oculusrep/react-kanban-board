# Database Migration History - Property Cascade Deletes

## Overview
This document tracks the evolution of the property CASCADE DELETE migration and the issues encountered.

## Migration Timeline

### Attempt 1: Initial Migration
**File:** `supabase/migrations/20251103220000_add_property_cascade_deletes.sql`

**Approach:**
```sql
ALTER TABLE property_contact
DROP CONSTRAINT IF EXISTS property_contact_property_id_fkey,
ADD CONSTRAINT property_contact_property_id_fkey
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;
```

**Result:** ❌ Created duplicate constraints when run multiple times

**Issue:**
- PostgreSQL's `DROP CONSTRAINT IF EXISTS, ADD CONSTRAINT` syntax doesn't prevent duplicates
- Running the migration twice created multiple constraints with the same name
- Some tables ended up with both CASCADE and NO ACTION rules

**Verification Output:**
```
| table_name       | column_name | delete_rule | what_happens    |
| activity         | property_id | CASCADE     | ✅ Auto-deletes  |
| activity         | property_id | NO ACTION   | ❌ Still orphans |
| property_contact | property_id | CASCADE     | ✅ Auto-deletes  |
| property_contact | property_id | CASCADE     | ✅ Auto-deletes  |
| deal             | property_id | NO ACTION   | ❌ Still orphans |
```

### Attempt 2: Explicit Constraint Cleanup
**File:** `fix-property-constraints.sql`

**Approach:**
```sql
-- Drop known constraint names
ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS property_contact_property_id_fkey;
ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS property_contact_property_id_fkey1;
ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS property_contact_property_id_fkey2;
-- ... then recreate
```

**Result:** ❌ Still had duplicates and NO ACTION constraints

**Issue:**
- Constraint names weren't predictable
- Some constraints had different names than expected
- Manually listing potential constraint names wasn't comprehensive enough

**Verification Output:**
```
| table_name       | column_name | delete_rule | what_happens    |
| property_contact | property_id | CASCADE     | ✅ Auto-deletes  |
| property_contact | property_id | CASCADE     | ✅ Auto-deletes  | ← Still duplicate!
| deal             | property_id | SET NULL    | ⚠️ Sets to NULL |
| deal             | property_id | NO ACTION   | ❌ Still orphans | ← Still has NO ACTION!
```

### Attempt 3: Dynamic Constraint Discovery (SUCCESSFUL!)
**File:** `aggressive-fix-property-constraints.sql`

**Approach:**
```sql
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tc.constraint_name, tc.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_name = 'property'
            AND kcu.column_name = 'property_id'
    ) LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
    END LOOP;
END $$;
-- Then recreate with proper CASCADE/SET NULL
```

**Result:** ✅ SUCCESS!

**Why It Worked:**
- Dynamically queried `information_schema` to find ALL constraints
- Didn't rely on guessing constraint names
- Dropped every single property_id foreign key constraint
- Recreated them cleanly with proper CASCADE/SET NULL rules

**Final Verification Output:**
```
| table_name       | column_name | delete_rule | what_happens    |
| activity         | property_id | CASCADE     | ✅ Auto-deletes  |
| note_object_link | property_id | CASCADE     | ✅ Auto-deletes  |
| property_contact | property_id | CASCADE     | ✅ Auto-deletes  |
| property_unit    | property_id | CASCADE     | ✅ Auto-deletes  |
| deal             | property_id | SET NULL    | ⚠️ Sets to NULL |
| site_submit      | property_id | SET NULL    | ⚠️ Sets to NULL |
```

**Perfect!** No duplicates, no NO ACTION constraints!

## Key Learnings

### PostgreSQL Foreign Key Behavior

1. **Multiple Constraints Allowed**
   - PostgreSQL allows multiple foreign key constraints on the same column
   - This can create confusing situations where deletion behavior is unclear
   - The most restrictive constraint wins (NO ACTION prevents deletion even if CASCADE exists)

2. **Constraint Naming**
   - PostgreSQL auto-generates constraint names if not specified
   - Names can be unpredictable: `fkey`, `fkey1`, `fkey2`, etc.
   - Can't rely on naming patterns for cleanup

3. **DROP CONSTRAINT IF EXISTS, ADD CONSTRAINT**
   - This syntax doesn't work as expected for deduplication
   - The DROP happens, but ADD creates a NEW constraint
   - Running twice = two constraints with the same name (somehow PostgreSQL allows this!)

### Best Practices for Constraint Migrations

✅ **DO:**
- Query `information_schema` to discover existing constraints
- Use dynamic SQL in DO blocks for comprehensive cleanup
- Always verify constraints after migration
- Test migrations in development first

❌ **DON'T:**
- Assume constraint names
- Run migrations multiple times without verification
- Use simple DROP/ADD without checking for duplicates
- Skip the verification query

### Useful Queries

**Find all foreign key constraints on a column:**
```sql
SELECT
    tc.constraint_name,
    tc.table_name,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'property'
    AND kcu.column_name = 'property_id';
```

**Dynamically drop all constraints:**
```sql
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        -- Your query to find constraints here
    ) LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
                      r.table_name, r.constraint_name);
    END LOOP;
END $$;
```

## Migration Files Reference

All migration files are located in the project root:

1. `supabase/migrations/20251103220000_add_property_cascade_deletes.sql` - Original attempt (kept for history)
2. `fix-property-constraints.sql` - Second attempt (kept for reference)
3. `aggressive-fix-property-constraints.sql` - **Final successful migration** ✅

## Verification

To verify constraints are correct, run this query:

```sql
SELECT
    tc.table_name,
    kcu.column_name,
    rc.delete_rule,
    CASE
        WHEN rc.delete_rule = 'CASCADE' THEN '✅ Auto-deletes'
        WHEN rc.delete_rule = 'SET NULL' THEN '⚠️ Sets to NULL'
        WHEN rc.delete_rule = 'NO ACTION' THEN '❌ Still orphans'
        ELSE '❓ ' || rc.delete_rule
    END as what_happens
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'property'
ORDER BY rc.delete_rule, tc.table_name;
```

Expected results: 6 rows, no duplicates, no NO ACTION constraints.
