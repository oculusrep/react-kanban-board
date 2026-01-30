import { usePortal } from '../../contexts/PortalContext';

/**
 * PortalClientSelector - Displayed when user has access to multiple clients
 * and needs to select which one to view
 */
export default function PortalClientSelector() {
  const { accessibleClients, setSelectedClientId } = usePortal();

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Select a Client</h1>
          <p className="text-gray-600">
            You have access to multiple clients. Please select which one you'd like to view.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accessibleClients.map((client) => (
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
      </div>
    </div>
  );
}
