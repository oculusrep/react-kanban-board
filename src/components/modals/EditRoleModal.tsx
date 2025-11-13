import React, { useState, useEffect } from 'react';
import { Database } from '../../../database-schema';
import {
  RolePermissions,
  getPermissionsByCategory,
  PERMISSION_CATEGORIES,
  PermissionCategory,
} from '../../types/permissions';

type Role = Database['public']['Tables']['role']['Row'];

interface EditRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: Role | null;
  onUpdateRole: (roleId: string, updates: {
    display_name?: string;
    description?: string;
    permissions?: RolePermissions;
    active?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
}

const EditRoleModal: React.FC<EditRoleModalProps> = ({ isOpen, onClose, role, onUpdateRole }) => {
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<RolePermissions>({});
  const [active, setActive] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<PermissionCategory>>(new Set());

  const permissionsByCategory = getPermissionsByCategory();

  // Populate form when role changes
  useEffect(() => {
    if (role) {
      setDisplayName(role.display_name);
      setDescription(role.description || '');
      setPermissions((role.permissions as RolePermissions) || {});
      setActive(role.active ?? true);
      // Expand all categories by default
      setExpandedCategories(new Set(Object.keys(PERMISSION_CATEGORIES) as PermissionCategory[]));
    }
  }, [role]);

  if (!isOpen || !role) return null;

  const handlePermissionToggle = (permissionKey: keyof RolePermissions) => {
    setPermissions(prev => ({
      ...prev,
      [permissionKey]: !prev[permissionKey],
    }));
  };

  const toggleCategory = (category: PermissionCategory) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const handleSelectAll = (category: PermissionCategory) => {
    const categoryPerms = permissionsByCategory[category];
    const allSelected = categoryPerms.every(p => permissions[p.key]);

    setPermissions(prev => {
      const updated = { ...prev };
      categoryPerms.forEach(p => {
        updated[p.key] = !allSelected;
      });
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUpdating(true);

    try {
      const result = await onUpdateRole(role.id, {
        display_name: displayName,
        description: description || undefined,
        permissions: permissions,
        active: active,
      });

      if (result.success) {
        onClose();
      } else {
        setError(result.error || 'Failed to update role');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setUpdating(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Edit Role: {role.name}</h2>
                <p className="text-sm text-gray-500 mt-1">Configure role details and permissions</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="machineName" className="block text-sm font-medium text-gray-700 mb-1">
                  Machine Name
                </label>
                <input
                  type="text"
                  id="machineName"
                  value={role.name}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed font-mono text-sm"
                  title="Machine name cannot be changed"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief description of this role..."
              />
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
                Active Role
              </label>
              <span className="text-xs text-gray-500">(Inactive roles cannot be assigned to users)</span>
            </div>

            {/* Permissions Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Permissions</h3>
              <p className="text-sm text-gray-600 mb-4">
                Select which actions users with this role can perform. Click category headers to expand/collapse.
              </p>

              <div className="space-y-3">
                {Object.entries(permissionsByCategory).map(([categoryKey, categoryPerms]) => {
                  const category = categoryKey as PermissionCategory;
                  const categoryInfo = PERMISSION_CATEGORIES[category];
                  const isExpanded = expandedCategories.has(category);
                  const selectedCount = categoryPerms.filter(p => permissions[p.key]).length;
                  const totalCount = categoryPerms.length;

                  return (
                    <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Category Header */}
                      <div
                        className="bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => toggleCategory(category)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <svg
                              className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900">{categoryInfo.label}</h4>
                              <p className="text-xs text-gray-500">{categoryInfo.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className="text-xs font-medium text-gray-600">
                              {selectedCount}/{totalCount} enabled
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectAll(category);
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              {selectedCount === totalCount ? 'Deselect All' : 'Select All'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Permissions List */}
                      {isExpanded && (
                        <div className="px-4 py-3 bg-white space-y-2">
                          {categoryPerms.map((perm) => (
                            <div key={perm.key} className="flex items-start space-x-3 py-2">
                              <input
                                type="checkbox"
                                id={perm.key}
                                checked={permissions[perm.key] || false}
                                onChange={() => handlePermissionToggle(perm.key)}
                                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                              <label htmlFor={perm.key} className="flex-1 cursor-pointer">
                                <div className="text-sm font-medium text-gray-900">{perm.label}</div>
                                <div className="text-xs text-gray-500">{perm.description}</div>
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
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

export default EditRoleModal;
