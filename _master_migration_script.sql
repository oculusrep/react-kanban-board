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

-- ==============================================================================
-- Missing Foreign Key Constraints (CRITICAL FIX)
-- ==============================================================================
-- Note: Lookup tables (property_type, property_stage, etc.) already exist manually
-- We just need to add the missing foreign key relationships

-- Add client_id foreign key constraint to contact table
-- This was missing and causing search relationship issues
ALTER TABLE contact DROP CONSTRAINT IF EXISTS fk_contact_client_id;
ALTER TABLE contact ADD CONSTRAINT fk_contact_client_id 
    FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE SET NULL;

-- Add property table foreign key constraints to existing lookup tables
ALTER TABLE property DROP CONSTRAINT IF EXISTS fk_property_type_id;
ALTER TABLE property ADD CONSTRAINT fk_property_type_id 
    FOREIGN KEY (property_type_id) REFERENCES property_type(id) ON DELETE SET NULL;

ALTER TABLE property DROP CONSTRAINT IF EXISTS fk_property_stage_id;
ALTER TABLE property ADD CONSTRAINT fk_property_stage_id 
    FOREIGN KEY (property_stage_id) REFERENCES property_stage(id) ON DELETE SET NULL;

ALTER TABLE property DROP CONSTRAINT IF EXISTS fk_property_record_type_id;
ALTER TABLE property ADD CONSTRAINT fk_property_record_type_id 
    FOREIGN KEY (property_record_type_id) REFERENCES property_record_type(id) ON DELETE SET NULL;

-- Add deal table foreign key constraint to deal_stage lookup table
ALTER TABLE deal DROP CONSTRAINT IF EXISTS fk_deal_stage_id;
ALTER TABLE deal ADD CONSTRAINT fk_deal_stage_id 
    FOREIGN KEY (stage_id) REFERENCES deal_stage(id) ON DELETE SET NULL;

-- Add site_submit table foreign key constraint to submit_stage lookup table
ALTER TABLE site_submit DROP CONSTRAINT IF EXISTS fk_site_submit_stage_id;
ALTER TABLE site_submit ADD CONSTRAINT fk_site_submit_stage_id 
    FOREIGN KEY (submit_stage_id) REFERENCES submit_stage(id) ON DELETE SET NULL;

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

-- Add missing columns to contact table for Lead data
ALTER TABLE contact ADD COLUMN IF NOT EXISTS sf_lead_source TEXT;
ALTER TABLE contact ADD COLUMN IF NOT EXISTS sf_email_campaigns TEXT;

-- Upsert into contact table from Salesforce Contact
INSERT INTO contact (
  id,
  first_name,
  last_name,
  email,
  phone,
  sf_id,
  source_type
)
SELECT
  gen_random_uuid(),
  c."FirstName",
  c."LastName",
  c."Email",
  c."Phone",
  c."Id" AS sf_id,
  'Contact' AS source_type
FROM "salesforce_Contact" c
ON CONFLICT (sf_id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  source_type = EXCLUDED.source_type;

-- Upsert into contact table from Salesforce Lead
INSERT INTO contact (
  id,
  source_type,
  sf_id,
  first_name,
  last_name,
  middle_name,
  salutation,
  title,
  company,
  email,
  phone,
  mobile_phone,
  website,
  mailing_street,
  mailing_city,
  mailing_state,
  mailing_zip,
  mailing_country,
  sf_name,
  sf_lead_status,
  lead_status_id,
  sf_owner_id,
  owner_id,
  sf_photo_url,
  sf_lead_source,
  sf_individual_id,
  sf_lead_list,
  sf_lead_tags,
  sf_converted_date,
  sf_lead_notes,
  sf_tenant_rep_id,
  tenant_rep_contact_id,
  sf_master_record_id,
  tenant_repped,
  sf_email_campaigns,
  icsc_profile_link,
  retail_sphere_link,
  linked_in_connection,
  linked_in_profile_link,
  sf_created_by_id,
  created_by_id,
  created_at,
  updated_by_sf_id,
  updated_by_id,
  updated_at
)
SELECT
  gen_random_uuid(),
  'Lead' AS source_type,
  l."Id" AS sf_id,
  l."FirstName",
  l."LastName",
  l."MiddleName",
  l."Salutation",
  l."Title",
  l."Company",
  l."Email",
  l."Phone",
  l."MobilePhone",
  l."Website",
  l."Street",
  l."City",
  l."State",
  l."PostalCode",
  l."Country",
  l."Name" AS sf_name,
  l."Status" AS sf_lead_status,
  (SELECT id FROM lead_status WHERE name = l."Status" LIMIT 1) AS lead_status_id,
  l."OwnerId" AS sf_owner_id,
  (SELECT id FROM "user" WHERE sf_id = l."OwnerId" LIMIT 1) AS owner_id,
  l."PhotoUrl" AS sf_photo_url,
  l."LeadSource" AS sf_lead_source,
  l."IndividualId" AS sf_individual_id,
  l."Lead_List__c" AS sf_lead_list,
  l."Lead_Tags__c" AS sf_lead_tags,
  l."ConvertedDate" AS sf_converted_date,
  l."Lead_Notes__c" AS sf_lead_notes,
  l."Tenant_Rep__c" AS sf_tenant_rep_id,
  (SELECT id FROM contact WHERE sf_id = l."Tenant_Rep__c" LIMIT 1) AS tenant_rep_contact_id,
  l."MasterRecordId" AS sf_master_record_id,
  l."Tenant_Repped__c" AS tenant_repped,
  l."Email_Campaigns__c" AS sf_email_campaigns,
  l."ICSC_Profile_Link__c" AS icsc_profile_link,
  l."RetailSphere_Link__c" AS retail_sphere_link,
  l."LinkedIN_Connection__c" AS linked_in_connection,
  l."LinkedIN_Profile_Link__c" AS linked_in_profile_link,
  l."CreatedById" AS sf_created_by_id,
  (SELECT id FROM "user" WHERE sf_id = l."CreatedById" LIMIT 1) AS created_by_id,
  l."CreatedDate" AS created_at,
  l."LastModifiedById" AS updated_by_sf_id,
  (SELECT id FROM "user" WHERE sf_id = l."LastModifiedById" LIMIT 1) AS updated_by_id,
  l."LastModifiedDate" AS updated_at
FROM "salesforce_Lead" l
ON CONFLICT (sf_id) DO UPDATE SET
  source_type = EXCLUDED.source_type,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  middle_name = EXCLUDED.middle_name,
  salutation = EXCLUDED.salutation,
  title = EXCLUDED.title,
  company = EXCLUDED.company,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  mobile_phone = EXCLUDED.mobile_phone,
  website = EXCLUDED.website,
  mailing_street = EXCLUDED.mailing_street,
  mailing_city = EXCLUDED.mailing_city,
  mailing_state = EXCLUDED.mailing_state,
  mailing_zip = EXCLUDED.mailing_zip,
  mailing_country = EXCLUDED.mailing_country,
  sf_name = EXCLUDED.sf_name,
  sf_lead_status = EXCLUDED.sf_lead_status,
  lead_status_id = EXCLUDED.lead_status_id,
  sf_owner_id = EXCLUDED.sf_owner_id,
  owner_id = EXCLUDED.owner_id,
  sf_photo_url = EXCLUDED.sf_photo_url,
  sf_lead_source = EXCLUDED.sf_lead_source,
  sf_individual_id = EXCLUDED.sf_individual_id,
  sf_lead_list = EXCLUDED.sf_lead_list,
  sf_lead_tags = EXCLUDED.sf_lead_tags,
  sf_converted_date = EXCLUDED.sf_converted_date,
  sf_lead_notes = EXCLUDED.sf_lead_notes,
  sf_tenant_rep_id = EXCLUDED.sf_tenant_rep_id,
  tenant_rep_contact_id = EXCLUDED.tenant_rep_contact_id,
  sf_master_record_id = EXCLUDED.sf_master_record_id,
  tenant_repped = EXCLUDED.tenant_repped,
  sf_email_campaigns = EXCLUDED.sf_email_campaigns,
  icsc_profile_link = EXCLUDED.icsc_profile_link,
  retail_sphere_link = EXCLUDED.retail_sphere_link,
  linked_in_connection = EXCLUDED.linked_in_connection,
  linked_in_profile_link = EXCLUDED.linked_in_profile_link,
  sf_created_by_id = EXCLUDED.sf_created_by_id,
  created_by_id = EXCLUDED.created_by_id,
  created_at = EXCLUDED.created_at,
  updated_by_sf_id = EXCLUDED.updated_by_sf_id,
  updated_by_id = EXCLUDED.updated_by_id,
  updated_at = EXCLUDED.updated_at;

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
  house_percent,
  origination_percent,
  site_percent,
  deal_percent,
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
  o."House_Percent__c" AS house_percent,
  o."Origination_Percent__c" AS origination_percent,
  o."Site_Percent__c" AS site_percent,
  o."Deal_Percent__c" AS deal_percent,
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
  referral_fee_usd = EXCLUDED.referral_fee_usd,
  house_percent = EXCLUDED.house_percent,
  origination_percent = EXCLUDED.origination_percent,
  site_percent = EXCLUDED.site_percent,
  deal_percent = EXCLUDED.deal_percent;
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

-- Add acres field to property table if it doesn't exist
ALTER TABLE property ADD COLUMN IF NOT EXISTS acres NUMERIC;

-- Upsert into property table
INSERT INTO property (
  id,
  property_name,
  property_stage_id,
  property_type_id,
  property_record_type_id,
  sf_id,
  acres
)
SELECT
  gen_random_uuid(),
  p."Name",
  ps.id AS property_stage_id,
  pt.id AS property_type_id,
  prt.id AS property_record_type_id,
  p."Id" AS sf_id,
  p."Acres__c" AS acres
FROM "salesforce_Property__c" p
LEFT JOIN property_stage        ps  ON ps.label  = p."stage__c"
LEFT JOIN property_type         pt  ON pt.label  = p."Property_Type__c"
LEFT JOIN "salesforce_RecordType" rt ON rt."Id" = p."RecordTypeId" AND rt."IsActive" = true
LEFT JOIN property_record_type  prt ON prt.label = rt."Name"
ON CONFLICT (sf_id) DO UPDATE SET
  property_name = EXCLUDED.property_name,
  property_stage_id = EXCLUDED.property_stage_id,
  property_type_id = EXCLUDED.property_type_id,
  property_record_type_id = EXCLUDED.property_record_type_id,
  acres = EXCLUDED.acres;

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

-- Make sf_id nullable for legacy tables (not required for new records)
ALTER TABLE site_submit ALTER COLUMN sf_id DROP NOT NULL;
ALTER TABLE property_unit ALTER COLUMN sf_id DROP NOT NULL;
ALTER TABLE deal_contact ALTER COLUMN sf_id DROP NOT NULL;

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
-- Deal-Level Commission Percentages (Now from Salesforce Opportunity)
-- ==============================================================================
-- UPDATED: These percentages now come directly from Salesforce Opportunity fields
-- (House_Percent__c, Origination_Percent__c, Site_Percent__c, Deal_Percent__c)
-- The old logic that calculated them from commission_split has been removed.

-- Add columns if they don't exist (for backwards compatibility)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS house_percent NUMERIC(5,2);
ALTER TABLE deal ADD COLUMN IF NOT EXISTS origination_percent NUMERIC(5,2);
ALTER TABLE deal ADD COLUMN IF NOT EXISTS site_percent NUMERIC(5,2);
ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_percent NUMERIC(5,2);

-- NOTE: The percentages are now populated directly in the deal INSERT above (lines 404-407)
-- No additional UPDATE needed since they come from Salesforce Opportunity

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

-- Drop any existing unique constraints on payment sequence (will recreate after migration)
DROP INDEX IF EXISTS idx_payment_sequence_unique;
DROP INDEX IF EXISTS payment_deal_sequence_unique;
DROP INDEX IF EXISTS idx_payment_deal_sequence_unique;

-- Clear ALL payment data for deals that have Salesforce data (Salesforce is source of truth)
-- This includes both Salesforce-sourced payments AND manually-created payments
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

-- Now delete ALL payments (Salesforce and manual) for deals with Salesforce payment data
WITH sf_deals AS (
    SELECT DISTINCT (SELECT id FROM deal WHERE sf_id = p."Opportunity__c" LIMIT 1) AS deal_id
    FROM "salesforce_Payment__c" p
    WHERE p."Id" IS NOT NULL
      AND p."Payment_Amount__c" IS NOT NULL
      AND p."Opportunity__c" IS NOT NULL
)
DELETE FROM payment
WHERE deal_id IN (SELECT deal_id FROM sf_deals WHERE deal_id IS NOT NULL);

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
-- Two-step CTE: assign sequences, then deduplicate by (deal_id, payment_sequence)
WITH payment_with_sequence AS (
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
),
payment_data AS (
    SELECT DISTINCT ON (deal_id, payment_sequence)
        *
    FROM payment_with_sequence
    WHERE deal_id IS NOT NULL
    ORDER BY deal_id, payment_sequence, updated_at DESC NULLS LAST
)
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
SELECT * FROM payment_data
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

-- Create unique index on payment sequence AFTER all payment data is inserted
-- This prevents duplicate payment sequences per deal while allowing manual payments without sequences
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_deal_sequence_unique
    ON payment(deal_id, payment_sequence)
    WHERE payment_sequence IS NOT NULL;

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

-- ==============================================================================
-- Property Contact Junction Table Migration
-- Maps Salesforce "J_Property_2_Contacts__c" to "property_contact"
-- ==============================================================================

-- Create the property_contact junction table
CREATE TABLE IF NOT EXISTS property_contact (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sf_id TEXT UNIQUE,
    sf_join_name TEXT,
    sf_owner_id TEXT,
    sf_email TEXT,
    sf_phone TEXT,
    sf_contact_id TEXT,
    contact_id UUID REFERENCES contact(id),
    sf_created_by_id TEXT,
    created_by_id UUID REFERENCES "user"(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sf_property_id TEXT,
    property_id UUID REFERENCES property(id),
    sf_mobile_phone TEXT,
    sf_contact_name TEXT,
    updated_by_sf_id TEXT,
    updated_by_id UUID REFERENCES "user"(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add any missing columns if they don't exist
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_join_name TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_owner_id TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_email TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_phone TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_contact_id TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS contact_id UUID;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_created_by_id TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS created_by_id UUID;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_property_id TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS property_id UUID;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_mobile_phone TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_contact_name TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS updated_by_sf_id TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS updated_by_id UUID;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_property_contact_property_id ON property_contact(property_id);
CREATE INDEX IF NOT EXISTS idx_property_contact_contact_id ON property_contact(contact_id);
CREATE INDEX IF NOT EXISTS idx_property_contact_sf_id ON property_contact(sf_id);
CREATE INDEX IF NOT EXISTS idx_property_contact_sf_contact_id ON property_contact(sf_contact_id);
CREATE INDEX IF NOT EXISTS idx_property_contact_sf_property_id ON property_contact(sf_property_id);

-- Create unique constraint to prevent duplicate property-contact relationships
CREATE UNIQUE INDEX IF NOT EXISTS property_contact_unique_pair ON property_contact(property_id, contact_id);

-- Add foreign key constraints with proper naming (drop first to avoid conflicts)
ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS fk_property_contact_contact_id;
ALTER TABLE property_contact ADD CONSTRAINT fk_property_contact_contact_id 
    FOREIGN KEY (contact_id) REFERENCES contact(id) ON DELETE CASCADE;

ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS fk_property_contact_property_id;
ALTER TABLE property_contact ADD CONSTRAINT fk_property_contact_property_id 
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS fk_property_contact_created_by_id;
ALTER TABLE property_contact ADD CONSTRAINT fk_property_contact_created_by_id 
    FOREIGN KEY (created_by_id) REFERENCES "user"(id);

ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS fk_property_contact_updated_by_id;
ALTER TABLE property_contact ADD CONSTRAINT fk_property_contact_updated_by_id 
    FOREIGN KEY (updated_by_id) REFERENCES "user"(id);

-- Populate property_contact table from Salesforce J_Property_2_Contacts__c
-- First, create a temporary view with deduplicated data (keep most recent)
WITH deduplicated_property_contacts AS (
    SELECT DISTINCT ON (sf."Property__c", sf."Contact__c")
        sf."Id" as sf_id,
        sf."Name" as sf_join_name,
        sf."OwnerId" as sf_owner_id,
        sf."Email__c" as sf_email,
        sf."Phone__c" as sf_phone,
        sf."Contact__c" as sf_contact_id,
        c.id as contact_id,
        sf."CreatedById" as sf_created_by_id,
        cu.id as created_by_id,
        sf."CreatedDate" as created_at,
        sf."Property__c" as sf_property_id,
        p.id as property_id,
        sf."MobilePhone__c" as sf_mobile_phone,
        sf."Contact_Name__c" as sf_contact_name,
        sf."LastModifiedById" as updated_by_sf_id,
        uu.id as updated_by_id,
        sf."LastModifiedDate" as updated_at
    FROM "salesforce_J_Property_2_Contacts__c" sf
    LEFT JOIN contact c ON c.sf_id = sf."Contact__c"
    LEFT JOIN property p ON p.sf_id = sf."Property__c"
    LEFT JOIN "user" cu ON cu.sf_id = sf."CreatedById"
    LEFT JOIN "user" uu ON uu.sf_id = sf."LastModifiedById"
    WHERE sf."IsDeleted" = false
        AND c.id IS NOT NULL 
        AND p.id IS NOT NULL
    ORDER BY sf."Property__c", sf."Contact__c", sf."LastModifiedDate" DESC NULLS LAST
)
INSERT INTO property_contact (
    sf_id,
    sf_join_name,
    sf_owner_id,
    sf_email,
    sf_phone,
    sf_contact_id,
    contact_id,
    sf_created_by_id,
    created_by_id,
    created_at,
    sf_property_id,
    property_id,
    sf_mobile_phone,
    sf_contact_name,
    updated_by_sf_id,
    updated_by_id,
    updated_at
)
SELECT 
    sf_id,
    sf_join_name,
    sf_owner_id,
    sf_email,
    sf_phone,
    sf_contact_id,
    contact_id,
    sf_created_by_id,
    created_by_id,
    created_at,
    sf_property_id,
    property_id,
    sf_mobile_phone,
    sf_contact_name,
    updated_by_sf_id,
    updated_by_id,
    updated_at
FROM deduplicated_property_contacts
ON CONFLICT (property_id, contact_id) DO UPDATE SET
    sf_id = EXCLUDED.sf_id,
    sf_join_name = EXCLUDED.sf_join_name,
    sf_owner_id = EXCLUDED.sf_owner_id,
    sf_email = EXCLUDED.sf_email,
    sf_phone = EXCLUDED.sf_phone,
    sf_contact_id = EXCLUDED.sf_contact_id,
    sf_created_by_id = EXCLUDED.sf_created_by_id,
    created_by_id = EXCLUDED.created_by_id,
    created_at = EXCLUDED.created_at,
    sf_property_id = EXCLUDED.sf_property_id,
    sf_mobile_phone = EXCLUDED.sf_mobile_phone,
    sf_contact_name = EXCLUDED.sf_contact_name,
    updated_by_sf_id = EXCLUDED.updated_by_sf_id,
    updated_by_id = EXCLUDED.updated_by_id,
    updated_at = EXCLUDED.updated_at;

-- Add comment documenting the junction table
COMMENT ON TABLE property_contact IS 'Junction table linking properties to contacts - many-to-many relationship mapped from Salesforce J_Property_2_Contacts__c';

-- ==============================================================================
-- Fix existing contacts that have NULL source_type (from previous migrations)
-- ==============================================================================

-- Update existing contacts from Salesforce Contact table to have source_type = 'Contact'
UPDATE contact 
SET source_type = 'Contact' 
WHERE sf_id IS NOT NULL 
  AND source_type IS NULL;

-- Set default source_type for any remaining NULL values (manually created contacts)
UPDATE contact 
SET source_type = 'Contact' 
WHERE source_type IS NULL;

-- ==============================================================================
-- Activity System Migration (Task/Activity Management)
-- ==============================================================================

-- ==============================================================================
-- Activity Lookup Tables (Must come first)
-- ==============================================================================

-- Activity Status lookup table
CREATE TABLE IF NOT EXISTS activity_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    is_closed BOOLEAN DEFAULT FALSE,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INTEGER,
    color VARCHAR(7),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO activity_status (name, is_closed, is_default, sort_order, color) VALUES
('Open', false, true, 1, '#3B82F6'),
('Completed', true, false, 2, '#10B981'),
('In Progress', false, false, 3, '#F59E0B'),
('Not Started', false, false, 4, '#6B7280'),
('Waiting on someone else', false, false, 5, '#8B5CF6'),
('Deferred', false, false, 6, '#EF4444')
ON CONFLICT (name) DO UPDATE SET
  is_closed = EXCLUDED.is_closed,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  color = EXCLUDED.color,
  active = EXCLUDED.active;

CREATE INDEX IF NOT EXISTS idx_activity_status_default ON activity_status(is_default);
CREATE INDEX IF NOT EXISTS idx_activity_status_closed ON activity_status(is_closed);

-- Activity Type lookup table  
CREATE TABLE IF NOT EXISTS activity_type (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(20),
    color VARCHAR(7),
    sort_order INTEGER,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO activity_type (name, description, icon, color, sort_order) VALUES
('Call', 'Phone call activities', 'Phone', '#10B981', 1),
('Email', 'Email communication activities', 'Mail', '#8B5CF6', 2),
('Task', 'General task activities', 'CheckSquare', '#3B82F6', 3),
('ListEmail', 'Email list/campaign activities', 'Send', '#F59E0B', 4)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

CREATE INDEX IF NOT EXISTS idx_activity_type_sort ON activity_type(sort_order);

-- Activity Priority lookup table
CREATE TABLE IF NOT EXISTS activity_priority (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    is_high_priority BOOLEAN DEFAULT FALSE,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INTEGER,
    color VARCHAR(7),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO activity_priority (name, is_high_priority, is_default, sort_order, color) VALUES
('Immediate', true, false, 1, '#DC2626'),
('EOD', true, false, 2, '#EA580C'),
('EOW', false, true, 3, '#F59E0B'),
('Next Week', false, false, 4, '#3B82F6'),
('Call Sheet', false, false, 5, '#8B5CF6'),
('Prospecting List', false, false, 6, '#10B981'),
('Normal', false, false, 7, '#6B7280'),
('High', true, false, 8, '#EF4444'),
('Low', false, false, 9, '#94A3B8')
ON CONFLICT (name) DO UPDATE SET
  is_high_priority = EXCLUDED.is_high_priority,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  color = EXCLUDED.color,
  active = EXCLUDED.active;

CREATE INDEX IF NOT EXISTS idx_activity_priority_default ON activity_priority(is_default);
CREATE INDEX IF NOT EXISTS idx_activity_priority_high ON activity_priority(is_high_priority);

-- Activity Task Type lookup table
CREATE TABLE IF NOT EXISTS activity_task_type (
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

INSERT INTO activity_task_type (name, category, description, icon, color, sort_order) VALUES
('Assistant Task', 'administrative', 'Tasks handled by assistant', 'UserCheck', '#6B7280', 1),
('Pipeline', 'sales', 'Pipeline management activities', 'TrendingUp', '#3B82F6', 2),
('Prospecting', 'sales', 'New client prospecting activities', 'Search', '#10B981', 3),
('Process', 'administrative', 'Internal process and workflow tasks', 'Settings', '#8B5CF6', 4),
('Site Submit', 'operations', 'Site submission related activities', 'MapPin', '#F59E0B', 5),
('Follow-ups', 'sales', 'Follow-up activities with clients', 'RotateCcw', '#EC4899', 6),
('Call List', 'sales', 'Organized calling activities', 'Phone', '#059669', 7),
('Property Research', 'research', 'Property research and analysis', 'BookOpen', '#06B6D4', 8),
('Personal', 'personal', 'Personal tasks and activities', 'User', '#84CC16', 9),
('CRM Future Projects', 'development', 'CRM system improvement tasks', 'Code', '#7C3AED', 10)
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

CREATE INDEX IF NOT EXISTS idx_activity_task_type_category ON activity_task_type(category);
CREATE INDEX IF NOT EXISTS idx_activity_task_type_sort ON activity_task_type(sort_order);

-- ==============================================================================
-- Main Activity Table
-- ==============================================================================

CREATE TABLE IF NOT EXISTS activity (
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
    user_id UUID REFERENCES "user"(id),  -- Maps from CreatedById
    activity_type_id UUID REFERENCES activity_type(id),
    activity_task_type_id UUID REFERENCES activity_task_type(id),
    updated_by UUID REFERENCES "user"(id),
    client_id UUID REFERENCES client(id),
    
    -- WhatId Relationship Mappings (from our prefix analysis)
    deal_id UUID REFERENCES deal(id),
    property_id UUID REFERENCES property(id),
    site_submit_id UUID REFERENCES site_submit(id),
    assignment_id UUID REFERENCES assignment(id),

    -- WhatId Text References (for smaller objects)
    related_object_type VARCHAR(50),  -- 'property_research', 'list_email', etc.
    related_object_id TEXT,  -- Changed from VARCHAR(18) to TEXT to support UUIDs
    
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
    is_property_prospecting_call BOOLEAN,
    
    -- Indexes
    CONSTRAINT activity_sf_id_unique UNIQUE(sf_id)
);

-- Add any missing columns (for schema evolution)
ALTER TABLE activity ADD COLUMN IF NOT EXISTS sf_who_id VARCHAR(18);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS sf_what_id VARCHAR(18);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS sf_owner_id VARCHAR(18);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS sf_account_id VARCHAR(18);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS sf_created_by_id VARCHAR(18);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS sf_updated_by VARCHAR(18);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS sf_status VARCHAR(100);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS sf_task_priority VARCHAR(100);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS sf_task_subtype VARCHAR(100);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS sf_task_type VARCHAR(100);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS sf_is_closed BOOLEAN;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS sf_is_recurring BOOLEAN;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS contact_id UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS status_id UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS activity_priority_id UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS activity_type_id UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS activity_task_type_id UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS deal_id UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS property_id UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS site_submit_id UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS assignment_id UUID;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS related_object_type VARCHAR(50);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS related_object_id TEXT;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS subject VARCHAR(255);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS activity_date DATE;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS call_disposition VARCHAR(100);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS call_duration_seconds INTEGER;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS is_high_priority BOOLEAN;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS meeting_held BOOLEAN;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS completed_call BOOLEAN;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS is_prospecting_call BOOLEAN;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS completed_property_call BOOLEAN;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS is_property_prospecting_call BOOLEAN;

-- Modify column types for enhanced functionality
ALTER TABLE activity ALTER COLUMN related_object_id TYPE TEXT;

-- Add foreign key constraints (drop first to avoid conflicts)
ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_contact_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_contact_id FOREIGN KEY (contact_id) REFERENCES contact(id);

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_status_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_status_id FOREIGN KEY (status_id) REFERENCES activity_status(id);

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_owner_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_owner_id FOREIGN KEY (owner_id) REFERENCES "user"(id);

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_priority_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_priority_id FOREIGN KEY (activity_priority_id) REFERENCES activity_priority(id);

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_user_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_user_id FOREIGN KEY (user_id) REFERENCES "user"(id);

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_type_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_type_id FOREIGN KEY (activity_type_id) REFERENCES activity_type(id);

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_task_type_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_task_type_id FOREIGN KEY (activity_task_type_id) REFERENCES activity_task_type(id);

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_updated_by;
ALTER TABLE activity ADD CONSTRAINT fk_activity_updated_by FOREIGN KEY (updated_by) REFERENCES "user"(id);

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_client_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_client_id FOREIGN KEY (client_id) REFERENCES client(id);

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_deal_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_deal_id FOREIGN KEY (deal_id) REFERENCES deal(id);

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_property_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_property_id FOREIGN KEY (property_id) REFERENCES property(id);

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_site_submit_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_site_submit_id FOREIGN KEY (site_submit_id) REFERENCES site_submit(id);

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_assignment_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_assignment_id FOREIGN KEY (assignment_id) REFERENCES assignment(id);

-- ==============================================================================
-- Activity Table Indexes
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_activity_contact ON activity(contact_id);
CREATE INDEX IF NOT EXISTS idx_activity_owner ON activity(owner_id);
CREATE INDEX IF NOT EXISTS idx_activity_deal ON activity(deal_id);
CREATE INDEX IF NOT EXISTS idx_activity_property ON activity(property_id);
CREATE INDEX IF NOT EXISTS idx_activity_client ON activity(client_id);
CREATE INDEX IF NOT EXISTS idx_activity_site_submit ON activity(site_submit_id);
CREATE INDEX IF NOT EXISTS idx_activity_assignment ON activity(assignment_id);
CREATE INDEX IF NOT EXISTS idx_activity_status ON activity(status_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity(activity_type_id);
CREATE INDEX IF NOT EXISTS idx_activity_task_type ON activity(activity_task_type_id);
CREATE INDEX IF NOT EXISTS idx_activity_date ON activity(activity_date);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_related_object ON activity(related_object_type, related_object_id);
CREATE INDEX IF NOT EXISTS idx_activity_sf_id ON activity(sf_id);
CREATE INDEX IF NOT EXISTS idx_activity_sf_who_id ON activity(sf_who_id);
CREATE INDEX IF NOT EXISTS idx_activity_sf_what_id ON activity(sf_what_id);
CREATE INDEX IF NOT EXISTS idx_activity_sf_owner_id ON activity(sf_owner_id);

-- ==============================================================================
-- Activity Migration INSERT Query
-- ==============================================================================

-- Populate activity table from salesforce_Task
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
SELECT 
    -- Salesforce Legacy Fields
    st."Id", st."WhoId", st."WhatId", st."OwnerId", st."AccountId", st."CreatedById", st."LastModifiedById",
    st."Status", st."Priority", st."TaskSubtype", st."Task_Type__c", st."IsClosed", st."IsRecurrence",
    
    -- Foreign Key Lookups
    (SELECT id FROM contact WHERE sf_id = st."WhoId" LIMIT 1),
    (SELECT id FROM activity_status WHERE is_default = true LIMIT 1), -- Will update based on Status later
    (SELECT id FROM "user" WHERE sf_id = st."OwnerId" LIMIT 1),
    (SELECT id FROM activity_priority WHERE is_default = true LIMIT 1), -- Will update based on Priority later
    (SELECT id FROM "user" WHERE sf_id = st."CreatedById" LIMIT 1),
    
    -- Activity Type Mapping
    CASE st."TaskSubtype"
        WHEN 'Call' THEN (SELECT id FROM activity_type WHERE name = 'Call')
        WHEN 'Email' THEN (SELECT id FROM activity_type WHERE name = 'Email')
        WHEN 'ListEmail' THEN (SELECT id FROM activity_type WHERE name = 'ListEmail')
        ELSE (SELECT id FROM activity_type WHERE name = 'Task')
    END,
    
    -- Task Type Mapping (lookup by name if exists)
    (SELECT id FROM activity_task_type WHERE name = st."Task_Type__c" LIMIT 1),
    
    (SELECT id FROM "user" WHERE sf_id = st."LastModifiedById" LIMIT 1),
    (SELECT id FROM client WHERE sf_id = st."AccountId" LIMIT 1),
    
    -- WhatId Relationship Mappings (based on prefix analysis)
    CASE LEFT(st."WhatId", 3)
        WHEN '006' THEN (SELECT id FROM deal WHERE sf_id = st."WhatId" LIMIT 1)
        ELSE NULL
    END,
    CASE LEFT(st."WhatId", 3)
        WHEN 'a00' THEN (SELECT id FROM property WHERE sf_id = st."WhatId" LIMIT 1)
        ELSE NULL
    END,
    CASE LEFT(st."WhatId", 3)
        WHEN 'a05' THEN (SELECT id FROM site_submit WHERE sf_id = st."WhatId" LIMIT 1)
        ELSE NULL
    END,
    
    -- Related Object Text References
    CASE LEFT(st."WhatId", 3)
        WHEN 'a03' THEN 'property_research'
        WHEN '0XB' THEN 'list_email'
        WHEN 'a2R' THEN 'individual_email'
        WHEN 'a1n' THEN 'restaurant_trends'
        ELSE NULL
    END,
    CASE 
        WHEN LEFT(st."WhatId", 3) IN ('a03', '0XB', 'a2R', 'a1n') THEN st."WhatId"
        ELSE NULL
    END,
    
    -- Core Fields
    st."Subject", st."Description", st."ActivityDate"::DATE, 
    st."CreatedDate"::TIMESTAMP, st."LastModifiedDate"::TIMESTAMP, st."CompletedDateTime"::TIMESTAMP,
    
    -- Call Fields
    st."CallDisposition", st."CallDurationInSeconds",
    
    -- Boolean Fields
    COALESCE(st."IsHighPriority", false), COALESCE(st."Meeting_Held__c", false), 
    COALESCE(st."Completed_Call__c", false), COALESCE(st."Log_Prospecting_Call__c", false),
    COALESCE(st."Completed_Property_Call__c", false), COALESCE(st."Log_Property_Prospecting_call__c", false)
    
FROM "salesforce_Task" st
WHERE (st."IsDeleted" = false OR st."IsDeleted" IS NULL)
ON CONFLICT (sf_id) DO UPDATE SET
    -- Update logic for any re-runs
    subject = EXCLUDED.subject,
    description = EXCLUDED.description,
    updated_at = EXCLUDED.updated_at,
    completed_at = EXCLUDED.completed_at,
    call_disposition = EXCLUDED.call_disposition,
    call_duration_seconds = EXCLUDED.call_duration_seconds,
    is_high_priority = EXCLUDED.is_high_priority,
    meeting_held = EXCLUDED.meeting_held,
    completed_call = EXCLUDED.completed_call,
    is_prospecting_call = EXCLUDED.is_prospecting_call,
    completed_property_call = EXCLUDED.completed_property_call,
    is_property_prospecting_call = EXCLUDED.is_property_prospecting_call;

-- ==============================================================================
-- Post-Migration Updates for Complex Mappings
-- ==============================================================================

-- Update Priority based on Salesforce Priority field
UPDATE activity SET activity_priority_id = (
    SELECT ap.id FROM activity_priority ap 
    WHERE ap.name = activity.sf_task_priority
    LIMIT 1
)
WHERE sf_task_priority IS NOT NULL
AND EXISTS (SELECT 1 FROM activity_priority WHERE name = activity.sf_task_priority);

-- Update Status based on Salesforce Status field
UPDATE activity SET status_id = (
    SELECT ast.id FROM activity_status ast
    WHERE ast.name = activity.sf_status
    LIMIT 1
)
WHERE sf_status IS NOT NULL
AND EXISTS (SELECT 1 FROM activity_status WHERE name = activity.sf_status);

-- Handle Status values that don't have exact matches - map common variations
UPDATE activity SET status_id = (
    SELECT id FROM activity_status 
    WHERE name = CASE 
        WHEN activity.sf_status IN ('Completed', 'Complete') THEN 'Completed'
        WHEN activity.sf_status IN ('Open', 'New', 'Started') THEN 'Open'
        WHEN activity.sf_status = 'In Progress' THEN 'In Progress'
        WHEN activity.sf_status = 'Not Started' THEN 'Not Started'
        WHEN activity.sf_status = 'Waiting on someone else' THEN 'Waiting on someone else'
        WHEN activity.sf_status = 'Deferred' THEN 'Deferred'
        ELSE 'Open' -- Default fallback
    END
    LIMIT 1
)
WHERE status_id IS NULL AND sf_status IS NOT NULL;

-- ==============================================================================
-- Activity Migration Validation Queries
-- ==============================================================================

-- Validation: Check migration completeness
-- This query shows the overall success of the migration
DO $$
DECLARE
    total_activities INTEGER;
    has_sf_id INTEGER;
    mapped_contacts INTEGER;
    mapped_deals INTEGER;
    mapped_properties INTEGER;
    mapped_site_submits INTEGER;
    mapped_other_objects INTEGER;
    validation_result TEXT;
BEGIN
    SELECT 
        COUNT(*) as total,
        COUNT(sf_id) as sf_ids,
        COUNT(contact_id) as contacts,
        COUNT(deal_id) as deals,
        COUNT(property_id) as properties,
        COUNT(site_submit_id) as site_submits,
        COUNT(CASE WHEN related_object_type IS NOT NULL THEN 1 END) as others
    INTO total_activities, has_sf_id, mapped_contacts, mapped_deals, mapped_properties, mapped_site_submits, mapped_other_objects
    FROM activity;
    
    validation_result := 'Activity Migration Validation Results:' || CHR(10) ||
                        'Total activities migrated: ' || total_activities || CHR(10) ||
                        'Activities with Salesforce IDs: ' || has_sf_id || CHR(10) ||
                        'Mapped to contacts: ' || mapped_contacts || CHR(10) ||
                        'Mapped to deals: ' || mapped_deals || CHR(10) ||
                        'Mapped to properties: ' || mapped_properties || CHR(10) ||
                        'Mapped to site submits: ' || mapped_site_submits || CHR(10) ||
                        'Mapped to other objects: ' || mapped_other_objects;
                        
    RAISE NOTICE '%', validation_result;
END $$;

-- Add helpful comment about WhatId mapping validation
COMMENT ON TABLE activity IS 'Activity table migrated from salesforce_Task with normalized relationships. WhatId mappings: 006=deals, a00=properties, a05=site_submits, a03=property_research, 0XB=list_email, a2R=individual_email, a1n=restaurant_trends';

-- ==============================================================================
-- NORMALIZED NOTE TABLE MIGRATION FROM CONTENTNOTE SYSTEM
-- ==============================================================================
-- This section creates the normalized note structure with separate note and
-- note_object_link tables to eliminate content duplication.

-- Create the main note table (unique notes only)
CREATE TABLE IF NOT EXISTS note (
    -- Primary Key
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Salesforce ContentNote System Fields
    sf_content_note_id TEXT UNIQUE,
    sf_content_document_id TEXT,
    sf_content_version_id TEXT,

    -- Note content (stored once per unique note)
    title TEXT,
    body TEXT,
    content_size INTEGER,

    -- Salesforce metadata
    share_type TEXT,
    visibility TEXT,
    sf_created_by_id TEXT,
    sf_updated_by_id TEXT,

    -- Local user references
    created_by UUID,
    updated_by UUID,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create the note-object relationship table
CREATE TABLE IF NOT EXISTS note_object_link (
    -- Primary Key
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Link to the note
    note_id UUID NOT NULL,

    -- Salesforce relationship identifier
    sf_content_document_link_id TEXT UNIQUE,

    -- Object type and ID (polymorphic relationship)
    object_type TEXT NOT NULL,
    object_id UUID,

    -- Specific foreign keys for type safety and performance
    client_id UUID,
    deal_id UUID,
    contact_id UUID,
    property_id UUID,
    assignment_id UUID,
    site_submit_id UUID,
    user_id UUID,

    -- Salesforce metadata for the relationship
    related_object_type TEXT,
    related_object_id TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_note_sf_content_note_id ON note(sf_content_note_id);
CREATE INDEX IF NOT EXISTS idx_note_created_at ON note(created_at);
CREATE INDEX IF NOT EXISTS idx_note_updated_at ON note(updated_at);

CREATE INDEX IF NOT EXISTS idx_note_object_link_note_id ON note_object_link(note_id);
CREATE INDEX IF NOT EXISTS idx_note_object_link_object_type ON note_object_link(object_type);
CREATE INDEX IF NOT EXISTS idx_note_object_link_sf_content_document_link_id ON note_object_link(sf_content_document_link_id);

-- Foreign key indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_note_object_link_client_id ON note_object_link(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_note_object_link_deal_id ON note_object_link(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_note_object_link_contact_id ON note_object_link(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_note_object_link_property_id ON note_object_link(property_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_note_object_link_assignment_id ON note_object_link(assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_note_object_link_site_submit_id ON note_object_link(site_submit_id) WHERE site_submit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_note_object_link_user_id ON note_object_link(user_id) WHERE user_id IS NOT NULL;

-- ==============================================================================
-- STEP 1: MIGRATE UNIQUE NOTES (One record per ContentNote)
-- ==============================================================================
INSERT INTO note (
    sf_content_note_id,
    sf_content_document_id,
    sf_content_version_id,
    title,
    body,
    content_size,
    share_type,
    visibility,
    sf_created_by_id,
    sf_updated_by_id,
    created_by,
    updated_by,
    created_at,
    updated_at
)
SELECT DISTINCT ON (cn."Id")
    cn."Id" as sf_content_note_id,
    cd."Id" as sf_content_document_id,
    cv."Id" as sf_content_version_id,
    cn."Title" as title,
    cn."TextPreview" as body,
    cv."ContentSize" as content_size,
    NULL as share_type,  -- Will be set per relationship
    NULL as visibility,  -- Will be set per relationship
    cd."CreatedById" as sf_created_by_id,
    cd."LastModifiedById" as sf_updated_by_id,

    -- Map created_by from CreatedById
    (SELECT u.id FROM "user" u WHERE u.sf_id = cd."CreatedById" LIMIT 1) as created_by,

    -- Map updated_by from LastModifiedById
    (SELECT u.id FROM "user" u WHERE u.sf_id = cd."LastModifiedById" LIMIT 1) as updated_by,

    cd."CreatedDate"::TIMESTAMPTZ as created_at,
    cd."LastModifiedDate"::TIMESTAMPTZ as updated_at

FROM "salesforce_ContentNote" cn
JOIN "salesforce_ContentVersion" cv ON cn."LatestPublishedVersionId" = cv."Id"
JOIN "salesforce_ContentDocument" cd ON cv."ContentDocumentId" = cd."Id"
WHERE cn."Id" IS NOT NULL
  AND cd."Id" IS NOT NULL
ORDER BY cn."Id", cd."CreatedDate" DESC
ON CONFLICT (sf_content_note_id) DO UPDATE SET
    sf_content_document_id = EXCLUDED.sf_content_document_id,
    sf_content_version_id = EXCLUDED.sf_content_version_id,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    content_size = EXCLUDED.content_size,
    sf_created_by_id = EXCLUDED.sf_created_by_id,
    sf_updated_by_id = EXCLUDED.sf_updated_by_id,
    created_by = EXCLUDED.created_by,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

-- ==============================================================================
-- STEP 2: MIGRATE NOTE-OBJECT RELATIONSHIPS (One record per ContentDocumentLink)
-- ==============================================================================
INSERT INTO note_object_link (
    note_id,
    sf_content_document_link_id,
    object_type,
    object_id,
    client_id,
    deal_id,
    property_id,
    site_submit_id,
    assignment_id,
    contact_id,
    user_id,
    related_object_type,
    related_object_id,
    created_at,
    updated_at
)
SELECT
    n.id as note_id,
    cdl."Id" as sf_content_document_link_id,

    -- Determine object type based on LinkedEntityId prefix
    CASE
        WHEN LEFT(cdl."LinkedEntityId", 3) = '001' THEN 'client'
        WHEN LEFT(cdl."LinkedEntityId", 3) = '006' THEN 'deal'
        WHEN LEFT(cdl."LinkedEntityId", 3) = 'a00' THEN 'property'
        WHEN LEFT(cdl."LinkedEntityId", 3) = 'a05' THEN 'site_submit'
        WHEN LEFT(cdl."LinkedEntityId", 3) = 'a02' THEN 'assignment'
        WHEN LEFT(cdl."LinkedEntityId", 3) = '003' THEN 'contact'
        WHEN LEFT(cdl."LinkedEntityId", 3) = '00Q' THEN 'contact'  -- Salesforce Lead IDs (now stored as contacts)
        WHEN LEFT(cdl."LinkedEntityId", 3) = '005' THEN 'user'
        ELSE 'unknown'
    END as object_type,

    -- Set object_id as the UUID of the first matched object
    COALESCE(
        (SELECT c.id FROM client c WHERE c.sf_id = cdl."LinkedEntityId" LIMIT 1),
        (SELECT d.id FROM deal d WHERE d.sf_id = cdl."LinkedEntityId" LIMIT 1),
        (SELECT p.id FROM property p WHERE p.sf_id = cdl."LinkedEntityId" LIMIT 1),
        (SELECT s.id FROM site_submit s WHERE s.sf_id = cdl."LinkedEntityId" LIMIT 1),
        (SELECT a.id FROM assignment a WHERE a.sf_id = cdl."LinkedEntityId" LIMIT 1),
        (SELECT ct.id FROM contact ct WHERE ct.sf_id = cdl."LinkedEntityId" LIMIT 1),
        (SELECT u.id FROM "user" u WHERE u.sf_id = cdl."LinkedEntityId" LIMIT 1)
    ) as object_id,

    -- Set specific foreign keys
    (SELECT c.id FROM client c WHERE c.sf_id = cdl."LinkedEntityId" LIMIT 1) as client_id,
    (SELECT d.id FROM deal d WHERE d.sf_id = cdl."LinkedEntityId" LIMIT 1) as deal_id,
    (SELECT p.id FROM property p WHERE p.sf_id = cdl."LinkedEntityId" LIMIT 1) as property_id,
    (SELECT s.id FROM site_submit s WHERE s.sf_id = cdl."LinkedEntityId" LIMIT 1) as site_submit_id,
    (SELECT a.id FROM assignment a WHERE a.sf_id = cdl."LinkedEntityId" LIMIT 1) as assignment_id,
    (SELECT ct.id FROM contact ct WHERE ct.sf_id = cdl."LinkedEntityId" LIMIT 1) as contact_id,
    (SELECT u.id FROM "user" u WHERE u.sf_id = cdl."LinkedEntityId" LIMIT 1) as user_id,

    -- Store the Salesforce object type and ID for unmapped objects
    cdl."LinkedEntityId" as related_object_type,
    cdl."LinkedEntityId" as related_object_id,

    cdl."SystemModstamp"::TIMESTAMPTZ as created_at,
    cdl."SystemModstamp"::TIMESTAMPTZ as updated_at

FROM "salesforce_ContentNote" cn
JOIN "salesforce_ContentVersion" cv ON cn."LatestPublishedVersionId" = cv."Id"
JOIN "salesforce_ContentDocument" cd ON cv."ContentDocumentId" = cd."Id"
JOIN "salesforce_ContentDocumentLink" cdl ON cd."Id" = cdl."ContentDocumentId"
JOIN note n ON n.sf_content_note_id = cn."Id"
WHERE cdl."LinkedEntityId" IS NOT NULL
  AND cn."Id" IS NOT NULL
  AND cd."Id" IS NOT NULL
ORDER BY cn."Id", cdl."LinkedEntityId"
ON CONFLICT (sf_content_document_link_id) DO UPDATE SET
    object_type = EXCLUDED.object_type,
    object_id = EXCLUDED.object_id,
    client_id = EXCLUDED.client_id,
    deal_id = EXCLUDED.deal_id,
    property_id = EXCLUDED.property_id,
    site_submit_id = EXCLUDED.site_submit_id,
    assignment_id = EXCLUDED.assignment_id,
    contact_id = EXCLUDED.contact_id,
    user_id = EXCLUDED.user_id,
    related_object_type = EXCLUDED.related_object_type,
    related_object_id = EXCLUDED.related_object_id,
    updated_at = EXCLUDED.updated_at;

-- Add foreign key constraints after data migration
DO $$
BEGIN
    -- Foreign keys for note table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_note_created_by' AND table_name = 'note'
    ) THEN
        ALTER TABLE note ADD CONSTRAINT fk_note_created_by FOREIGN KEY (created_by) REFERENCES "user"(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_note_updated_by' AND table_name = 'note'
    ) THEN
        ALTER TABLE note ADD CONSTRAINT fk_note_updated_by FOREIGN KEY (updated_by) REFERENCES "user"(id);
    END IF;

    -- Foreign key from note_object_link to note
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_note_object_link_note_id' AND table_name = 'note_object_link'
    ) THEN
        ALTER TABLE note_object_link ADD CONSTRAINT fk_note_object_link_note_id FOREIGN KEY (note_id) REFERENCES note(id) ON DELETE CASCADE;
    END IF;

    -- Foreign keys for note_object_link table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_note_object_link_client_id' AND table_name = 'note_object_link'
    ) THEN
        ALTER TABLE note_object_link ADD CONSTRAINT fk_note_object_link_client_id FOREIGN KEY (client_id) REFERENCES client(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_note_object_link_deal_id' AND table_name = 'note_object_link'
    ) THEN
        ALTER TABLE note_object_link ADD CONSTRAINT fk_note_object_link_deal_id FOREIGN KEY (deal_id) REFERENCES deal(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_note_object_link_contact_id' AND table_name = 'note_object_link'
    ) THEN
        ALTER TABLE note_object_link ADD CONSTRAINT fk_note_object_link_contact_id FOREIGN KEY (contact_id) REFERENCES contact(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_note_object_link_property_id' AND table_name = 'note_object_link'
    ) THEN
        ALTER TABLE note_object_link ADD CONSTRAINT fk_note_object_link_property_id FOREIGN KEY (property_id) REFERENCES property(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_note_object_link_assignment_id' AND table_name = 'note_object_link'
    ) THEN
        ALTER TABLE note_object_link ADD CONSTRAINT fk_note_object_link_assignment_id FOREIGN KEY (assignment_id) REFERENCES assignment(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_note_object_link_site_submit_id' AND table_name = 'note_object_link'
    ) THEN
        ALTER TABLE note_object_link ADD CONSTRAINT fk_note_object_link_site_submit_id FOREIGN KEY (site_submit_id) REFERENCES site_submit(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_note_object_link_user_id' AND table_name = 'note_object_link'
    ) THEN
        ALTER TABLE note_object_link ADD CONSTRAINT fk_note_object_link_user_id FOREIGN KEY (user_id) REFERENCES "user"(id);
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Note: Some foreign key constraints may have failed to add: %', SQLERRM;
END $$;

-- Add constraints for normalized structure
DO $$
BEGIN
    -- Unique constraint for note-object relationships
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'note_object_link_unique_relationship' AND table_name = 'note_object_link'
    ) THEN
        ALTER TABLE note_object_link ADD CONSTRAINT note_object_link_unique_relationship
        UNIQUE (note_id, sf_content_document_link_id);
    END IF;

    -- Check constraint to ensure only one object type is set
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'note_object_link_single_object_type'
    ) THEN
        ALTER TABLE note_object_link ADD CONSTRAINT note_object_link_single_object_type
        CHECK (
            (CASE WHEN client_id IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN deal_id IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN property_id IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN assignment_id IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN site_submit_id IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
        );
    END IF;
END $$;

-- Validation queries for normalized ContentNote migration
DO $$
DECLARE
    total_notes INTEGER;
    total_relationships INTEGER;
    mapped_clients INTEGER;
    mapped_deals INTEGER;
    mapped_properties INTEGER;
    mapped_site_submits INTEGER;
    mapped_assignments INTEGER;
    mapped_contacts INTEGER;
    mapped_users INTEGER;
    unassigned_notes INTEGER;
    validation_result TEXT;
BEGIN
    RAISE NOTICE 'Running Normalized ContentNote Migration Validation...';

    -- Count notes and relationships
    SELECT COUNT(*) INTO total_notes FROM note;
    SELECT COUNT(*) INTO total_relationships FROM note_object_link;

    -- Count relationships by type
    SELECT COUNT(*) INTO mapped_clients FROM note_object_link WHERE client_id IS NOT NULL;
    SELECT COUNT(*) INTO mapped_deals FROM note_object_link WHERE deal_id IS NOT NULL;
    SELECT COUNT(*) INTO mapped_properties FROM note_object_link WHERE property_id IS NOT NULL;
    SELECT COUNT(*) INTO mapped_site_submits FROM note_object_link WHERE site_submit_id IS NOT NULL;
    SELECT COUNT(*) INTO mapped_assignments FROM note_object_link WHERE assignment_id IS NOT NULL;
    SELECT COUNT(*) INTO mapped_contacts FROM note_object_link WHERE contact_id IS NOT NULL;
    SELECT COUNT(*) INTO mapped_users FROM note_object_link WHERE user_id IS NOT NULL;

    -- Count unassigned notes (notes with no relationships)
    SELECT COUNT(*) INTO unassigned_notes
    FROM note n
    LEFT JOIN note_object_link nol ON n.id = nol.note_id
    WHERE nol.id IS NULL;

    validation_result := 'Normalized ContentNote Migration Validation Results:' || CHR(10) ||
                        'Total unique notes migrated: ' || total_notes || CHR(10) ||
                        'Total note-object relationships: ' || total_relationships || CHR(10) ||
                        'Mapped to clients: ' || mapped_clients || CHR(10) ||
                        'Mapped to deals: ' || mapped_deals || CHR(10) ||
                        'Mapped to properties: ' || mapped_properties || CHR(10) ||
                        'Mapped to site submits: ' || mapped_site_submits || CHR(10) ||
                        'Mapped to assignments: ' || mapped_assignments || CHR(10) ||
                        'Mapped to contacts: ' || mapped_contacts || CHR(10) ||
                        'Mapped to users: ' || mapped_users || CHR(10) ||
                        'Unassigned notes: ' || unassigned_notes;

    RAISE NOTICE '%', validation_result;
END $$;

-- Add helpful comments about the normalized structure
COMMENT ON TABLE note IS 'Normalized note table storing unique ContentNote records without duplication. Each Salesforce ContentNote appears once here.';
COMMENT ON TABLE note_object_link IS 'Many-to-many relationship table linking notes to business objects. ContentDocumentLink mappings: 001=clients, 006=deals, a00=properties, a05=site_submits, a02=assignments, 003=contacts, 005=users';

-- ==============================================================================
-- Global Site Submit Stage Fix: Submitted-Reviewing
-- ==============================================================================

-- Ensure "Submitted-Reviewing" stage exists (proper upsert without assuming unique constraint)
INSERT INTO submit_stage (id, name)
SELECT
    gen_random_uuid(),
    'Submitted-Reviewing'
WHERE NOT EXISTS (
    SELECT 1 FROM submit_stage WHERE name = 'Submitted-Reviewing'
);

-- Global fix for all site submits with Submitted-Reviewing stage
DO $$
DECLARE
    submitted_reviewing_id UUID;
    affected_count INTEGER;
    rec RECORD;
BEGIN
    RAISE NOTICE 'Running Global Submitted-Reviewing Stage Fix...';

    -- Get the stage ID
    SELECT id INTO submitted_reviewing_id
    FROM submit_stage
    WHERE name = 'Submitted-Reviewing';

    IF submitted_reviewing_id IS NULL THEN
        RAISE EXCEPTION 'Failed to find or create Submitted-Reviewing stage';
    END IF;

    RAISE NOTICE 'Submitted-Reviewing stage ID: %', submitted_reviewing_id;

    -- Update all site_submits that have sf_submit_stage = 'Submitted-Reviewing'
    -- but are not mapped to the correct submit_stage_id
    UPDATE site_submit
    SET submit_stage_id = submitted_reviewing_id
    WHERE sf_submit_stage = 'Submitted-Reviewing'
      AND (submit_stage_id IS NULL OR submit_stage_id != submitted_reviewing_id);

    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RAISE NOTICE 'Updated % site_submit records to map to Submitted-Reviewing stage', affected_count;

    -- Check for any variations of the stage name that might need fixing
    UPDATE site_submit
    SET submit_stage_id = submitted_reviewing_id
    WHERE (
        sf_submit_stage ILIKE '%submitted%review%' OR
        sf_submit_stage ILIKE '%submit%review%' OR
        sf_submit_stage = 'Submitted - Reviewing' OR
        sf_submit_stage = 'Submitted Reviewing'
    )
    AND (submit_stage_id IS NULL OR submit_stage_id != submitted_reviewing_id);

    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RAISE NOTICE 'Updated % additional site_submit records with similar stage names', affected_count;

    -- Report final counts
    SELECT COUNT(*) INTO affected_count
    FROM site_submit ss
    JOIN submit_stage st ON ss.submit_stage_id = st.id
    WHERE st.name = 'Submitted-Reviewing';

    RAISE NOTICE 'Total site_submits now mapped to Submitted-Reviewing stage: %', affected_count;

    -- Show breakdown by client
    RAISE NOTICE 'Breakdown by client:';
    FOR rec IN
        SELECT
            COALESCE(c.client_name, 'No Client') as client_name,
            COUNT(*) as count
        FROM site_submit ss
        JOIN submit_stage st ON ss.submit_stage_id = st.id
        LEFT JOIN client c ON ss.client_id = c.id
        WHERE st.name = 'Submitted-Reviewing'
        GROUP BY c.client_name
        ORDER BY count DESC
    LOOP
        RAISE NOTICE '  %: % records', rec.client_name, rec.count;
    END LOOP;

END $$;

-- =============================================================================
-- DROPBOX FOLDER MAPPING TABLE
-- =============================================================================
-- Maps Salesforce records to their Dropbox folders
-- Used to connect client/property/deal records to Dropbox file storage

CREATE TABLE IF NOT EXISTS dropbox_folder_mapping (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Entity identification
  entity_type VARCHAR(50) NOT NULL, -- 'client', 'property', 'deal'
  entity_id UUID NOT NULL,

  -- Salesforce reference for verification
  sf_id VARCHAR(18) NOT NULL,

  -- Dropbox folder path
  dropbox_folder_path TEXT NOT NULL,

  -- Metadata
  sfdb_file_found BOOLEAN DEFAULT true,
  last_verified_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Ensure one mapping per entity
  CONSTRAINT unique_entity_mapping UNIQUE(entity_type, entity_id),
  CONSTRAINT unique_sf_id UNIQUE(sf_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dropbox_entity_type ON dropbox_folder_mapping(entity_type);
CREATE INDEX IF NOT EXISTS idx_dropbox_entity_id ON dropbox_folder_mapping(entity_id);
CREATE INDEX IF NOT EXISTS idx_dropbox_sf_id ON dropbox_folder_mapping(sf_id);
CREATE INDEX IF NOT EXISTS idx_dropbox_folder_path ON dropbox_folder_mapping(dropbox_folder_path);

-- Update trigger
CREATE OR REPLACE FUNCTION update_dropbox_folder_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_dropbox_folder_mapping_updated_at ON dropbox_folder_mapping;
CREATE TRIGGER trigger_update_dropbox_folder_mapping_updated_at
  BEFORE UPDATE ON dropbox_folder_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_dropbox_folder_mapping_updated_at();

-- Add comment
COMMENT ON TABLE dropbox_folder_mapping IS 'Maps CRM records to Dropbox folders via Salesforce ID and .sfdb marker files';

-- Enable RLS for dropbox_folder_mapping
ALTER TABLE dropbox_folder_mapping ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all dropbox folder mappings
DROP POLICY IF EXISTS "Allow authenticated users to read dropbox mappings" ON dropbox_folder_mapping;
CREATE POLICY "Allow authenticated users to read dropbox mappings"
  ON dropbox_folder_mapping FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert dropbox folder mappings
DROP POLICY IF EXISTS "Allow authenticated users to insert dropbox mappings" ON dropbox_folder_mapping;
CREATE POLICY "Allow authenticated users to insert dropbox mappings"
  ON dropbox_folder_mapping FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update dropbox folder mappings
DROP POLICY IF EXISTS "Allow authenticated users to update dropbox mappings" ON dropbox_folder_mapping;
CREATE POLICY "Allow authenticated users to update dropbox mappings"
  ON dropbox_folder_mapping FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to delete dropbox folder mappings
DROP POLICY IF EXISTS "Allow authenticated users to delete dropbox mappings" ON dropbox_folder_mapping;
CREATE POLICY "Allow authenticated users to delete dropbox mappings"
  ON dropbox_folder_mapping FOR DELETE
  TO authenticated
  USING (true);

-- =============================================================================
-- CONTACT-CLIENT MANY-TO-MANY RELATIONSHIP
-- =============================================================================
-- Creates junction table for many-to-many relationship between contacts and clients
-- Allows a single contact to be associated with multiple clients
-- Replaces the single contact.client_id with a flexible relationship model

-- Create the updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create contact_client_relation junction table
CREATE TABLE IF NOT EXISTS contact_client_relation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,

  -- Relationship metadata
  role TEXT,  -- Contact's role at this client (e.g., "Decision Maker", "Influencer")
  is_primary BOOLEAN DEFAULT false,  -- Is this the primary client association?
  is_active BOOLEAN DEFAULT true,  -- Is this relationship currently active?

  -- Salesforce sync fields (optional - for tracking source)
  sf_relation_id TEXT,  -- Maps to salesforce_AccountContactRelation.Id
  synced_from_salesforce BOOLEAN DEFAULT false,

  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_id UUID REFERENCES "user"(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by_id UUID REFERENCES "user"(id),

  -- Ensure unique contact-client pairs
  UNIQUE(contact_id, client_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contact_client_relation_contact_id ON contact_client_relation(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_client_relation_client_id ON contact_client_relation(client_id);
CREATE INDEX IF NOT EXISTS idx_contact_client_relation_is_primary ON contact_client_relation(is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_contact_client_relation_sf_relation_id ON contact_client_relation(sf_relation_id) WHERE sf_relation_id IS NOT NULL;

-- Updated at trigger
DROP TRIGGER IF EXISTS update_contact_client_relation_updated_at ON contact_client_relation;
CREATE TRIGGER update_contact_client_relation_updated_at
  BEFORE UPDATE ON contact_client_relation
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE contact_client_relation IS 'Many-to-many junction table linking contacts to multiple clients with role and priority information';

-- =============================================================================
-- MIGRATE EXISTING SALESFORCE ACCOUNTCONTACTRELATION DATA
-- =============================================================================
-- Migrates multi-client relationships from Salesforce if the table exists

DO $$
BEGIN
  -- Check if salesforce_AccountContactRelation table exists
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'salesforce_AccountContactRelation'
  ) THEN
    -- Migrate existing Salesforce AccountContactRelation data
    INSERT INTO contact_client_relation (
      contact_id,
      client_id,
      role,
      is_active,
      sf_relation_id,
      synced_from_salesforce,
      created_at
    )
    SELECT DISTINCT
      c.id AS contact_id,
      cl.id AS client_id,
      acr."Roles" AS role,
      COALESCE(acr."IsActive", true) AS is_active,
      acr."Id" AS sf_relation_id,
      true AS synced_from_salesforce,
      COALESCE(acr."CreatedDate"::timestamp, NOW()) AS created_at
    FROM "salesforce_AccountContactRelation" acr
    INNER JOIN contact c ON c.sf_id = acr."ContactId"
    INNER JOIN client cl ON cl.sf_id = acr."AccountId"
    WHERE
      acr."IsDeleted" = false
      AND acr."IsActive" = true
    ON CONFLICT (contact_id, client_id) DO NOTHING;

    RAISE NOTICE 'Migrated Salesforce AccountContactRelation data';

    -- Set one relationship as primary for each contact (prefer IsDirect = true)
    WITH ranked_relations AS (
      SELECT
        ccr.id,
        ROW_NUMBER() OVER (
          PARTITION BY ccr.contact_id
          ORDER BY
            CASE WHEN acr."IsDirect" = true THEN 0 ELSE 1 END,
            acr."CreatedDate" ASC
        ) as rn
      FROM contact_client_relation ccr
      LEFT JOIN "salesforce_AccountContactRelation" acr ON ccr.sf_relation_id = acr."Id"
      WHERE ccr.synced_from_salesforce = true
    )
    UPDATE contact_client_relation
    SET is_primary = true
    WHERE id IN (SELECT id FROM ranked_relations WHERE rn = 1);

    RAISE NOTICE 'Set primary relationships from Salesforce data';
  ELSE
    RAISE NOTICE 'Salesforce AccountContactRelation table not found, skipping Salesforce migration';
  END IF;
END $$;

-- =============================================================================
-- MIGRATE EXISTING OVIS-ONLY CONTACT-CLIENT LINKS
-- =============================================================================
-- Handle contacts that have client_id set but no Salesforce relationship

INSERT INTO contact_client_relation (
  contact_id,
  client_id,
  is_primary,
  is_active,
  synced_from_salesforce,
  created_at
)
SELECT
  c.id AS contact_id,
  c.client_id,
  true AS is_primary,  -- Existing single relationship becomes primary
  true AS is_active,
  false AS synced_from_salesforce,
  c.created_at
FROM contact c
WHERE
  c.client_id IS NOT NULL
  AND NOT EXISTS (
    -- Don't duplicate if already migrated from Salesforce
    SELECT 1 FROM contact_client_relation ccr
    WHERE ccr.contact_id = c.id AND ccr.client_id = c.client_id
  )
ON CONFLICT (contact_id, client_id) DO NOTHING;

-- =============================================================================
-- SYNC TRIGGER: KEEP contact.client_id IN SYNC WITH PRIMARY RELATION
-- =============================================================================
-- This trigger maintains backward compatibility by keeping contact.client_id
-- pointing to the primary client relationship

CREATE OR REPLACE FUNCTION sync_contact_primary_client()
RETURNS TRIGGER AS $$
BEGIN
  -- When a relationship is marked as primary, update contact.client_id
  IF NEW.is_primary = true THEN
    -- First, unset any other primary relationships for this contact
    UPDATE contact_client_relation
    SET is_primary = false
    WHERE contact_id = NEW.contact_id AND id != NEW.id AND is_primary = true;

    -- Update contact.client_id to point to the new primary client
    UPDATE contact
    SET client_id = NEW.client_id
    WHERE id = NEW.contact_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_contact_primary_client_trigger ON contact_client_relation;
CREATE TRIGGER sync_contact_primary_client_trigger
  AFTER INSERT OR UPDATE OF is_primary ON contact_client_relation
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION sync_contact_primary_client();

-- Add comment
COMMENT ON FUNCTION sync_contact_primary_client() IS 'Maintains backward compatibility by syncing contact.client_id with the primary client relationship';

COMMIT;
