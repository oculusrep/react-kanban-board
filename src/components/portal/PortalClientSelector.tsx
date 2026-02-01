import { useState } from 'react';
import { usePortal } from '../../contexts/PortalContext';

/**
 * PortalClientSelector - Displayed when user has access to multiple clients
 * and needs to select which one to view
 */
export default function PortalClientSelector() {
  const { accessibleClients, setSelectedClientId } = usePortal();
  const [searchTerm, setSearchTerm] = useState('');

  // Filter clients based on search term
  const filteredClients = accessibleClients.filter((client) =>
    client.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Select a Client</h1>
          <p className="text-gray-600">
            You have access to multiple clients. Please select which one you'd like to view.
          </p>
        </div>

        {/* Search Box */}
        <div className="mb-6">
          <div className="relative max-w-md mx-auto">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchTerm && (
            <p className="text-sm text-gray-500 text-center mt-2">
              {filteredClients.length} of {accessibleClients.length} clients
            </p>
          )}
        </div>

        {filteredClients.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-gray-500">No clients found matching "{searchTerm}"</p>
            <button
              onClick={() => setSearchTerm('')}
              className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map((client) => (
              <button
                key={client.id}
                onClick={() => setSelectedClientId(client.id)}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition-all text-left group"
              >
                {client.logo_url ? (
                  <img
                    src={client.logo_url}
                    alt={client.client_name}
                    className="h-12 w-auto max-w-full object-contain mb-4"
                  />
                ) : (
                  <div
                    className="h-12 w-12 rounded-lg flex items-center justify-center mb-4 text-white font-bold text-lg"
                    style={{ backgroundColor: '#104073' }}
                  >
                    {client.client_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                  {client.client_name}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Click to view pipeline
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
