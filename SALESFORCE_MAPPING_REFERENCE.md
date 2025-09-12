# Salesforce Field Mapping Reference

## Activity/Task Fields (Completed December 2024)

### Core Activity Mappings

| Salesforce Field | Database Active Field | Database Legacy Field | Data Type | Notes |
|------------------|----------------------|----------------------|-----------|--------|
| `Id` | - | `sf_id` | VARCHAR(18) | Primary Salesforce ID |
| `WhoId` | `contact_id` | `sf_who_id` | UUID/VARCHAR(18) | Link to Contact |
| `WhatId` | `deal_id/property_id/site_submit_id` | `sf_what_id` | UUID/VARCHAR(18) | Intelligent object mapping |
| `OwnerId` | `owner_id` | `sf_owner_id` | UUID/VARCHAR(18) | Task owner |
| `AccountId` | `client_id` | `sf_account_id` | UUID/VARCHAR(18) | Link to Client |
| `CreatedById` | `user_id` | `sf_created_by_id` | UUID/VARCHAR(18) | Created by user |
| `LastModifiedById` | `updated_by` | `sf_updated_by` | UUID/VARCHAR(18) | Last modified by |

### Status and Priority Fields

| Salesforce Field | Database Active Field | Database Legacy Field | Data Type | Notes |
|------------------|----------------------|----------------------|-----------|--------|
| `Status` | `status_id` | `sf_status` | UUID/VARCHAR(100) | Activity status lookup |
| `Priority` | `activity_priority_id` | `sf_task_priority` | UUID/VARCHAR(100) | Priority lookup |
| `TaskSubtype` | `activity_type_id` | `sf_task_subtype` | UUID/VARCHAR(100) | Call/Email/Task mapping |
| `Task_Type__c` | `activity_task_type_id` | `sf_task_type` | UUID/VARCHAR(100) | Task category lookup |
| `IsClosed` | - | `sf_is_closed` | BOOLEAN | Closed status |
| `IsRecurrence` | - | `sf_is_recurring` | BOOLEAN | Recurring task flag |

### Content and Timing Fields

| Salesforce Field | Database Active Field | Database Legacy Field | Data Type | Notes |
|------------------|----------------------|----------------------|-----------|--------|
| `Subject` | `subject` | - | VARCHAR(255) | Activity title |
| `Description` | `description` | - | TEXT | Activity description |
| `ActivityDate` | `activity_date` | - | DATE | Scheduled date |
| `CreatedDate` | `created_at` | - | TIMESTAMP | Creation timestamp |
| `LastModifiedDate` | `updated_at` | - | TIMESTAMP | Last update |
| `CompletedDateTime` | `completed_at` | - | TIMESTAMP | Completion time |

### Call-Specific Fields

| Salesforce Field | Database Active Field | Database Legacy Field | Data Type | Notes |
|------------------|----------------------|----------------------|-----------|--------|
| `CallDisposition` | `call_disposition` | - | VARCHAR(100) | Call outcome |
| `CallDurationInSeconds` | `call_duration_seconds` | - | INTEGER | Call length in seconds |

### Custom Boolean Fields

| Salesforce Field | Database Active Field | Database Legacy Field | Data Type | Notes |
|------------------|----------------------|----------------------|-----------|--------|
| `IsHighPriority` | `is_high_priority` | - | BOOLEAN | High priority flag |
| `Meeting_Held__c` | `meeting_held` | - | BOOLEAN | Meeting completion status |
| `Completed_Call__c` | `completed_call` | - | BOOLEAN | Call completion flag |
| `Log_Prospecting_Call__c` | `is_prospecting_call` | - | BOOLEAN | Prospecting activity |
| `Completed_Property_Call__c` | `completed_property_call` | - | BOOLEAN | Property-related call |
| `Log_Property_Prospecting_call__c` | `is_property_prospecting_call` | - | BOOLEAN | Property prospecting |

### WhatId Object Mapping

The activity system uses intelligent WhatId prefix mapping:

| Prefix | Object Type | Database Field | Notes |
|--------|------------|---------------|-------|
| `006` | Opportunity (Deal) | `deal_id` | Standard Salesforce Opportunity |
| `a00` | Property | `property_id` | Custom Property object |
| `a05` | Site Submit | `site_submit_id` | Site submission object |
| `a03` | Property Research | `related_object_type/id` | Text reference |
| `0XB` | List Email | `related_object_type/id` | Email campaign reference |
| `a2R` | Individual Email | `related_object_type/id` | Individual email reference |
| `a1n` | Restaurant Trends | `related_object_type/id` | Trends analysis reference |

### Activity Migration Pattern

The activity migration follows the standard three-section pattern:

#### INSERT Statement
```sql
INSERT INTO activity (
    sf_id, sf_who_id, sf_what_id, sf_owner_id, sf_account_id, sf_created_by_id, sf_updated_by,
    sf_status, sf_task_priority, sf_task_subtype, sf_task_type, sf_is_closed, sf_is_recurring,
    contact_id, status_id, owner_id, activity_priority_id, user_id, activity_type_id, 
    activity_task_type_id, updated_by, client_id,
    deal_id, property_id, site_submit_id, related_object_type, related_object_id,
    subject, description, activity_date, created_at, updated_at, completed_at,
    call_disposition, call_duration_seconds, is_high_priority, meeting_held, completed_call,
    is_prospecting_call, completed_property_call, is_property_prospecting_call
)
```

#### SELECT with Smart Mapping
```sql
SELECT 
    st."Id", st."WhoId", st."WhatId", st."OwnerId", st."AccountId", st."CreatedById", st."LastModifiedById",
    st."Status", st."Priority", st."TaskSubtype", st."Task_Type__c", st."IsClosed", st."IsRecurrence",
    
    -- Foreign Key Lookups
    (SELECT id FROM contact WHERE sf_id = st."WhoId" LIMIT 1),
    (SELECT id FROM activity_status WHERE is_default = true LIMIT 1),
    
    -- WhatId Intelligent Mapping
    CASE LEFT(st."WhatId", 3)
        WHEN '006' THEN (SELECT id FROM deal WHERE sf_id = st."WhatId" LIMIT 1)
        ELSE NULL
    END,
    
    -- Core fields...
    st."Subject", st."Description", st."ActivityDate"::DATE,
    COALESCE(st."IsHighPriority", false), COALESCE(st."Meeting_Held__c", false)
FROM "salesforce_Task" st
WHERE (st."IsDeleted" = false OR st."IsDeleted" IS NULL)
```

#### Post-Migration Updates
```sql
-- Update Priority based on Salesforce Priority field
UPDATE activity SET activity_priority_id = (
    SELECT ap.id FROM activity_priority ap 
    WHERE ap.name = activity.sf_task_priority
    LIMIT 1
)
WHERE sf_task_priority IS NOT NULL
AND EXISTS (SELECT 1 FROM activity_priority WHERE name = activity.sf_task_priority);
```

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