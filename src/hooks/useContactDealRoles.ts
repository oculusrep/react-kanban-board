/**
 * Custom hook for managing contact-deal role assignments
 *
 * This hook allows managing multiple roles per contact-deal relationship.
 * A contact can have different roles for different deals.
 *
 * Example: John Doe might be an "Attorney" for Deal A but a "Lender" for Deal B
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { prepareInsert, prepareUpdate } from '../lib/supabaseHelpers'

export interface ContactDealRoleType {
  id: string
  role_name: string
  description: string | null
  is_active: boolean
  sort_order: number
}

export interface ContactDealRole {
  id: string
  contact_id: string
  deal_id: string
  role_id: string
  role_name?: string  // Joined from contact_deal_role_type
  role_description?: string | null  // Joined from contact_deal_role_type
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

interface UseContactDealRolesReturn {
  // Data
  roles: ContactDealRole[]
  availableRoleTypes: ContactDealRoleType[]
  loading: boolean
  error: string | null

  // Methods
  refreshRoles: () => Promise<void>
  addRole: (contactId: string, dealId: string, roleId: string, notes?: string) => Promise<void>
  removeRole: (roleAssignmentId: string) => Promise<void>
  toggleRoleActive: (roleAssignmentId: string, isActive: boolean) => Promise<void>
  updateRoleNotes: (roleAssignmentId: string, notes: string) => Promise<void>
}

/**
 * Hook to manage roles for a specific contact-deal relationship
 */
export function useContactDealRoles(
  contactId?: string,
  dealId?: string
): UseContactDealRolesReturn {
  const [roles, setRoles] = useState<ContactDealRole[]>([])
  const [availableRoleTypes, setAvailableRoleTypes] = useState<ContactDealRoleType[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load available role types
  useEffect(() => {
    loadRoleTypes()
  }, [])

  // Load roles when contactId or dealId changes
  useEffect(() => {
    if (contactId || dealId) {
      refreshRoles()
    }
  }, [contactId, dealId])

  const loadRoleTypes = async () => {
    try {
      const { data, error: err } = await supabase
        .from('contact_deal_role_type')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')

      if (err) throw err
      setAvailableRoleTypes(data || [])
    } catch (err) {
      console.error('Error loading deal role types:', err)
      setError(err instanceof Error ? err.message : 'Failed to load role types')
    }
  }

  const refreshRoles = async () => {
    if (!contactId && !dealId) {
      setRoles([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('contact_deal_role')
        .select(`
          id,
          contact_id,
          deal_id,
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
      if (dealId) query = query.eq('deal_id', dealId)

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
      console.error('Error loading contact deal roles:', err)
      setError(err instanceof Error ? err.message : 'Failed to load roles')
    } finally {
      setLoading(false)
    }
  }

  const addRole = async (
    contactIdParam: string,
    dealIdParam: string,
    roleId: string,
    notes?: string
  ) => {
    try {
      setError(null)

      const { data, error: err } = await supabase
        .from('contact_deal_role')
        .insert(prepareInsert({
          contact_id: contactIdParam,
          deal_id: dealIdParam,
          role_id: roleId,
          notes: notes || null,
          is_active: true,
        }))
        .select()
        .single()

      if (err) {
        // Check for unique constraint violation
        if (err.code === '23505') {
          throw new Error('This role is already assigned to this contact for this deal')
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
        .from('contact_deal_role')
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
        .from('contact_deal_role')
        .update(prepareUpdate({ is_active: isActive }))
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
        .from('contact_deal_role')
        .update(prepareUpdate({ notes }))
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
 * Hook to check if a contact has a specific role for a deal
 */
export function useHasDealRole(
  contactId: string | undefined,
  dealId: string | undefined,
  roleName: string
): { hasRole: boolean; loading: boolean } {
  const [hasRole, setHasRole] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!contactId || !dealId) {
      setHasRole(false)
      return
    }

    const checkRole = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('contact_deal_role')
          .select(`
            id,
            role:role_id (
              role_name
            )
          `)
          .eq('contact_id', contactId)
          .eq('deal_id', dealId)
          .eq('is_active', true)

        if (error) throw error

        const hasMatchingRole = data?.some(
          (item: any) => item.role?.role_name === roleName
        )

        setHasRole(hasMatchingRole || false)
      } catch (err) {
        console.error('Error checking deal role:', err)
        setHasRole(false)
      } finally {
        setLoading(false)
      }
    }

    checkRole()
  }, [contactId, dealId, roleName])

  return { hasRole, loading }
}
