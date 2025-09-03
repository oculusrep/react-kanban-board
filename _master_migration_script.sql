-- ==============================================================================
-- Master Migration Script (Updated with Contact Roles)
-- ==============================================================================

-- ==============================================================================
-- User Table Migration (Must come first - other tables reference users)
-- ==============================================================================

-- First, ensure user table exists and add any missing columns
CREATE TABLE IF NOT EXISTS "user" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sf_id TEXT,
  name TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  active BOOLEAN DEFAULT true,
  sf_user_type TEXT,
  sf_username TEXT,
  sf_profile_id TEXT,
  sf_user_role_id TEXT,
  created_by_sf_id TEXT,
  created_by_id UUID,
  updated_by_sf_id TEXT,
  updated_by_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if they don't exist (based on your mapping)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS sf_user_type TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS sf_username TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS sf_profile_id TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS sf_user_role_id TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS created_by_sf_id TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS created_by_id UUID;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS updated_by_sf_id TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS updated_by_id UUID;

-- Add unique constraint on sf_id if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS user_sf_id_unique ON "user" (sf_id);

-- Populate user table from Salesforce (UPSERT pattern)
INSERT INTO "user" (sf_id, name, email, first_name, last_name, active, sf_user_type, sf_username, sf_profile_id, sf_user_role_id, created_by_sf_id, updated_by_sf_id, created_at, updated_at)
SELECT 
  "Id" as sf_id,
  "Name" as name,
  "Email" as email,
  "FirstName" as first_name,
  "LastName" as last_name,
  "IsActive" as active,
  "UserType" as sf_user_type,
  "Username" as sf_username,
  "ProfileId" as sf_profile_id,
  "UserRoleId" as sf_user_role_id,
  "CreatedById" as created_by_sf_id,
  "LastModifiedById" as updated_by_sf_id,
  "CreatedDate" as created_at,
  "LastModifiedDate" as updated_at
FROM "salesforce_User"
WHERE "Id" IS NOT NULL
ON CONFLICT (sf_id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  active = EXCLUDED.active,
  sf_user_type = EXCLUDED.sf_user_type,
  sf_username = EXCLUDED.sf_username,
  sf_profile_id = EXCLUDED.sf_profile_id,
  sf_user_role_id = EXCLUDED.sf_user_role_id,
  created_by_sf_id = EXCLUDED.created_by_sf_id,
  updated_by_sf_id = EXCLUDED.updated_by_sf_id,
  updated_at = EXCLUDED.updated_at;

-- ==============================================================================
-- Contact Role Lookup Table (Must come before deal_contact)
-- ==============================================================================

-- Create contact_role lookup table
CREATE TABLE IF NOT EXISTS contact_role (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique constraint on label
CREATE UNIQUE INDEX IF NOT EXISTS contact_role_label_unique ON contact_role (label);

-- Insert the role options in the specified order
INSERT INTO contact_role (label, sort_order, active) VALUES
('--None--', 1, true),
('Client', 2, true),
('Corporate Contact', 3, true),
('Co-Broker', 4, true),
('Owner', 5, true),
('Landlord', 6, true),
('Master Broker', 7, true),
('Attorney (Client Side)', 8, true),
('Attorney (Opposing Side)', 9, true),
('Engineer', 10, true),
('Architect', 11, true),
('Contractor', 12, true),
('Surveyor', 13, true),
('Lender', 14, true),
('Other', 15, true)
ON CONFLICT (label) DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

-- ==============================================================================
-- Client, Contact, and Deal Tables
-- ==============================================================================

-- Ensure site_submit_id column exists on deal (safe to run every time)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS site_submit_id uuid;

-- Ensure kanban_position column exists on deal (CRM-specific field, not from Salesforce)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS kanban_position INTEGER;

-- Ensure referral fields exist on deal
ALTER TABLE deal ADD COLUMN IF NOT EXISTS referral_payee_client_id UUID;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS referral_fee_percent NUMERIC(5,2);
ALTER TABLE deal ADD COLUMN IF NOT EXISTS referral_fee_usd NUMERIC(12,2);

-- Upsert into client table
INSERT INTO client (
  id,
  client_name,
  sf_id
)
SELECT
  gen_random_uuid(),
  a."Name",
  a."Id" AS sf_id
FROM "salesforce_Account" a
ON CONFLICT (sf_id) DO UPDATE SET
  client_name = EXCLUDED.client_name;

-- Upsert into contact table
INSERT INTO contact (
  id,
  first_name,
  last_name,
  email,
  phone,
  sf_id
)
SELECT
  gen_random_uuid(),
  c."FirstName",
  c."LastName",
  c."Email",
  c."Phone",
  c."Id" AS sf_id
FROM "salesforce_Contact" c
ON CONFLICT (sf_id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone;

WITH opp AS (
  SELECT
    o.*,
    CASE
      WHEN o."Assign_To__c" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN o."Assign_To__c"::uuid
      ELSE NULL
    END AS assign_to_uuid
  FROM "salesforce_Opportunity" o
)

-- Upsert into deal table
INSERT INTO deal (
  id,
  deal_name,
  client_id,
  property_id,
  deal_value,
  commission_percent,
  flat_fee_override,
  fee,
  stage_id,
  probability,
  target_close_date,
  loi_signed_date,
  closed_date,
  deal_team_id,
  referral_payee_client_id,
  referral_fee_percent,
  referral_fee_usd,
  sf_id
)
SELECT
  gen_random_uuid(),
  o."Name",
  c.id AS client_id,
  p.id AS property_id,
  o."Deal_Value__c",
  o."Commission__c",
  o."Amount",
  COALESCE(o."Amount", (o."Deal_Value__c" * (o."Commission__c" / 100.0))),
  ds.id AS stage_id,
  o."Probability",
  o."CloseDate",
  o."LOI_Signed_Date__c",
  o."Closed_Date__c",
  dt.id AS deal_team_id,
  c_ref.id AS referral_payee_client_id,
  o."Referral_Fee_p__c" AS referral_fee_percent,
  o."Referral_Fee__c" AS referral_fee_usd,
  o."Id" AS sf_id
FROM opp o
LEFT JOIN client     c     ON c.sf_id   = o."AccountId"
LEFT JOIN client     c_ref ON c_ref.sf_id = o."Referral_Payee_Account__c"
LEFT JOIN property   p     ON p.sf_id   = o."Property__c"
LEFT JOIN deal_stage ds    ON ds.label  = o."StageName"
LEFT JOIN deal_team  dt    ON dt.id     = o.assign_to_uuid
ON CONFLICT (sf_id) DO UPDATE SET
  deal_name = EXCLUDED.deal_name,
  client_id = EXCLUDED.client_id,
  property_id = EXCLUDED.property_id,
  deal_value = EXCLUDED.deal_value,
  commission_percent = EXCLUDED.commission_percent,
  flat_fee_override = EXCLUDED.flat_fee_override,
  fee = EXCLUDED.fee,
  stage_id = EXCLUDED.stage_id,
  probability = EXCLUDED.probability,
  target_close_date = EXCLUDED.target_close_date,
  loi_signed_date = EXCLUDED.loi_signed_date,
  closed_date = EXCLUDED.closed_date,
  deal_team_id = EXCLUDED.deal_team_id,
  referral_payee_client_id = EXCLUDED.referral_payee_client_id,
  referral_fee_percent = EXCLUDED.referral_fee_percent,
  referral_fee_usd = EXCLUDED.referral_fee_usd;
  -- NOTE: kanban_position is intentionally NOT updated here
  -- This preserves the CRM-specific positioning when deals are re-migrated

-- ==============================================================================
-- Fix Deal Table User References (updated_by_id and created_by_id)
-- ==============================================================================

-- Add created_by_id column if it doesn't exist
ALTER TABLE deal ADD COLUMN IF NOT EXISTS created_by_id UUID;

-- Add updated_by_id column if it doesn't exist (in case it was never created)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS updated_by_id UUID;

-- Update deal.updated_by_id to reference the user table properly
UPDATE deal d 
SET updated_by_id = u.id
FROM "salesforce_Opportunity" o
JOIN "user" u ON u.sf_id = o."LastModifiedById"
WHERE d.sf_id = o."Id";

-- Populate created_by_id
UPDATE deal d 
SET created_by_id = u.id
FROM "salesforce_Opportunity" o
JOIN "user" u ON u.sf_id = o."CreatedById"
WHERE d.sf_id = o."Id" AND d.created_by_id IS NULL;

-- Add foreign key constraints (drop first to avoid conflicts)
ALTER TABLE deal DROP CONSTRAINT IF EXISTS deal_updated_by_id_fkey;
ALTER TABLE deal ADD CONSTRAINT deal_updated_by_id_fkey FOREIGN KEY (updated_by_id) REFERENCES "user"(id);

ALTER TABLE deal DROP CONSTRAINT IF EXISTS deal_created_by_id_fkey;
ALTER TABLE deal ADD CONSTRAINT deal_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES "user"(id);

-- Add referral payee foreign key constraint
ALTER TABLE deal DROP CONSTRAINT IF EXISTS deal_referral_payee_client_id_fkey;
ALTER TABLE deal ADD CONSTRAINT deal_referral_payee_client_id_fkey FOREIGN KEY (referral_payee_client_id) REFERENCES client(id);

-- Create index for kanban performance
CREATE INDEX IF NOT EXISTS idx_deal_kanban_position ON deal(stage_id, kanban_position);

-- ==============================================================================
-- Populate deal.property_unit_id from BOTH sources
-- ==============================================================================

-- Ensure property_unit_id column exists on deal
ALTER TABLE deal ADD COLUMN IF NOT EXISTS property_unit_id UUID;

-- FIRST: Update from the junction table (Property_Unit_Opportunities)
WITH unit_links AS (
  SELECT DISTINCT ON (j."Opportunity__c")
    j."Opportunity__c" as opportunity_sf_id,
    j."Property_Unit__c" as property_unit_sf_id,
    j."LastModifiedDate" as last_modified
  FROM "salesforce_Property_Unit_Opportunities__c" j
  WHERE j."Opportunity__c" IS NOT NULL 
    AND j."Property_Unit__c" IS NOT NULL
  ORDER BY j."Opportunity__c", j."LastModifiedDate" DESC NULLS LAST
)
UPDATE deal d
SET property_unit_id = pu.id
FROM unit_links ul
JOIN property_unit pu ON pu.sf_id = ul.property_unit_sf_id
WHERE d.sf_id = ul.opportunity_sf_id
  AND d.property_unit_id IS NULL;

-- SECOND: Update from Opportunity.Property_Unit__c field
UPDATE deal d
SET property_unit_id = pu.id
FROM "salesforce_Opportunity" o
JOIN property_unit pu ON pu.sf_id = o."Property_Unit__c"
WHERE d.sf_id = o."Id"
  AND o."Property_Unit__c" IS NOT NULL
  AND d.property_unit_id IS NULL;

-- Upsert into property table
INSERT INTO property (
  id,
  property_name,
  property_stage_id,
  property_type_id,
  property_record_type_id,
  sf_id
)
SELECT
  gen_random_uuid(),
  p."Name",
  ps.id AS property_stage_id,
  pt.id AS property_type_id,
  prt.id AS property_record_type_id,
  p."Id" AS sf_id
FROM "salesforce_Property__c" p
LEFT JOIN property_stage        ps  ON ps.label  = p."stage__c"
LEFT JOIN property_type         pt  ON pt.label  = p."Property_Type__c"
LEFT JOIN "salesforce_RecordType" rt ON rt."Id" = p."RecordTypeId" AND rt."IsActive" = true
LEFT JOIN property_record_type  prt ON prt.label = rt."Name"
ON CONFLICT (sf_id) DO UPDATE SET
  property_name = EXCLUDED.property_name,
  property_stage_id = EXCLUDED.property_stage_id,
  property_type_id = EXCLUDED.property_type_id,
  property_record_type_id = EXCLUDED.property_record_type_id;

-- Upsert into assignment table
INSERT INTO assignment (
  id,
  assignment_name,
  deal_id,
  sf_id
)
SELECT
  gen_random_uuid(),
  a."Name",
  d.id AS deal_id,
  a."Id" AS sf_id
FROM "salesforce_Assignment__c" a
LEFT JOIN deal d ON d.sf_id = a."Assignment_Value__c"::text
ON CONFLICT (sf_id) DO UPDATE SET
  assignment_name = EXCLUDED.assignment_name,
  deal_id = EXCLUDED.deal_id;

-- ==============================================================================
-- Property Unit Table Migration with UPSERT Logic
-- ==============================================================================

CREATE TABLE IF NOT EXISTS property_unit (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sf_id TEXT UNIQUE,
    property_unit_name TEXT,
    patio BOOLEAN,
    inline BOOLEAN,
    end_cap BOOLEAN,
    created_by_sf_id TEXT,
    created_by_id UUID REFERENCES "user"(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    property_id UUID REFERENCES property(id),
    nnn NUMERIC,
    rent NUMERIC,
    sqft NUMERIC,
    unit_notes TEXT,
    deal_id UUID REFERENCES deal(id),
    site_submit_id UUID REFERENCES site_submit(id),
    updated_by_sf_id TEXT,
    updated_by_id UUID REFERENCES "user"(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    end_cap_drive_thru BOOLEAN,
    second_gen_restaurant BOOLEAN,
    lease_expiration_date DATE
);

-- Add any missing columns
ALTER TABLE property_unit ADD COLUMN IF NOT EXISTS patio BOOLEAN;
ALTER TABLE property_unit ADD COLUMN IF NOT EXISTS inline BOOLEAN;
ALTER TABLE property_unit ADD COLUMN IF NOT EXISTS end_cap BOOLEAN;
ALTER TABLE property_unit ADD COLUMN IF NOT EXISTS end_cap_drive_thru BOOLEAN;
ALTER TABLE property_unit ADD COLUMN IF NOT EXISTS second_gen_restaurant BOOLEAN;
ALTER TABLE property_unit ADD COLUMN IF NOT EXISTS lease_expiration_date DATE;

-- UPSERT data from Salesforce
INSERT INTO property_unit (
    sf_id,
    property_unit_name,
    patio,
    inline,
    end_cap,
    created_by_sf_id,
    created_by_id,
    created_at,
    property_id,
    nnn,
    rent,
    sqft,
    unit_notes,
    deal_id,
    site_submit_id,
    updated_by_sf_id,
    updated_by_id,
    updated_at,
    end_cap_drive_thru,
    second_gen_restaurant,
    lease_expiration_date
)
SELECT
    p."Id" AS sf_id,
    p."Name" AS property_unit_name,
    p."Patio__c" AS patio,
    p."Inline__c" AS inline,
    p."End_Cap__c" AS end_cap,
    p."CreatedById" AS created_by_sf_id,
    (SELECT id FROM "user" WHERE sf_id = p."CreatedById" LIMIT 1) AS created_by_id,
    p."CreatedDate" AS created_at,
    (SELECT id FROM property WHERE sf_id = p."Property__c" LIMIT 1) AS property_id,
    p."Unit_NNN__c" AS nnn,
    p."Unit_Rent__c" AS rent,
    p."Unit_Sqft__c" AS sqft,
    p."Unit_Notes__c" AS unit_notes,
    (SELECT id FROM deal WHERE sf_id = p."Opportunity__c" LIMIT 1) AS deal_id,
    (SELECT id FROM site_submit WHERE sf_id = p."Site_Submits__c" LIMIT 1) AS site_submit_id,
    p."LastModifiedById" AS updated_by_sf_id,
    (SELECT id FROM "user" WHERE sf_id = p."LastModifiedById" LIMIT 1) AS updated_by_id,
    p."LastModifiedDate" AS updated_at,
    p."End_Cap_Drive_Thru__c" AS end_cap_drive_thru,
    p."X2nd_Gen_Restaurant__c" AS second_gen_restaurant,
    p."Lease_Expiration_Date__c" AS lease_expiration_date
FROM "salesforce_Property_Unit__c" p
ON CONFLICT (sf_id) DO UPDATE SET
    property_unit_name = EXCLUDED.property_unit_name,
    patio = EXCLUDED.patio,
    inline = EXCLUDED.inline,
    end_cap = EXCLUDED.end_cap,
    created_by_sf_id = EXCLUDED.created_by_sf_id,
    created_by_id = EXCLUDED.created_by_id,
    created_at = EXCLUDED.created_at,
    property_id = EXCLUDED.property_id,
    nnn = EXCLUDED.nnn,
    rent = EXCLUDED.rent,
    sqft = EXCLUDED.sqft,
    unit_notes = EXCLUDED.unit_notes,
    deal_id = EXCLUDED.deal_id,
    site_submit_id = EXCLUDED.site_submit_id,
    updated_by_sf_id = EXCLUDED.updated_by_sf_id,
    updated_by_id = EXCLUDED.updated_by_id,
    updated_at = EXCLUDED.updated_at,
    end_cap_drive_thru = EXCLUDED.end_cap_drive_thru,
    second_gen_restaurant = EXCLUDED.second_gen_restaurant,
    lease_expiration_date = EXCLUDED.lease_expiration_date;

-- ==============================================================================
-- Site Submit Table Migration with UPSERT Logic
-- ==============================================================================

CREATE TABLE IF NOT EXISTS site_submit (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sf_id TEXT UNIQUE,
    code TEXT,
    ti NUMERIC,
    notes TEXT,
    client_id UUID REFERENCES client(id),
    monitor BOOLEAN,
    sf_created_by_id TEXT,
    created_by_id UUID REFERENCES "user"(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    loi_date DATE,
    sf_priority TEXT,
    site_submit_priority_id UUID REFERENCES site_submit_priority(id),
    sf_property_id TEXT,
    property_id UUID REFERENCES property(id),
    sf_deal_type TEXT,
    site_submit_deal_type_id UUID REFERENCES site_submit_deal_type(id),
    sf_record_type_id TEXT,
    record_type_id UUID REFERENCES site_submit_record_type(id),
    assignment_id UUID REFERENCES assignment(id),
    loi_written BOOLEAN,
    deal_id UUID REFERENCES deal(id),
    year_1_rent NUMERIC,
    sf_account TEXT,
    sf_submit_stage TEXT,
    submit_stage_id UUID REFERENCES submit_stage(id),
    delivery_date DATE,
    updated_by_sf_id TEXT,
    updated_by_id UUID REFERENCES "user"(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    sf_property_unit TEXT,
    property_unit_id UUID REFERENCES property_unit(id),
    date_submitted DATE,
    competitor_data TEXT,
    customer_comments TEXT,
    sf_opportunity_stage TEXT,
    sf_property_latitude NUMERIC,
    site_submit_name TEXT,
    verified_latitude NUMERIC,
    delivery_timeframe TEXT,
    sf_property_longitude NUMERIC,
    verified_longitude NUMERIC
);

-- Add any missing columns
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS site_submit_name TEXT;
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS competitor_data TEXT;
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS customer_comments TEXT;
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS verified_latitude NUMERIC;
ALTER TABLE site_submit ADD COLUMN IF NOT EXISTS verified_longitude NUMERIC;

-- UPSERT data from Salesforce
INSERT INTO site_submit (
    sf_id,
    code,
    ti,
    notes,
    client_id,
    monitor,
    sf_created_by_id,
    created_by_id,
    created_at,
    loi_date,
    sf_priority,
    site_submit_priority_id,
    sf_property_id,
    property_id,
    sf_deal_type,
    site_submit_deal_type_id,
    sf_record_type_id,
    record_type_id,
    assignment_id,
    loi_written,
    deal_id,
    year_1_rent,
    sf_account,
    sf_submit_stage,
    submit_stage_id,
    delivery_date,
    updated_by_sf_id,
    updated_by_id,
    updated_at,
    sf_property_unit,
    property_unit_id,
    date_submitted,
    competitor_data,
    customer_comments,
    sf_opportunity_stage,
    sf_property_latitude,
    site_submit_name,
    verified_latitude,
    delivery_timeframe,
    sf_property_longitude,
    verified_longitude
)
SELECT
    s."Id" AS sf_id,
    s."Name" AS code,
    s."TI__c" AS ti,
    s."Notes__c" AS notes,
    (SELECT id FROM client WHERE sf_id = s."Account__c" LIMIT 1) AS client_id,
    s."Monitor__c" AS monitor,
    s."CreatedById" AS sf_created_by_id,
    (SELECT id FROM "user" WHERE sf_id = s."CreatedById" LIMIT 1) AS created_by_id,
    s."CreatedDate" AS created_at,
    s."LOI_Date__c" AS loi_date,
    s."Priority__c" AS sf_priority,
    (SELECT id FROM site_submit_priority WHERE name = s."Priority__c" LIMIT 1) AS site_submit_priority_id,
    s."Property__c" AS sf_property_id,
    (SELECT id FROM property WHERE sf_id = s."Property__c" LIMIT 1) AS property_id,
    s."Deal_Type__c" AS sf_deal_type,
    (SELECT id FROM site_submit_deal_type WHERE name = s."Deal_Type__c" LIMIT 1) AS site_submit_deal_type_id,
    s."RecordTypeId" AS sf_record_type_id,
    (SELECT id FROM site_submit_record_type WHERE name = s."RecordTypeId" LIMIT 1) AS record_type_id,
    (SELECT id FROM assignment WHERE sf_id = s."Assignment__c" LIMIT 1) AS assignment_id,
    s."LOI_Written__c" AS loi_written,
    (SELECT id FROM deal WHERE sf_id = s."Opportunity__c" LIMIT 1) AS deal_id,
    s."Year_1_Rent__c" AS year_1_rent,
    s."Account_Name__c" AS sf_account,
    s."Submit_Stage__c" AS sf_submit_stage,
    (SELECT id FROM submit_stage WHERE name = s."Submit_Stage__c" LIMIT 1) AS submit_stage_id,
    s."Delivery_Date__c" AS delivery_date,
    s."LastModifiedById" AS updated_by_sf_id,
    (SELECT id FROM "user" WHERE sf_id = s."LastModifiedById" LIMIT 1) AS updated_by_id,
    s."LastModifiedDate" AS updated_at,
    s."Property_Unit__c" AS sf_property_unit,
    (SELECT id FROM property_unit WHERE sf_id = s."Property_Unit__c" LIMIT 1) AS property_unit_id,
    s."Date_Submitted__c" AS date_submitted,
    s."Competitor_Data__c" AS competitor_data,
    s."Customer_Comments__c" AS customer_comments,
    s."Opportunity_Stage__c" AS sf_opportunity_stage,
    s."Property_Latitude__c" AS sf_property_latitude,
    s."Site_Submits_Name__c" AS site_submit_name,
    s."Verified_Latitude__c" AS verified_latitude,
    s."Delivery_Timeframe__c" AS delivery_timeframe,
    s."Property_Longitude__c" AS sf_property_longitude,
    s."Verified_Longitude__c" AS verified_longitude
FROM "salesforce_Site_Submits__c" s
ON CONFLICT (sf_id) DO UPDATE SET
    code = EXCLUDED.code,
    ti = EXCLUDED.ti,
    notes = EXCLUDED.notes,
    client_id = EXCLUDED.client_id,
    monitor = EXCLUDED.monitor,
    sf_created_by_id = EXCLUDED.sf_created_by_id,
    created_by_id = EXCLUDED.created_by_id,
    created_at = EXCLUDED.created_at,
    loi_date = EXCLUDED.loi_date,
    sf_priority = EXCLUDED.sf_priority,
    site_submit_priority_id = EXCLUDED.site_submit_priority_id,
    sf_property_id = EXCLUDED.sf_property_id,
    property_id = EXCLUDED.property_id,
    sf_deal_type = EXCLUDED.sf_deal_type,
    site_submit_deal_type_id = EXCLUDED.site_submit_deal_type_id,
    sf_record_type_id = EXCLUDED.sf_record_type_id,
    record_type_id = EXCLUDED.record_type_id,
    assignment_id = EXCLUDED.assignment_id,
    loi_written = EXCLUDED.loi_written,
    deal_id = EXCLUDED.deal_id,
    year_1_rent = EXCLUDED.year_1_rent,
    sf_account = EXCLUDED.sf_account,
    sf_submit_stage = EXCLUDED.sf_submit_stage,
    submit_stage_id = EXCLUDED.submit_stage_id,
    delivery_date = EXCLUDED.delivery_date,
    updated_by_sf_id = EXCLUDED.updated_by_sf_id,
    updated_by_id = EXCLUDED.updated_by_id,
    updated_at = EXCLUDED.updated_at,
    sf_property_unit = EXCLUDED.sf_property_unit,
    property_unit_id = EXCLUDED.property_unit_id,
    date_submitted = EXCLUDED.date_submitted,
    competitor_data = EXCLUDED.competitor_data,
    customer_comments = EXCLUDED.customer_comments,
    sf_opportunity_stage = EXCLUDED.sf_opportunity_stage,
    sf_property_latitude = EXCLUDED.sf_property_latitude,
    site_submit_name = EXCLUDED.site_submit_name,
    verified_latitude = EXCLUDED.verified_latitude,
    delivery_timeframe = EXCLUDED.delivery_timeframe,
    sf_property_longitude = EXCLUDED.sf_property_longitude,
    verified_longitude = EXCLUDED.verified_longitude;

-- ==============================================================================
-- Deal Contact Migration (NEW - Contact Roles)
-- ==============================================================================

-- Create the deal_contact table if it doesn't exist
CREATE TABLE IF NOT EXISTS deal_contact (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sf_id TEXT UNIQUE NOT NULL,
    role_id UUID REFERENCES contact_role(role_id),
    sf_contact_id TEXT,
    contact_id UUID REFERENCES contact(id),
    primary_contact BOOLEAN DEFAULT false,
    sf_created_by TEXT,
    created_by_id UUID REFERENCES "user"(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sf_opportunity_id TEXT,
    deal_id UUID REFERENCES deal(id),
    sf_modified_by TEXT,
    updated_by_id UUID REFERENCES "user"(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add any missing columns (for schema evolution)
ALTER TABLE deal_contact ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES contact_role(role_id);
ALTER TABLE deal_contact ADD COLUMN IF NOT EXISTS sf_contact_id TEXT;
ALTER TABLE deal_contact ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contact(id);
ALTER TABLE deal_contact ADD COLUMN IF NOT EXISTS primary_contact BOOLEAN DEFAULT false;
ALTER TABLE deal_contact ADD COLUMN IF NOT EXISTS sf_created_by TEXT;
ALTER TABLE deal_contact ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES "user"(id);
ALTER TABLE deal_contact ADD COLUMN IF NOT EXISTS sf_opportunity_id TEXT;
ALTER TABLE deal_contact ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deal(id);
ALTER TABLE deal_contact ADD COLUMN IF NOT EXISTS sf_modified_by TEXT;
ALTER TABLE deal_contact ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES "user"(id);

-- UPSERT data from Salesforce
INSERT INTO deal_contact (
    sf_id,
    role_id,
    sf_contact_id,
    contact_id,
    primary_contact,
    sf_created_by,
    created_by_id,
    created_at,
    sf_opportunity_id,
    deal_id,
    sf_modified_by,
    updated_by_id,
    updated_at
)
SELECT
    ocr."Id" AS sf_id,
    (SELECT role_id FROM contact_role WHERE label = ocr."Role" LIMIT 1) AS role_id,
    ocr."ContactId" AS sf_contact_id,
    (SELECT id FROM contact WHERE sf_id = ocr."ContactId" LIMIT 1) AS contact_id,
    ocr."IsPrimary" AS primary_contact,
    ocr."CreatedById" AS sf_created_by,
    (SELECT id FROM "user" WHERE sf_id = ocr."CreatedById" LIMIT 1) AS created_by_id,
    ocr."CreatedDate" AS created_at,
    ocr."OpportunityId" AS sf_opportunity_id,
    (SELECT id FROM deal WHERE sf_id = ocr."OpportunityId" LIMIT 1) AS deal_id,
    ocr."LastModifiedById" AS sf_modified_by,
    (SELECT id FROM "user" WHERE sf_id = ocr."LastModifiedById" LIMIT 1) AS updated_by_id,
    ocr."LastModifiedDate" AS updated_at
FROM "salesforce_OpportunityContactRole" ocr
WHERE ocr."Id" IS NOT NULL
  AND ocr."IsDeleted" = false  -- Exclude deleted records
ON CONFLICT (sf_id) DO UPDATE SET
    role_id = EXCLUDED.role_id,
    sf_contact_id = EXCLUDED.sf_contact_id,
    contact_id = EXCLUDED.contact_id,
    primary_contact = EXCLUDED.primary_contact,
    sf_created_by = EXCLUDED.sf_created_by,
    created_by_id = EXCLUDED.created_by_id,
    created_at = EXCLUDED.created_at,
    sf_opportunity_id = EXCLUDED.sf_opportunity_id,
    deal_id = EXCLUDED.deal_id,
    sf_modified_by = EXCLUDED.sf_modified_by,
    updated_by_id = EXCLUDED.updated_by_id,
    updated_at = EXCLUDED.updated_at;

-- Create helpful indexes for deal_contact
CREATE INDEX IF NOT EXISTS idx_deal_contact_deal_id ON deal_contact(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_contact_contact_id ON deal_contact(contact_id);
CREATE INDEX IF NOT EXISTS idx_deal_contact_role_id ON deal_contact(role_id);
CREATE INDEX IF NOT EXISTS idx_deal_contact_primary ON deal_contact(deal_id, primary_contact);

-- ==============================================================================
-- Final Setup and Constraints
-- ==============================================================================

-- Helpful index for joins
CREATE INDEX IF NOT EXISTS idx_site_submit_sf_id ON site_submit(sf_id);

-- Add FK from deal.site_submit_id → site_submit(id)
ALTER TABLE deal DROP CONSTRAINT IF EXISTS deal_site_submit_fk;
ALTER TABLE deal ADD CONSTRAINT deal_site_submit_fk
  FOREIGN KEY (site_submit_id) REFERENCES site_submit(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

-- DROP the unique index FIRST (before any updates)
DROP INDEX IF EXISTS idx_deal_site_submit_unique;

-- Backfill deal.site_submit_id from Opportunity.Site_Submits__c
WITH link AS (
  SELECT 
    d.id AS deal_id, 
    ss.id AS site_submit_id,
    ROW_NUMBER() OVER (
      PARTITION BY ss.id 
      ORDER BY 
        CASE WHEN d.closed_date IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(d.updated_at, d.created_at, NOW()) DESC,
        d.id
    ) AS rn
  FROM deal d
  JOIN "salesforce_Opportunity" so ON so."Id" = d.sf_id
  JOIN site_submit ss ON ss.sf_id = so."Site_Submits__c"
)
UPDATE deal AS d
SET site_submit_id = CASE 
  WHEN link.rn = 1 THEN link.site_submit_id 
  ELSE NULL 
END
FROM link
WHERE d.id = link.deal_id;

-- Now recreate the unique index (after all updates are done)
CREATE UNIQUE INDEX idx_deal_site_submit_unique
  ON deal(site_submit_id)
  WHERE site_submit_id IS NOT NULL;

-- ==============================================================================
-- Payment System Migration (NEW - Commission Tracking)
-- ==============================================================================

-- ==============================================================================
-- Broker Table (Lookup table for commission management)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS broker (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Populate broker table from Salesforce commission data
INSERT INTO broker (name)
SELECT DISTINCT 
    COALESCE(cs."Broker__c", 'Unknown Broker') as name
FROM "salesforce_Commission_Split__c" cs
WHERE cs."Broker__c" IS NOT NULL
  AND TRIM(cs."Broker__c") != ''
ON CONFLICT (name) DO NOTHING;

-- Ensure we have a fallback broker
INSERT INTO broker (name) VALUES ('Unknown Broker')
ON CONFLICT (name) DO NOTHING;

-- ==============================================================================
-- Commission Split Table (Deal-level commission templates)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS commission_split (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sf_id TEXT UNIQUE,
    split_name TEXT,
    deal_id UUID REFERENCES deal(id),
    broker_id UUID REFERENCES broker(id),
    sf_owner_id TEXT,
    sf_created_by_id TEXT,
    created_by_id UUID REFERENCES "user"(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sf_updated_by_id TEXT,
    updated_by_id UUID REFERENCES "user"(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Commission percentages (0-100)
    split_origination_percent NUMERIC(5,2) DEFAULT 0,
    split_site_percent NUMERIC(5,2) DEFAULT 0,
    split_deal_percent NUMERIC(5,2) DEFAULT 0,
    
    -- Calculated USD amounts (populated by triggers)
    split_origination_usd NUMERIC(12,2) DEFAULT 0,
    split_site_usd NUMERIC(12,2) DEFAULT 0,
    split_deal_usd NUMERIC(12,2) DEFAULT 0,
    split_broker_total NUMERIC(12,2) DEFAULT 0,
    
    -- Salesforce original fields (for reference)
    sf_house_percent NUMERIC(5,2),
    sf_origination_usd NUMERIC(12,2),
    sf_site_usd NUMERIC(12,2),
    sf_deal_usd NUMERIC(12,2)
);

-- Add any missing columns (for schema evolution)
ALTER TABLE commission_split ADD COLUMN IF NOT EXISTS split_origination_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE commission_split ADD COLUMN IF NOT EXISTS split_site_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE commission_split ADD COLUMN IF NOT EXISTS split_deal_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE commission_split ADD COLUMN IF NOT EXISTS split_origination_usd NUMERIC(12,2) DEFAULT 0;
ALTER TABLE commission_split ADD COLUMN IF NOT EXISTS split_site_usd NUMERIC(12,2) DEFAULT 0;
ALTER TABLE commission_split ADD COLUMN IF NOT EXISTS split_deal_usd NUMERIC(12,2) DEFAULT 0;
ALTER TABLE commission_split ADD COLUMN IF NOT EXISTS split_broker_total NUMERIC(12,2) DEFAULT 0;
ALTER TABLE commission_split ADD COLUMN IF NOT EXISTS sf_house_percent NUMERIC(5,2);
ALTER TABLE commission_split ADD COLUMN IF NOT EXISTS sf_origination_usd NUMERIC(12,2);
ALTER TABLE commission_split ADD COLUMN IF NOT EXISTS sf_site_usd NUMERIC(12,2);
ALTER TABLE commission_split ADD COLUMN IF NOT EXISTS sf_deal_usd NUMERIC(12,2);

-- UPSERT commission split data from Salesforce
INSERT INTO commission_split (
    sf_id,
    split_name,
    deal_id,
    broker_id,
    sf_owner_id,
    sf_created_by_id,
    created_by_id,
    created_at,
    sf_updated_by_id,
    updated_by_id,
    updated_at,
    split_origination_percent,
    split_site_percent,
    split_deal_percent,
    sf_house_percent,
    sf_origination_usd,
    sf_site_usd,
    sf_deal_usd
)
SELECT
    cs."Id" AS sf_id,
    cs."Name" AS split_name,
    (SELECT id FROM deal WHERE sf_id = cs."Opportunity__c" LIMIT 1) AS deal_id,
    (SELECT id FROM broker WHERE name = COALESCE(cs."Broker__c", 'Unknown Broker') LIMIT 1) AS broker_id,
    cs."OwnerId" AS sf_owner_id,
    cs."CreatedById" AS sf_created_by_id,
    (SELECT id FROM "user" WHERE sf_id = cs."CreatedById" LIMIT 1) AS created_by_id,
    cs."CreatedDate" AS created_at,
    cs."LastModifiedById" AS sf_updated_by_id,
    (SELECT id FROM "user" WHERE sf_id = cs."LastModifiedById" LIMIT 1) AS updated_by_id,
    cs."LastModifiedDate" AS updated_at,
    
    -- Clean percentage data (handle bad Salesforce data)
    CASE 
        WHEN cs."Origination_Percent__c" > 100 THEN cs."Origination_Percent__c" / 100 
        ELSE cs."Origination_Percent__c" 
    END as split_origination_percent,
    CASE 
        WHEN cs."Site_Percent__c" > 100 THEN cs."Site_Percent__c" / 100 
        ELSE cs."Site_Percent__c" 
    END as split_site_percent,
    CASE 
        WHEN cs."Deal_Percent__c" > 100 THEN cs."Deal_Percent__c" / 100 
        ELSE cs."Deal_Percent__c" 
    END as split_deal_percent,
    
    -- Store original Salesforce values for reference (correct column names)
    CASE 
        WHEN cs."House_Percent__c" > 100 THEN cs."House_Percent__c" / 100 
        ELSE cs."House_Percent__c" 
    END as sf_house_percent,
    cs."Origination_Dollars__c" AS sf_origination_usd,
    cs."Site_Dollars__c" AS sf_site_usd,
    cs."Deal_Dollars__c" AS sf_deal_usd
FROM "salesforce_Commission_Split__c" cs
WHERE cs."Id" IS NOT NULL
ON CONFLICT (sf_id) DO UPDATE SET
    split_name = EXCLUDED.split_name,
    deal_id = EXCLUDED.deal_id,
    broker_id = EXCLUDED.broker_id,
    sf_owner_id = EXCLUDED.sf_owner_id,
    sf_created_by_id = EXCLUDED.sf_created_by_id,
    created_by_id = EXCLUDED.created_by_id,
    created_at = EXCLUDED.created_at,
    sf_updated_by_id = EXCLUDED.sf_updated_by_id,
    updated_by_id = EXCLUDED.updated_by_id,
    updated_at = EXCLUDED.updated_at,
    split_origination_percent = EXCLUDED.split_origination_percent,
    split_site_percent = EXCLUDED.split_site_percent,
    split_deal_percent = EXCLUDED.split_deal_percent,
    sf_house_percent = EXCLUDED.sf_house_percent,
    sf_origination_usd = EXCLUDED.sf_origination_usd,
    sf_site_usd = EXCLUDED.sf_site_usd,
    sf_deal_usd = EXCLUDED.sf_deal_usd;

-- ==============================================================================
-- Payment Table (Individual payment records)
-- ==============================================================================

-- Ensure deal table has number_of_payments field
ALTER TABLE deal ADD COLUMN IF NOT EXISTS number_of_payments INTEGER;

-- Populate number_of_payments based on Salesforce logic + manual overrides
UPDATE deal d
SET number_of_payments = GREATEST(
    CASE WHEN sf_multiple_payments THEN 2 ELSE 1 END,
    COALESCE((SELECT COUNT(*) FROM "salesforce_Payment__c" p WHERE p."Opportunity__c" = d.sf_id), 0)
)
WHERE number_of_payments IS NULL;

-- Default to 1 if still null (safety fallback)
UPDATE deal SET number_of_payments = 1 WHERE number_of_payments IS NULL OR number_of_payments = 0;

-- Clear existing payment data (Salesforce is source of truth)
DELETE FROM payment_split WHERE sf_id IS NOT NULL;
DELETE FROM payment WHERE sf_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sf_id TEXT UNIQUE,
    payment_name TEXT,
    deal_id UUID REFERENCES deal(id),
    payment_sequence INTEGER NOT NULL,
    payment_amount NUMERIC(12,2) NOT NULL,
    
    -- QB integration fields (ready for future sync)
    qb_invoice_id TEXT,
    qb_payment_id TEXT,
    qb_sync_status TEXT,
    qb_last_sync TIMESTAMPTZ,
    
    -- Audit fields
    sf_created_by_id TEXT,
    created_by_id UUID REFERENCES "user"(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sf_updated_by_id TEXT,
    updated_by_id UUID REFERENCES "user"(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Payment status fields (from Salesforce)
    sf_received_date DATE,
    sf_payment_status TEXT,
    sf_invoice_sent_date DATE
);

-- Add any missing columns
ALTER TABLE payment ADD COLUMN IF NOT EXISTS payment_sequence INTEGER;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS qb_invoice_id TEXT;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS qb_payment_id TEXT;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS qb_sync_status TEXT;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS qb_last_sync TIMESTAMPTZ;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS sf_received_date DATE;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS sf_payment_status TEXT;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS sf_invoice_sent_date DATE;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS sf_payment_date_est DATE;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS sf_payment_date_received DATE;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS sf_payment_date_actual DATE;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS sf_payment_invoice_date DATE;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS payment_date_estimated DATE;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS payment_received_date DATE;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS payment_invoice_date DATE;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS payment_received BOOLEAN DEFAULT FALSE;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS orep_invoice TEXT;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS referral_fee_paid BOOLEAN DEFAULT FALSE;

-- UPSERT payment data from Salesforce
INSERT INTO payment (
    sf_id,
    payment_name,
    deal_id,
    payment_sequence,
    payment_amount,
    sf_created_by_id,
    created_by_id,
    created_at,
    sf_updated_by_id,
    updated_by_id,
    updated_at,
    sf_received_date,
    sf_payment_status,
    sf_invoice_sent_date,
    sf_payment_date_est,
    payment_date_estimated,
    sf_payment_date_received,
    payment_received_date,
    payment_received,
    sf_payment_date_actual,
    sf_payment_invoice_date,
    payment_invoice_date,
    orep_invoice,
    referral_fee_paid
)
SELECT
    p."Id" AS sf_id,
    p."Name" AS payment_name,
    (SELECT id FROM deal WHERE sf_id = p."Opportunity__c" LIMIT 1) AS deal_id,
    ROW_NUMBER() OVER (PARTITION BY p."Opportunity__c" ORDER BY p."CreatedDate", p."Id") AS payment_sequence,
    p."Payment_Amount__c" AS payment_amount,
    p."CreatedById" AS sf_created_by_id,
    (SELECT id FROM "user" WHERE sf_id = p."CreatedById" LIMIT 1) AS created_by_id,
    p."CreatedDate" AS created_at,
    p."LastModifiedById" AS sf_updated_by_id,
    (SELECT id FROM "user" WHERE sf_id = p."LastModifiedById" LIMIT 1) AS updated_by_id,
    p."LastModifiedDate" AS updated_at,
    p."PMT_Received_Date__c" AS sf_received_date,
    CASE 
        WHEN p."Payment_Received__c" = true THEN 'Received'
        WHEN p."Invoice_Sent__c" = true THEN 'Invoice Sent'
        ELSE 'Pending'
    END AS sf_payment_status,
    p."Payment_Invoice_Date__c" AS sf_invoice_sent_date,
    p."Payment_Date_Est__c" AS sf_payment_date_est,
    p."Payment_Date_Est__c" AS payment_date_estimated,
    p."PMT_Received_Date__c" AS sf_payment_date_received,
    p."PMT_Received_Date__c" AS payment_received_date,
    p."Payment_Received__c" AS payment_received,
    p."Payment_Date_Actual__c" AS sf_payment_date_actual,
    p."Payment_Invoice_Date__c" AS sf_payment_invoice_date,
    p."Payment_Invoice_Date__c" AS payment_invoice_date,
    p."OREP_Invoice__c" AS orep_invoice,
    COALESCE(p."Referral_Fee_Paid__c", FALSE) AS referral_fee_paid
FROM "salesforce_Payment__c" p
WHERE p."Id" IS NOT NULL
  AND p."Payment_Amount__c" IS NOT NULL
  AND p."Opportunity__c" IS NOT NULL
ON CONFLICT (sf_id) DO UPDATE SET
    payment_name = EXCLUDED.payment_name,
    deal_id = EXCLUDED.deal_id,
    payment_sequence = EXCLUDED.payment_sequence,
    payment_amount = EXCLUDED.payment_amount,
    sf_created_by_id = EXCLUDED.sf_created_by_id,
    created_by_id = EXCLUDED.created_by_id,
    created_at = EXCLUDED.created_at,
    sf_updated_by_id = EXCLUDED.sf_updated_by_id,
    updated_by_id = EXCLUDED.updated_by_id,
    updated_at = EXCLUDED.updated_at,
    sf_received_date = EXCLUDED.sf_received_date,
    sf_payment_status = EXCLUDED.sf_payment_status,
    sf_invoice_sent_date = EXCLUDED.sf_invoice_sent_date,
    sf_payment_date_est = EXCLUDED.sf_payment_date_est,
    payment_date_estimated = EXCLUDED.payment_date_estimated,
    sf_payment_date_received = EXCLUDED.sf_payment_date_received,
    payment_received_date = EXCLUDED.payment_received_date,
    payment_received = EXCLUDED.payment_received,
    sf_payment_date_actual = EXCLUDED.sf_payment_date_actual,
    sf_payment_invoice_date = EXCLUDED.sf_payment_invoice_date,
    payment_invoice_date = EXCLUDED.payment_invoice_date,
    orep_invoice = EXCLUDED.orep_invoice,
    referral_fee_paid = EXCLUDED.referral_fee_paid;

-- ==============================================================================
-- Payment Split Table (Commission splits per payment)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS payment_split (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sf_id TEXT UNIQUE,
    sf_split_name TEXT,
    payment_id UUID REFERENCES payment(id),
    broker_id UUID REFERENCES broker(id),
    commission_split_id UUID REFERENCES commission_split(id),
    
    -- Commission percentages (inherited from commission_split, can be overridden)
    split_origination_percent NUMERIC(5,2) DEFAULT 0,
    split_site_percent NUMERIC(5,2) DEFAULT 0,
    split_deal_percent NUMERIC(5,2) DEFAULT 0,
    
    -- Override fields (for edge cases)
    split_origination_percent_override NUMERIC(5,2),
    split_site_percent_override NUMERIC(5,2),
    split_deal_percent_override NUMERIC(5,2),
    
    -- Calculated USD amounts per payment
    split_origination_usd NUMERIC(12,2) DEFAULT 0,
    split_site_usd NUMERIC(12,2) DEFAULT 0,
    split_deal_usd NUMERIC(12,2) DEFAULT 0,
    split_broker_total NUMERIC(12,2) DEFAULT 0,
    
    -- Payment tracking
    paid BOOLEAN DEFAULT FALSE,
    
    -- Audit fields
    sf_owner_id TEXT,
    sf_created_by_id TEXT,
    created_by_id UUID REFERENCES "user"(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sf_updated_by_id TEXT,
    updated_by_id UUID REFERENCES "user"(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Salesforce reference fields
    sf_broker TEXT,
    sf_broker_picklist TEXT,
    sf_commission_split_id TEXT,
    sf_payment_info TEXT,
    sf_origination_usd NUMERIC(12,2),
    sf_site_usd NUMERIC(12,2),
    sf_deal_usd NUMERIC(12,2)
);

-- Add any missing columns
ALTER TABLE payment_split ADD COLUMN IF NOT EXISTS commission_split_id UUID REFERENCES commission_split(id);
ALTER TABLE payment_split ADD COLUMN IF NOT EXISTS split_origination_percent_override NUMERIC(5,2);
ALTER TABLE payment_split ADD COLUMN IF NOT EXISTS split_site_percent_override NUMERIC(5,2);
ALTER TABLE payment_split ADD COLUMN IF NOT EXISTS split_deal_percent_override NUMERIC(5,2);

-- Clear existing payment split data (Salesforce is source of truth)
DELETE FROM payment_split WHERE sf_id IS NOT NULL;

-- UPSERT payment split data from Salesforce
INSERT INTO payment_split (
    sf_id,
    sf_split_name,
    payment_id,
    broker_id,
    commission_split_id,
    split_origination_percent,
    split_site_percent,
    split_deal_percent,
    -- Add calculated USD fields during insert
    split_origination_usd,
    split_site_usd,
    split_deal_usd,
    split_broker_total,
    sf_owner_id,
    sf_created_by_id,
    created_by_id,
    created_at,
    sf_updated_by_id,
    updated_by_id,
    updated_at,
    paid,
    sf_broker,
    sf_broker_picklist,
    sf_commission_split_id,
    sf_payment_info,
    sf_origination_usd,
    sf_site_usd,
    sf_deal_usd
)
SELECT
    ps."Id" AS sf_id,
    ps."Name" AS sf_split_name,
    (SELECT id FROM payment WHERE sf_id = ps."Payment__c" LIMIT 1) AS payment_id,
    (SELECT id FROM broker WHERE name = COALESCE(ps."Broker__c", 'Unknown Broker') LIMIT 1) AS broker_id,
    (SELECT id FROM commission_split WHERE sf_id = ps."Commission_Split__c" LIMIT 1) AS commission_split_id,
    
    -- Percentages (cleaned)
    CASE 
        WHEN ps."Origination_Percent__c" > 100 THEN ps."Origination_Percent__c" / 100 
        ELSE ps."Origination_Percent__c" 
    END as split_origination_percent,
    CASE 
        WHEN ps."Site_Percent__c" > 100 THEN ps."Site_Percent__c" / 100 
        ELSE ps."Site_Percent__c" 
    END as split_site_percent,
    CASE 
        WHEN ps."Deal_Percent__c" > 100 THEN ps."Deal_Percent__c" / 100 
        ELSE ps."Deal_Percent__c" 
    END as split_deal_percent,
    
    -- Calculate USD amounts during migration (since no triggers)
    COALESCE(d.origination_usd, 0) * (COALESCE(
        CASE WHEN ps."Origination_Percent__c" > 100 THEN ps."Origination_Percent__c" / 100 
             ELSE ps."Origination_Percent__c" END, 0) / 100.0) as split_origination_usd,
    COALESCE(d.site_usd, 0) * (COALESCE(
        CASE WHEN ps."Site_Percent__c" > 100 THEN ps."Site_Percent__c" / 100 
             ELSE ps."Site_Percent__c" END, 0) / 100.0) as split_site_usd,
    COALESCE(d.deal_usd, 0) * (COALESCE(
        CASE WHEN ps."Deal_Percent__c" > 100 THEN ps."Deal_Percent__c" / 100 
             ELSE ps."Deal_Percent__c" END, 0) / 100.0) as split_deal_usd,
    
    -- Calculate total
    COALESCE(d.origination_usd, 0) * (COALESCE(CASE WHEN ps."Origination_Percent__c" > 100 THEN ps."Origination_Percent__c" / 100 ELSE ps."Origination_Percent__c" END, 0) / 100.0) +
    COALESCE(d.site_usd, 0) * (COALESCE(CASE WHEN ps."Site_Percent__c" > 100 THEN ps."Site_Percent__c" / 100 ELSE ps."Site_Percent__c" END, 0) / 100.0) +
    COALESCE(d.deal_usd, 0) * (COALESCE(CASE WHEN ps."Deal_Percent__c" > 100 THEN ps."Deal_Percent__c" / 100 ELSE ps."Deal_Percent__c" END, 0) / 100.0) as split_broker_total,
    
    -- Audit fields
    ps."OwnerId" AS sf_owner_id,
    ps."CreatedById" AS sf_created_by_id,
    (SELECT id FROM "user" WHERE sf_id = ps."CreatedById" LIMIT 1) AS created_by_id,
    ps."CreatedDate" AS created_at,
    ps."LastModifiedById" AS sf_updated_by_id,
    (SELECT id FROM "user" WHERE sf_id = ps."LastModifiedById" LIMIT 1) AS updated_by_id,
    ps."LastModifiedDate" AS updated_at,
    
    -- Payment status (correct column name)
    COALESCE(ps."Broker_Paid__c", FALSE) AS paid,
    
    -- Reference fields (correct column names)
    ps."Broker__c" AS sf_broker,
    ps."Broker_Picklist__c" AS sf_broker_picklist,
    ps."Commission_Split__c" AS sf_commission_split_id,
    ps."Payment_Info__c" AS sf_payment_info,
    ps."Origination_Dollars__c" AS sf_origination_usd,
    ps."Site_Dollars__c" AS sf_site_usd,
    ps."Deal_Dollars__c" AS sf_deal_usd
FROM "salesforce_Payment_Split__c" ps
JOIN payment p ON p.sf_id = ps."Payment__c"
JOIN deal d ON d.id = p.deal_id  -- Add this JOIN to get deal amounts for calculations
WHERE ps."Id" IS NOT NULL
ON CONFLICT (sf_id) DO UPDATE SET
    sf_split_name = EXCLUDED.sf_split_name,
    payment_id = EXCLUDED.payment_id,
    broker_id = EXCLUDED.broker_id,
    commission_split_id = EXCLUDED.commission_split_id,
    split_origination_percent = EXCLUDED.split_origination_percent,
    split_site_percent = EXCLUDED.split_site_percent,
    split_deal_percent = EXCLUDED.split_deal_percent,
    split_origination_usd = EXCLUDED.split_origination_usd,
    split_site_usd = EXCLUDED.split_site_usd,
    split_deal_usd = EXCLUDED.split_deal_usd,
    split_broker_total = EXCLUDED.split_broker_total,
    sf_owner_id = EXCLUDED.sf_owner_id,
    sf_created_by_id = EXCLUDED.sf_created_by_id,
    created_by_id = EXCLUDED.created_by_id,
    created_at = EXCLUDED.created_at,
    sf_updated_by_id = EXCLUDED.sf_updated_by_id,
    updated_by_id = EXCLUDED.updated_by_id,
    updated_at = EXCLUDED.updated_at,
    paid = EXCLUDED.paid,
    sf_broker = EXCLUDED.sf_broker,
    sf_broker_picklist = EXCLUDED.sf_broker_picklist,
    sf_commission_split_id = EXCLUDED.sf_commission_split_id,
    sf_payment_info = EXCLUDED.sf_payment_info,
    sf_origination_usd = EXCLUDED.sf_origination_usd,
    sf_site_usd = EXCLUDED.sf_site_usd,
    sf_deal_usd = EXCLUDED.sf_deal_usd;

-- ==============================================================================
-- Payment System Triggers and Functions
-- ==============================================================================

-- Function to calculate commission split USD amounts
CREATE OR REPLACE FUNCTION calculate_commission_split()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate USD amounts from percentages and deal amounts
    NEW.split_origination_usd := COALESCE(
        (SELECT d.origination_usd * (NEW.split_origination_percent / 100.0)
         FROM deal d WHERE d.id = NEW.deal_id), 0
    );
    
    NEW.split_site_usd := COALESCE(
        (SELECT d.site_usd * (NEW.split_site_percent / 100.0)
         FROM deal d WHERE d.id = NEW.deal_id), 0
    );
    
    NEW.split_deal_usd := COALESCE(
        (SELECT d.deal_usd * (NEW.split_deal_percent / 100.0)
         FROM deal d WHERE d.id = NEW.deal_id), 0
    );
    
    -- Calculate broker total
    NEW.split_broker_total := COALESCE(NEW.split_origination_usd, 0) + 
                              COALESCE(NEW.split_site_usd, 0) + 
                              COALESCE(NEW.split_deal_usd, 0);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for commission split calculations
DROP TRIGGER IF EXISTS trigger_calculate_commission_split ON commission_split;
CREATE TRIGGER trigger_calculate_commission_split
    BEFORE INSERT OR UPDATE ON commission_split
    FOR EACH ROW
    EXECUTE FUNCTION calculate_commission_split();

-- Function to calculate payment split USD amounts
CREATE OR REPLACE FUNCTION calculate_payment_split()
RETURNS TRIGGER AS $$
DECLARE
    payment_count INTEGER;
    template_origination NUMERIC(12,2);
    template_site NUMERIC(12,2);
    template_deal NUMERIC(12,2);
BEGIN
    -- Get the number of payments for this deal
    SELECT d.number_of_payments INTO payment_count
    FROM payment p
    JOIN deal d ON d.id = p.deal_id
    WHERE p.id = NEW.payment_id;
    
    -- Get commission split template amounts
    SELECT cs.split_origination_usd, cs.split_site_usd, cs.split_deal_usd
    INTO template_origination, template_site, template_deal
    FROM commission_split cs
    WHERE cs.id = NEW.commission_split_id;
    
    -- Calculate per-payment amounts (template total ÷ number of payments)
    NEW.split_origination_usd := COALESCE(template_origination, 0) / COALESCE(payment_count, 1);
    NEW.split_site_usd := COALESCE(template_site, 0) / COALESCE(payment_count, 1);
    NEW.split_deal_usd := COALESCE(template_deal, 0) / COALESCE(payment_count, 1);
    
    -- Calculate broker total for this payment
    NEW.split_broker_total := COALESCE(NEW.split_origination_usd, 0) + 
                              COALESCE(NEW.split_site_usd, 0) + 
                              COALESCE(NEW.split_deal_usd, 0);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for payment split calculations
DROP TRIGGER IF EXISTS trigger_calculate_payment_split ON payment_split;
CREATE TRIGGER trigger_calculate_payment_split
    BEFORE INSERT OR UPDATE ON payment_split
    FOR EACH ROW
    EXECUTE FUNCTION calculate_payment_split();

-- Function to generate payments for a deal
CREATE OR REPLACE FUNCTION generate_payments_for_deal(deal_uuid UUID)
RETURNS TEXT AS $$
DECLARE
    payment_count INTEGER;
    deal_fee NUMERIC(12,2);
    payment_amount NUMERIC(12,2);
    new_payment_id UUID;
    commission_rec RECORD;
    i INTEGER;
BEGIN
    -- Get deal info
    SELECT d.number_of_payments, d.fee
    INTO payment_count, deal_fee
    FROM deal d
    WHERE d.id = deal_uuid;
    
    IF payment_count IS NULL OR deal_fee IS NULL THEN
        RETURN 'Error: Deal not found or missing payment info';
    END IF;
    
    -- Calculate payment amount
    payment_amount := deal_fee / payment_count;
    
    -- Generate payments
    FOR i IN 1..payment_count LOOP
        INSERT INTO payment (deal_id, payment_sequence, payment_amount)
        VALUES (deal_uuid, i, payment_amount)
        RETURNING id INTO new_payment_id;
        
        -- Generate payment splits for each commission split
        FOR commission_rec IN 
            SELECT cs.id, cs.broker_id, cs.split_origination_percent, cs.split_site_percent, cs.split_deal_percent
            FROM commission_split cs
            WHERE cs.deal_id = deal_uuid
        LOOP
            INSERT INTO payment_split (
                payment_id, 
                broker_id, 
                commission_split_id,
                split_origination_percent,
                split_site_percent,
                split_deal_percent
            )
            VALUES (
                new_payment_id,
                commission_rec.broker_id,
                commission_rec.id,
                commission_rec.split_origination_percent,
                commission_rec.split_site_percent,
                commission_rec.split_deal_percent
            );
        END LOOP;
    END LOOP;
    
    RETURN 'Success: Generated ' || payment_count || ' payments with commission splits';
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- Payment System Indexes and Constraints
-- ==============================================================================

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_commission_split_deal_id ON commission_split(deal_id);
CREATE INDEX IF NOT EXISTS idx_commission_split_broker_id ON commission_split(broker_id);
CREATE INDEX IF NOT EXISTS idx_payment_deal_id ON payment(deal_id);
CREATE INDEX IF NOT EXISTS idx_payment_sequence ON payment(deal_id, payment_sequence);
CREATE INDEX IF NOT EXISTS idx_payment_split_payment_id ON payment_split(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_split_broker_id ON payment_split(broker_id);
CREATE INDEX IF NOT EXISTS idx_payment_split_commission_split_id ON payment_split(commission_split_id);

-- Constraints (drop first to avoid conflicts, then recreate)
ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_sequence_positive;
ALTER TABLE payment ADD CONSTRAINT payment_sequence_positive CHECK (payment_sequence > 0);

ALTER TABLE commission_split DROP CONSTRAINT IF EXISTS commission_percent_valid;
ALTER TABLE commission_split ADD CONSTRAINT commission_percent_valid CHECK (
    split_origination_percent >= 0 AND split_origination_percent <= 100 AND
    split_site_percent >= 0 AND split_site_percent <= 100 AND
    split_deal_percent >= 0 AND split_deal_percent <= 100
);

-- Update the calculated fields for existing commission splits
UPDATE commission_split SET updated_at = NOW();

-- ==============================================================================
-- Remove problematic payment_split triggers (trigger-free approach)
-- ==============================================================================
-- This ensures they don't get recreated during migration and allows manual editing
DROP TRIGGER IF EXISTS trg_payment_split_calculations ON payment_split;
DROP TRIGGER IF EXISTS trigger_calculate_payment_split_amounts ON payment_split;
DROP FUNCTION IF EXISTS payment_split_calculations() CASCADE;
DROP FUNCTION IF EXISTS calculate_payment_split_amounts() CASCADE;

-- Add comment documenting the approach
COMMENT ON TABLE payment_split IS 'USD amounts calculated during migration - no automatic triggers during prototype phase';

COMMIT;
