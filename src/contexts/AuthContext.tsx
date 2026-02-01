import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  userTableId: string | null; // ID from user table (not auth.users)
  isPortalUser: boolean; // True if user is a portal-only user (not internal)
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
  const [userTableId, setUserTableId] = useState<string | null>(null);
  const [isPortalUser, setIsPortalUser] = useState(false);

  // Check if user is a portal-only user (contact with portal_access_enabled)
  const checkIfPortalUser = async (email: string) => {
    try {
      const { data, error } = await supabase
        .from('contact')
        .select('id, portal_access_enabled')
        .ilike('email', email)
        .eq('portal_access_enabled', true)
        .single();

      if (!error && data) {
        setIsPortalUser(true);
        // Cache portal user status
        const cacheKey = `user_data_${email}`;
        localStorage.setItem(cacheKey, JSON.stringify({ role: null, id: null, isPortal: true }));
      } else {
        setIsPortalUser(false);
      }
    } catch (err) {
      console.error('Error checking portal user:', err);
      setIsPortalUser(false);
    }
  };

  // Fetch user role and table ID from user table
  const fetchUserData = async (authUser: User) => {
    try {
      const email = authUser.email;
      if (!email) {
        console.error('No email found for auth user');
        setUserRole(null);
        setUserTableId(null);
        return;
      }

      // Check localStorage cache first for instant loading
      const cacheKey = `user_data_${email}`;
      const cachedData = localStorage.getItem(cacheKey);

      if (cachedData) {
        // Use cached data immediately for instant loading
        const { role, id, isPortal } = JSON.parse(cachedData);
        setUserRole(role);
        setUserTableId(id);
        setIsPortalUser(isPortal || false);
        // Continue to refresh in background
      }

      // Add 2-second timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('User data query timeout')), 2000)
      );

      const queryPromise = supabase
        .from('user')
        .select('id, ovis_role')
        .eq('auth_user_id', authUser.id)
        .single();

      // Race between query and timeout
      const result = await Promise.race([queryPromise, timeoutPromise]);
      const { data, error } = result as any;

      if (error) {
        console.error('Error fetching user data:', error);
        // If we have cached data, keep it; otherwise check if portal user
        if (!cachedData) {
          setUserRole(null);
          setUserTableId(null);
          // Check if this is a portal user (has contact with portal_access_enabled)
          await checkIfPortalUser(email);
        }
      } else {
        const role = data?.ovis_role || null;
        const id = data?.id || null;
        setUserRole(role);
        setUserTableId(id);
        setIsPortalUser(false); // Internal users are not portal-only users
        // Cache the data for instant loading on next visit
        if (role && id) {
          localStorage.setItem(cacheKey, JSON.stringify({ role, id, isPortal: false }));
        }
      }
    } catch (err) {
      console.error('User data fetch failed or timed out:', err);
      const email = authUser.email;
      if (email) {
        // Check if we have cached data
        const cacheKey = `user_data_${email}`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          const { role, id, isPortal } = JSON.parse(cachedData);
          setUserRole(role);
          setUserTableId(id);
          setIsPortalUser(isPortal || false);
        } else {
          // Set to null - user won't have access to admin routes
          setUserRole(null);
          setUserTableId(null);
          // Check if portal user
          await checkIfPortalUser(email);
        }
      }
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      // DON'T AWAIT - fetch user data in background so page loads instantly
      if (session?.user) {
        fetchUserData(session.user); // Fire and forget
      }

      // Set loading false IMMEDIATELY - don't block on user data fetch
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      // DON'T AWAIT - fetch user data in background
      if (session?.user) {
        fetchUserData(session.user); // Fire and forget
      } else {
        setUserRole(null);
        setUserTableId(null);
        setIsPortalUser(false);
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
    userTableId,
    isPortalUser,
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