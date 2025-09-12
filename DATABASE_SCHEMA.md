# Database Schema Documentation

## Recent Schema Changes - Activity Management System

### New Activity Tables

The activity system has been added to manage tasks, calls, emails and other activities from Salesforce Task records.

#### Activity Lookup Tables

```sql
-- Activity status options
CREATE TABLE activity_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    is_closed BOOLEAN DEFAULT FALSE,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INTEGER,
    color VARCHAR(7),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Activity type categories  
CREATE TABLE activity_type (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(20),
    color VARCHAR(7),
    sort_order INTEGER,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Priority levels for activities
CREATE TABLE activity_priority (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    is_high_priority BOOLEAN DEFAULT FALSE,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INTEGER,
    color VARCHAR(7),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Task type classifications
CREATE TABLE activity_task_type (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50),
    description TEXT,
    icon VARCHAR(20),
    color VARCHAR(7),
    sort_order INTEGER,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### Main Activity Table

```sql
CREATE TABLE activity (
    -- Primary Key
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Salesforce Legacy Fields (Always Keep)
    sf_id VARCHAR(18) UNIQUE,
    sf_who_id VARCHAR(18),
    sf_what_id VARCHAR(18),
    sf_owner_id VARCHAR(18),
    sf_account_id VARCHAR(18),
    sf_created_by_id VARCHAR(18),
    sf_updated_by VARCHAR(18),
    sf_status VARCHAR(100),
    sf_task_priority VARCHAR(100),
    sf_task_subtype VARCHAR(100),
    sf_task_type VARCHAR(100),
    sf_is_closed BOOLEAN,
    sf_is_recurring BOOLEAN,
    
    -- Active Foreign Key Relationships
    contact_id UUID REFERENCES contact(id),
    status_id UUID REFERENCES activity_status(id),
    owner_id UUID REFERENCES "user"(id),
    activity_priority_id UUID REFERENCES activity_priority(id),
    user_id UUID REFERENCES "user"(id),
    activity_type_id UUID REFERENCES activity_type(id),
    activity_task_type_id UUID REFERENCES activity_task_type(id),
    updated_by UUID REFERENCES "user"(id),
    client_id UUID REFERENCES client(id),
    
    -- WhatId Relationship Mappings
    deal_id UUID REFERENCES deal(id),
    property_id UUID REFERENCES property(id),
    site_submit_id UUID REFERENCES site_submit(id),
    
    -- WhatId Text References (for smaller objects)
    related_object_type VARCHAR(50),
    related_object_id VARCHAR(18),
    
    -- Core Activity Fields
    subject VARCHAR(255),
    description TEXT,
    activity_date DATE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Call-Specific Fields
    call_disposition VARCHAR(100),
    call_duration_seconds INTEGER,
    
    -- Boolean Flags
    is_high_priority BOOLEAN,
    meeting_held BOOLEAN,
    completed_call BOOLEAN,
    is_prospecting_call BOOLEAN,
    completed_property_call BOOLEAN,
    is_property_prospecting_call BOOLEAN
);
```

### Activity WhatId Mapping

Activities are linked to related objects through intelligent WhatId prefix mapping:

- **006**: Deal objects (opportunity)
- **a00**: Property objects  
- **a05**: Site Submit objects
- **a03**: Property Research (text reference)
- **0XB**: List Email (text reference)
- **a2R**: Individual Email (text reference)
- **a1n**: Restaurant Trends (text reference)

### Migration Data

The system migrates ~23,435 Task records from `salesforce_Task` with full relationship mapping and data preservation.

## Payment Disbursement System Updates

### Payment Table Updates

```sql
-- Added disbursement tracking to payment table
ALTER TABLE payment ADD COLUMN IF NOT EXISTS referral_fee_paid BOOLEAN DEFAULT FALSE;
```

**New Field:**
- `referral_fee_paid` (BOOLEAN): Tracks whether the referral fee for this payment has been disbursed

### Payment Split Table Updates

```sql
-- Added disbursement tracking to payment_split table  
ALTER TABLE payment_split ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE;
```

**New Field:**
- `paid` (BOOLEAN): Tracks whether the broker commission for this split has been disbursed

### Type Definitions

#### Payment Interface Updates
```typescript
export interface Payment {
  // ... existing fields ...
  
  // Disbursement tracking
  referral_fee_paid?: boolean | null;
}
```

#### PaymentSplit Interface Updates
```typescript
export interface PaymentSplit {
  // ... existing fields ...
  
  // Disbursement tracking
  paid?: boolean | null;
}
```

## Disbursement Logic

### Referral Fee Calculation
Referral fees are calculated proportionally based on the payment amount versus the total deal amount:

```
proportionalReferralFee = dealReferralFee × (paymentAmount / totalDealAmount)
```

### Database Operations

#### Update Referral Payment Status
```sql
UPDATE payment 
SET referral_fee_paid = $1 
WHERE id = $2;
```

#### Update Payment Split Status
```sql
UPDATE payment_split 
SET paid = $1 
WHERE id = $2;
```

## Migration Notes

The migration script (`_master_migration_script.sql`) has been updated to include these new fields. When deploying:

1. Run the migration script to add the new columns
2. Existing records will have default values (FALSE for both fields)
3. The application will handle the new fields gracefully with null checks

## Data Flow

1. **Payment Received**: When `payment_received` is marked true on a payment
2. **Disbursement Generation**: System calculates all required disbursements:
   - Referral fee (if applicable, calculated proportionally)
   - Broker commissions (from payment splits with `split_broker_total > 0`)
3. **Status Tracking**: Each disbursement can be individually marked as paid
4. **Database Updates**: Status changes are persisted immediately to respective tables