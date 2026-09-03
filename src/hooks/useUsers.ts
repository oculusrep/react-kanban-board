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

  /**
   * Pull the server's error message out of a failed functions.invoke().
   *
   * supabase-js surfaces a non-2xx edge response as FunctionsHttpError whose
   * .message is just "Edge Function returned a non-2xx status code" — the
   * useful text is in the attached Response body.
   */
  const edgeErrorMessage = async (err: unknown, fallback: string): Promise<string> => {
    const context = (err as { context?: Response })?.context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        if (body?.error) return body.error as string;
      } catch {
        // Body wasn't JSON — fall through to the generic message.
      }
    }
    return err instanceof Error ? err.message : fallback;
  };

  /**
   * Create a user through the admin-create-user edge function.
   *
   * Not supabase.auth.admin.createUser(): that namespace requires a
   * service_role key and this client is built with the publishable key, so the
   * old in-browser version could never succeed. The edge function holds the
   * service_role key, re-checks that the caller is an admin, and creates the
   * auth login and the public.user row together — rolling the login back if
   * the user row fails.
   */
  const createUser = async (
    email: string,
    password: string,
    userData: Omit<UserInsert, 'auth_user_id'>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-create-user', {
        body: { email, password, userData },
      });

      if (invokeError) {
        return {
          success: false,
          error: await edgeErrorMessage(invokeError, 'Failed to create user'),
        };
      }
      if (!data?.success) {
        return { success: false, error: data?.error || 'Failed to create user' };
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

  /**
   * Delete a user via the admin_delete_user RPC.
   *
   * Not a direct `.delete()` on the user table: public.user has RLS with no
   * DELETE policy, so that statement matched zero rows and returned no error —
   * the UI reported success while the user stayed on the list. And the auth
   * half never worked either, because supabase.auth.admin.* needs a
   * service_role key while this client is built with the publishable key.
   *
   * The RPC removes the user row and revokes the login in one transaction, and
   * refuses (listing the tables) when records still reference the user.
   */
  const deleteUser = async (
    userId: string,
    _authUserId?: string | null,
  ): Promise<{ success: boolean; error?: string; authAction?: string; authBlockers?: string[] }> => {
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_delete_user', {
        p_user_id: userId,
      });

      if (rpcError) throw rpcError;

      const result = (data || {}) as {
        deleted?: boolean;
        auth_action?: string;
        auth_blockers?: string[];
      };
      if (!result.deleted) {
        throw new Error('Delete did not complete — the user was not removed.');
      }

      // Refresh users list
      await fetchUsers();

      return {
        success: true,
        authAction: result.auth_action,
        authBlockers: result.auth_blockers || [],
      };
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
