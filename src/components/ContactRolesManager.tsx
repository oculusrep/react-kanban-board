/**
 * ContactRolesManager Component
 *
 * Displays and manages roles for a specific contact-client relationship.
 * Shows role badges and allows adding/removing roles.
 */

import React, { useState } from 'react'
import { useContactClientRoles } from '../hooks/useContactClientRoles'

interface ContactRolesManagerProps {
  contactId: string
  clientId: string
  contactName?: string
  clientName?: string
  showAddButton?: boolean
  compact?: boolean
}

export const ContactRolesManager: React.FC<ContactRolesManagerProps> = ({
  contactId,
  clientId,
  contactName,
  clientName,
  showAddButton = true,
  compact = false,
}) => {
  const {
    roles,
    availableRoleTypes,
    loading,
    error,
    addRole,
    removeRole,
  } = useContactClientRoles(contactId, clientId)

  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Filter out already assigned roles
  const availableToAdd = availableRoleTypes.filter(
    (roleType) => !roles.some((role) => role.role_id === roleType.id && role.is_active)
  )

  const handleAddRole = async () => {
    if (selectedRoleIds.length === 0) return

    setSaving(true)
    try {
      // Add all selected roles
      for (const roleId of selectedRoleIds) {
        await addRole(contactId, clientId, roleId)
      }
      setShowAddModal(false)
      setSelectedRoleIds([])
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add roles')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveRole = async (roleId: string, roleName: string) => {
    try {
      await removeRole(roleId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove role')
    }
  }

  // Role badge colors
  const getRoleBadgeColor = (roleName: string) => {
    switch (roleName) {
      case 'Site Selector':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'Franchisee':
        return 'bg-purple-100 text-purple-800 border-purple-300'
      case 'Franchisor':
        return 'bg-violet-100 text-violet-800 border-violet-300'
      case 'Real Estate Lead':
        return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'Attorney':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'Lender':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'Contractor':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300'
      case 'Engineer':
        return 'bg-teal-100 text-teal-800 border-teal-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  if (loading && roles.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        Loading roles...
      </div>
    )
  }

  const activeRoles = roles.filter((role) => role.is_active)

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {/* Role badges */}
      <div className="flex flex-wrap gap-1">
        {activeRoles.length === 0 ? (
          <span className="text-xs text-gray-500 italic">No roles assigned</span>
        ) : (
          activeRoles.map((role) => (
            <div
              key={role.id}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium border ${getRoleBadgeColor(
                role.role_name || ''
              )}`}
              title={role.notes || undefined}
            >
              <span className="text-xs">{role.role_name}</span>
              <button
                onClick={() => handleRemoveRole(role.id, role.role_name || '')}
                className="hover:opacity-70 focus:outline-none ml-0.5"
                title="Remove role"
              >
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          ))
        )}

        {/* Add role button */}
        {showAddButton && availableToAdd.length > 0 && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium border border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors"
            title="Add role"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-xs">Add Role</span>
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {/* Add role modal */}
      {showAddModal && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-50"
            onClick={() => setShowAddModal(false)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Add Role</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              {contactName && clientName && (
                <p className="text-xs text-gray-600">
                  Adding role for <strong>{contactName}</strong> at <strong>{clientName}</strong>
                </p>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableToAdd.map((roleType) => (
                    <label
                      key={roleType.id}
                      className="flex items-start p-2 border rounded cursor-pointer transition-colors hover:border-gray-300 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRoleIds.includes(roleType.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRoleIds([...selectedRoleIds, roleType.id])
                          } else {
                            setSelectedRoleIds(selectedRoleIds.filter(id => id !== roleType.id))
                          }
                        }}
                        className="mt-0.5 h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        disabled={saving}
                      />
                      <div className="ml-2 flex-1">
                        <p className="text-xs font-medium text-gray-900">{roleType.role_name}</p>
                        {roleType.description && (
                          <p className="text-xs text-gray-500">{roleType.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setSelectedRoleIds([])
                  }}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddRole}
                  disabled={selectedRoleIds.length === 0 || saving}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Adding...' : selectedRoleIds.length > 1 ? `Add ${selectedRoleIds.length} Roles` : 'Add Role'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default ContactRolesManager
