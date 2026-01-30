import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface PortalRouteProps {
  children: React.ReactNode;
}

/**
 * PortalRoute - Route guard for client portal users
 *
 * This component checks if the current user is a portal user (client)
 * and allows access to portal routes. Internal users (admin, broker, etc.)
 * also have access to portal routes with elevated permissions.
 */
export default function PortalRoute({ children }: PortalRouteProps) {
  const { user, userRole, loading } = useAuth();
  const location = useLocation();
  const [isPortalUser, setIsPortalUser] = useState<boolean | null>(null);
  const [checkingPortal, setCheckingPortal] = useState(true);

  useEffect(() => {
    async function checkPortalAccess() {
      if (!user) {
        setCheckingPortal(false);
        return;
      }

      // Internal users (admin, broker, assistant) always have portal access
      if (userRole && ['admin', 'broker_full', 'broker_limited', 'assistant'].includes(userRole)) {
        setIsPortalUser(true);
        setCheckingPortal(false);
        return;
      }

      // Check if user is a portal user (contact with portal_access_enabled)
      try {
        const { data, error } = await supabase
          .from('contact')
          .select('id, portal_access_enabled')
          .ilike('email', user.email || '')
          .eq('portal_access_enabled', true)
          .single();

        if (error || !data) {
          setIsPortalUser(false);
        } else {
          setIsPortalUser(true);
        }
      } catch (err) {
        console.error('Error checking portal access:', err);
        setIsPortalUser(false);
      }

      setCheckingPortal(false);
    }

    if (!loading) {
      checkPortalAccess();
    }
  }, [user, userRole, loading]);

  // Still loading auth
  if (loading || checkingPortal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Not logged in - redirect to portal login
  if (!user) {
    return <Navigate to="/portal/login" state={{ from: location }} replace />;
  }

  // No portal access
  if (!isPortalUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
          <svg
            className="mx-auto h-12 w-12 text-red-500 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            You don't have access to the client portal. Please contact your administrator if you believe this is an error.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
