import { useEffect } from 'react';
import { usePortal } from '../../contexts/PortalContext';
import { Navigate } from 'react-router-dom';

/**
 * PortalMapPage - Map view for the client portal
 *
 * This page will reuse the existing map component with portal-specific
 * configuration (filtered site submits, portal detail sidebar, etc.)
 */
export default function PortalMapPage() {
  const { selectedClient, selectedClientId, accessibleClients } = usePortal();

  useEffect(() => {
    document.title = `Map - ${selectedClient?.client_name || 'Portal'} | OVIS`;
  }, [selectedClient]);

  // If no client selected and multiple available, redirect to select
  if (!selectedClientId && accessibleClients.length > 1) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <div className="h-[calc(100vh-64px)] relative">
      {/* Placeholder - will integrate with existing map component */}
      <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-sm max-w-md">
          <svg className="mx-auto h-16 w-16 text-blue-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Portal Map View</h2>
          <p className="text-gray-600 mb-4">
            Viewing site submits for: <strong>{selectedClient?.client_name || 'All Clients'}</strong>
          </p>
          <p className="text-sm text-gray-500">
            Map component integration coming soon...
          </p>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            <strong>Features planned:</strong>
            <ul className="mt-2 text-left list-disc list-inside">
              <li>Site submit pins (filtered by client)</li>
              <li>Stage toggle legend</li>
              <li>Property search bar</li>
              <li>Clustering</li>
              <li>Portal detail sidebar</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
