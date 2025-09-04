-- Check for properties with values in size_acres field
SELECT 
    id,
    property_name,
    size_acres,
    property_record_type_id
FROM property 
WHERE size_acres IS NOT NULL 
    AND size_acres > 0
ORDER BY size_acres DESC
LIMIT 20;

-- Check if acres field exists and has values
SELECT 
    id,
    property_name,
    acres,
    property_record_type_id
FROM property 
WHERE acres IS NOT NULL 
    AND acres > 0
ORDER BY acres DESC
LIMIT 20;

-- Check table structure to see all column names containing 'acres'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'property' 
    AND column_name ILIKE '%acres%'
ORDER BY column_name;

-- Count records with values in each acres-related field
SELECT 
    COUNT(*) as total_properties,
    COUNT(size_acres) as properties_with_size_acres,
    COUNT(CASE WHEN size_acres > 0 THEN 1 END) as properties_with_positive_size_acres
FROM property;

-- Try to check if acres field exists (this will error if it doesn't exist)
-- SELECT 
--     COUNT(*) as total_properties,
--     COUNT(acres) as properties_with_acres,
--     COUNT(CASE WHEN acres > 0 THEN 1 END) as properties_with_positive_acres
-- FROM property;