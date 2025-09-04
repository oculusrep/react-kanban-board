-- Add missing acres field to property table
ALTER TABLE property ADD COLUMN IF NOT EXISTS acres NUMERIC;

-- Update the property table INSERT statement to include acres mapping
-- This will replace the existing property upsert section (lines ~318-342)

-- Updated Upsert into property table with acres field
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