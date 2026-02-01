import { ReactNode } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoginForm from './LoginForm';

interface ProtectedRouteProps {
  children?: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, isPortalUser, userRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  // Portal-only users should be redirected to the portal
  // (They are authenticated but don't have an internal role)
  if (isPortalUser && !userRole) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {children}
      <Outlet />
    </div>
  );
}