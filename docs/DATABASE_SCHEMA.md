# Database Schema Documentation

## Overview

This document outlines the database schema for the Real Estate Commission Management System, including tables, relationships, and recent additions.

## Core Tables

### User Management

#### `user` Table
Primary user/broker table for system authentication and ownership tracking.

```sql
CREATE TABLE "user" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sf_id TEXT UNIQUE,           -- Salesforce User ID
  name TEXT,                   -- Full name
  email TEXT,                  -- Email address
  first_name TEXT,             -- First name
  last_name TEXT,              -- Last name
  active BOOLEAN DEFAULT true, -- User status
  sf_user_type TEXT,           -- Salesforce user type
  sf_username TEXT,            -- Salesforce username
  sf_profile_id TEXT,          -- Salesforce profile ID
  sf_user_role_id TEXT,        -- Salesforce role ID
  created_by_sf_id TEXT,       -- Salesforce creator
  created_by_id UUID,          -- Local creator
  updated_by_sf_id TEXT,       -- Salesforce updater
  updated_by_id UUID,          -- Local updater
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Contact Management

#### `client` Table
High-level client entities (companies/organizations).

```sql
CREATE TABLE client (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT,            -- Client company name
  type TEXT,                   -- Client type (Tenant, Landlord, etc.)
  phone TEXT,                  -- Primary phone
  email TEXT,                  -- Primary email
  sf_id TEXT UNIQUE,           -- Salesforce Account ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `contact` Table
Individual contacts associated with clients.

```sql
CREATE TABLE contact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES client(id), -- Associated client
  company TEXT,                -- Contact's company
  contact_tags TEXT,           -- Tags/categories
  email TEXT,                  -- Work email
  personal_email TEXT,         -- Personal email
  fax TEXT,                    -- Fax number
  first_name TEXT,             -- First name
  last_name TEXT,              -- Last name
  middle_name TEXT,            -- Middle name
  salutation TEXT,             -- Title/salutation
  title TEXT,                  -- Job title
  phone TEXT,                  -- Work phone
  mobile_phone TEXT,           -- Mobile phone
  -- Address fields
  mailing_street TEXT,
  mailing_city TEXT,
  mailing_state TEXT,
  mailing_zip TEXT,
  mailing_country TEXT,
  -- Professional links
  icsc_profile_link TEXT,
  linked_in_profile_link TEXT,
  retail_sphere_link TEXT,
  -- Status and classification
  is_site_selector BOOLEAN,
  tenant_repped BOOLEAN,
  linked_in_connection BOOLEAN,
  lead_status_id TEXT,
  tenant_rep_contact_id UUID,
  -- Salesforce integration
  sf_id TEXT UNIQUE,
  sf_account_id TEXT,
  sf_contact_name TEXT,
  sf_contact_type TEXT,
  sf_converted_date DATE,
  sf_email_list TEXT,
  sf_lead_list TEXT,
  sf_lead_notes TEXT,
  sf_lead_status TEXT,
  sf_lead_tags TEXT,
  sf_master_record_id TEXT,
  sf_name TEXT,
  sf_photo_url TEXT,
  sf_tenant_rep_id TEXT,
  source_type TEXT NOT NULL,
  -- Audit fields
  created_by_id UUID REFERENCES "user"(id),
  owner_id UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Property Management

#### `property` Table
Core properties table with location, financial, and market data.

```sql
CREATE TABLE property (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sf_id TEXT UNIQUE,               -- Salesforce Property ID
  
  -- Basic Information
  property_name TEXT,              -- Property name
  description TEXT,                -- Property description
  landlord TEXT,                   -- Landlord name
  
  -- Location Information
  address TEXT,                    -- Street address
  city TEXT,                       -- City
  state TEXT,                      -- State/Province
  zip TEXT,                        -- ZIP/Postal code
  country TEXT,                    -- Country
  county TEXT,                     -- County
  latitude NUMERIC,                -- GPS latitude
  longitude NUMERIC,               -- GPS longitude
  verified_latitude NUMERIC,       -- Verified GPS latitude
  verified_longitude NUMERIC,      -- Verified GPS longitude
  trade_area TEXT,                 -- Trade area description
  parcel_id TEXT,                  -- Tax parcel ID
  
  -- Physical Specifications
  building_sqft NUMERIC,           -- Building square footage
  available_sqft NUMERIC,          -- Available square footage
  acres NUMERIC,                   -- Property size in acres
  
  -- Financial Information
  asking_purchase_price NUMERIC,   -- Purchase price
  asking_lease_price NUMERIC,      -- Lease price
  rent_psf NUMERIC,               -- Rent per square foot
  all_in_rent NUMERIC,            -- All-in rent
  nnn_psf NUMERIC,                -- NNN per square foot
  lease_expiration_date DATE,      -- Lease expiration
  
  -- Market Analysis
  "1_mile_pop" NUMERIC,           -- 1-mile population
  "3_mile_pop" NUMERIC,           -- 3-mile population
  hh_income_median_3_mile NUMERIC, -- Median household income (3-mile)
  demographics TEXT,               -- Demographics notes
  total_traffic NUMERIC,           -- Total traffic count
  traffic_count NUMERIC,           -- Primary traffic count
  traffic_count_2nd NUMERIC,       -- Secondary traffic count
  
  -- Links and Resources
  costar_link TEXT,               -- CoStar property link
  reonomy_link TEXT,              -- Reonomy property link
  map_link TEXT,                  -- Map link
  marketing_materials TEXT,        -- Marketing materials link
  site_plan TEXT,                 -- Site plan link
  tax_url TEXT,                   -- Tax information URL
  
  -- Status and Classification
  property_type_id UUID,          -- Property type reference
  property_stage_id UUID,         -- Property stage reference
  property_record_type_id UUID,   -- Property record type
  deal_type_id UUID,              -- Deal type reference
  contact_id UUID,                -- Primary contact reference
  contact_made BOOLEAN,           -- Contact made flag
  letter_sent BOOLEAN,            -- Letter sent flag
  
  -- Notes
  property_notes TEXT,            -- General notes
  layer_notes TEXT,               -- Layer-specific notes
  
  -- Audit Fields
  created_by_id UUID REFERENCES "user"(id),
  owner_id UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `property_unit` Table
Individual units within properties (for retail centers, office buildings, etc.).

```sql
CREATE TABLE property_unit (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sf_id TEXT UNIQUE,              -- Salesforce ID
    property_id UUID REFERENCES property(id), -- Parent property
    
    -- Unit Identification
    property_unit_name TEXT,        -- Unit name/number
    
    -- Physical Features
    sqft NUMERIC,                   -- Square footage
    patio BOOLEAN,                  -- Has patio
    inline BOOLEAN,                 -- Inline unit
    end_cap BOOLEAN,                -- End cap unit
    end_cap_drive_thru BOOLEAN,     -- End cap with drive-thru
    second_gen_restaurant BOOLEAN,  -- Second generation restaurant
    
    -- Financial Information
    rent NUMERIC,                   -- Base rent (USD)
    nnn NUMERIC,                    -- NNN charges (USD)
    lease_expiration_date DATE,     -- Lease expiration
    
    -- Notes and References
    unit_notes TEXT,                -- Unit-specific notes
    deal_id UUID REFERENCES deal(id), -- Associated deal
    site_submit_id UUID REFERENCES site_submit(id), -- Site submission
    
    -- Audit Fields
    created_by_sf_id TEXT,          -- Salesforce creator
    created_by_id UUID REFERENCES "user"(id), -- Local creator
    updated_by_sf_id TEXT,          -- Salesforce updater
    updated_by_id UUID REFERENCES "user"(id), -- Local updater
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Relationship Tables

### Property-Contact Junction

#### `property_contact` Table ⭐ **NEW**
Many-to-many relationship between properties and contacts.

```sql
CREATE TABLE property_contact (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sf_id TEXT UNIQUE,              -- Salesforce Junction ID
    
    -- Relationship Information
    property_id UUID REFERENCES property(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contact(id) ON DELETE CASCADE,
    
    -- Salesforce Legacy Fields
    sf_join_name TEXT,              -- Salesforce join record name
    sf_owner_id TEXT,               -- Salesforce owner ID
    sf_property_id TEXT,            -- Salesforce property reference
    sf_contact_id TEXT,             -- Salesforce contact reference
    sf_contact_name TEXT,           -- Salesforce contact name
    sf_email TEXT,                  -- Salesforce email
    sf_phone TEXT,                  -- Salesforce phone
    sf_mobile_phone TEXT,           -- Salesforce mobile phone
    
    -- Audit Fields
    sf_created_by_id TEXT,          -- Salesforce creator
    created_by_id UUID REFERENCES "user"(id), -- Local creator
    updated_by_sf_id TEXT,          -- Salesforce updater
    updated_by_id UUID REFERENCES "user"(id), -- Local updater
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(property_id, contact_id) -- Prevent duplicate relationships
);

-- Performance Indexes
CREATE INDEX idx_property_contact_property_id ON property_contact(property_id);
CREATE INDEX idx_property_contact_contact_id ON property_contact(contact_id);
CREATE INDEX idx_property_contact_sf_id ON property_contact(sf_id);
```

**Key Features:**
- **Many-to-Many Relationship**: Properties can have multiple contacts; contacts can be on multiple properties
- **Salesforce Integration**: Maps from `salesforce_J_Property_2_Contacts__c`
- **Deduplication Logic**: Migration handles duplicate relationships by keeping most recent
- **Cascade Deletes**: Junction records are cleaned up when properties or contacts are deleted

### Deal-Contact Junction

#### `deal_contact` Table
Links contacts to deals with role information.

```sql
CREATE TABLE deal_contact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sf_id TEXT NOT NULL UNIQUE,      -- Salesforce ID
  deal_id UUID REFERENCES deal(id), -- Deal reference
  contact_id UUID REFERENCES contact(id), -- Contact reference
  role_id UUID,                     -- Contact role
  primary_contact BOOLEAN,          -- Primary contact flag
  
  -- Salesforce Integration
  sf_opportunity_id TEXT,           -- Salesforce opportunity ID
  sf_contact_id TEXT,               -- Salesforce contact ID
  
  -- Audit Fields
  sf_created_by TEXT,
  sf_modified_by TEXT,
  created_by_id UUID REFERENCES "user"(id),
  updated_by_id UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Deal Management

#### `deal` Table
Core deals/opportunities table.

```sql
CREATE TABLE deal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sf_id TEXT UNIQUE,               -- Salesforce Opportunity ID
  
  -- Basic Information
  deal_name TEXT,                  -- Deal name
  deal_value NUMERIC,              -- Total deal value
  stage TEXT,                      -- Deal stage
  stage_id UUID,                   -- Stage reference
  probability NUMERIC,             -- Close probability (0-100)
  
  -- Important Dates
  close_date DATE,                 -- Expected close date
  target_close_date DATE,          -- Target close date
  loi_signed_date DATE,            -- LOI signed date
  closed_date DATE,                -- Actual close date
  booked_date DATE,                -- Booking date
  
  -- Relationships
  client_id UUID REFERENCES client(id), -- Associated client
  property_id UUID REFERENCES property(id), -- Associated property
  property_unit_id UUID REFERENCES property_unit(id), -- Specific unit
  assignment_id UUID,              -- Assignment reference
  site_submit_id UUID REFERENCES site_submit(id), -- Site submission
  deal_team_id UUID,               -- Deal team reference
  
  -- Classification
  transaction_type_id UUID,        -- Transaction type
  property_type_id UUID,           -- Property type
  representation_id UUID,          -- Representation type
  source TEXT,                     -- Deal source
  
  -- Size Information
  size_sqft NUMERIC,              -- Deal size in square feet
  size_acres NUMERIC,             -- Deal size in acres
  
  -- Commission Structure
  commission_percent NUMERIC,      -- Commission percentage
  flat_fee_override NUMERIC,       -- Flat fee override
  fee NUMERIC,                     -- Total fee amount
  calculated_fee NUMERIC,          -- Calculated fee
  
  -- Commission Breakdown
  referral_fee_percent NUMERIC,   -- Referral fee percentage
  referral_fee_usd NUMERIC,       -- Referral fee amount
  referral_payee_client_id UUID REFERENCES client(id), -- Referral payee
  gci NUMERIC,                     -- Gross commission income
  agci NUMERIC,                    -- Adjusted gross commission income
  house_percent NUMERIC,          -- House percentage
  house_usd NUMERIC,               -- House dollar amount
  origination_percent NUMERIC,    -- Origination percentage
  origination_usd NUMERIC,        -- Origination dollar amount
  site_percent NUMERIC,           -- Site percentage
  site_usd NUMERIC,                -- Site dollar amount
  deal_percent NUMERIC,           -- Deal percentage
  deal_usd NUMERIC,                -- Deal dollar amount
  
  -- Payment Configuration
  number_of_payments INTEGER,      -- Number of payment installments
  sf_multiple_payments BOOLEAN,   -- Multiple payments flag
  
  -- Audit Fields
  created_by_id UUID REFERENCES "user"(id),
  owner_id UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Commission and Payment System

#### `commission_split` Table
Broker commission splits for deals.

```sql
CREATE TABLE commission_split (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deal(id), -- Associated deal
  broker_id UUID REFERENCES "user"(id), -- Broker receiving split
  
  -- Split Percentages
  split_origination_percent NUMERIC, -- Origination percentage
  split_site_percent NUMERIC,        -- Site percentage
  split_deal_percent NUMERIC,        -- Deal percentage
  
  -- Split Amounts (calculated)
  split_origination_usd NUMERIC,     -- Origination dollar amount
  split_site_usd NUMERIC,            -- Site dollar amount
  split_deal_usd NUMERIC,            -- Deal dollar amount
  split_broker_total NUMERIC,        -- Total broker amount
  
  -- Audit Fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `payment` Table
Payment tracking for deals.

```sql
CREATE TABLE payment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sf_id TEXT UNIQUE,               -- Salesforce Payment ID
  deal_id UUID REFERENCES deal(id), -- Associated deal
  
  -- Payment Identification
  payment_name TEXT,               -- Payment name
  payment_sequence INTEGER,       -- Payment number in sequence
  payment_amount NUMERIC,         -- Payment amount
  
  -- Payment Dates
  payment_date_estimated DATE,    -- Estimated payment date
  payment_received_date DATE,     -- Actual received date
  payment_invoice_date DATE,      -- Invoice date
  
  -- Salesforce Date Fields (read-only)
  sf_received_date DATE,
  sf_payment_date_est DATE,
  sf_payment_date_received DATE,
  sf_payment_date_actual DATE,
  sf_payment_invoice_date DATE,
  
  -- Status Tracking
  payment_received BOOLEAN,        -- Payment received flag
  sf_payment_status TEXT,         -- Salesforce payment status
  sf_invoice_sent_date DATE,      -- Invoice sent date
  
  -- Integration Fields
  qb_invoice_id TEXT,             -- QuickBooks invoice ID
  qb_payment_id TEXT,             -- QuickBooks payment ID
  qb_sync_status TEXT,            -- QuickBooks sync status
  qb_last_sync TIMESTAMPTZ,       -- Last QuickBooks sync
  orep_invoice TEXT,              -- OREP invoice number
  
  -- Disbursement Tracking
  referral_fee_paid BOOLEAN DEFAULT FALSE, -- Referral fee disbursed
  
  -- Legacy Fields
  status TEXT,                    -- Legacy status field
  payment_date DATE,              -- Legacy payment date
  invoice_sent BOOLEAN,           -- Legacy invoice sent flag
  
  -- Audit Fields
  sf_created_by_id TEXT,
  created_by_id UUID REFERENCES "user"(id),
  sf_updated_by_id TEXT,
  updated_by_id UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `payment_split` Table
Individual broker payment splits.

```sql
CREATE TABLE payment_split (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payment(id), -- Associated payment
  commission_split_id UUID REFERENCES commission_split(id), -- Commission split reference
  broker_id UUID REFERENCES "user"(id),  -- Broker receiving payment
  
  -- Split Amounts
  split_broker_total NUMERIC,     -- Total amount for broker
  split_origination_percent NUMERIC, -- Origination percentage
  split_site_percent NUMERIC,        -- Site percentage  
  split_deal_percent NUMERIC,        -- Deal percentage
  split_origination_usd NUMERIC,     -- Origination dollar amount
  split_site_usd NUMERIC,            -- Site dollar amount
  split_deal_usd NUMERIC,            -- Deal dollar amount
  
  -- Disbursement Status
  paid BOOLEAN DEFAULT FALSE,      -- Payment disbursed flag
  
  -- Audit Fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Lookup Tables

### Property Classification

#### `property_type` Table
Property type classifications (Office, Retail, Industrial, etc.).

```sql
CREATE TABLE property_type (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,             -- Display name
  description TEXT,                -- Type description
  sort_order INTEGER,              -- Display order
  active BOOLEAN DEFAULT TRUE     -- Active flag
);
```

#### `property_stage` Table
Property lifecycle stages.

```sql
CREATE TABLE property_stage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,             -- Display name
  description TEXT,                -- Stage description
  sort_order INTEGER,              -- Display order
  active BOOLEAN DEFAULT TRUE     -- Active flag
);
```

#### `property_record_type` Table
Property record types for financial field configuration.

```sql
CREATE TABLE property_record_type (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,             -- Display name
  description TEXT,                -- Type description
  sort_order INTEGER,              -- Display order
  active BOOLEAN DEFAULT TRUE     -- Active flag
);
```

## Key Relationships

### Primary Relationships
- **Users** → **Deals** (ownership, creation, updates)
- **Properties** ↔ **Contacts** (many-to-many via `property_contact`)
- **Deals** → **Properties** (one deal can reference one property)
- **Deals** ↔ **Contacts** (many-to-many via `deal_contact`)
- **Deals** → **Commission Splits** → **Users** (broker assignments)
- **Payments** → **Deals** (payment tracking)
- **Payment Splits** → **Payments** → **Users** (disbursement tracking)

### Junction Tables
1. **`property_contact`** - Properties ↔ Contacts
2. **`deal_contact`** - Deals ↔ Contacts  
3. **`commission_split`** - Deals → Brokers (commission allocation)
4. **`payment_split`** - Payments → Brokers (payment disbursement)

## Indexes and Performance

### Key Indexes
```sql
-- Property Contact Performance
CREATE INDEX idx_property_contact_property_id ON property_contact(property_id);
CREATE INDEX idx_property_contact_contact_id ON property_contact(contact_id);

-- Deal Performance  
CREATE INDEX idx_deal_property_id ON deal(property_id);
CREATE INDEX idx_deal_client_id ON deal(client_id);

-- Payment Performance
CREATE INDEX idx_payment_deal_id ON payment(deal_id);
CREATE INDEX idx_payment_sequence ON payment(deal_id, payment_sequence);

-- Commission Performance
CREATE INDEX idx_commission_split_deal_id ON commission_split(deal_id);
CREATE INDEX idx_commission_split_broker_id ON commission_split(broker_id);
```

## Migration Strategy

### Salesforce Integration
The system maintains dual field sets for Salesforce integration:
- **sf_*** fields**: Raw Salesforce data (read-only, for sync)
- **Local fields**: Application-specific data (editable)

### Migration Scripts
- **`_master_migration_script.sql`**: Complete schema setup
- **Deduplication Logic**: Handles duplicate relationships from Salesforce
- **UPSERT Patterns**: Safe re-running of migrations

### Data Integrity
- **Foreign Key Constraints**: Maintain referential integrity
- **Unique Constraints**: Prevent duplicate relationships
- **Cascade Deletes**: Clean up junction table records
- **NOT NULL Constraints**: Ensure required data is present