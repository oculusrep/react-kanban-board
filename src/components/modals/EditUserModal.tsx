import React, { useState, useEffect } from 'react';
import { Database } from '../../../database-schema';

type User = Database['public']['Tables']['user']['Row'];
type Role = Database['public']['Tables']['role']['Row'];

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
      const result = await onUpdateUser(user.id, {
        name: name || undefined,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        email: email || undefined,
        ovis_role: selectedRole,
        mobile_phone: mobilePhone || undefined,
        active: active,
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
    onClose();
  };

  const activeRoles = roles.filter(r => r.active);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
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
