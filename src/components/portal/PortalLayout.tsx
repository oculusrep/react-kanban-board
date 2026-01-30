import { Outlet } from 'react-router-dom';
import { PortalProvider, usePortal } from '../../contexts/PortalContext';
import PortalNavbar from './PortalNavbar';
import PortalClientSelector from './PortalClientSelector';

/**
 * Inner layout component that uses portal context
 */
function PortalLayoutInner() {
  const { selectedClient, accessibleClients, loading, error } = usePortal();

  // Show client selector if multiple clients or no client selected
  const showClientSelector = !loading && !error && accessibleClients.length > 1 && !selectedClient;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <PortalNavbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading portal...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100">
        <PortalNavbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
            <svg className="mx-auto h-12 w-12 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Portal Error</h2>
            <p className="text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (accessibleClients.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100">
        <PortalNavbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
            <svg className="mx-auto h-12 w-12 text-yellow-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No Client Access</h2>
            <p className="text-gray-600">
              You don't have access to any clients yet. Please contact your administrator to grant you access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <PortalNavbar
        clientLogo={selectedClient?.logo_url}
        clientName={selectedClient?.client_name}
      />

      {showClientSelector ? (
        <PortalClientSelector />
      ) : (
        <Outlet />
      )}
    </div>
  );
}

/**
 * PortalLayout - Main layout wrapper for portal pages
 *
 * Provides:
 * - Portal context (client access, selection)
 * - Portal navigation bar
 * - Client selector (when needed)
 */
export default function PortalLayout() {
  return (
    <PortalProvider>
      <PortalLayoutInner />
    </PortalProvider>
  );
}
