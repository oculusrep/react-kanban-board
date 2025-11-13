import React, { useState } from 'react';
import { Database } from '../../../database-schema';

type Role = Database['public']['Tables']['role']['Row'];

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  roles: Role[];
  onCreateUser: (
    email: string,
    password: string,
    userData: {
      name: string;
      first_name?: string;
      last_name?: string;
      email: string;
      ovis_role: string;
      mobile_phone?: string;
      active: boolean;
    }
  ) => Promise<{ success: boolean; error?: string }>;
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({ isOpen, onClose, roles, onCreateUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedRole) {
      setError('Please select a role');
      return;
    }

    setCreating(true);

    try {
      const result = await onCreateUser(email, password, {
        name: name || `${firstName} ${lastName}`.trim(),
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        email: email,
        ovis_role: selectedRole,
        mobile_phone: mobilePhone || undefined,
        active: true,
      });

      if (result.success) {
        // Reset form
        setEmail('');
        setPassword('');
        setName('');
        setFirstName('');
        setLastName('');
        setMobilePhone('');
        setSelectedRole('');
        onClose();
      } else {
        setError(result.error || 'Failed to create user');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setPassword('');
    setName('');
    setFirstName('');
    setLastName('');
    setMobilePhone('');
    setSelectedRole('');
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
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Create New User</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="user@example.com"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Temporary Password *
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Minimum 6 characters"
                required
                minLength={6}
              />
              <p className="text-xs text-gray-500 mt-1">User can change this after logging in</p>
            </div>

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="John Doe"
                required
              />
            </div>

            {/* First Name & Last Name (Optional) */}
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
                Role *
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
                disabled={creating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default CreateUserModal;
