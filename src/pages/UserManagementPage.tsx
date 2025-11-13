import React, { useState } from 'react';
import { useUsers } from '../hooks/useUsers';
import { useRoles } from '../hooks/useRoles';
import CreateUserModal from '../components/modals/CreateUserModal';
import EditUserModal from '../components/modals/EditUserModal';
import CreateRoleModal from '../components/modals/CreateRoleModal';
import EditRoleModal from '../components/modals/EditRoleModal';
import PermissionsMatrix from '../components/PermissionsMatrix';

export default function UserManagementPage() {
  const {
    users,
    loading: usersLoading,
    error: usersError,
    createUser,
    updateUser,
    deleteUser,
    sendPasswordResetEmail,
  } = useUsers();

  const {
    roles,
    loading: rolesLoading,
    error: rolesError,
    createRole,
    updateRole,
  } = useRoles();

  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false);
  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<typeof users[0] | null>(null);
  const [selectedRole, setSelectedRole] = useState<typeof roles[0] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleView, setRoleView] = useState<'cards' | 'matrix'>('cards');

  // Filter users based on search query
  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase();
    return (
      user.name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query) ||
      user.first_name?.toLowerCase().includes(query) ||
      user.last_name?.toLowerCase().includes(query) ||
      user.ovis_role?.toLowerCase().includes(query)
    );
  });

  const handleEditUser = (user: typeof users[0]) => {
    setSelectedUser(user);
    setShowEditUserModal(true);
  };

  const handleDeleteUser = async (user: typeof users[0]) => {
    const confirmMessage = `Are you sure you want to delete user "${user.name || user.email}"?\n\nThis will:\n- Remove their user account\n- Delete their authentication access\n- This action cannot be undone`;

    if (!confirm(confirmMessage)) return;

    const result = await deleteUser(user.id, user.auth_user_id);
    if (result.success) {
      alert('User deleted successfully');
    } else {
      alert(`Failed to delete user: ${result.error}`);
    }
  };

  const handleResetPassword = async (user: typeof users[0]) => {
    if (!user.email) {
      alert('User has no email address');
      return;
    }

    const confirmMessage = `Send password reset email to ${user.email}?`;
    if (!confirm(confirmMessage)) return;

    const result = await sendPasswordResetEmail(user.email);
    if (result.success) {
      alert(`Password reset email sent to ${user.email}`);
    } else {
      alert(`Failed to send password reset: ${result.error}`);
    }
  };

  if (usersLoading || rolesLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (usersError || rolesError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">Error: {usersError || rolesError}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage user accounts, roles, and permissions
          </p>
        </div>

        {/* Actions Bar */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0">
            {/* Search */}
            <div className="w-full sm:w-96">
              <input
                type="text"
                placeholder="Search users by name, email, or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={() => setShowCreateRoleModal(true)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                + Create Role
              </button>
              <button
                onClick={() => setShowCreateUserModal(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                + Create User
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Total Users</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{users.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Active Users</div>
            <div className="mt-2 text-3xl font-bold text-green-600">
              {users.filter(u => u.active).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Available Roles</div>
            <div className="mt-2 text-3xl font-bold text-blue-600">
              {roles.filter(r => r.active).length}
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Users ({filteredUsers.length})
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unnamed User'}
                          </div>
                          {user.mobile_phone && (
                            <div className="text-sm text-gray-500">{user.mobile_phone}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{user.email || 'No email'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {user.role?.display_name || user.ovis_role || 'No role'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleResetPassword(user)}
                        className="text-orange-600 hover:text-orange-900"
                      >
                        Reset Password
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {searchQuery ? 'No users found matching your search' : 'No users yet'}
              </div>
            )}
          </div>
        </div>

        {/* Roles Section */}
        <div className="mt-8">
          {/* View Toggle */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Roles & Permissions</h2>
            <div className="inline-flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => setRoleView('cards')}
                className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
                  roleView === 'cards'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Role Cards
              </button>
              <button
                type="button"
                onClick={() => setRoleView('matrix')}
                className={`px-4 py-2 text-sm font-medium rounded-r-md border-t border-r border-b ${
                  roleView === 'matrix'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Permissions Matrix
              </button>
            </div>
          </div>

          {/* Cards View */}
          {roleView === 'cards' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Available Roles</h3>
                <p className="text-sm text-gray-600 mt-1">Click on a role card to edit its permissions</p>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {roles.map((role) => (
                    <div
                      key={role.id}
                      className={`border rounded-lg p-4 ${
                        role.active ? 'border-gray-200 hover:border-blue-300' : 'border-gray-100 bg-gray-50'
                      } transition-colors cursor-pointer group`}
                      onClick={() => {
                        setSelectedRole(role);
                        setShowEditRoleModal(true);
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600">
                            {role.display_name}
                          </h3>
                          <p className="text-xs text-gray-500 mt-1 font-mono">{role.name}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          {!role.active && (
                            <span className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-600">
                              Inactive
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRole(role);
                              setShowEditRoleModal(true);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                      {role.description && (
                        <p className="text-sm text-gray-600 mt-2">{role.description}</p>
                      )}
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {users.filter(u => u.ovis_role === role.name).length} users
                        </span>
                        <span className="text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to edit permissions →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Matrix View */}
          {roleView === 'matrix' && (
            <PermissionsMatrix roles={roles} loading={rolesLoading} onUpdateRole={updateRole} />
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateUserModal
        isOpen={showCreateUserModal}
        onClose={() => setShowCreateUserModal(false)}
        roles={roles}
        onCreateUser={createUser}
      />

      <EditUserModal
        isOpen={showEditUserModal}
        onClose={() => setShowEditUserModal(false)}
        user={selectedUser}
        roles={roles}
        onUpdateUser={updateUser}
      />

      <CreateRoleModal
        isOpen={showCreateRoleModal}
        onClose={() => setShowCreateRoleModal(false)}
        onCreateRole={createRole}
      />

      <EditRoleModal
        isOpen={showEditRoleModal}
        onClose={() => setShowEditRoleModal(false)}
        role={selectedRole}
        onUpdateRole={updateRole}
      />
    </div>
  );
}
