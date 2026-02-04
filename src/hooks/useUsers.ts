import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';

type User = Database['public']['Tables']['user']['Row'];
type UserInsert = Database['public']['Tables']['user']['Insert'];
type UserUpdate = Database['public']['Tables']['user']['Update'];

interface UserWithRole extends User {
  role?: {
    display_name: string;
    description: string | null;
  };
}

export function useUsers() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('user')
        .select(`
          *,
          role:ovis_role (
            display_name,
            description
          )
        `)
        .order('name');

      if (fetchError) throw fetchError;

      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const createUser = async (
    email: string,
    password: string,
    userData: Omit<UserInsert, 'auth_user_id'>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // 1. Create auth user via Supabase Auth Admin API
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Auto-confirm email
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create auth user');

      // 2. Create corresponding record in public.user table
      const { error: userError } = await supabase
        .from('user')
        .insert([{
          ...userData,
          auth_user_id: authData.user.id,
          email: email,
        }]);

      if (userError) {
        // Rollback: delete auth user if user table insert fails
        await supabase.auth.admin.deleteUser(authData.user.id);
        throw userError;
      }

      // Refresh users list
      await fetchUsers();

      return { success: true };
    } catch (err) {
      console.error('Error creating user:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create user'
      };
    }
  };

  const updateUser = async (userId: string, updates: UserUpdate): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('📝 Updating user:', userId, 'with updates:', JSON.stringify(updates, null, 2));

      // Use RPC function to bypass RLS for admin user updates
      const { data, error: updateError } = await supabase.rpc('admin_update_user', {
        p_user_id: userId,
        p_name: updates.name || null,
        p_first_name: updates.first_name || null,
        p_last_name: updates.last_name || null,
        p_email: updates.email || null,
        p_ovis_role: updates.ovis_role || null,
        p_mobile_phone: updates.mobile_phone || null,
        p_active: updates.active ?? null,
        p_permissions: updates.permissions || null,
      });

      if (updateError) throw updateError;

      console.log('✅ Update response:', data);

      // Refresh users list
      await fetchUsers();

      return { success: true };
    } catch (err) {
      console.error('Error updating user:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update user'
      };
    }
  };

  const deactivateUser = async (userId: string): Promise<{ success: boolean; error?: string }> => {
    return updateUser(userId, { active: false });
  };

  const activateUser = async (userId: string): Promise<{ success: boolean; error?: string }> => {
    return updateUser(userId, { active: true });
  };

  const deleteUser = async (userId: string, authUserId: string | null): Promise<{ success: boolean; error?: string }> => {
    try {
      // 1. Delete from user table
      const { error: userDeleteError } = await supabase
        .from('user')
        .delete()
        .eq('id', userId);

      if (userDeleteError) throw userDeleteError;

      // 2. Delete from auth.users if auth_user_id exists
      if (authUserId) {
        const { error: authDeleteError } = await supabase.auth.admin.deleteUser(authUserId);
        if (authDeleteError) {
          console.warn('Failed to delete auth user, but user table record was deleted:', authDeleteError);
        }
      }

      // Refresh users list
      await fetchUsers();

      return { success: true };
    } catch (err) {
      console.error('Error deleting user:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete user'
      };
    }
  };

  const sendPasswordResetEmail = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      return { success: true };
    } catch (err) {
      console.error('Error sending password reset:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to send password reset email'
      };
    }
  };

  return {
    users,
    loading,
    error,
    fetchUsers,
    createUser,
    updateUser,
    deactivateUser,
    activateUser,
    deleteUser,
    sendPasswordResetEmail,
  };
}
