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
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contact(id);
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_created_by_id TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES "user"(id);
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_property_id TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES property(id);
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_mobile_phone TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS sf_contact_name TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS updated_by_sf_id TEXT;
ALTER TABLE property_contact ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES "user"(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_property_contact_property_id ON property_contact(property_id);
CREATE INDEX IF NOT EXISTS idx_property_contact_contact_id ON property_contact(contact_id);
CREATE INDEX IF NOT EXISTS idx_property_contact_sf_id ON property_contact(sf_id);
CREATE INDEX IF NOT EXISTS idx_property_contact_sf_contact_id ON property_contact(sf_contact_id);
CREATE INDEX IF NOT EXISTS idx_property_contact_sf_property_id ON property_contact(sf_property_id);

-- Create unique constraint to prevent duplicate property-contact relationships
CREATE UNIQUE INDEX IF NOT EXISTS property_contact_unique_pair ON property_contact(property_id, contact_id);

-- Populate property_contact table from Salesforce J_Property_2_Contacts__c
-- This is a template - replace with actual Salesforce table name and adjust field names as needed
/*
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
FROM "J_Property_2_Contacts__c" sf
LEFT JOIN contact c ON c.sf_id = sf."Contact__c"
LEFT JOIN property p ON p.sf_id = sf."Property__c"
LEFT JOIN "user" cu ON cu.sf_id = sf."CreatedById"
LEFT JOIN "user" uu ON uu.sf_id = sf."LastModifiedById"
WHERE sf."IsDeleted" = false
    AND c.id IS NOT NULL 
    AND p.id IS NOT NULL
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
*/

-- Add foreign key constraints with proper naming
ALTER TABLE property_contact ADD CONSTRAINT IF NOT EXISTS fk_property_contact_contact_id 
    FOREIGN KEY (contact_id) REFERENCES contact(id) ON DELETE CASCADE;

ALTER TABLE property_contact ADD CONSTRAINT IF NOT EXISTS fk_property_contact_property_id 
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

ALTER TABLE property_contact ADD CONSTRAINT IF NOT EXISTS fk_property_contact_created_by_id 
    FOREIGN KEY (created_by_id) REFERENCES "user"(id);

ALTER TABLE property_contact ADD CONSTRAINT IF NOT EXISTS fk_property_contact_updated_by_id 
    FOREIGN KEY (updated_by_id) REFERENCES "user"(id);