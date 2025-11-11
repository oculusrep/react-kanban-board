-- Verification Query: Property Creator Tracking Status
-- Shows how many properties have creator information and what type

-- =====================================================================
-- Summary Statistics
-- =====================================================================

SELECT
  'Total Properties' as metric,
  COUNT(*) as count
FROM property

UNION ALL

SELECT
  'Missing created_at timestamp' as metric,
  COUNT(*) as count
FROM property
WHERE created_at IS NULL

UNION ALL

SELECT
  'Missing updated_at timestamp' as metric,
  COUNT(*) as count
FROM property
WHERE updated_at IS NULL

UNION ALL

SELECT
  'Has created_by_id (mapped user)' as metric,
  COUNT(*) as count
FROM property
WHERE created_by_id IS NOT NULL

UNION ALL

SELECT
  'Missing created_by_id' as metric,
  COUNT(*) as count
FROM property
WHERE created_by_id IS NULL

UNION ALL

SELECT
  'Has created_by_sf_id (SF fallback)' as metric,
  COUNT(*) as count
FROM property
WHERE created_by_sf_id IS NOT NULL

UNION ALL

SELECT
  'Has updated_by_id (mapped user)' as metric,
  COUNT(*) as count
FROM property
WHERE updated_by_id IS NOT NULL

UNION ALL

SELECT
  'Missing updated_by_id' as metric,
  COUNT(*) as count
FROM property
WHERE updated_by_id IS NULL

UNION ALL

SELECT
  'Has updated_by_sf_id (SF fallback)' as metric,
  COUNT(*) as count
FROM property
WHERE updated_by_sf_id IS NOT NULL

UNION ALL

SELECT
  'No creator info at all' as metric,
  COUNT(*) as count
FROM property
WHERE created_by_id IS NULL
  AND created_by_sf_id IS NULL

ORDER BY metric;

-- =====================================================================
-- Detailed Breakdown by Creator Status
-- =====================================================================

SELECT
  CASE
    WHEN created_at IS NULL THEN 'Missing created_at timestamp'
    WHEN created_by_id IS NOT NULL THEN 'Has creator ID (will show name)'
    WHEN created_by_sf_id IS NOT NULL THEN 'Has SF creator ID (will show SF User ID)'
    ELSE 'No creator info (timestamp only)'
  END as creator_status,
  COUNT(*) as property_count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM property), 2) as percentage
FROM property
GROUP BY
  CASE
    WHEN created_at IS NULL THEN 'Missing created_at timestamp'
    WHEN created_by_id IS NOT NULL THEN 'Has creator ID (will show name)'
    WHEN created_by_sf_id IS NOT NULL THEN 'Has SF creator ID (will show SF User ID)'
    ELSE 'No creator info (timestamp only)'
  END
ORDER BY property_count DESC;

-- =====================================================================
-- Sample Properties Missing Creator Info
-- =====================================================================

SELECT
  p.id,
  p.property_name,
  p.created_at,
  p.created_by_id,
  p.created_by_sf_id,
  p.sf_id as salesforce_id,
  CASE
    WHEN p.created_at IS NULL THEN 'Missing timestamp'
    WHEN p.created_by_id IS NOT NULL THEN 'Has creator ID'
    WHEN p.created_by_sf_id IS NOT NULL THEN 'Has SF creator ID'
    WHEN p.sf_id IS NOT NULL THEN 'SF import, no creator mapped'
    ELSE 'Created before tracking'
  END as status
FROM property p
WHERE p.created_by_id IS NULL
ORDER BY p.created_at DESC NULLS LAST
LIMIT 20;

-- =====================================================================
-- Properties with Successful Creator Mapping
-- =====================================================================

SELECT
  p.id,
  p.property_name,
  p.created_at,
  u.name as created_by_name,
  u.email as created_by_email,
  p.updated_at,
  u2.name as updated_by_name
FROM property p
JOIN "user" u ON p.created_by_id = u.auth_user_id
LEFT JOIN "user" u2 ON p.updated_by_id = u2.auth_user_id
ORDER BY p.created_at DESC
LIMIT 20;

-- =====================================================================
-- Missing Timestamps (Data Quality Issue)
-- =====================================================================

SELECT
  'Properties missing created_at' as issue,
  COUNT(*) as count,
  ARRAY_AGG(id ORDER BY id LIMIT 5) as sample_ids
FROM property
WHERE created_at IS NULL

UNION ALL

SELECT
  'Properties missing updated_at' as issue,
  COUNT(*) as count,
  ARRAY_AGG(id ORDER BY id LIMIT 5) as sample_ids
FROM property
WHERE updated_at IS NULL;
