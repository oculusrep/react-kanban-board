import React, { useState, useEffect } from 'react';
import { Database } from '../../../database-schema';
import { RolePermissions, PERMISSION_DEFINITIONS, PERMISSION_CATEGORIES, PermissionCategory } from '../../types/permissions';
import { ChevronDown, ChevronRight } from 'lucide-react';

type User = Database['public']['Tables']['user']['Row'];
type Role = Database['public']['Tables']['role']['Row'];
type Json = Database['public']['Tables']['user']['Row']['permissions'];

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  roles: Role[];
  onUpdateUser: (userId: string, updates: {
    name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    ovis_role?: string;
    mobile_phone?: string;
    active?: boolean;
    permissions?: Json;
  }) => Promise<{ success: boolean; error?: string }>;
}

const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, user, roles, onUpdateUser }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [active, setActive] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Permission overrides state
  const [permissionOverrides, setPermissionOverrides] = useState<RolePermissions>({});
  const [showPermissions, setShowPermissions] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Get role permissions for the selected role
  const selectedRoleObj = roles.find(r => r.name === selectedRole);
  const rolePermissions = (selectedRoleObj?.permissions as RolePermissions) || {};

  // Populate form when user changes
  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      setName(user.name || '');
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setMobilePhone(user.mobile_phone || '');
      setSelectedRole(user.ovis_role || '');
      setActive(user.active ?? true);
      setPermissionOverrides((user.permissions as RolePermissions) || {});
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedRole) {
      setError('Please select a role');
      return;
    }

    setUpdating(true);

    try {
      // Only include permissions if there are overrides
      const hasOverrides = Object.keys(permissionOverrides).length > 0;

      const result = await onUpdateUser(user.id, {
        name: name || undefined,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        email: email || undefined,
        ovis_role: selectedRole,
        mobile_phone: mobilePhone || undefined,
        active: active,
        permissions: hasOverrides ? permissionOverrides : null,
      });

      if (result.success) {
        onClose();
      } else {
        setError(result.error || 'Failed to update user');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setUpdating(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setShowPermissions(false);
    setExpandedCategories(new Set());
    onClose();
  };

  // Toggle a permission override
  const togglePermissionOverride = (key: keyof RolePermissions) => {
    setPermissionOverrides(prev => {
      const current = prev[key];
      const roleValue = rolePermissions[key] ?? false;

      // Cycle: undefined (inherit) -> true (grant) -> false (deny) -> undefined (inherit)
      if (current === undefined) {
        // Currently inheriting, override to grant
        return { ...prev, [key]: true };
      } else if (current === true) {
        // Currently granting, override to deny
        return { ...prev, [key]: false };
      } else {
        // Currently denying, remove override (inherit from role)
        const { [key]: _, ...rest } = prev;
        return rest as RolePermissions;
      }
    });
  };

  // Clear all overrides for a user
  const clearAllOverrides = () => {
    setPermissionOverrides({});
  };

  // Get permission value (merged)
  const getEffectiveValue = (key: keyof RolePermissions): boolean => {
    if (permissionOverrides[key] !== undefined) {
      return permissionOverrides[key]!;
    }
    return rolePermissions[key] ?? false;
  };

  // Check if permission is overridden
  const isOverridden = (key: keyof RolePermissions): boolean => {
    return permissionOverrides[key] !== undefined;
  };

  // Group permissions by category
  const permissionsByCategory = PERMISSION_DEFINITIONS.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<PermissionCategory, typeof PERMISSION_DEFINITIONS>);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const activeRoles = roles.filter(r => r.active);
  const overrideCount = Object.keys(permissionOverrides).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Edit User</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="user@example.com"
              />
              <p className="text-xs text-gray-500 mt-1">Changing email may affect login</p>
            </div>

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="John Doe"
              />
            </div>

            {/* First Name & Last Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Doe"
                />
              </div>
            </div>

            {/* Mobile Phone */}
            <div>
              <label htmlFor="mobilePhone" className="block text-sm font-medium text-gray-700 mb-1">
                Mobile Phone
              </label>
              <input
                type="tel"
                id="mobilePhone"
                value={mobilePhone}
                onChange={(e) => setMobilePhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="(555) 123-4567"
              />
            </div>

            {/* Role */}
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                id="role"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select a role...</option>
                {activeRoles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.display_name}
                    {role.description ? ` - ${role.description}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Active Status */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="active"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="active" className="text-sm font-medium text-gray-700">
                Active User
              </label>
              <span className="text-xs text-gray-500">(Inactive users cannot log in)</span>
            </div>

            {/* Permission Overrides Section */}
            <div className="border border-gray-200 rounded-lg">
              <button
                type="button"
                onClick={() => setShowPermissions(!showPermissions)}
                className="w-full px-4 py-3 flex items-center justify-between text-left bg-gray-50 hover:bg-gray-100 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  {showPermissions ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-medium text-gray-900">Permission Overrides</span>
                  {overrideCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                      {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  Override role permissions for this user
                </span>
              </button>

              {showPermissions && (
                <div className="p-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-600">
                      Click a permission to cycle: <span className="text-gray-400">Inherit</span> →
                      <span className="text-green-600"> Grant</span> →
                      <span className="text-red-600"> Deny</span> →
                      <span className="text-gray-400">Inherit</span>
                    </p>
                    {overrideCount > 0 && (
                      <button
                        type="button"
                        onClick={clearAllOverrides}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Clear all overrides
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {Object.entries(PERMISSION_CATEGORIES).map(([categoryKey, category]) => {
                      const perms = permissionsByCategory[categoryKey as PermissionCategory] || [];
                      if (perms.length === 0) return null;

                      const isExpanded = expandedCategories.has(categoryKey);
                      const categoryOverrides = perms.filter(p => isOverridden(p.key)).length;

                      return (
                        <div key={categoryKey} className="border border-gray-100 rounded">
                          <button
                            type="button"
                            onClick={() => toggleCategory(categoryKey)}
                            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              <span className="text-sm font-medium text-gray-700">{category.label}</span>
                              {categoryOverrides > 0 && (
                                <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                                  {categoryOverrides}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400">{perms.length} permissions</span>
                          </button>

                          {isExpanded && (
                            <div className="px-3 pb-2 space-y-1">
                              {perms.map(perm => {
                                const overridden = isOverridden(perm.key);
                                const effectiveValue = getEffectiveValue(perm.key);
                                const overrideValue = permissionOverrides[perm.key];

                                return (
                                  <button
                                    key={perm.key}
                                    type="button"
                                    onClick={() => togglePermissionOverride(perm.key)}
                                    className={`w-full px-2 py-1.5 rounded text-left text-xs flex items-center justify-between
                                      ${overridden
                                        ? overrideValue
                                          ? 'bg-green-50 border border-green-200'
                                          : 'bg-red-50 border border-red-200'
                                        : 'hover:bg-gray-50 border border-transparent'
                                      }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`w-4 h-4 rounded flex items-center justify-center text-xs
                                        ${overridden
                                          ? overrideValue
                                            ? 'bg-green-500 text-white'
                                            : 'bg-red-500 text-white'
                                          : effectiveValue
                                            ? 'bg-gray-300 text-gray-600'
                                            : 'bg-gray-100 text-gray-400'
                                        }`}
                                      >
                                        {overridden
                                          ? (overrideValue ? '✓' : '✕')
                                          : (effectiveValue ? '✓' : '')}
                                      </span>
                                      <span className="text-gray-700">{perm.label}</span>
                                    </div>
                                    <span className={`text-xs ${overridden ? 'font-medium' : 'text-gray-400'}`}>
                                      {overridden
                                        ? (overrideValue ? 'Granted' : 'Denied')
                                        : 'Inherit'}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={updating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={updating}
              >
                {updating ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default EditUserModal;
