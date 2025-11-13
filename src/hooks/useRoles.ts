import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';

type Role = Database['public']['Tables']['role']['Row'];
type RoleInsert = Database['public']['Tables']['role']['Insert'];
type RoleUpdate = Database['public']['Tables']['role']['Update'];

export function useRoles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('role')
        .select('*')
        .order('name');

      if (fetchError) throw fetchError;

      setRoles(data || []);
    } catch (err) {
      console.error('Error fetching roles:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const createRole = async (roleData: RoleInsert): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error: insertError } = await supabase
        .from('role')
        .insert([roleData]);

      if (insertError) throw insertError;

      // Refresh roles list
      await fetchRoles();

      return { success: true };
    } catch (err) {
      console.error('Error creating role:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create role'
      };
    }
  };

  const updateRole = async (roleId: string, updates: RoleUpdate): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error: updateError } = await supabase
        .from('role')
        .update(updates)
        .eq('id', roleId);

      if (updateError) throw updateError;

      // Refresh roles list
      await fetchRoles();

      return { success: true };
    } catch (err) {
      console.error('Error updating role:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update role'
      };
    }
  };

  const deleteRole = async (roleId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error: deleteError } = await supabase
        .from('role')
        .delete()
        .eq('id', roleId);

      if (deleteError) {
        // Check if it's a foreign key constraint error
        if (deleteError.message.includes('violates foreign key constraint')) {
          throw new Error('Cannot delete role that is assigned to users');
        }
        throw deleteError;
      }

      // Refresh roles list
      await fetchRoles();

      return { success: true };
    } catch (err) {
      console.error('Error deleting role:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete role'
      };
    }
  };

  const deactivateRole = async (roleId: string): Promise<{ success: boolean; error?: string }> => {
    return updateRole(roleId, { active: false });
  };

  const activateRole = async (roleId: string): Promise<{ success: boolean; error?: string }> => {
    return updateRole(roleId, { active: true });
  };

  return {
    roles,
    loading,
    error,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    deactivateRole,
    activateRole,
  };
}
