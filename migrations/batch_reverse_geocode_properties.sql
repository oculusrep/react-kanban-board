-- Find properties that have lat/long but are missing address
-- These need reverse geocoding

SELECT
  p.id,
  p.property_name,
  p.latitude,
  p.longitude,
  p.address,
  p.city,
  p.state,
  p.zip
FROM property p
WHERE p.latitude IS NOT NULL
  AND p.longitude IS NOT NULL
  AND p.address IS NULL
ORDER BY p.property_name
LIMIT 200;

-- Count how many properties need reverse geocoding
SELECT COUNT(*) as properties_needing_reverse_geocoding
FROM property
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND address IS NULL;
