import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import ClientOverviewTab from '../components/ClientOverviewTab';
import GenericActivityTab from '../components/GenericActivityTab';
import ClientNotesSidebar from '../components/ClientNotesSidebar';
import { useTrackPageView } from '../hooks/useRecentlyViewed';

type Client = Database['public']['Tables']['client']['Row'];

const ClientDetailsPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotesSidebarMinimized, setIsNotesSidebarMinimized] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const { trackView } = useTrackPageView();

  const isNewClient = clientId === 'new';

  useEffect(() => {
    const fetchClient = async () => {
      if (isNewClient) {
        setLoading(false);
        return;
      }

      if (!clientId) {
        setError('Client ID not provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('client')
          .select('*')
          .eq('id', clientId)
          .single();

        if (error) {
          console.error('Error fetching client:', error);
          setError(`Failed to load client: ${error.message}`);
        } else if (data) {
          setClient(data);
          // Track this client as recently viewed
          trackView(
            data.id,
            'client',
            data.client_name || 'Unnamed Client',
            data.type || undefined
          );
        }
      } catch (err) {
        console.error('Unexpected error fetching client:', err);
        setError('An unexpected error occurred while loading the client');
      } finally {
        setLoading(false);
      }
    };

    fetchClient();
  }, [clientId, isNewClient, trackView]);

  const handleSave = (updatedClient: Client) => {
    setClient(updatedClient);
    if (isNewClient && updatedClient.id) {
      // Navigate to the new client's detail page
      navigate(`/client/${updatedClient.id}`, { replace: true });
    }
  };

  const handleDelete = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error Loading Client</h3>
            <div className="mt-2 text-sm text-red-700">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', name: 'Overview' },
    { id: 'activities', name: 'Activities' },
    { id: 'notes', name: 'Notes' }
  ];

  return (
    <>
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ${
        !isNotesSidebarMinimized ? 'mr-[500px]' : 'mr-12'
      }`}>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isNewClient ? 'New Client' : client?.client_name || 'Unnamed Client'}
              </h1>
              {client?.type && (
                <p className="text-sm text-gray-500 mt-1">
                  {client.type}
                </p>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsNotesSidebarMinimized(!isNotesSidebarMinimized)}
                className="inline-flex items-center px-3 py-2 border border-purple-300 rounded-md shadow-sm text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                title={isNotesSidebarMinimized ? "Show Notes Sidebar" : "Hide Notes Sidebar"}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                {isNotesSidebarMinimized ? 'Show' : 'Hide'} Notes
              </button>
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <ClientOverviewTab
            client={client}
            isNewClient={isNewClient}
            onSave={handleSave}
            onDelete={!isNewClient ? handleDelete : undefined}
          />
        )}
        {activeTab === 'activities' && (
          <GenericActivityTab
            parentObject={client ? { id: client.id, type: 'client', name: client.client_name || 'Unnamed Client' } : null}
          />
        )}
        {activeTab === 'notes' && (
          <div className="text-gray-600">
            <p className="mb-4">Notes are displayed in the sidebar. Use the sidebar to view and manage client notes.</p>
            <button
              onClick={() => setIsNotesSidebarMinimized(false)}
              className="inline-flex items-center px-4 py-2 border border-purple-300 rounded-md shadow-sm text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Show Notes Sidebar
            </button>
          </div>
        )}
      </div>
    </div>

      {/* Notes Sidebar */}
      {clientId && clientId !== 'new' && (
        <ClientNotesSidebar
          clientId={clientId}
          isMinimized={isNotesSidebarMinimized}
          onMinimize={() => setIsNotesSidebarMinimized(!isNotesSidebarMinimized)}
          onNoteModalChange={setIsNoteModalOpen}
        />
      )}
    </>
  );
};

export default ClientDetailsPage;