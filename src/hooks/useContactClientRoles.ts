/**
 * Custom hook for managing contact-client role assignments
 *
 * This hook allows managing multiple roles per contact-client relationship.
 * A contact can have different roles for different clients.
 *
 * Example: John Doe might be a "Site Selector" for Starbucks but a "Decision Maker" for McDonald's
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export interface ContactClientRoleType {
  id: string
  role_name: string
  description: string | null
  is_active: boolean
  sort_order: number
}

export interface ContactClientRole {
  id: string
  contact_id: string
  client_id: string
  role_id: string
  role_name?: string  // Joined from contact_client_role_type
  role_description?: string | null  // Joined from contact_client_role_type
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

interface UseContactClientRolesReturn {
  // Data
  roles: ContactClientRole[]
  availableRoleTypes: ContactClientRoleType[]
  loading: boolean
  error: string | null

  // Methods
  refreshRoles: () => Promise<void>
  addRole: (contactId: string, clientId: string, roleId: string, notes?: string) => Promise<void>
  removeRole: (roleAssignmentId: string) => Promise<void>
  toggleRoleActive: (roleAssignmentId: string, isActive: boolean) => Promise<void>
  updateRoleNotes: (roleAssignmentId: string, notes: string) => Promise<void>
}

/**
 * Hook to manage roles for a specific contact-client relationship
 */
export function useContactClientRoles(
  contactId?: string,
  clientId?: string
): UseContactClientRolesReturn {
  const [roles, setRoles] = useState<ContactClientRole[]>([])
  const [availableRoleTypes, setAvailableRoleTypes] = useState<ContactClientRoleType[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load available role types
  useEffect(() => {
    loadRoleTypes()
  }, [])

  // Load roles when contactId or clientId changes
  useEffect(() => {
    if (contactId || clientId) {
      refreshRoles()
    }
  }, [contactId, clientId])

  const loadRoleTypes = async () => {
    try {
      const { data, error: err } = await supabase
        .from('contact_client_role_type')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')

      if (err) throw err
      setAvailableRoleTypes(data || [])
    } catch (err) {
      console.error('Error loading role types:', err)
      setError(err instanceof Error ? err.message : 'Failed to load role types')
    }
  }

  const refreshRoles = async () => {
    if (!contactId && !clientId) {
      setRoles([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('contact_client_role')
        .select(`
          id,
          contact_id,
          client_id,
          role_id,
          is_active,
          notes,
          created_at,
          updated_at,
          role:role_id (
            id,
            role_name,
            description
          )
        `)

      if (contactId) query = query.eq('contact_id', contactId)
      if (clientId) query = query.eq('client_id', clientId)

      const { data, error: err } = await query.order('created_at', { ascending: false })

      if (err) throw err

      // Flatten the nested role data
      const flattenedRoles = (data || []).map((item: any) => ({
        ...item,
        role_name: item.role?.role_name,
        role_description: item.role?.description,
      }))

      setRoles(flattenedRoles)
    } catch (err) {
      console.error('Error loading contact client roles:', err)
      setError(err instanceof Error ? err.message : 'Failed to load roles')
    } finally {
      setLoading(false)
    }
  }

  const addRole = async (
    contactIdParam: string,
    clientIdParam: string,
    roleId: string,
    notes?: string
  ) => {
    try {
      setError(null)

      const { data, error: err } = await supabase
        .from('contact_client_role')
        .insert({
          contact_id: contactIdParam,
          client_id: clientIdParam,
          role_id: roleId,
          notes: notes || null,
          is_active: true,
        })
        .select()
        .single()

      if (err) {
        // Check for unique constraint violation
        if (err.code === '23505') {
          throw new Error('This role is already assigned to this contact for this client')
        }
        throw err
      }

      await refreshRoles()
    } catch (err) {
      console.error('Error adding role:', err)
      setError(err instanceof Error ? err.message : 'Failed to add role')
      throw err
    }
  }

  const removeRole = async (roleAssignmentId: string) => {
    try {
      setError(null)

      const { error: err } = await supabase
        .from('contact_client_role')
        .delete()
        .eq('id', roleAssignmentId)

      if (err) throw err

      await refreshRoles()
    } catch (err) {
      console.error('Error removing role:', err)
      setError(err instanceof Error ? err.message : 'Failed to remove role')
      throw err
    }
  }

  const toggleRoleActive = async (roleAssignmentId: string, isActive: boolean) => {
    try {
      setError(null)

      const { error: err } = await supabase
        .from('contact_client_role')
        .update({ is_active: isActive })
        .eq('id', roleAssignmentId)

      if (err) throw err

      await refreshRoles()
    } catch (err) {
      console.error('Error toggling role active status:', err)
      setError(err instanceof Error ? err.message : 'Failed to update role')
      throw err
    }
  }

  const updateRoleNotes = async (roleAssignmentId: string, notes: string) => {
    try {
      setError(null)

      const { error: err } = await supabase
        .from('contact_client_role')
        .update({ notes })
        .eq('id', roleAssignmentId)

      if (err) throw err

      await refreshRoles()
    } catch (err) {
      console.error('Error updating role notes:', err)
      setError(err instanceof Error ? err.message : 'Failed to update notes')
      throw err
    }
  }

  return {
    roles,
    availableRoleTypes,
    loading,
    error,
    refreshRoles,
    addRole,
    removeRole,
    toggleRoleActive,
    updateRoleNotes,
  }
}

/**
 * Hook to check if a contact has a specific role for a client
 */
export function useHasRole(
  contactId: string | undefined,
  clientId: string | undefined,
  roleName: string
): { hasRole: boolean; loading: boolean } {
  const [hasRole, setHasRole] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!contactId || !clientId) {
      setHasRole(false)
      return
    }

    const checkRole = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('contact_client_role')
          .select(`
            id,
            role:role_id (
              role_name
            )
          `)
          .eq('contact_id', contactId)
          .eq('client_id', clientId)
          .eq('is_active', true)

        if (error) throw error

        const hasMatchingRole = data?.some(
          (item: any) => item.role?.role_name === roleName
        )

        setHasRole(hasMatchingRole || false)
      } catch (err) {
        console.error('Error checking role:', err)
        setHasRole(false)
      } finally {
        setLoading(false)
      }
    }

    checkRole()
  }, [contactId, clientId, roleName])

  return { hasRole, loading }
}
