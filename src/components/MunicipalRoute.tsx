import { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';

interface MunicipalRouteProps {
  children: ReactNode;
}

/**
 * Route guard for the Municipal Project Import page.
 * Checks for can_access_municipal_import permission.
 * Admin users always have access.
 */
export default function MunicipalRoute({ children }: MunicipalRouteProps) {
  const { userRole, loading: authLoading } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();

  const loading = authLoading || permLoading;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const hasAccess = userRole === 'admin' || hasPermission('can_access_municipal_import');

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
          <svg
            className="mx-auto h-12 w-12 text-red-500 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">
            You do not have permission to access the Municipal Project Import page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
