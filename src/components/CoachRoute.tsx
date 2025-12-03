import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface CoachRouteProps {
  children: ReactNode;
}

/**
 * Route guard that redirects coach users to their dashboard.
 * Coach users can only access /coach-dashboard - all other routes redirect them back.
 */
export default function CoachRoute({ children }: CoachRouteProps) {
  const { userRole } = useAuth();

  // If user is a coach, redirect them to coach dashboard
  if (userRole === 'coach') {
    return <Navigate to="/coach-dashboard" replace />;
  }

  // All other roles can access the route
  return <>{children}</>;
}
