import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { RolePermissions } from '../types/permissions';

/**
 * Hook for checking user permissions based on their role
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
  const { userRole } = useAuth();
  const [permissions, setPermissions] = useState<RolePermissions>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!userRole) {
        setPermissions({});
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('role')
          .select('permissions')
          .eq('name', userRole)
          .single();

        if (fetchError) throw fetchError;

        setPermissions((data?.permissions as RolePermissions) || {});
      } catch (err) {
        console.error('Error fetching permissions:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch permissions');
        setPermissions({});
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [userRole]);

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

  return {
    permissions,
    loading,
    error,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
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
