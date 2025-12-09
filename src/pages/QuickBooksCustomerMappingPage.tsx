import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeft, Search, Link2, Unlink, RefreshCw, CheckCircle, XCircle, ChevronRight } from "lucide-react";

interface OvisClient {
  id: string;
  client_name: string;
  parent_id: string | null;
  parent_name?: string;
  qb_customer_id: string | null;
  phone: string | null;
}

interface QBCustomer {
  id: string;
  displayName: string;
  companyName?: string;
  email?: string;
  isSubCustomer: boolean;
  parentId?: string;
  parentName?: string;
  fullyQualifiedName?: string;
  active: boolean;
}

export default function QuickBooksCustomerMappingPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [ovisClients, setOvisClients] = useState<OvisClient[]>([]);
  const [qbCustomers, setQbCustomers] = useState<QBCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [qbSearchTerm, setQbSearchTerm] = useState("");
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedClient, setSelectedClient] = useState<OvisClient | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [filterUnlinked, setFilterUnlinked] = useState(false);

  useEffect(() => {
    document.title = "Customer Mapping | QuickBooks | OVIS Admin";
    fetchOvisClients();
    fetchQBCustomers();
  }, []);

  const fetchOvisClients = async () => {
    try {
      // Get clients with parent name
      const { data, error } = await supabase
        .from('client')
        .select(`
          id,
          client_name,
          parent_id,
          qb_customer_id,
          phone,
          parent:parent_id (
            client_name
          )
        `)
        .eq('is_active_client', true)
        .order('client_name');

      if (error) throw error;

      const clients = (data || []).map(c => ({
        id: c.id,
        client_name: c.client_name,
        parent_id: c.parent_id,
        parent_name: (c.parent as any)?.client_name || null,
        qb_customer_id: c.qb_customer_id,
        phone: c.phone
      }));

      setOvisClients(clients);
    } catch (error) {
      console.error('Error fetching OVIS clients:', error);
      setMessage({ type: 'error', text: 'Failed to load OVIS clients' });
    } finally {
      setLoading(false);
    }
  };

  const fetchQBCustomers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-list-customers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ maxResults: 1000 })
        }
      );

      const result = await response.json();

      if (result.success) {
        setQbCustomers(result.customers);
      } else if (result.error?.includes('not connected')) {
        // QB not connected - that's okay for viewing
        console.log('QuickBooks not connected');
      } else {
        console.error('Error fetching QB customers:', result.error);
      }
    } catch (error) {
      console.error('Error fetching QB customers:', error);
    }
  };

  const handleSyncClient = async (client: OvisClient) => {
    setSyncing(client.id);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: 'error', text: 'You must be logged in' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-customer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ clientId: client.id })
        }
      );

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        // Refresh data
        await Promise.all([fetchOvisClients(), fetchQBCustomers()]);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to sync customer' });
      }
    } catch (error: any) {
      console.error('Error syncing customer:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to sync customer' });
    } finally {
      setSyncing(null);
    }
  };

  const handleLinkCustomer = async (qbCustomer: QBCustomer) => {
    if (!selectedClient) return;

    setSyncing(selectedClient.id);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: 'error', text: 'You must be logged in' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-link-customer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            clientId: selectedClient.id,
            qbCustomerId: qbCustomer.id,
            qbDisplayName: qbCustomer.displayName
          })
        }
      );

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        setShowLinkModal(false);
        setSelectedClient(null);
        await fetchOvisClients();
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to link customer' });
      }
    } catch (error: any) {
      console.error('Error linking customer:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to link customer' });
    } finally {
      setSyncing(null);
    }
  };

  const handleUnlinkCustomer = async (client: OvisClient) => {
    if (!confirm(`Unlink "${client.client_name}" from QuickBooks?`)) return;

    try {
      const { error } = await supabase
        .from('client')
        .update({ qb_customer_id: null })
        .eq('id', client.id);

      if (error) throw error;

      setMessage({ type: 'success', text: `Unlinked "${client.client_name}" from QuickBooks` });
      await fetchOvisClients();
    } catch (error: any) {
      console.error('Error unlinking customer:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to unlink customer' });
    }
  };

  // Filter clients
  const filteredClients = ovisClients.filter(client => {
    const matchesSearch = client.client_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = !filterUnlinked || !client.qb_customer_id;
    return matchesSearch && matchesFilter;
  });

  // Filter QB customers for modal
  const filteredQBCustomers = qbCustomers.filter(customer =>
    customer.displayName.toLowerCase().includes(qbSearchTerm.toLowerCase()) ||
    customer.fullyQualifiedName?.toLowerCase().includes(qbSearchTerm.toLowerCase())
  );

  // Stats
  const totalClients = ovisClients.length;
  const linkedClients = ovisClients.filter(c => c.qb_customer_id).length;
  const unlinkedClients = totalClients - linkedClients;

  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900">Access Denied</h1>
          <p className="text-gray-600 mt-2">Only administrators can access this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading customer mapping...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/admin/quickbooks')}
            className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to QuickBooks Settings
          </button>

          <h1 className="text-3xl font-bold text-gray-900">Customer Mapping</h1>
          <p className="mt-2 text-gray-600">
            Link OVIS clients to QuickBooks customers for accurate invoice syncing.
          </p>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-auto text-gray-500 hover:text-gray-700"
            >
              &times;
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Total Clients</p>
            <p className="text-2xl font-bold text-gray-900">{totalClients}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Linked to QB</p>
            <p className="text-2xl font-bold text-green-600">{linkedClients}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Not Linked</p>
            <p className="text-2xl font-bold text-orange-600">{unlinkedClients}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterUnlinked}
                onChange={(e) => setFilterUnlinked(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Show only unlinked</span>
            </label>
            <button
              onClick={() => {
                fetchOvisClients();
                fetchQBCustomers();
              }}
              className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Client List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">OVIS Clients</h2>
          </div>

          <div className="divide-y divide-gray-200">
            {filteredClients.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No clients found matching your criteria.
              </div>
            ) : (
              filteredClients.map((client) => (
                <div
                  key={client.id}
                  className="p-4 hover:bg-gray-50 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{client.client_name}</span>
                      {client.parent_name && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          Sub of: {client.parent_name}
                        </span>
                      )}
                    </div>
                    {client.qb_customer_id ? (
                      <div className="flex items-center gap-2 mt-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-600">
                          Linked to QB Customer ID: {client.qb_customer_id}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <XCircle className="h-4 w-4 text-orange-500" />
                        <span className="text-sm text-orange-600">Not linked</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {client.qb_customer_id ? (
                      <>
                        <button
                          onClick={() => handleSyncClient(client)}
                          disabled={syncing === client.id}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded"
                          title="Sync changes to QuickBooks"
                        >
                          <RefreshCw className={`h-4 w-4 ${syncing === client.id ? 'animate-spin' : ''}`} />
                          Sync
                        </button>
                        <button
                          onClick={() => handleUnlinkCustomer(client)}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
                          title="Unlink from QuickBooks"
                        >
                          <Unlink className="h-4 w-4" />
                          Unlink
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleSyncClient(client)}
                          disabled={syncing === client.id}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white hover:bg-green-700 rounded disabled:opacity-50"
                          title="Create customer in QuickBooks"
                        >
                          {syncing === client.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                          Create in QB
                        </button>
                        <button
                          onClick={() => {
                            setSelectedClient(client);
                            setShowLinkModal(true);
                            setQbSearchTerm(client.client_name);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded"
                          title="Link to existing QB customer"
                        >
                          <Link2 className="h-4 w-4" />
                          Link Existing
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Link Modal */}
      {showLinkModal && selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Link to QuickBooks Customer</h3>
                <p className="text-sm text-gray-600">
                  Linking: <strong>{selectedClient.client_name}</strong>
                </p>
              </div>
              <button
                onClick={() => {
                  setShowLinkModal(false);
                  setSelectedClient(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search QuickBooks customers..."
                  value={qbSearchTerm}
                  onChange={(e) => setQbSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {filteredQBCustomers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {qbCustomers.length === 0 ? (
                    <p>No QuickBooks customers loaded. Make sure QuickBooks is connected.</p>
                  ) : (
                    <p>No customers match your search.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredQBCustomers.map((qbCustomer) => (
                    <button
                      key={qbCustomer.id}
                      onClick={() => handleLinkCustomer(qbCustomer)}
                      disabled={syncing === selectedClient.id}
                      className="w-full p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 text-left flex items-center justify-between disabled:opacity-50"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {qbCustomer.fullyQualifiedName || qbCustomer.displayName}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          <span>ID: {qbCustomer.id}</span>
                          {qbCustomer.isSubCustomer && (
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                              Sub-customer
                            </span>
                          )}
                          {qbCustomer.email && <span>{qbCustomer.email}</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
