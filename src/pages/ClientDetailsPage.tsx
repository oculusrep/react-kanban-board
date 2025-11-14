import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import ClientOverviewTab from '../components/ClientOverviewTab';
import GenericActivityTab from '../components/GenericActivityTab';
import ClientSidebar from '../components/ClientSidebar';
import FileManager from '../components/FileManager/FileManager';
import { useTrackPageView } from '../hooks/useRecentlyViewed';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';

type Client = Database['public']['Tables']['client']['Row'];

const ClientDetailsPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isSiteSubmitModalOpen, setIsSiteSubmitModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { trackView } = useTrackPageView();
  const { toast, showToast } = useToast();

  const isNewClient = clientId === 'new';

  // Clear error state when navigating to new client
  useEffect(() => {
    if (isNewClient) {
      setError(null);
    }
  }, [isNewClient]);

  // Set page title
  useEffect(() => {
    if (isNewClient) {
      document.title = "New Client | OVIS";
    } else if (client?.client_name) {
      document.title = `${client.client_name} | OVIS`;
    } else {
      document.title = "Client | OVIS";
    }
  }, [client, isNewClient]);

  useEffect(() => {
    const fetchClient = async () => {
      // Handle new client creation - check this FIRST
      if (!clientId || isNewClient || clientId === 'new') {
        setLoading(false);
        setError(null); // Clear any previous errors
        setClient(null); // Clear any previous client data
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
    if (!clientId || isNewClient) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);

    try {
      const { error } = await supabase
        .from('client')
        .delete()
        .eq('id', clientId);

      if (error) throw error;

      showToast('Client deleted successfully!', { type: 'success' });

      // Navigate after a brief delay to show the toast
      setTimeout(() => {
        navigate('/master-pipeline');
      }, 1000);
    } catch (error) {
      console.error('Error deleting client:', error);
      showToast(`Error deleting client: ${error instanceof Error ? error.message : 'Unknown error'}`, { type: 'error' });
    }
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
    { id: 'files', name: 'Files' }
  ];

  const ClientIcon = () => (
    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Client Header Bar */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-600 text-white px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-600 rounded-lg">
                  <ClientIcon />
                  <span className="text-white text-sm font-medium">Client</span>
                </div>
                <h1 className="text-xl font-bold leading-tight">
                  {isNewClient ? 'New Client' : client?.client_name || 'Unnamed Client'}
                </h1>
                {client?.type && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-600 text-white">
                    {client.type}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-3">
                {!isNewClient && clientId && (
                  <button
                    onClick={handleDelete}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors"
                    title="Delete Client"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ${
          !isSidebarMinimized ? 'mr-[500px]' : 'mr-12'
        }`}>

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
        {activeTab === 'activities' && client && (
          <GenericActivityTab
            config={{
              parentObject: { id: client.id, type: 'client', name: client.client_name || 'Unnamed Client' },
              title: 'Client Activities',
              showSummary: true,
              allowAdd: true
            }}
          />
        )}
        {activeTab === 'files' && (
          <>
            {isNewClient || !client?.id ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">Save Client First</h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>Please save the client in the Overview tab before viewing files.</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <FileManager
                  entityType="client"
                  entityId={client.id}
                />
              </div>
            )}
          </>
        )}
      </div>
        </div>
      </div>

      {/* Client Sidebar */}
      {clientId && clientId !== 'new' && (
        <ClientSidebar
          clientId={clientId}
          isMinimized={isSidebarMinimized}
          onMinimize={() => setIsSidebarMinimized(!isSidebarMinimized)}
          onContactClick={(contactId) => navigate(`/contact/${contactId}`)}
          onDealClick={(dealId) => navigate(`/deal/${dealId}`)}
          onContactModalChange={setIsContactModalOpen}
          onSiteSubmitModalChange={setIsSiteSubmitModalOpen}
        />
      )}

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Client"
        message="Are you sure you want to delete this client? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
};

export default ClientDetailsPage;