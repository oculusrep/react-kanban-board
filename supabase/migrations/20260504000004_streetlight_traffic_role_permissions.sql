-- Grant traffic-count permissions to roles.
-- - admin:        view + consume + admin
-- - broker_full:  view + consume (no admin)
-- - everyone else: view-only (sees cached AADT but cannot trigger paid fetches)
-- Frontend gates the spend buttons via hasPermission('can_consume_traffic_quota').

UPDATE "role"
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'can_view_traffic_data', true,
  'can_consume_traffic_quota', true,
  'can_admin_traffic_quota', true
)
WHERE name = 'admin';

UPDATE "role"
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'can_view_traffic_data', true,
  'can_consume_traffic_quota', true
)
WHERE name = 'broker_full';

UPDATE "role"
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'can_view_traffic_data', true,
  'can_consume_traffic_quota', false,
  'can_admin_traffic_quota', false
)
WHERE name IN ('broker_lite', 'client', 'coach', 'testing', 'va');
