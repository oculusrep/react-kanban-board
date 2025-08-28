# Salesforce Field Mapping Reference

## Payment Date Fields (Completed August 28, 2025)

| Salesforce Field | Database Active Field | Database Legacy Field | Data Type | Notes |
|------------------|----------------------|----------------------|-----------|--------|
| `Payment_Date_Est__c` | `payment_date_estimated` | `sf_payment_date_est` | DATE | Estimated payment date |
| `PMT_Received_Date__c` | `payment_received_date` | `sf_payment_date_received` | DATE | Actual received date |
| `Payment_Received__c` | `payment_received` | - | BOOLEAN | **CRITICAL**: Payment status boolean |
| `Payment_Invoice_Date__c` | `payment_invoice_date` | `sf_payment_invoice_date` | DATE | Invoice sent date |
| `OREP_Invoice__c` | `orep_invoice` | - | TEXT | QuickBooks invoice number |
| `Payment_Date_Actual__c` | ~~removed~~ | `sf_payment_date_actual` | DATE | Legacy only |

## Migration Script Update Pattern

When adding new field mappings, update all three sections:

### 1. INSERT Statement
```sql
INSERT INTO payment (
    -- existing fields...
    sf_payment_date_est,
    payment_date_estimated,
    sf_payment_date_received,
    payment_received_date,
    payment_received,
    orep_invoice
)
```

### 2. SELECT Statement  
```sql
SELECT
    -- existing fields...
    p."Payment_Date_Est__c" AS sf_payment_date_est,
    p."Payment_Date_Est__c" AS payment_date_estimated,
    p."PMT_Received_Date__c" AS sf_payment_date_received,
    p."PMT_Received_Date__c" AS payment_received_date,
    p."Payment_Received__c" AS payment_received,
    p."OREP_Invoice__c" AS orep_invoice
```

### 3. ON CONFLICT Section
```sql
ON CONFLICT (sf_id) DO UPDATE SET
    -- existing fields...
    sf_payment_date_est = EXCLUDED.sf_payment_date_est,
    payment_date_estimated = EXCLUDED.payment_date_estimated,
    sf_payment_date_received = EXCLUDED.sf_payment_date_received,
    payment_received_date = EXCLUDED.payment_received_date,
    payment_received = EXCLUDED.payment_received,
    orep_invoice = EXCLUDED.orep_invoice;
```

## Common Mapping Patterns

### Date Fields
- **Pattern**: `SalesforceField__c` → `local_field` (active) + `sf_salesforce_field` (legacy)
- **Purpose**: Active for business logic, legacy for audit trail

### Boolean Fields  
- **Pattern**: `SalesforceBoolean__c` → `local_boolean`
- **Critical**: Always map boolean fields - missing mappings cause silent failures

### Text/ID Fields
- **Pattern**: `SalesforceText__c` → `local_field`  
- **Example**: Invoice numbers, external IDs

## Troubleshooting Checklist

### Data Not Appearing
1. ✅ Check browser console for query errors
2. ✅ Verify field exists in database schema
3. ✅ Confirm mapping in all three SQL sections
4. ✅ Test query in database directly

### UI Not Updating
1. ✅ Check component SELECT statements include new fields
2. ✅ Verify TypeScript interfaces match database
3. ✅ Clear cache and refresh data

### Status Issues
1. ✅ Verify boolean field mappings (most common cause)
2. ✅ Check for type mismatches (boolean vs string)
3. ✅ Confirm Salesforce data has values

## Field Naming Conventions

- **Active Fields**: `field_name` (used in business logic)
- **Salesforce Legacy**: `sf_original_name` (audit trail)
- **QuickBooks Prep**: `qb_field_name` (future API integration)

## Next Integration Areas

### QuickBooks Online (Future)
- Use existing `qb_invoice_id`, `qb_payment_id` fields
- Map to QBO API response fields
- Maintain `orep_invoice` for manual entries

### Additional Salesforce Objects  
- Contact roles and relationships
- Property and deal associations
- Commission calculation overrides