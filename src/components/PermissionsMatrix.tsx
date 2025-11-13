import React, { useState } from 'react';
import { Database } from '../../database-schema';
import {
  RolePermissions,
  PERMISSION_DEFINITIONS,
  PERMISSION_CATEGORIES,
  PermissionCategory,
  getPermissionsByCategory,
} from '../types/permissions';

type Role = Database['public']['Tables']['role']['Row'];

interface PermissionsMatrixProps {
  roles: Role[];
  loading?: boolean;
  onUpdateRole: (roleId: string, updates: {
    display_name?: string;
    description?: string;
    permissions?: RolePermissions;
    active?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
}

const PermissionsMatrix: React.FC<PermissionsMatrixProps> = ({ roles, loading, onUpdateRole }) => {
  const permissionsByCategory = getPermissionsByCategory();
  const [updating, setUpdating] = useState<string | null>(null); // Track which cell is updating
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading permissions matrix...</div>
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center text-gray-500">
          No roles available. Create a role to see the permissions matrix.
        </div>
      </div>
    );
  }

  // Only show active roles
  const activeRoles = roles.filter(r => r.active);

  const handleTogglePermission = async (role: Role, permissionKey: keyof RolePermissions) => {
    const cellId = `${role.id}-${permissionKey}`;
    setUpdating(cellId);
    setError(null);

    try {
      const currentPermissions = (role.permissions || {}) as RolePermissions;
      const newValue = !currentPermissions[permissionKey];

      const updatedPermissions = {
        ...currentPermissions,
        [permissionKey]: newValue,
      };

      const result = await onUpdateRole(role.id, {
        permissions: updatedPermissions,
      });

      if (!result.success) {
        setError(result.error || 'Failed to update permission');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Error toggling permission:', err);
    } finally {
      setUpdating(null);
    }
  };

  const handleSelectAllForRole = async (role: Role) => {
    const cellId = `${role.id}-select-all`;
    setUpdating(cellId);
    setError(null);

    try {
      const currentPermissions = (role.permissions || {}) as RolePermissions;

      // Count how many permissions are currently enabled
      const enabledCount = PERMISSION_DEFINITIONS.filter(
        perm => currentPermissions[perm.key] === true
      ).length;

      // If all are enabled, disable all. Otherwise, enable all.
      const shouldEnableAll = enabledCount < PERMISSION_DEFINITIONS.length;

      const updatedPermissions: RolePermissions = {};
      PERMISSION_DEFINITIONS.forEach(perm => {
        updatedPermissions[perm.key] = shouldEnableAll;
      });

      const result = await onUpdateRole(role.id, {
        permissions: updatedPermissions,
      });

      if (!result.success) {
        setError(result.error || 'Failed to update permissions');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Error selecting all permissions:', err);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Permissions Matrix</h2>
        <p className="text-sm text-gray-600 mt-1">
          Click any checkbox to toggle permissions for that role. Changes are saved automatically.
        </p>
        {error && (
          <div className="mt-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
            {error}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-20 min-w-[300px]">
                Permission
              </th>
              {activeRoles.map((role) => {
                const currentPermissions = (role.permissions || {}) as RolePermissions;
                const enabledCount = PERMISSION_DEFINITIONS.filter(
                  perm => currentPermissions[perm.key] === true
                ).length;
                const allSelected = enabledCount === PERMISSION_DEFINITIONS.length;
                const someSelected = enabledCount > 0 && !allSelected;
                const isUpdatingRole = updating === `${role.id}-select-all`;

                return (
                  <th
                    key={role.id}
                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
                  >
                    <div className="font-semibold text-gray-900">{role.display_name}</div>
                    <div className="font-mono text-[10px] text-gray-500 mt-0.5">{role.name}</div>
                    <div className="mt-2 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => handleSelectAllForRole(role)}
                        disabled={isUpdatingRole}
                        className={`relative w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                          isUpdatingRole
                            ? 'border-gray-300 bg-gray-100 cursor-wait'
                            : allSelected
                            ? 'border-green-600 bg-green-600 hover:bg-green-700 cursor-pointer'
                            : someSelected
                            ? 'border-green-600 bg-green-100 hover:bg-green-200 cursor-pointer'
                            : 'border-gray-300 bg-white hover:border-green-600 cursor-pointer'
                        }`}
                        title={allSelected ? `Deselect all for ${role.display_name}` : `Select all for ${role.display_name}`}
                      >
                        {isUpdatingRole ? (
                          <svg
                            className="w-4 h-4 text-gray-400 animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                        ) : allSelected ? (
                          <svg
                            className="w-4 h-4 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : someSelected ? (
                          <svg
                            className="w-4 h-4 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M20 12H4"
                            />
                          </svg>
                        ) : null}
                      </button>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {enabledCount}/{PERMISSION_DEFINITIONS.length}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Object.entries(permissionsByCategory).map(([categoryKey, categoryPerms]) => {
              const category = categoryKey as PermissionCategory;
              const categoryInfo = PERMISSION_CATEGORIES[category];

              return (
                <React.Fragment key={category}>
                  {/* Category Header Row */}
                  <tr className="bg-blue-50">
                    <td
                      colSpan={activeRoles.length + 1}
                      className="px-6 py-3 text-sm font-semibold text-blue-900 sticky left-0 z-10"
                    >
                      {categoryInfo.label}
                      <span className="ml-2 text-xs font-normal text-blue-600">
                        ({categoryInfo.description})
                      </span>
                    </td>
                  </tr>

                  {/* Permission Rows */}
                  {categoryPerms.map((perm) => (
                    <tr key={perm.key} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm sticky left-0 bg-white z-10">
                        <div className="font-medium text-gray-900">{perm.label}</div>
                        <div className="text-xs text-gray-500">{perm.description}</div>
                      </td>
                      {activeRoles.map((role) => {
                        const rolePermissions = (role.permissions || {}) as RolePermissions;
                        const hasPermission = rolePermissions[perm.key] === true;
                        const cellId = `${role.id}-${perm.key}`;
                        const isUpdating = updating === cellId;

                        return (
                          <td
                            key={cellId}
                            className="px-4 py-3 text-center"
                          >
                            <div className="flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => handleTogglePermission(role, perm.key)}
                                disabled={isUpdating}
                                className={`relative w-8 h-8 rounded flex items-center justify-center transition-colors ${
                                  isUpdating
                                    ? 'bg-gray-100 cursor-wait'
                                    : hasPermission
                                    ? 'hover:bg-green-50 cursor-pointer'
                                    : 'hover:bg-gray-100 cursor-pointer'
                                }`}
                                title={`${hasPermission ? 'Disable' : 'Enable'} ${perm.label} for ${role.display_name}`}
                              >
                                {isUpdating ? (
                                  <svg
                                    className="w-5 h-5 text-gray-400 animate-spin"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    />
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                  </svg>
                                ) : hasPermission ? (
                                  <svg
                                    className="w-5 h-5 text-green-600"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                ) : (
                                  <svg
                                    className="w-5 h-5 text-gray-300"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Enabled</span>
            </div>
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Disabled</span>
            </div>
          </div>
          <div>
            {PERMISSION_DEFINITIONS.length} total permissions across {activeRoles.length} active role{activeRoles.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PermissionsMatrix;
