# Migration Best Practices

## Critical Migration Pattern: ALWAYS USE UPSERT

**⚠️ MANDATORY PATTERN**: All Salesforce-to-PostgreSQL migrations MUST use UPSERT to prevent duplicates and sync updates.

## Why UPSERT is Required

### The Problem This Document Prevents
- **Duplicate Crisis**: Notes migration created 1,728 duplicate records (52% of table)
- **Missing Updates**: Changes in Salesforce don't sync to our system
- **Data Inconsistency**: Multiple versions of the same record with different data
- **Wasted Time**: Hours debugging "missing" data that was actually duplicate/stale

### The Solution: UPSERT Pattern
```sql
INSERT INTO table_name (...)
SELECT ...
FROM salesforce_table
-- CRITICAL: Use UPSERT instead of plain INSERT
ON CONFLICT (unique_constraint)
DO UPDATE SET
    field1 = EXCLUDED.field1,
    field2 = EXCLUDED.field2,
    updated_at = EXCLUDED.updated_at,
    -- Preserve original created_at
    created_at = COALESCE(table_name.created_at, EXCLUDED.created_at);
```

## Standard Migration Template

### 1. Basic UPSERT Structure
```sql
-- ============================================
-- [ENTITY] MIGRATION SCRIPT - UPSERT PATTERN
-- ============================================

-- Report current state
SELECT
    'Before migration' as stage,
    COUNT(*) as total_records,
    COUNT(DISTINCT sf_id) as unique_sf_ids
FROM target_table;

-- Migration with UPSERT
INSERT INTO target_table (
    sf_id,
    -- all other fields
    created_at,
    updated_at
)
SELECT DISTINCT ON (sf."Id", related_field)
    sf."Id" as sf_id,
    -- field mappings
    sf."CreatedDate"::timestamp as created_at,
    sf."LastModifiedDate"::timestamp as updated_at
FROM salesforce_source_table sf
-- Join conditions
WHERE sf."Id" IS NOT NULL
-- Critical uniqueness for DISTINCT ON
ORDER BY sf."Id", related_field, sf."LastModifiedDate" DESC

-- UPSERT: Prevent duplicates AND sync updates
ON CONFLICT (sf_id, related_entity_id)  -- Adjust constraint as needed
DO UPDATE SET
    -- Update all fields except created_at
    field1 = EXCLUDED.field1,
    field2 = EXCLUDED.field2,
    updated_at = EXCLUDED.updated_at,
    -- PRESERVE original created_at timestamp
    created_at = COALESCE(target_table.created_at, EXCLUDED.created_at);

-- Report results
SELECT
    'After migration' as stage,
    COUNT(*) as total_records,
    COUNT(DISTINCT sf_id) as unique_sf_ids,
    COUNT(*) - COUNT(DISTINCT sf_id) as duplicates_remaining
FROM target_table;
```

### 2. Relationship Mapping Pattern
```sql
-- Smart relationship mapping based on Salesforce ID prefixes
CASE
    WHEN sf_linked_id LIKE '001%' THEN
        (SELECT c.id FROM client c WHERE c.sf_id = sf_linked_id LIMIT 1)
    WHEN sf_linked_id LIKE '006%' THEN
        (SELECT d.id FROM deal d WHERE d.sf_id = sf_linked_id LIMIT 1)
    WHEN sf_linked_id LIKE 'a1O%' THEN
        (SELECT p.id FROM property p WHERE p.sf_id = sf_linked_id LIMIT 1)
    WHEN sf_linked_id LIKE '003%' THEN
        (SELECT c.id FROM contact c WHERE c.sf_id = sf_linked_id LIMIT 1)
    ELSE NULL
END as target_entity_id
```

### 3. Lookup Table UPSERT Pattern
```sql
-- For reference/lookup tables
INSERT INTO lookup_table (name, value, sort_order, active) VALUES
('Active', true, 1, true),
('Inactive', false, 2, true)
ON CONFLICT (name) DO UPDATE SET
    value = EXCLUDED.value,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active;
```

## Migration Checklist

### Before Writing Migration
- [ ] Identify unique constraint for UPSERT (usually `sf_id` + related entity)
- [ ] Map all Salesforce relationship fields to internal foreign keys
- [ ] Determine which fields should update vs preserve on conflict
- [ ] Plan for orphaned relationships (SF IDs that don't exist in our system)

### Migration Script Requirements
- [ ] Use `INSERT ... ON CONFLICT DO UPDATE SET` pattern
- [ ] Include before/after record counts
- [ ] Preserve `created_at` timestamps using `COALESCE`
- [ ] Update all other fields on conflict
- [ ] Use `DISTINCT ON` to handle multiple relationships per record
- [ ] Include validation queries at the end

### Testing Checklist
- [ ] Run migration on test data first
- [ ] Verify no duplicates created (`COUNT(*) = COUNT(DISTINCT sf_id)`)
- [ ] Test running migration twice (should be idempotent)
- [ ] Verify relationship mappings work correctly
- [ ] Check that updates from Salesforce sync properly

## Common Patterns by Entity Type

### 1. Simple Entity (Client, Deal, Property)
```sql
-- Single record per Salesforce ID
ON CONFLICT (sf_id)
DO UPDATE SET ...
```

### 2. Relationship Entity (ContentDocumentLink, Notes)
```sql
-- Multiple relationships per Salesforce record
ON CONFLICT (sf_content_note_id, related_object_id)
DO UPDATE SET ...
```

### 3. Lookup/Reference Tables
```sql
-- Name-based uniqueness
ON CONFLICT (name)
DO UPDATE SET ...
```

## Anti-Patterns to Avoid

### ❌ NEVER DO: Plain INSERT
```sql
-- This creates duplicates!
INSERT INTO note (sf_content_note_id, ...)
SELECT cn."Id", ...
FROM salesforce_ContentNote cn;
```

### ❌ NEVER DO: INSERT with EXISTS check
```sql
-- This misses updates!
INSERT INTO note (...)
SELECT ...
WHERE NOT EXISTS (SELECT 1 FROM note WHERE sf_id = cn."Id");
```

### ❌ NEVER DO: DELETE then INSERT
```sql
-- This loses data and breaks relationships!
DELETE FROM note WHERE sf_content_note_id = 'some_id';
INSERT INTO note (...) VALUES (...);
```

## Success Metrics

A successful migration should show:
```sql
-- Validation query template
SELECT
    'Migration Results' as summary,
    COUNT(*) as total_records,
    COUNT(DISTINCT sf_id) as unique_sf_records,
    CASE
        WHEN COUNT(*) = COUNT(DISTINCT sf_id) THEN 'NO DUPLICATES ✅'
        ELSE CONCAT(COUNT(*) - COUNT(DISTINCT sf_id), ' DUPLICATES ❌')
    END as duplicate_status
FROM migrated_table;
```

## Emergency Duplicate Cleanup

If duplicates exist, use this pattern to clean up:
```sql
-- Remove duplicates, keeping most recent
WITH ranked_records AS (
  SELECT
    id,
    sf_id,
    ROW_NUMBER() OVER (
      PARTITION BY sf_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) as rn
  FROM target_table
  WHERE sf_id IS NOT NULL
)
DELETE FROM target_table
WHERE id IN (
  SELECT id FROM ranked_records WHERE rn > 1
);
```

## Migration Documentation Requirements

Each migration script must include:
1. **Purpose**: What data is being migrated
2. **Unique Constraint**: What fields prevent duplicates
3. **Relationship Mapping**: How Salesforce IDs map to our entities
4. **Validation**: Queries to verify success
5. **Rollback Plan**: How to undo if needed

---

**Remember**: Migration problems like the 1,728 duplicate notes could have been prevented by following this UPSERT pattern from the start. Always use UPSERT for Salesforce migrations!