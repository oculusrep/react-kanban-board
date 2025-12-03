import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Helper function to get user initials
const getUserInitials = (firstName?: string, lastName?: string): string => {
  if (firstName && lastName) {
    return (firstName[0] + lastName[0]).toUpperCase();
  }
  if (firstName) {
    return firstName.substring(0, 2).toUpperCase();
  }
  return 'U';
};

/**
 * Simplified navbar for Coach users - only shows logo, user avatar, and sign out
 */
export default function CoachNavbar() {
  const { user, signOut } = useAuth();
  const [userProfile, setUserProfile] = useState<{ first_name?: string; last_name?: string } | null>(null);

  // Fetch user profile data
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user?.email) {
        const { data, error } = await supabase
          .from('user')
          .select('first_name, last_name')
          .eq('email', user.email)
          .single();

        if (data && !error) {
          setUserProfile(data);
        }
      }
    };

    fetchUserProfile();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <nav className="bg-white shadow p-4">
      <div className="flex justify-between items-center">
        {/* Left side - Logo/Title */}
        <div className="flex items-center">
          <span className="text-xl font-bold text-gray-800">OVIS</span>
          <span className="ml-2 text-sm text-gray-500">Coach Dashboard</span>
        </div>

        {/* Right side - User info and sign out */}
        {user && (
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-semibold text-sm">
              {getUserInitials(userProfile?.first_name, userProfile?.last_name)}
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-600 hover:text-red-700"
              aria-label="Sign Out"
              title="Sign Out"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
