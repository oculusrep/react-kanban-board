-- Debug script to check property type for "Firepark Test Site 4"
-- This will show the property details and its associated property record type

SELECT
    p.id,
    p.property_name,
    p.property_record_type_id,
    prt.label as property_type_label,
    prt.id as property_type_id
FROM property p
LEFT JOIN property_record_type prt ON p.property_record_type_id = prt.id
WHERE p.property_name ILIKE '%Firepark Test Site 4%'
   OR p.property_name = 'Firepark Test Site 4';

-- Also show all available property record types for reference
SELECT
    'Available Property Types:' as info,
    id,
    label
FROM property_record_type
ORDER BY label;