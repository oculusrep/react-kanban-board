import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Fetch user role from user table
  const fetchUserRole = async (userId: string) => {
    try {
      // Check localStorage cache first for instant loading
      const cacheKey = `user_role_${userId}`;
      const cachedRole = localStorage.getItem(cacheKey);

      if (cachedRole) {
        // Use cached role immediately for instant loading
        setUserRole(cachedRole);
        // Continue to refresh in background
      }

      // Add 2-second timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Role query timeout')), 2000)
      );

      const queryPromise = supabase
        .from('user')
        .select('ovis_role')
        .eq('id', userId)
        .single();

      // Race between query and timeout
      const result = await Promise.race([queryPromise, timeoutPromise]);
      const { data, error } = result as any;

      if (error) {
        console.error('Error fetching user role:', error);
        // If we have cached role, keep it; otherwise set to null (no access)
        if (!cachedRole) {
          setUserRole(null);
        }
      } else {
        const role = data?.ovis_role || null;
        setUserRole(role);
        // Cache the role for instant loading on next visit
        if (role) {
          localStorage.setItem(cacheKey, role);
        }
      }
    } catch (err) {
      console.error('Role fetch failed or timed out:', err);
      // Check if we have cached role
      const cacheKey = `user_role_${userId}`;
      const cachedRole = localStorage.getItem(cacheKey);
      if (cachedRole) {
        setUserRole(cachedRole);
      } else {
        // Set to null - user won't have access to admin routes
        setUserRole(null);
      }
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      // DON'T AWAIT - fetch role in background so page loads instantly
      if (session?.user) {
        fetchUserRole(session.user.id); // Fire and forget
      }

      // Set loading false IMMEDIATELY - don't block on role fetch
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      // DON'T AWAIT - fetch role in background
      if (session?.user) {
        fetchUserRole(session.user.id); // Fire and forget
      } else {
        setUserRole(null);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    return await supabase.auth.signInWithPassword({ email, password });
  };

  const signUp = async (email: string, password: string) => {
    return await supabase.auth.signUp({ email, password });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    loading,
    userRole,
    signIn,
    signUp,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}