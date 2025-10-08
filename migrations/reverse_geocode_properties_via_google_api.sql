-- REVERSE GEOCODE: Get addresses from lat/long using Google Geocoding API
-- This is a manual SQL approach that generates the API URLs you need to call

-- Step 1: Find properties that need reverse geocoding
SELECT
  'Properties needing reverse geocoding:' as info,
  COUNT(*) as count
FROM property
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND address IS NULL;

-- Step 2: Generate Google Geocoding API URLs for each property
-- Copy these URLs and paste them in your browser (or use curl/fetch)
-- Then manually update the addresses based on the results

SELECT
  p.id,
  p.property_name,
  p.latitude,
  p.longitude,
  -- Generate Google API URL for reverse geocoding
  CONCAT(
    'https://maps.googleapis.com/maps/api/geocode/json?latlng=',
    p.latitude,
    ',',
    p.longitude,
    '&key=YOUR_API_KEY_HERE'
  ) as google_api_url
FROM property p
WHERE p.latitude IS NOT NULL
  AND p.longitude IS NOT NULL
  AND p.address IS NULL
ORDER BY p.property_name
LIMIT 50;

-- ALTERNATIVE APPROACH: If you have a list of results from the API
-- Use this template to update properties manually:

-- Example update (replace values with actual results from Google API):
/*
UPDATE property
SET
  address = '123 Main St',
  city = 'Atlanta',
  state = 'GA',
  zip = '30301',
  updated_at = NOW()
WHERE id = 'property-id-here';
*/
