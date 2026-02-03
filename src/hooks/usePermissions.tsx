import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { RolePermissions } from '../types/permissions';

/**
 * Hook for checking user permissions based on their role AND user-level overrides
 *
 * Permission resolution order:
 * 1. User-level permission overrides (highest priority)
 * 2. Role permissions (base permissions)
 *
 * Usage:
 * ```typescript
 * const { hasPermission, permissions, loading } = usePermissions();
 *
 * if (hasPermission('can_delete_deals')) {
 *   // Show delete button
 * }
 * ```
 */
export function usePermissions() {
  const { userRole, userTableId } = useAuth();
  const [permissions, setPermissions] = useState<RolePermissions>({});
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>({});
  const [userOverrides, setUserOverrides] = useState<RolePermissions>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!userRole && !userTableId) {
        setPermissions({});
        setRolePermissions({});
        setUserOverrides({});
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch role permissions and user overrides in parallel
        const [roleResult, userResult] = await Promise.all([
          // Fetch role permissions
          userRole
            ? supabase
                .from('role')
                .select('permissions')
                .eq('name', userRole)
                .single()
            : Promise.resolve({ data: null, error: null }),
          // Fetch user-level permission overrides
          userTableId
            ? supabase
                .from('user')
                .select('permissions')
                .eq('id', userTableId)
                .single()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (roleResult.error && userRole) {
          console.error('Error fetching role permissions:', roleResult.error);
        }

        const rolePerm = (roleResult.data?.permissions as RolePermissions) || {};
        const userPerm = (userResult.data?.permissions as RolePermissions) || {};

        setRolePermissions(rolePerm);
        setUserOverrides(userPerm);

        // Merge permissions: user overrides take precedence
        const merged: RolePermissions = { ...rolePerm };
        for (const key of Object.keys(userPerm) as (keyof RolePermissions)[]) {
          if (userPerm[key] !== undefined) {
            merged[key] = userPerm[key];
          }
        }

        setPermissions(merged);
      } catch (err) {
        console.error('Error fetching permissions:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch permissions');
        setPermissions({});
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [userRole, userTableId]);

  /**
   * Check if user has a specific permission
   */
  const hasPermission = (permission: keyof RolePermissions): boolean => {
    return permissions[permission] === true;
  };

  /**
   * Check if user has ANY of the specified permissions
   */
  const hasAnyPermission = (...permissionKeys: (keyof RolePermissions)[]): boolean => {
    return permissionKeys.some(key => permissions[key] === true);
  };

  /**
   * Check if user has ALL of the specified permissions
   */
  const hasAllPermissions = (...permissionKeys: (keyof RolePermissions)[]): boolean => {
    return permissionKeys.every(key => permissions[key] === true);
  };

  /**
   * Check if a specific permission is overridden at the user level
   */
  const isUserOverride = (permission: keyof RolePermissions): boolean => {
    return userOverrides[permission] !== undefined;
  };

  return {
    permissions,
    rolePermissions,
    userOverrides,
    loading,
    error,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isUserOverride,
  };
}

/**
 * Higher-order component to conditionally render based on permission
 *
 * Usage:
 * ```typescript
 * <PermissionGuard permission="can_delete_deals">
 *   <button>Delete</button>
 * </PermissionGuard>
 * ```
 */
interface PermissionGuardProps {
  permission: keyof RolePermissions;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGuard({ permission, children, fallback = null }: PermissionGuardProps) {
  const { hasPermission, loading } = usePermissions();

  if (loading) return null;

  return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
}
