/**
 * ovis_role values that the database's is_internal_user() accepts. Coach and
 * portal users are excluded. UI gates use this; the server re-checks.
 */
export const INTERNAL_ROLES = ['admin', 'broker_full', 'broker_lite', 'va'];

export function isInternalRole(userRole: string | null | undefined, isPortalUser: boolean): boolean {
  return !isPortalUser && !!userRole && INTERNAL_ROLES.includes(userRole);
}
