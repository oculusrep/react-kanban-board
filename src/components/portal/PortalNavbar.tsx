import { useAuth } from '../../contexts/AuthContext';
import { usePortal } from '../../contexts/PortalContext';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';

interface PortalNavbarProps {
  clientLogo?: string | null;
  clientName?: string;
}

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
 * PortalNavbar - Navigation bar for the client portal
 *
 * Features:
 * - Hamburger menu to toggle between Map and Pipeline views
 * - Client logo display (top right)
 * - User menu with sign out
 * - Oculus branding colors
 */
export default function PortalNavbar({ clientLogo, clientName }: PortalNavbarProps) {
  const { user, signOut, userRole } = useAuth();
  const { accessibleClients, selectedClientId, setSelectedClientId, isInternalUser: isInternalPortalUser, viewMode, setViewMode } = usePortal();
  const navigate = useNavigate();
  const location = useLocation();
  const [userProfile, setUserProfile] = useState<{ first_name?: string; last_name?: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [sendingPasswordReset, setSendingPasswordReset] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const clientMenuRef = useRef<HTMLDivElement>(null);

  // Determine current view from URL
  const currentView = location.pathname.includes('/portal/pipeline') ? 'Pipeline' : 'Map';

  // Check if user is an internal user (broker/admin)
  const isInternalUser = userRole && ['admin', 'broker_full', 'broker_limited', 'assistant'].includes(userRole);

  // Fetch user profile data
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user?.email) {
        // Try to get from user table first (for internal users)
        let { data, error } = await supabase
          .from('user')
          .select('first_name, last_name')
          .eq('email', user.email)
          .single();

        if (data && !error) {
          setUserProfile(data);
          return;
        }

        // Fallback to contact table (for portal users)
        const { data: contactData, error: contactError } = await supabase
          .from('contact')
          .select('first_name, last_name')
          .ilike('email', user.email)
          .single();

        if (contactData && !contactError) {
          setUserProfile(contactData);
        }
      }
    };

    fetchUserProfile();
  }, [user]);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (clientMenuRef.current && !clientMenuRef.current.contains(event.target as Node)) {
        setClientMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle client selection
  const handleSelectClient = (clientId: string | null) => {
    setSelectedClientId(clientId);
    setClientMenuOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;

    setSendingPasswordReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/portal/reset-password`,
      });

      if (error) throw error;

      setPasswordResetSent(true);
      // Clear the success message after 5 seconds
      setTimeout(() => {
        setPasswordResetSent(false);
        setUserMenuOpen(false);
      }, 3000);
    } catch (err) {
      console.error('Error sending password reset:', err);
    } finally {
      setSendingPasswordReset(false);
    }
  };

  const handleNavigateToMap = () => {
    navigate('/portal/map');
    setMenuOpen(false);
  };

  const handleNavigateToPipeline = () => {
    navigate('/portal/pipeline');
    setMenuOpen(false);
  };

  const handleNavigateToCRM = () => {
    navigate('/master-pipeline');
    setMenuOpen(false);
  };

  return (
    <nav
      className="shadow-sm px-4 h-16 flex items-center"
      style={{ backgroundColor: '#011742' }}
    >
      <div className="flex justify-between items-center w-full">
        {/* Left side - Hamburger menu and view title */}
        <div className="flex items-center space-x-3">
          {/* Hamburger Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {menuOpen && (
              <div className="absolute left-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 z-[10010]">
                <button
                  onClick={handleNavigateToMap}
                  className={`w-full px-4 py-2 text-left flex items-center space-x-2 hover:bg-gray-100 ${
                    currentView === 'Map' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  <span>Map</span>
                </button>
                <button
                  onClick={handleNavigateToPipeline}
                  className={`w-full px-4 py-2 text-left flex items-center space-x-2 hover:bg-gray-100 ${
                    currentView === 'Pipeline' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  <span>Pipeline</span>
                </button>

                {/* View mode toggle for internal users */}
                {isInternalUser && (
                  <>
                    <div className="border-t border-gray-200 my-1"></div>
                    <div className="px-4 py-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">View Mode</p>
                    </div>
                    <button
                      onClick={() => {
                        setViewMode('broker');
                        setMenuOpen(false);
                      }}
                      className={`w-full px-4 py-2 text-left flex items-center space-x-2 hover:bg-gray-100 ${
                        viewMode === 'broker' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span>Broker View</span>
                      {viewMode === 'broker' && (
                        <svg className="w-4 h-4 ml-auto text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setViewMode('client');
                        setMenuOpen(false);
                      }}
                      className={`w-full px-4 py-2 text-left flex items-center space-x-2 hover:bg-gray-100 ${
                        viewMode === 'client' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      <span>Client View</span>
                      {viewMode === 'client' && (
                        <svg className="w-4 h-4 ml-auto text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <div className="border-t border-gray-200 my-1"></div>
                    <button
                      onClick={handleNavigateToCRM}
                      className="w-full px-4 py-2 text-left flex items-center space-x-2 hover:bg-gray-100 text-gray-700"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      <span>Back to CRM</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* View Title */}
          <span className="text-lg font-semibold text-white">{currentView}</span>

          {/* Client View indicator */}
          {isInternalUser && viewMode === 'client' && (
            <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-500 text-yellow-900">
              Client Preview
            </span>
          )}
        </div>

        {/* Center - Oculus Logo */}
        <div className="hidden sm:flex items-center">
          <img
            src="/Images/Oculus_02-Long - white.png"
            alt="Oculus"
            className="h-8"
          />
        </div>

        {/* Right side - Client logo and user menu */}
        <div className="flex items-center space-x-4">
          {/* Client Logo/Switcher */}
          {isInternalPortalUser ? (
            // Internal users get a dropdown to switch clients
            <div className="relative" ref={clientMenuRef}>
              <button
                onClick={() => setClientMenuOpen(!clientMenuOpen)}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                {clientLogo ? (
                  <img
                    src={clientLogo}
                    alt={clientName || 'Client'}
                    className="h-7 w-auto max-w-[100px] object-contain"
                  />
                ) : (
                  <span
                    className="text-sm font-medium"
                    style={{ color: '#ffffff' }}
                  >
                    {clientName || 'All Clients'}
                  </span>
                )}
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Client Dropdown */}
              {clientMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg py-1 z-[10010] max-h-80 overflow-y-auto">
                  <div className="px-4 py-2 border-b border-gray-200">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Switch Client</p>
                  </div>

                  {/* All Clients option */}
                  <button
                    onClick={() => handleSelectClient(null)}
                    className={`w-full px-4 py-2 text-left flex items-center space-x-3 hover:bg-gray-100 ${
                      !selectedClientId ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">All Clients</p>
                      <p className="text-xs text-gray-500">{accessibleClients.length} clients</p>
                    </div>
                    {!selectedClientId && (
                      <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>

                  <div className="border-t border-gray-200 my-1"></div>

                  {/* Client list */}
                  {accessibleClients.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => handleSelectClient(client.id)}
                      className={`w-full px-4 py-2 text-left flex items-center space-x-3 hover:bg-gray-100 ${
                        selectedClientId === client.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                        {client.logo_url ? (
                          <img
                            src={client.logo_url}
                            alt={client.client_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-medium text-gray-500">
                            {client.client_name.substring(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{client.client_name}</p>
                      </div>
                      {selectedClientId === client.id && (
                        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Regular portal users just see their client logo/name
            clientLogo ? (
              <img
                src={clientLogo}
                alt={clientName || 'Client'}
                className="h-8 w-auto max-w-[120px] object-contain"
                title={clientName}
              />
            ) : clientName ? (
              <span
                className="text-sm font-medium px-3 py-1 rounded"
                style={{ backgroundColor: '#104073', color: '#ffffff' }}
              >
                {clientName}
              </span>
            ) : null
          )}

          {/* User Menu */}
          {user && (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center space-x-2 p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-full text-white font-semibold text-sm"
                  style={{ backgroundColor: '#34518a' }}
                >
                  {getUserInitials(userProfile?.first_name, userProfile?.last_name)}
                </div>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* User Dropdown */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg py-1 z-[10010]">
                  <div className="px-4 py-2 border-b border-gray-200">
                    <p className="text-sm font-medium text-gray-900">
                      {userProfile?.first_name} {userProfile?.last_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    {isInternalUser && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
                        {userRole === 'admin' ? 'Admin' : 'Broker'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleResetPassword}
                    disabled={sendingPasswordReset || passwordResetSent}
                    className="w-full px-4 py-2 text-left flex items-center space-x-2 hover:bg-gray-100 text-gray-700 disabled:opacity-50"
                  >
                    {sendingPasswordReset ? (
                      <>
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Sending...</span>
                      </>
                    ) : passwordResetSent ? (
                      <>
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-green-600">Email Sent!</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        <span>Reset Password</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="w-full px-4 py-2 text-left flex items-center space-x-2 hover:bg-red-50 text-red-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
