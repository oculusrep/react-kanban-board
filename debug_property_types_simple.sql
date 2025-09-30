-- Simple debug to see the exact mismatch
SELECT
    'Property Data:' as info,
    p.id as property_id,
    p.property_name,
    p.property_record_type_id
FROM property p
WHERE p.property_name = 'Firepark Test Site 4';

SELECT
    'Available Types:' as info,
    prt.id,
    prt.label
FROM property_record_type prt
ORDER BY prt.label;